"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeTypeNormalizer = void 0;
class NodeTypeNormalizer {
    static normalizeToShortForm(type) {
        if (!type || typeof type !== 'string') {
            return type;
        }
        if (type.startsWith('n8n-nodes-base.')) {
            return type.replace(/^n8n-nodes-base\./, 'nodes-base.');
        }
        if (type.startsWith('@n8n/n8n-nodes-langchain.')) {
            return type.replace(/^@n8n\/n8n-nodes-langchain\./, 'nodes-langchain.');
        }
        if (type.startsWith('n8n-nodes-langchain.')) {
            return type.replace(/^n8n-nodes-langchain\./, 'nodes-langchain.');
        }
        return type;
    }
    static normalizeToFullForm(type) {
        return this.normalizeToShortForm(type);
    }
    static normalizeWithDetails(type) {
        const original = type;
        const normalized = this.normalizeToShortForm(type);
        return {
            original,
            normalized,
            wasNormalized: original !== normalized,
            package: this.detectPackage(normalized)
        };
    }
    static detectPackage(type) {
        if (type.startsWith('nodes-base.') || type.startsWith('n8n-nodes-base.'))
            return 'base';
        if (type.startsWith('nodes-langchain.') || type.startsWith('@n8n/n8n-nodes-langchain.') || type.startsWith('n8n-nodes-langchain.'))
            return 'langchain';
        if (type.includes('.'))
            return 'community';
        return 'unknown';
    }
    static normalizeBatch(types) {
        const result = new Map();
        for (const type of types) {
            result.set(type, this.normalizeToShortForm(type));
        }
        return result;
    }
    static normalizeWorkflowNodeTypes(workflow) {
        if (!workflow?.nodes || !Array.isArray(workflow.nodes)) {
            return workflow;
        }
        return {
            ...workflow,
            nodes: workflow.nodes.map((node) => ({
                ...node,
                type: this.normalizeToShortForm(node.type)
            }))
        };
    }
    static isFullForm(type) {
        if (!type || typeof type !== 'string') {
            return false;
        }
        return (type.startsWith('n8n-nodes-base.') ||
            type.startsWith('@n8n/n8n-nodes-langchain.') ||
            type.startsWith('n8n-nodes-langchain.'));
    }
    static isShortForm(type) {
        if (!type || typeof type !== 'string') {
            return false;
        }
        return (type.startsWith('nodes-base.') ||
            type.startsWith('nodes-langchain.'));
    }
    static toWorkflowFormat(type) {
        if (!type || typeof type !== 'string') {
            return type;
        }
        if (type.startsWith('nodes-base.')) {
            return type.replace(/^nodes-base\./, 'n8n-nodes-base.');
        }
        if (type.startsWith('nodes-langchain.')) {
            return type.replace(/^nodes-langchain\./, '@n8n/n8n-nodes-langchain.');
        }
        return type;
    }
}
exports.NodeTypeNormalizer = NodeTypeNormalizer;
//# sourceMappingURL=node-type-normalizer.js.map