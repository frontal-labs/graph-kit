declare module 'kuzu' {
  export interface KuzuConnection {
    query(cypher: string, params?: Record<string, unknown>): Promise<KuzuQueryResult>;
    close(): Promise<void>;
  }

  export interface KuzuQueryResult {
    getColumnNames(): string[] | undefined;
    getNext(): boolean;
    getValue(index: number): unknown;
    hasNext(): boolean;
  }

  export class Database {
    constructor(path: string);
    connect(): KuzuConnection;
  }

  export class Connection {
    constructor(db: Database);
    query(cypher: string, params?: Record<string, unknown>): Promise<KuzuQueryResult>;
    close(): Promise<void>;
  }
}
