"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectTriggerFromWorkflow = detectTriggerFromWorkflow;
exports.isTriggerNodeType = isTriggerNodeType;
exports.buildTriggerUrl = buildTriggerUrl;
exports.describeTrigger = describeTrigger;
const node_type_utils_1 = require("../utils/node-type-utils");
const WEBHOOK_PATTERNS = [
    'webhook',
    'webhooktrigger',
];
const FORM_PATTERNS = [
    'formtrigger',
    'form',
];
const CHAT_PATTERNS = [
    'chattrigger',
];
function detectTriggerFromWorkflow(workflow) {
    if (!workflow.nodes || workflow.nodes.length === 0) {
        return {
            detected: false,
            reason: 'Workflow has no nodes',
        };
    }
    const triggerNodes = workflow.nodes.filter(node => !node.disabled && isTriggerNodeType(node.type));
    if (triggerNodes.length === 0) {
        return {
            detected: false,
            reason: 'No trigger nodes found in workflow',
        };
    }
    for (const node of triggerNodes) {
        const webhookTrigger = detectWebhookTrigger(node);
        if (webhookTrigger) {
            return {
                detected: true,
                trigger: webhookTrigger,
            };
        }
    }
    for (const node of triggerNodes) {
        const chatTrigger = detectChatTrigger(node);
        if (chatTrigger) {
            return {
                detected: true,
                trigger: chatTrigger,
            };
        }
    }
    for (const node of triggerNodes) {
        const formTrigger = detectFormTrigger(node);
        if (formTrigger) {
            return {
                detected: true,
                trigger: formTrigger,
            };
        }
    }
    const connectedTrigger = triggerNodes.find(node => getMainDestinations(workflow, node.name).length > 0);
    if (connectedTrigger) {
        return {
            detected: true,
            trigger: {
                type: 'execute',
                node: connectedTrigger,
            },
        };
    }
    return {
        detected: false,
        reason: `Workflow has trigger nodes but none are connected to downstream nodes (found: ${triggerNodes.map(n => n.type).join(', ')}). Connect a trigger to the rest of the workflow first.`,
    };
}
function getMainDestinations(workflow, nodeName) {
    const main = workflow.connections?.[nodeName]?.main;
    if (!Array.isArray(main) || !Array.isArray(main[0])) {
        return [];
    }
    return main[0];
}
function isTriggerNodeType(nodeType) {
    const normalized = (0, node_type_utils_1.normalizeNodeType)(nodeType).toLowerCase();
    return (normalized.includes('trigger') ||
        normalized.includes('webhook') ||
        normalized === 'nodes-base.start');
}
function detectWebhookTrigger(node) {
    const normalized = (0, node_type_utils_1.normalizeNodeType)(node.type).toLowerCase();
    const nodeName = normalized.split('.').pop() || '';
    const isWebhook = WEBHOOK_PATTERNS.some(pattern => nodeName === pattern || nodeName.includes(pattern));
    if (!isWebhook) {
        return null;
    }
    const params = node.parameters || {};
    const webhookPath = extractWebhookPath(params, node.id, node.webhookId);
    const httpMethod = extractHttpMethod(params);
    return {
        type: 'webhook',
        node,
        webhookPath,
        httpMethod,
    };
}
function detectFormTrigger(node) {
    const normalized = (0, node_type_utils_1.normalizeNodeType)(node.type).toLowerCase();
    const nodeName = normalized.split('.').pop() || '';
    const isForm = FORM_PATTERNS.some(pattern => nodeName === pattern || nodeName.includes(pattern));
    if (!isForm) {
        return null;
    }
    const params = node.parameters || {};
    const formFields = extractFormFields(params);
    const webhookPath = extractWebhookPath(params, node.id, node.webhookId);
    return {
        type: 'form',
        node,
        webhookPath,
        formFields,
    };
}
function detectChatTrigger(node) {
    const normalized = (0, node_type_utils_1.normalizeNodeType)(node.type).toLowerCase();
    const nodeName = normalized.split('.').pop() || '';
    const isChat = CHAT_PATTERNS.some(pattern => nodeName === pattern || nodeName.includes(pattern));
    if (!isChat) {
        return null;
    }
    const params = node.parameters || {};
    const responseMode = params.options?.responseMode || 'lastNode';
    const webhookPath = extractWebhookPath(params, node.id, node.webhookId);
    return {
        type: 'chat',
        node,
        webhookPath,
        chatConfig: {
            responseMode,
        },
    };
}
function extractWebhookPath(params, nodeId, webhookId) {
    if (typeof params.path === 'string' && params.path) {
        return params.path;
    }
    if (typeof params.httpMethod === 'string') {
        const methodPath = params[`path_${params.httpMethod.toLowerCase()}`];
        if (typeof methodPath === 'string' && methodPath) {
            return methodPath;
        }
    }
    if (typeof webhookId === 'string' && webhookId) {
        return webhookId;
    }
    return nodeId;
}
function extractHttpMethod(params) {
    if (typeof params.httpMethod === 'string') {
        return params.httpMethod.toUpperCase();
    }
    return 'POST';
}
function extractFormFields(params) {
    const fields = [];
    if (Array.isArray(params.formFields)) {
        for (const field of params.formFields) {
            if (field && typeof field.fieldLabel === 'string') {
                fields.push(field.fieldLabel);
            }
            else if (field && typeof field.fieldName === 'string') {
                fields.push(field.fieldName);
            }
        }
    }
    const options = params.options;
    if (options && Array.isArray(options.formFields)) {
        for (const field of options.formFields) {
            if (field && typeof field.fieldLabel === 'string') {
                fields.push(field.fieldLabel);
            }
        }
    }
    return fields;
}
function buildTriggerUrl(baseUrl, trigger, mode = 'production') {
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
    switch (trigger.type) {
        case 'webhook': {
            const prefix = mode === 'test' ? 'webhook-test' : 'webhook';
            const path = trigger.webhookPath || trigger.node.id;
            return `${cleanBaseUrl}/${prefix}/${path}`;
        }
        case 'chat': {
            const prefix = mode === 'test' ? 'webhook-test' : 'webhook';
            const path = trigger.webhookPath || trigger.node.id;
            return `${cleanBaseUrl}/${prefix}/${path}/chat`;
        }
        case 'form': {
            const prefix = mode === 'test' ? 'form-test' : 'form';
            const path = trigger.webhookPath || trigger.node.id;
            return `${cleanBaseUrl}/${prefix}/${path}`;
        }
        default:
            throw new Error(`Cannot build URL for trigger type: ${trigger.type}`);
    }
}
function describeTrigger(trigger) {
    switch (trigger.type) {
        case 'webhook':
            return `Webhook trigger (${trigger.httpMethod || 'POST'} /${trigger.webhookPath || trigger.node.id})`;
        case 'form':
            const fieldCount = trigger.formFields?.length || 0;
            return `Form trigger (${fieldCount} fields)`;
        case 'chat':
            return `Chat trigger (${trigger.chatConfig?.responseMode || 'lastNode'} mode)`;
        case 'execute':
            return `Execute via temporary clone (simulating ${trigger.node.name} [${trigger.node.type}])`;
        default:
            return 'Unknown trigger';
    }
}
//# sourceMappingURL=trigger-detector.js.map