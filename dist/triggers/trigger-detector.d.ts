import { Workflow } from '../types/n8n-api';
import { DetectedTrigger, TriggerDetectionResult } from './types';
export declare function detectTriggerFromWorkflow(workflow: Workflow): TriggerDetectionResult;
export declare function isTriggerNodeType(nodeType: string): boolean;
export declare function buildTriggerUrl(baseUrl: string, trigger: DetectedTrigger, mode?: 'production' | 'test'): string;
export declare function describeTrigger(trigger: DetectedTrigger): string;
//# sourceMappingURL=trigger-detector.d.ts.map