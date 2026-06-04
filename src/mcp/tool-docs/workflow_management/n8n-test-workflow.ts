import { ToolDocumentation } from '../types';

export const n8nTestWorkflowDoc: ToolDocumentation = {
  name: 'n8n_test_workflow',
  category: 'workflow_management',
  essentials: {
    description: 'Test/trigger workflow execution. Auto-detects trigger type (webhook/form/chat/execute). Schedule, manual, and other triggers run via "execute": a temporary webhook-shim clone.',
    keyParameters: ['workflowId', 'triggerType', 'data', 'message'],
    example: 'n8n_test_workflow({workflowId: "123"}) - auto-detect trigger',
    performance: 'Immediate trigger, response time depends on workflow complexity. Execute mode adds ~2-4s for clone create/activate/delete.',
    tips: [
      'Auto-detects trigger type from workflow if not specified',
      'Webhook/form/chat triggers are called directly and require the workflow to be ACTIVE',
      'Schedule/manual/other triggers run via "execute" - the target does NOT need to be active and is never modified',
      'For chat triggers, message is required',
      'For execute runs, data becomes the input item downstream nodes receive (empty item if omitted, like a manual run)'
    ]
  },
  full: {
    description: `Test and trigger n8n workflows through HTTP-based methods. This unified tool supports multiple trigger types:

**Trigger Types:**
- **webhook**: HTTP-based triggers (GET/POST/PUT/DELETE)
- **form**: Form submission triggers
- **chat**: AI chat triggers with conversation support
- **execute**: any other trigger type (schedule, manual, executeWorkflowTrigger, ...) via a temporary clone

**How execute works:** n8n's public API has no "run workflow now" endpoint, and on n8n 2.x the Execute Workflow node refuses inactive targets and requires an Execute Workflow Trigger node. So execute mode creates a temporary clone of the target with all original trigger nodes disabled and a webhook trigger + input-shaping Code node injected, activates the clone, fires the webhook (responseMode: lastNode), returns the final node's output, and deletes the clone. The target workflow is never modified, does not need to be active, and its real schedule cannot accidentally fire.

**Execute mode trade-offs:**
- The execution record belongs to the temporary clone (deleted afterwards), so rely on the returned output rather than the target's execution list
- Workflow staticData is not shared with the clone (fresh state each run)
- Real side effects DO happen (HTTP calls, posts, database writes) - this runs the actual nodes

The tool auto-detects the appropriate trigger type by analyzing the workflow's trigger nodes (webhook > chat > form > execute fallback). You can override this with the triggerType parameter - forcing "execute" is always allowed, even for workflows that also have a webhook trigger.`,
    parameters: {
      workflowId: {
        type: 'string',
        required: true,
        description: 'Workflow ID to execute'
      },
      triggerType: {
        type: 'string',
        required: false,
        enum: ['webhook', 'form', 'chat', 'execute'],
        description: 'Trigger type. Auto-detected if not specified. "execute" runs any workflow with a connected trigger via a temporary webhook-shim clone.'
      },
      httpMethod: {
        type: 'string',
        required: false,
        enum: ['GET', 'POST', 'PUT', 'DELETE'],
        description: 'For webhook: HTTP method (default: from workflow config or POST)'
      },
      webhookPath: {
        type: 'string',
        required: false,
        description: 'For webhook: override the webhook path'
      },
      message: {
        type: 'string',
        required: false,
        description: 'For chat: message to send (required for chat triggers)'
      },
      sessionId: {
        type: 'string',
        required: false,
        description: 'For chat: session ID for conversation continuity'
      },
      data: {
        type: 'object',
        required: false,
        description: 'Input data/payload for webhook, form fields, or the input item for execute runs'
      },
      headers: {
        type: 'object',
        required: false,
        description: 'Custom HTTP headers'
      },
      timeout: {
        type: 'number',
        required: false,
        description: 'Timeout in ms (default: 120000)'
      },
      waitForResponse: {
        type: 'boolean',
        required: false,
        description: 'Wait for workflow completion (default: true). For execute runs with false, the clone is kept until the next garbage collection so the execution can finish.'
      }
    },
    returns: `Execution response including:
- success: boolean
- data: workflow output data (for execute: the last executed node's output)
- executionId: for tracking/debugging (execute: belongs to the temporary clone)
- triggerType: detected or specified trigger type
- details.simulatedTrigger: (execute only) which trigger node was simulated
- metadata: timing and request details`,
    examples: [
      'n8n_test_workflow({workflowId: "123"}) - Auto-detect and trigger (schedule/manual workflows run via execute)',
      'n8n_test_workflow({workflowId: "123", triggerType: "execute"}) - Force a clone-shim run, e.g. to test-fire a parked schedule workflow',
      'n8n_test_workflow({workflowId: "123", triggerType: "execute", data: {dryRun: true}}) - Execute with an input item',
      'n8n_test_workflow({workflowId: "123", triggerType: "webhook", data: {name: "John"}}) - Webhook with data',
      'n8n_test_workflow({workflowId: "123", triggerType: "chat", message: "Hello AI"}) - Chat trigger',
      'n8n_test_workflow({workflowId: "123", triggerType: "form", data: {email: "test@example.com"}}) - Form submission'
    ],
    useCases: [
      'Test workflows during development',
      'Test-fire schedule- or manual-triggered workflows without opening the n8n UI',
      'Verify a parked (inactive) workflow end-to-end before activating its schedule',
      'Trigger AI chat workflows with messages',
      'Submit form data to form-triggered workflows',
      'Integrate n8n workflows with external systems via webhooks'
    ],
    performance: `Performance varies based on workflow complexity and waitForResponse setting:
- Webhook: Immediate trigger, depends on workflow
- Form: Immediate trigger, depends on workflow
- Chat: May have additional AI processing time
- Execute: Adds ~2-4s overhead for clone create/activate/delete around the workflow's own runtime`,
    errorHandling: `**Error Response with Execution Guidance**

When execution fails, the response includes guidance for debugging:

**With Execution ID** (workflow started but failed):
- Use n8n_executions({action: 'get', id: executionId, mode: 'preview'}) to investigate
- For execute runs the execution belongs to the (deleted) clone; the error message and description are surfaced in the response instead

**Without Execution ID** (workflow didn't start):
- Use n8n_executions({action: 'list', workflowId: 'wf_id'}) to find recent executions

**Common Errors:**
- "Workflow not found" - Check workflow ID exists
- "Workflow not active" - Activate workflow (webhook/form/chat only; execute does not need it)
- "Workflow cannot be triggered externally" - No enabled trigger node is connected to downstream nodes
- "Chat message required" - Provide message parameter for chat triggers
- "SSRF protection" - URL validation failed`,
    bestPractices: [
      'Let auto-detection choose the trigger type when possible',
      'Use execute mode to test-fire schedule/manual workflows instead of asking a human to click Execute in the UI',
      'Remember execute runs the REAL nodes - side effects (posts, emails, writes) happen',
      'For chat workflows, provide sessionId for multi-turn conversations',
      'Use mode="preview" with n8n_executions for efficient debugging',
      'Test with small data payloads first'
    ],
    pitfalls: [
      'Webhook/form/chat triggers require the workflow to be ACTIVE (execute does not)',
      'Execute mode runs a temporary clone: execution records and staticData belong to the clone, not the target',
      'Stale __mcp_execute_* clones can briefly appear in the workflow list after interrupted runs; they are garbage-collected automatically',
      'Chat trigger requires message parameter',
      'Form data must match expected form fields',
      'Webhook method must match node configuration'
    ],
    relatedTools: ['n8n_executions', 'n8n_get_workflow', 'n8n_create_workflow', 'n8n_validate_workflow']
  }
};
