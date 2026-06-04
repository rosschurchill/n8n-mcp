/**
 * Unit tests for ExecuteHandler (temporary webhook-shim clone execution)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecuteHandler, EXECUTE_CLONE_PREFIX } from '../../../../src/triggers/handlers/execute-handler';
import { N8nApiClient } from '../../../../src/services/n8n-api-client';
import { Workflow, WorkflowNode } from '../../../../src/types/n8n-api';
import { ExecuteTriggerInput, DetectedTrigger } from '../../../../src/triggers/types';

// Mock getN8nApiConfig
vi.mock('../../../../src/config/n8n-api', () => ({
  getN8nApiConfig: vi.fn(() => ({
    baseUrl: 'https://test.n8n.com/api/v1',
    apiKey: 'test-api-key',
  })),
}));

// Create mock client
const createMockClient = () => ({
  getWorkflow: vi.fn(),
  listWorkflows: vi.fn(async () => ({ data: [] })),
  createWorkflow: vi.fn(async (wf: Partial<Workflow>) => ({ ...wf, id: 'clone-456' })),
  updateWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(async () => ({})),
  activateWorkflow: vi.fn(async () => ({ active: true })),
  deactivateWorkflow: vi.fn(),
  triggerWebhook: vi.fn(async (_request: any): Promise<any> => ({ status: 200, statusText: 'OK', data: { proof: 'ran' } })),
  getExecution: vi.fn(),
  listExecutions: vi.fn(async () => ({ data: [{ id: 'exec-1' }] })),
  deleteExecution: vi.fn(),
});

// Schedule-only test workflow (the case the public API cannot run directly)
const createScheduleWorkflow = (): Workflow => ({
  id: 'workflow-123',
  name: 'Scheduled Poster',
  active: false,
  nodes: [
    {
      id: 's1',
      name: 'Schedule Trigger',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1.2,
      position: [0, 0],
      parameters: { rule: { interval: [{ field: 'days' }] } },
    },
    {
      id: 'w1',
      name: 'Do Work',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.4,
      position: [220, 0],
      parameters: {},
    },
  ],
  connections: {
    'Schedule Trigger': { main: [[{ node: 'Do Work', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1' },
} as Workflow);

const baseInput: ExecuteTriggerInput = {
  workflowId: 'workflow-123',
  triggerType: 'execute',
};

describe('ExecuteHandler', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let handler: ExecuteHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    handler = new ExecuteHandler(mockClient as unknown as N8nApiClient);
  });

  describe('capabilities', () => {
    it('does not require the target workflow to be active', () => {
      expect(handler.capabilities.requiresActiveWorkflow).toBe(false);
    });

    it('can pass input data', () => {
      expect(handler.capabilities.canPassInputData).toBe(true);
    });
  });

  describe('successful execution', () => {
    it('creates, activates, fires, and deletes a clone', async () => {
      const result = await handler.execute(baseInput, createScheduleWorkflow());

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ proof: 'ran' });
      expect(result.executionId).toBe('exec-1');
      expect(mockClient.createWorkflow).toHaveBeenCalledTimes(1);
      expect(mockClient.activateWorkflow).toHaveBeenCalledWith('clone-456');
      expect(mockClient.triggerWebhook).toHaveBeenCalledTimes(1);
      expect(mockClient.deleteWorkflow).toHaveBeenCalledWith('clone-456');
    });

    it('never modifies the target workflow', async () => {
      await handler.execute(baseInput, createScheduleWorkflow());
      expect(mockClient.updateWorkflow).not.toHaveBeenCalled();
    });

    it('builds a clone with original triggers disabled and a webhook + shim added', async () => {
      await handler.execute(baseInput, createScheduleWorkflow());

      const clone = mockClient.createWorkflow.mock.calls[0][0] as Partial<Workflow>;
      expect(clone.name).toMatch(new RegExp(`^${EXECUTE_CLONE_PREFIX}workflow-123_`));

      const nodes = clone.nodes as WorkflowNode[];
      const schedule = nodes.find(n => n.name === 'Schedule Trigger');
      expect(schedule?.disabled).toBe(true);

      const webhook = nodes.find(n => n.type === 'n8n-nodes-base.webhook');
      expect(webhook).toBeDefined();
      expect(webhook!.parameters.responseMode).toBe('lastNode');
      expect(webhook!.webhookId).toBeDefined();

      const shim = nodes.find(n => n.type === 'n8n-nodes-base.code');
      expect(shim).toBeDefined();

      // webhook -> shim -> original trigger's downstream
      const connections = clone.connections as any;
      expect(connections[webhook!.name].main[0][0].node).toBe(shim!.name);
      expect(connections[shim!.name].main[0]).toEqual([{ node: 'Do Work', type: 'main', index: 0 }]);
    });

    it('fires the webhook at the clone path with the provided data', async () => {
      await handler.execute({ ...baseInput, data: { dryRun: true } }, createScheduleWorkflow());

      const request = mockClient.triggerWebhook.mock.calls[0][0] as any;
      const clone = mockClient.createWorkflow.mock.calls[0][0] as Partial<Workflow>;
      const webhook = (clone.nodes as WorkflowNode[]).find(n => n.type === 'n8n-nodes-base.webhook')!;
      expect(request.webhookUrl).toBe(`https://test.n8n.com/webhook/${webhook.parameters.path}`);
      expect(request.httpMethod).toBe('POST');
      expect(request.data).toEqual({ dryRun: true });
    });

    it('uses the detected trigger node when provided', async () => {
      const workflow = createScheduleWorkflow();
      const triggerInfo: DetectedTrigger = {
        type: 'execute',
        node: workflow.nodes[0],
      };

      const result = await handler.execute(baseInput, workflow, triggerInfo);

      expect(result.success).toBe(true);
      expect(result.details?.simulatedTrigger).toContain('Schedule Trigger');
    });

    it('retries the webhook on 404 while registration completes', async () => {
      mockClient.triggerWebhook
        .mockResolvedValueOnce({ status: 404, statusText: 'Not Found', data: {} })
        .mockResolvedValueOnce({ status: 200, statusText: 'OK', data: { ok: true } });

      const result = await handler.execute(baseInput, createScheduleWorkflow());

      expect(result.success).toBe(true);
      expect(mockClient.triggerWebhook).toHaveBeenCalledTimes(2);
    });
  });

  describe('waitForResponse: false', () => {
    it('keeps the clone so the execution can finish', async () => {
      const result = await handler.execute(
        { ...baseInput, waitForResponse: false },
        createScheduleWorkflow()
      );

      expect(result.success).toBe(true);
      expect(mockClient.deleteWorkflow).not.toHaveBeenCalled();
      expect(result.details?.clonedWorkflowId).toBe('clone-456');
    });
  });

  describe('error handling', () => {
    it('errors when the workflow has no connected trigger to simulate', async () => {
      const workflow = createScheduleWorkflow();
      workflow.connections = {};

      const result = await handler.execute(baseInput, workflow);

      expect(result.success).toBe(false);
      expect(result.error).toContain('no enabled trigger node with downstream connections');
      expect(mockClient.createWorkflow).not.toHaveBeenCalled();
    });

    it('surfaces the execution error and still deletes the clone when the run fails', async () => {
      mockClient.triggerWebhook.mockRejectedValueOnce(new Error('Request failed with status code 500'));
      mockClient.listExecutions.mockResolvedValueOnce({
        data: [
          {
            id: 'exec-9',
            data: { resultData: { error: { message: 'Node "Do Work" blew up', description: 'boom' } } },
          },
        ],
      } as any);

      const result = await handler.execute(baseInput, createScheduleWorkflow());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Node "Do Work" blew up');
      expect(result.executionId).toBe('exec-9');
      expect(mockClient.deleteWorkflow).toHaveBeenCalledWith('clone-456');
    });

    it('deletes the clone when webhook returns a 4xx', async () => {
      mockClient.triggerWebhook.mockResolvedValue({ status: 404, statusText: 'Not Found', data: { message: 'not registered' } });

      const result = await handler.execute(baseInput, createScheduleWorkflow());

      expect(result.success).toBe(false);
      expect(mockClient.deleteWorkflow).toHaveBeenCalledWith('clone-456');
    });

    it('reports a clean error when clone creation fails', async () => {
      mockClient.createWorkflow.mockRejectedValueOnce(new Error('API down'));

      const result = await handler.execute(baseInput, createScheduleWorkflow());

      expect(result.success).toBe(false);
      expect(result.error).toBe('API down');
      expect(mockClient.deleteWorkflow).not.toHaveBeenCalled();
    });
  });

  describe('garbage collection', () => {
    it('deletes stale clones from previous runs', async () => {
      const staleDate = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      mockClient.listWorkflows.mockResolvedValueOnce({
        data: [
          { id: 'stale-1', name: `${EXECUTE_CLONE_PREFIX}old_abc`, createdAt: staleDate },
          { id: 'fresh-1', name: `${EXECUTE_CLONE_PREFIX}new_def`, createdAt: new Date().toISOString() },
          { id: 'other-1', name: 'Production Workflow', createdAt: staleDate },
        ],
      } as any);

      await handler.execute(baseInput, createScheduleWorkflow());

      expect(mockClient.deleteWorkflow).toHaveBeenCalledWith('stale-1');
      expect(mockClient.deleteWorkflow).not.toHaveBeenCalledWith('fresh-1');
      expect(mockClient.deleteWorkflow).not.toHaveBeenCalledWith('other-1');
    });
  });
});
