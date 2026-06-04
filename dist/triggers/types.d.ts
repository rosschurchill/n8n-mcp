import { WorkflowNode } from '../types/n8n-api';
export type TriggerType = 'webhook' | 'form' | 'chat' | 'execute';
export interface BaseTriggerInput {
    workflowId: string;
    triggerType?: TriggerType;
    data?: Record<string, unknown>;
    headers?: Record<string, string>;
    timeout?: number;
    waitForResponse?: boolean;
}
export interface WebhookTriggerInput extends BaseTriggerInput {
    triggerType: 'webhook';
    httpMethod?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    webhookPath?: string;
}
export interface FormTriggerInput extends BaseTriggerInput {
    triggerType: 'form';
    formData?: Record<string, unknown>;
}
export interface ChatTriggerInput extends BaseTriggerInput {
    triggerType: 'chat';
    message: string;
    sessionId?: string;
}
export interface ExecuteTriggerInput extends BaseTriggerInput {
    triggerType: 'execute';
}
export type TriggerInput = WebhookTriggerInput | FormTriggerInput | ChatTriggerInput | ExecuteTriggerInput;
export interface TriggerResponse {
    success: boolean;
    triggerType: TriggerType;
    workflowId: string;
    executionId?: string;
    status?: number;
    statusText?: string;
    data?: unknown;
    error?: string;
    code?: string;
    details?: Record<string, unknown>;
    metadata: {
        duration: number;
        webhookPath?: string;
        sessionId?: string;
        httpMethod?: string;
    };
}
export interface TriggerHandlerCapabilities {
    requiresActiveWorkflow: boolean;
    supportedMethods?: string[];
    canPassInputData: boolean;
}
export interface DetectedTrigger {
    type: TriggerType;
    node: WorkflowNode;
    webhookPath?: string;
    httpMethod?: string;
    formFields?: string[];
    chatConfig?: {
        responseMode?: string;
    };
}
export interface TriggerDetectionResult {
    detected: boolean;
    trigger?: DetectedTrigger;
    reason?: string;
}
export interface TestWorkflowInput {
    workflowId: string;
    triggerType?: TriggerType;
    httpMethod?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    webhookPath?: string;
    message?: string;
    sessionId?: string;
    data?: Record<string, unknown>;
    headers?: Record<string, string>;
    timeout?: number;
    waitForResponse?: boolean;
}
//# sourceMappingURL=types.d.ts.map