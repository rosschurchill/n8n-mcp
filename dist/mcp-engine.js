"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.N8NMCPEngine = void 0;
const http_server_single_session_1 = require("./http-server-single-session");
const logger_1 = require("./utils/logger");
const version_1 = require("./utils/version");
class N8NMCPEngine {
    constructor(options = {}) {
        this.server = new http_server_single_session_1.SingleSessionHTTPServer();
        this.startTime = new Date();
        if (options.logLevel) {
            process.env.LOG_LEVEL = options.logLevel;
        }
    }
    async processRequest(req, res, instanceContext) {
        try {
            await this.server.handleRequest(req, res, instanceContext);
        }
        catch (error) {
            logger_1.logger.error('Engine processRequest error:', error);
            throw error;
        }
    }
    async healthCheck() {
        try {
            const sessionInfo = this.server.getSessionInfo();
            const memoryUsage = process.memoryUsage();
            return {
                status: 'healthy',
                uptime: Math.floor((Date.now() - this.startTime.getTime()) / 1000),
                sessionActive: sessionInfo.active,
                memoryUsage: {
                    used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                    total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
                    unit: 'MB'
                },
                version: version_1.PROJECT_VERSION
            };
        }
        catch (error) {
            logger_1.logger.error('Health check failed:', error);
            return {
                status: 'unhealthy',
                uptime: 0,
                sessionActive: false,
                memoryUsage: { used: 0, total: 0, unit: 'MB' },
                version: version_1.PROJECT_VERSION
            };
        }
    }
    getSessionInfo() {
        return this.server.getSessionInfo();
    }
    exportSessionState() {
        if (!this.server) {
            logger_1.logger.warn('Cannot export sessions: server not initialized');
            return [];
        }
        return this.server.exportSessionState();
    }
    async restoreSessionState(sessions) {
        if (!this.server) {
            logger_1.logger.warn('Cannot restore sessions: server not initialized');
            return 0;
        }
        return this.server.restoreSessionState(sessions);
    }
    async shutdown() {
        logger_1.logger.info('Shutting down N8N MCP Engine...');
        await this.server.shutdown();
    }
    async start() {
        await this.server.start();
    }
}
exports.N8NMCPEngine = N8NMCPEngine;
exports.default = N8NMCPEngine;
//# sourceMappingURL=mcp-engine.js.map