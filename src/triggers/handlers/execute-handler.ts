/**
 * Execute trigger handler
 *
 * Runs workflows whose triggers cannot be invoked via n8n's public API
 * (schedule, manual, interval, executeWorkflowTrigger, etc.) using a
 * temporary clone with a webhook shim:
 *
 * 1. Clone the target workflow with all original trigger nodes disabled
 * 2. Inject a webhook trigger + input-shaping Code node wired to the
 *    simulated trigger's downstream nodes
 * 3. Activate the clone and fire the webhook (responseMode: lastNode)
 * 4. Return the final node's output, then delete the clone
 *
 * Why a clone (empirically verified on n8n 2.x):
 * - The Execute Workflow node refuses inactive targets ("Workflow is not
 *   active and cannot be executed") and requires an Execute Workflow
 *   Trigger node on the target — so NO approach can run an arbitrary
 *   schedule/manual workflow without modifying something.
 * - Cloning means the production workflow is never mutated: no version
 *   history pollution, no risk of a failed restore, and no chance of the
 *   real schedule trigger firing while temporarily active (original
 *   triggers are disabled in the clone).
 *
 * Trade-offs (documented in tool output):
 * - The execution runs under the clone's workflow ID, not the target's
 * - Workflow staticData is not shared with the clone
 * - Credentials are referenced by ID and resolve normally for same-project
 *   workflows
 */

import { z } from 'zod';
import { randomUUID } from 'crypto';
import { Workflow, WorkflowNode, WorkflowConnection } from '../../types/n8n-api';
import {
  TriggerType,
  TriggerResponse,
  TriggerHandlerCapabilities,
  DetectedTrigger,
  ExecuteTriggerInput,
} from '../types';
import { BaseTriggerHandler } from './base-handler';
import { isTriggerNodeType } from '../trigger-detector';
import { logger } from '../../utils/logger';

/** Prefix for temporary clone workflow names (also used for GC) */
export const EXECUTE_CLONE_PREFIX = '__mcp_execute_';

/** Clones older than this are garbage-collected on each run (ms) */
const CLONE_GC_AGE_MS = 30 * 60 * 1000;

/** Webhook fire retries while the freshly-activated webhook registers */
const WEBHOOK_RETRY_ATTEMPTS = 4;
const WEBHOOK_RETRY_DELAY_MS = 750;

/**
 * Zod schema for execute input validation
 */
const executeInputSchema = z.object({
  workflowId: z.string(),
  triggerType: z.literal('execute'),
  data: z.record(z.unknown()).optional(),
  headers: z.record(z.string()).optional(),
  timeout: z.number().optional(),
  waitForResponse: z.boolean().optional(),
});

/**
 * Execute trigger handler - runs any workflow via a temporary webhook-shim clone
 */
export class ExecuteHandler extends BaseTriggerHandler<ExecuteTriggerInput> {
  readonly triggerType: TriggerType = 'execute';

  readonly capabilities: TriggerHandlerCapabilities = {
    // The TARGET does not need to be active - the temporary clone is
    // activated instead
    requiresActiveWorkflow: false,
    supportedMethods: ['POST'],
    canPassInputData: true,
  };

  readonly inputSchema = executeInputSchema as z.ZodSchema<ExecuteTriggerInput>;

  async execute(
    input: ExecuteTriggerInput,
    workflow: Workflow,
    triggerInfo?: DetectedTrigger
  ): Promise<TriggerResponse> {
    const startTime = Date.now();

    const baseUrl = this.getBaseUrl();
    if (!baseUrl) {
      return this.errorResponse(input, 'Cannot determine n8n base URL', startTime);
    }

    // Pick the trigger node to simulate: detection result if provided,
    // otherwise the first enabled trigger with downstream connections
    const simulatedTrigger =
      (triggerInfo?.type === 'execute' ? triggerInfo.node : undefined) ??
      this.findSimulatedTrigger(workflow);

    if (!simulatedTrigger) {
      return this.errorResponse(
        input,
        'Workflow has no enabled trigger node with downstream connections to simulate',
        startTime,
        {
          details: {
            hint: 'The execute trigger replaces an existing trigger node with a temporary webhook. The workflow needs at least one enabled, connected trigger node.',
          },
        }
      );
    }

    // Best-effort GC of stale clones from previous failed runs
    await this.garbageCollectClones();

    const webhookPath = randomUUID();
    const clonePayload = this.buildClone(workflow, simulatedTrigger, webhookPath);

    let cloneId: string | undefined;
    let executionFinished = true;

    try {
      const clone = await this.client.createWorkflow(clonePayload);
      cloneId = clone.id;
      if (!cloneId) {
        return this.errorResponse(input, 'n8n did not return an ID for the temporary clone', startTime);
      }

      await this.client.activateWorkflow(cloneId);

      // Fire the webhook, retrying briefly while registration completes
      const webhookUrl = `${baseUrl.replace(/\/+$/, '')}/webhook/${webhookPath}`;
      const waitForResponse = input.waitForResponse ?? true;
      const response = await this.fireWebhookWithRetry(webhookUrl, input, waitForResponse);

      if (!waitForResponse) {
        // Execution may still be running - leave the clone for the GC
        // rather than deleting a workflow mid-execution
        executionFinished = false;
        return this.normalizeResponse(response?.data, input, startTime, {
          status: response?.status,
          statusText: response?.statusText,
          details: {
            clonedWorkflowId: cloneId,
            simulatedTrigger: `${simulatedTrigger.name} (${simulatedTrigger.type})`,
            note: `Fired without waiting. Temporary clone ${cloneId} was kept so the execution can finish; it will be garbage-collected on a later run (or delete it with n8n_delete_workflow).`,
          },
        });
      }

      // Webhook 4xx (e.g. workflow not started) comes back as a status, not a throw
      if (response.status >= 400) {
        const executionError = await this.fetchLatestExecutionError(cloneId);
        return this.errorResponse(
          input,
          executionError?.message ||
            `Webhook responded with HTTP ${response.status}: ${JSON.stringify(response.data).slice(0, 300)}`,
          startTime,
          {
            status: response.status,
            executionId: executionError?.executionId,
            details: {
              clonedWorkflowId: cloneId,
              simulatedTrigger: `${simulatedTrigger.name} (${simulatedTrigger.type})`,
              ...(executionError?.description ? { description: executionError.description } : {}),
            },
          }
        );
      }

      const executionId = await this.fetchLatestExecutionId(cloneId);

      return this.normalizeResponse(response.data, input, startTime, {
        status: response.status,
        statusText: response.statusText,
        executionId,
        details: {
          simulatedTrigger: `${simulatedTrigger.name} (${simulatedTrigger.type})`,
          note: 'Executed via a temporary clone with a webhook shim (the target workflow was not modified). Output is the last executed node\'s data.',
        },
      });
    } catch (error) {
      // A 5xx from the webhook (execution error) throws - enrich it with
      // the execution's own error message when we can get it
      const executionError = cloneId ? await this.fetchLatestExecutionError(cloneId) : undefined;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return this.errorResponse(
        input,
        executionError?.message || errorMessage,
        startTime,
        {
          executionId: executionError?.executionId,
          code: (error as any)?.code,
          details: {
            ...(cloneId ? { clonedWorkflowId: cloneId } : {}),
            simulatedTrigger: `${simulatedTrigger.name} (${simulatedTrigger.type})`,
            ...(executionError?.description ? { description: executionError.description } : {}),
            ...(executionError?.message && executionError.message !== errorMessage
              ? { transportError: errorMessage }
              : {}),
          },
        }
      );
    } finally {
      if (cloneId && executionFinished) {
        try {
          await this.client.deleteWorkflow(cloneId);
        } catch (cleanupError) {
          logger.warn(
            `Failed to delete temporary execute clone ${cloneId}; it will be garbage-collected on a later run`,
            cleanupError
          );
        }
      }
    }
  }

  /**
   * Find the first enabled trigger node that has outgoing main connections
   */
  private findSimulatedTrigger(workflow: Workflow): WorkflowNode | undefined {
    return workflow.nodes?.find(
      node =>
        !node.disabled &&
        isTriggerNodeType(node.type) &&
        this.getTriggerDestinations(workflow.connections, node.name).length > 0
    );
  }

  /**
   * Get the main-output destinations of a node (output index 0)
   */
  private getTriggerDestinations(
    connections: WorkflowConnection | undefined,
    nodeName: string
  ): Array<{ node: string; type: string; index: number }> {
    const main = (connections?.[nodeName] as any)?.main;
    if (!Array.isArray(main) || !Array.isArray(main[0])) {
      return [];
    }
    return main[0];
  }

  /**
   * Build the temporary clone: original nodes with triggers disabled,
   * plus a webhook trigger and an input-shaping Code node wired to the
   * simulated trigger's downstream nodes
   */
  private buildClone(
    workflow: Workflow,
    simulatedTrigger: WorkflowNode,
    webhookPath: string
  ): Partial<Workflow> {
    const existingNames = new Set(workflow.nodes.map(n => n.name));
    const webhookName = this.uniqueName('MCP Execute Webhook', existingNames);
    const shimName = this.uniqueName('MCP Execute Input', existingNames);

    // Disable every trigger node so the clone cannot fire on the original
    // schedule (or collide on webhook paths) while it is briefly active
    const nodes: WorkflowNode[] = workflow.nodes.map(node =>
      isTriggerNodeType(node.type) ? { ...node, disabled: true } : { ...node }
    );

    const [x, y] = simulatedTrigger.position || [0, 0];

    nodes.push({
      id: randomUUID(),
      name: webhookName,
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [x, y + 220],
      webhookId: randomUUID(),
      parameters: {
        httpMethod: 'POST',
        path: webhookPath,
        responseMode: 'lastNode',
        options: {},
      },
    });

    // Reshape the webhook envelope so downstream nodes receive the same
    // input a manual run would give them: the provided data object, or a
    // single empty item when no data was passed
    nodes.push({
      id: randomUUID(),
      name: shimName,
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [x + 200, y + 220],
      parameters: {
        jsCode: [
          'const body = $input.first().json.body;',
          "const hasData = body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length > 0;",
          'return [{ json: hasData ? body : {} }];',
        ].join('\n'),
      },
    });

    const connections: WorkflowConnection = {
      ...(workflow.connections || {}),
      [webhookName]: {
        main: [[{ node: shimName, type: 'main', index: 0 }]],
      },
      [shimName]: {
        main: [this.getTriggerDestinations(workflow.connections, simulatedTrigger.name)],
      },
    };

    return {
      name: `${EXECUTE_CLONE_PREFIX}${workflow.id}_${Date.now().toString(36)}`,
      nodes,
      connections,
      settings: workflow.settings,
    };
  }

  /**
   * Make a node name unique within the workflow
   */
  private uniqueName(base: string, existing: Set<string>): string {
    let name = base;
    let i = 1;
    while (existing.has(name)) {
      name = `${base} ${++i}`;
    }
    existing.add(name);
    return name;
  }

  /**
   * Fire the clone's webhook, retrying briefly on 404 while the
   * freshly-activated webhook finishes registering
   */
  private async fireWebhookWithRetry(
    webhookUrl: string,
    input: ExecuteTriggerInput,
    waitForResponse: boolean
  ): Promise<any> {
    let response: any;
    for (let attempt = 1; attempt <= WEBHOOK_RETRY_ATTEMPTS; attempt++) {
      response = await this.client.triggerWebhook({
        webhookUrl,
        httpMethod: 'POST',
        data: input.data || {},
        headers: input.headers,
        waitForResponse,
      });
      if (response?.status !== 404) {
        return response;
      }
      if (attempt < WEBHOOK_RETRY_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, WEBHOOK_RETRY_DELAY_MS));
      }
    }
    return response;
  }

  /**
   * Get the most recent execution ID for a workflow (best effort - returns
   * undefined when execution saving is disabled on the instance)
   */
  private async fetchLatestExecutionId(workflowId: string): Promise<string | undefined> {
    try {
      const executions = await this.client.listExecutions({ workflowId, limit: 1 });
      const id = executions.data?.[0]?.id;
      return id !== undefined ? String(id) : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Get the most recent execution's error info for a workflow (best effort)
   */
  private async fetchLatestExecutionError(
    workflowId: string
  ): Promise<{ executionId?: string; message?: string; description?: string } | undefined> {
    try {
      const executions = await this.client.listExecutions({ workflowId, limit: 1, includeData: true });
      const execution = executions.data?.[0] as any;
      if (!execution) return undefined;
      const error = execution.data?.resultData?.error;
      return {
        executionId: execution.id !== undefined ? String(execution.id) : undefined,
        message: error?.message,
        description: error?.description,
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Best-effort cleanup of stale clones left behind by interrupted runs
   * (process crash mid-execution, waitForResponse=false, failed delete)
   */
  private async garbageCollectClones(): Promise<void> {
    try {
      const workflows = await this.client.listWorkflows({ limit: 100 });
      const cutoff = Date.now() - CLONE_GC_AGE_MS;
      const stale = (workflows.data || []).filter(
        wf =>
          wf.name?.startsWith(EXECUTE_CLONE_PREFIX) &&
          wf.id &&
          // Missing createdAt -> keep (could be a concurrent run's clone)
          wf.createdAt !== undefined &&
          new Date(wf.createdAt).getTime() < cutoff
      );
      for (const wf of stale) {
        try {
          await this.client.deleteWorkflow(wf.id!);
          logger.info(`Garbage-collected stale execute clone: ${wf.name} (${wf.id})`);
        } catch {
          // Ignore - will retry on a later run
        }
      }
    } catch {
      // GC is best effort only
    }
  }
}
