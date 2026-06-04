"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SQLiteStorageService = void 0;
class SQLiteStorageService {
    constructor(dbPath = ':memory:') {
        this.adapter = null;
        this.dbPath = dbPath;
        this.initSync();
    }
    initSync() {
        let Database;
        try {
            Database = require('better-sqlite3');
        }
        catch (error) {
            throw new Error('better-sqlite3 is required for SQLiteStorageService. Install with: npm install better-sqlite3');
        }
        const db = new Database(this.dbPath);
        this.adapter = {
            prepare: (sql) => db.prepare(sql),
            exec: (sql) => db.exec(sql),
            close: () => db.close(),
            pragma: (key, value) => db.pragma(`${key}${value !== undefined ? ` = ${value}` : ''}`),
            inTransaction: db.inTransaction,
            transaction: (fn) => db.transaction(fn)(),
            checkFTS5Support: () => {
                try {
                    db.exec("CREATE VIRTUAL TABLE test_fts USING fts5(content)");
                    db.exec("DROP TABLE test_fts");
                    return true;
                }
                catch {
                    return false;
                }
            }
        };
        this.initializeSchema();
    }
    initializeSchema() {
        const schema = `
      CREATE TABLE IF NOT EXISTS nodes (
        node_type TEXT PRIMARY KEY,
        package_name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT,
        category TEXT,
        development_style TEXT CHECK(development_style IN ('declarative', 'programmatic')),
        is_ai_tool INTEGER DEFAULT 0,
        is_trigger INTEGER DEFAULT 0,
        is_webhook INTEGER DEFAULT 0,
        is_versioned INTEGER DEFAULT 0,
        version TEXT,
        documentation TEXT,
        properties_schema TEXT,
        operations TEXT,
        credentials_required TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_package ON nodes(package_name);
      CREATE INDEX IF NOT EXISTS idx_ai_tool ON nodes(is_ai_tool);
      CREATE INDEX IF NOT EXISTS idx_category ON nodes(category);
    `;
        this.adapter.exec(schema);
    }
    get db() {
        if (!this.adapter) {
            throw new Error('Database not initialized');
        }
        return this.adapter;
    }
    close() {
        if (this.adapter) {
            this.adapter.close();
            this.adapter = null;
        }
    }
}
exports.SQLiteStorageService = SQLiteStorageService;
//# sourceMappingURL=sqlite-storage-service.js.map