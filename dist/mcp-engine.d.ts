import { Request, Response } from 'express';
import { InstanceContext } from './types/instance-context';
import { SessionState } from './types/session-state';
export interface EngineHealth {
    status: 'healthy' | 'unhealthy';
    uptime: number;
    sessionActive: boolean;
    memoryUsage: {
        used: number;
        total: number;
        unit: string;
    };
    version: string;
}
export interface EngineOptions {
    sessionTimeout?: number;
    logLevel?: 'error' | 'warn' | 'info' | 'debug';
}
export declare class N8NMCPEngine {
    private server;
    private startTime;
    constructor(options?: EngineOptions);
    processRequest(req: Request, res: Response, instanceContext?: InstanceContext): Promise<void>;
    healthCheck(): Promise<EngineHealth>;
    getSessionInfo(): {
        active: boolean;
        sessionId?: string;
        age?: number;
    };
    exportSessionState(): SessionState[];
    restoreSessionState(sessions: SessionState[]): Promise<number>;
    shutdown(): Promise<void>;
    start(): Promise<void>;
}
export default N8NMCPEngine;
//# sourceMappingURL=mcp-engine.d.ts.map