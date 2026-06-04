export interface NodeTypeNormalizationResult {
    original: string;
    normalized: string;
    wasNormalized: boolean;
    package: 'base' | 'langchain' | 'community' | 'unknown';
}
export declare class NodeTypeNormalizer {
    static normalizeToShortForm(type: string): string;
    static normalizeToFullForm(type: string): string;
    static normalizeWithDetails(type: string): NodeTypeNormalizationResult;
    private static detectPackage;
    static normalizeBatch(types: string[]): Map<string, string>;
    static normalizeWorkflowNodeTypes(workflow: any): any;
    static isFullForm(type: string): boolean;
    static isShortForm(type: string): boolean;
    static toWorkflowFormat(type: string): string;
}
//# sourceMappingURL=node-type-normalizer.d.ts.map