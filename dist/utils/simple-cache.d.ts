export declare class SimpleCache {
    private cache;
    private cleanupTimer;
    private maxSize;
    constructor(maxSize?: number);
    get(key: string): any;
    set(key: string, data: any, ttlSeconds?: number): void;
    clear(): void;
    destroy(): void;
}
//# sourceMappingURL=simple-cache.d.ts.map