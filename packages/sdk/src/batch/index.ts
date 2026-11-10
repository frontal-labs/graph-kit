// @graph-kit/sdk/src/batch/index.ts
// Batch operations and bulk import for Graph-Kit

import type { AnyNodeConfig, DriverAdapter, GraphSchemaRegistry, QueryResult } from '../types';

export interface BatchOptions {
  batchSize?: number;
  concurrency?: number;
  continueOnError?: boolean;
  transactional?: boolean;
}

export interface BulkInsertOptions<T extends Record<string, unknown>> {
  label: string;
  data: T[];
  options?: BatchOptions;
  onProgress?: (progress: BulkProgress) => void;
}

export interface BulkProgress {
  total: number;
  processed: number;
  successful: number;
  failed: number;
  currentBatch: number;
  totalBatches: number;
}

export interface BulkResult<T> {
  successful: T[];
  failed: Array<{ data: T; error: Error; index: number }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
    duration: number;
  };
}

export interface BulkUpdateOptions<T extends Record<string, unknown>> {
  label: string;
  data: Array<{ where: Record<string, unknown>; data: T }>;
  options?: BatchOptions;
  onProgress?: (progress: BulkProgress) => void;
}

export interface BulkDeleteOptions {
  label: string;
  where: Array<Record<string, unknown>>;
  options?: BatchOptions;
  onProgress?: (progress: BulkProgress) => void;
}

export interface BulkRelateOptions {
  fromLabel: string;
  relationType: string;
  toLabel: string;
  relations: Array<{ fromId: string; toId: string; properties?: Record<string, unknown> }>;
  direction?: 'IN' | 'OUT' | 'BOTH';
  options?: BatchOptions;
  onProgress?: (progress: BulkProgress) => void;
}

export interface CSVImportOptions {
  label: string;
  filePath: string;
  delimiter?: string;
  hasHeader?: boolean;
  mapping?: Record<string, string>;
  transform?: (row: Record<string, string>) => Record<string, unknown>;
  options?: BatchOptions;
  onProgress?: (progress: BulkProgress) => void;
}

export interface JSONImportOptions {
  label: string;
  filePath: string;
  transform?: (obj: Record<string, unknown>) => Record<string, unknown>;
  options?: BatchOptions;
  onProgress?: (progress: BulkProgress) => void;
}

export class BatchProcessor {
  private driver: DriverAdapter;
  private schema?: GraphSchemaRegistry;
  private defaultBatchSize: number;
  private defaultConcurrency: number;

  constructor(config: {
    driver: DriverAdapter;
    schema?: GraphSchemaRegistry;
    defaultBatchSize?: number;
    defaultConcurrency?: number;
  }) {
    this.driver = config.driver;
    this.schema = config.schema;
    this.defaultBatchSize = config.defaultBatchSize ?? 1000;
    this.defaultConcurrency = config.defaultConcurrency ?? 4;
  }

  async bulkInsert<T extends Record<string, unknown>>(
    options: BulkInsertOptions<T>,
  ): Promise<BulkResult<T>> {
    const { label, data, options: batchOptions = {}, onProgress } = options;
    const batchSize = batchOptions.batchSize ?? this.defaultBatchSize;
    const _concurrency = batchOptions.concurrency ?? this.defaultConcurrency;
    const continueOnError = batchOptions.continueOnError ?? true;
    const transactional = batchOptions.transactional ?? false;

    const nodeConfig = this.schema ? (this.schema[label] ?? null) : null;
    const total = data.length;
    const totalBatches = Math.ceil(total / batchSize);

    const successful: T[] = [];
    const failed: Array<{ data: T; error: Error; index: number }> = [];
    let processed = 0;

    const startTime = Date.now();

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const start = batchIndex * batchSize;
      const end = Math.min(start + batchSize, total);
      const batch = data.slice(start, end);

      if (onProgress) {
        onProgress({
          total,
          processed,
          successful: successful.length,
          failed: failed.length,
          currentBatch: batchIndex + 1,
          totalBatches,
        });
      }

      try {
        if (transactional) {
          await this.driver.runInTransaction(async (txc) => {
            await this.insertBatchInTransaction(txc, label, batch, nodeConfig);
          });
        } else {
          await this.insertBatch(label, batch, nodeConfig);
        }

        successful.push(...batch);
        processed += batch.length;
      } catch (error) {
        if (continueOnError) {
          // Process individually to identify failures
          for (let i = 0; i < batch.length; i++) {
            const item = batch[i];
            if (!item) continue;
            try {
              await this.insertBatch(label, [item], nodeConfig);
              successful.push(item);
              processed++;
            } catch (e) {
              failed.push({ data: item, error: e as Error, index: start + i });
              processed++;
            }
          }
        } else {
          // Mark all in batch as failed
          for (let i = 0; i < batch.length; i++) {
            const item = batch[i];
            if (!item) continue;
            failed.push({ data: item, error: error as Error, index: start + i });
          }
          processed += batch.length;
          break;
        }
      }
    }

    if (onProgress) {
      onProgress({
        total,
        processed,
        successful: successful.length,
        failed: failed.length,
        currentBatch: totalBatches,
        totalBatches,
      });
    }

    return {
      successful,
      failed,
      summary: {
        total,
        successful: successful.length,
        failed: failed.length,
        duration: Date.now() - startTime,
      },
    };
  }

  private async insertBatch(
    label: string,
    batch: Record<string, unknown>[],
    _nodeConfig: AnyNodeConfig | null,
  ): Promise<void> {
    const statements: string[] = [];
    const params: Record<string, unknown> = {};

    for (let i = 0; i < batch.length; i++) {
      const record = batch[i];
      if (!record) continue;
      const paramPrefix = `b${i}_`;

      const setClauses: string[] = [];
      for (const [key, value] of Object.entries(record)) {
        if (value === undefined) continue;
        const paramName = `${paramPrefix}${key}`;
        setClauses.push(`${key}: $${paramName}`);
        params[paramName] = value;
      }

      if (setClauses.length > 0) {
        const propsString = `{ ${setClauses.join(', ')} }`;
        statements.push(`CREATE (n${i}:${label} ${propsString})`);
      } else {
        statements.push(`CREATE (n${i}:${label})`);
      }
    }

    if (statements.length === 0) return;

    const cypher = statements.join('\n');
    await this.driver.runQuery(cypher, params);
  }

  private async insertBatchInTransaction(
    txc: { run: (query: string, params?: Record<string, unknown>) => Promise<QueryResult> },
    label: string,
    batch: Record<string, unknown>[],
    _nodeConfig: AnyNodeConfig | null,
  ): Promise<void> {
    const statements: string[] = [];
    const params: Record<string, unknown> = {};

    for (let i = 0; i < batch.length; i++) {
      const record = batch[i];
      if (!record) continue;
      const paramPrefix = `b${i}_`;

      const setClauses: string[] = [];
      for (const [key, value] of Object.entries(record)) {
        if (value === undefined) continue;
        const paramName = `${paramPrefix}${key}`;
        setClauses.push(`${key}: $${paramName}`);
        params[paramName] = value;
      }

      if (setClauses.length > 0) {
        const propsString = `{ ${setClauses.join(', ')} }`;
        statements.push(`CREATE (n${i}:${label} ${propsString})`);
      } else {
        statements.push(`CREATE (n${i}:${label})`);
      }
    }

    if (statements.length === 0) return;

    const cypher = statements.join('\n');
    await txc.run(cypher, params);
  }

  async bulkUpdate<T extends Record<string, unknown>>(
    options: BulkUpdateOptions<T>,
  ): Promise<BulkResult<{ where: Record<string, unknown>; data: T }>> {
    const { label, data, options: batchOptions = {}, onProgress } = options;
    const batchSize = batchOptions.batchSize ?? this.defaultBatchSize;
    const continueOnError = batchOptions.continueOnError ?? true;

    const nodeConfig = this.schema ? (this.schema[label] ?? null) : null;
    const total = data.length;
    const totalBatches = Math.ceil(total / batchSize);

    const successful: Array<{ where: Record<string, unknown>; data: T }> = [];
    const failed: Array<{
      data: { where: Record<string, unknown>; data: T };
      error: Error;
      index: number;
    }> = [];
    let processed = 0;

    const startTime = Date.now();

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const start = batchIndex * batchSize;
      const end = Math.min(start + batchSize, total);
      const batch = data.slice(start, end);

      if (onProgress) {
        onProgress({
          total,
          processed,
          successful: successful.length,
          failed: failed.length,
          currentBatch: batchIndex + 1,
          totalBatches,
        });
      }

      try {
        await this.updateBatch(label, batch, nodeConfig);
        successful.push(...batch);
        processed += batch.length;
      } catch (error) {
        if (continueOnError) {
          for (let i = 0; i < batch.length; i++) {
            const item = batch[i];
            if (!item) continue;
            try {
              await this.updateBatch(label, [item], nodeConfig);
              successful.push(item);
              processed++;
            } catch (e) {
              failed.push({ data: item, error: e as Error, index: start + i });
              processed++;
            }
          }
        } else {
          for (let i = 0; i < batch.length; i++) {
            const item = batch[i];
            if (!item) continue;
            failed.push({ data: item, error: error as Error, index: start + i });
          }
          processed += batch.length;
          break;
        }
      }
    }

    return {
      successful,
      failed,
      summary: {
        total,
        successful: successful.length,
        failed: failed.length,
        duration: Date.now() - startTime,
      },
    };
  }

  private async updateBatch(
    label: string,
    batch: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }>,
    _nodeConfig: AnyNodeConfig | null,
  ): Promise<void> {
    const statements: string[] = [];
    const params: Record<string, unknown> = {};

    for (let i = 0; i < batch.length; i++) {
      const entry = batch[i];
      if (!entry) continue;
      const { where, data } = entry;
      const paramPrefix = `b${i}_`;
      const alias = `n${i}`;

      // Build WHERE clause
      const whereClauses: string[] = [];
      for (const [key, value] of Object.entries(where)) {
        const paramName = `${paramPrefix}w_${key}`;
        whereClauses.push(`${alias}.${key} = $${paramName}`);
        params[paramName] = value;
      }

      // Build SET clause
      const setClauses: string[] = [];
      for (const [key, value] of Object.entries(data)) {
        if (value === undefined) continue;
        const paramName = `${paramPrefix}s_${key}`;
        setClauses.push(`${alias}.${key} = $${paramName}`);
        params[paramName] = value;
      }

      if (setClauses.length === 0) continue;

      const cypher = `MATCH (${alias}:${label}) WHERE ${whereClauses.join(' AND ')} SET ${setClauses.join(', ')}`;
      statements.push(cypher);
    }

    if (statements.length === 0) return;

    const cypher = statements.join('\n');
    await this.driver.runQuery(cypher, params);
  }

  async bulkDelete(options: BulkDeleteOptions): Promise<BulkResult<Record<string, unknown>>> {
    const { label, where, options: batchOptions = {}, onProgress } = options;
    const batchSize = batchOptions.batchSize ?? this.defaultBatchSize;
    const continueOnError = batchOptions.continueOnError ?? true;

    const nodeConfig = this.schema ? (this.schema[label] ?? null) : null;
    const total = where.length;
    const totalBatches = Math.ceil(total / batchSize);

    const successful: Record<string, unknown>[] = [];
    const failed: Array<{ data: Record<string, unknown>; error: Error; index: number }> = [];
    let processed = 0;

    const startTime = Date.now();

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const start = batchIndex * batchSize;
      const end = Math.min(start + batchSize, total);
      const batch = where.slice(start, end);

      if (onProgress) {
        onProgress({
          total,
          processed,
          successful: successful.length,
          failed: failed.length,
          currentBatch: batchIndex + 1,
          totalBatches,
        });
      }

      try {
        await this.deleteBatch(label, batch, nodeConfig);
        successful.push(...batch);
        processed += batch.length;
      } catch (error) {
        if (continueOnError) {
          for (let i = 0; i < batch.length; i++) {
            const item = batch[i];
            if (!item) continue;
            try {
              await this.deleteBatch(label, [item], nodeConfig);
              successful.push(item);
              processed++;
            } catch (e) {
              failed.push({ data: item, error: e as Error, index: start + i });
              processed++;
            }
          }
        } else {
          for (let i = 0; i < batch.length; i++) {
            const item = batch[i];
            if (!item) continue;
            failed.push({ data: item, error: error as Error, index: start + i });
          }
          processed += batch.length;
          break;
        }
      }
    }

    return {
      successful,
      failed,
      summary: {
        total,
        successful: successful.length,
        failed: failed.length,
        duration: Date.now() - startTime,
      },
    };
  }

  private async deleteBatch(
    label: string,
    batch: Record<string, unknown>[],
    _nodeConfig: AnyNodeConfig | null,
  ): Promise<void> {
    const statements: string[] = [];
    const params: Record<string, unknown> = {};

    for (let i = 0; i < batch.length; i++) {
      const where = batch[i];
      if (!where) continue;
      const paramPrefix = `b${i}_`;
      const alias = `n${i}`;

      const whereClauses: string[] = [];
      for (const [key, value] of Object.entries(where)) {
        const paramName = `${paramPrefix}w_${key}`;
        whereClauses.push(`${alias}.${key} = $${paramName}`);
        params[paramName] = value;
      }

      if (whereClauses.length === 0) continue;

      const cypher = `MATCH (${alias}:${label}) WHERE ${whereClauses.join(' AND ')} DETACH DELETE ${alias}`;
      statements.push(cypher);
    }

    if (statements.length === 0) return;

    const cypher = statements.join('\n');
    await this.driver.runQuery(cypher, params);
  }

  async bulkRelate(
    options: BulkRelateOptions,
  ): Promise<BulkResult<{ fromId: string; toId: string; properties?: Record<string, unknown> }>> {
    const {
      fromLabel,
      relationType,
      toLabel,
      relations,
      direction = 'OUT',
      options: batchOptions = {},
      onProgress,
    } = options;
    const batchSize = batchOptions.batchSize ?? this.defaultBatchSize;
    const continueOnError = batchOptions.continueOnError ?? true;

    const total = relations.length;
    const totalBatches = Math.ceil(total / batchSize);

    const successful: Array<{
      fromId: string;
      toId: string;
      properties?: Record<string, unknown>;
    }> = [];
    const failed: Array<{
      data: { fromId: string; toId: string; properties?: Record<string, unknown> };
      error: Error;
      index: number;
    }> = [];
    let processed = 0;

    const startTime = Date.now();

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const start = batchIndex * batchSize;
      const end = Math.min(start + batchSize, total);
      const batch = relations.slice(start, end);

      if (onProgress) {
        onProgress({
          total,
          processed,
          successful: successful.length,
          failed: failed.length,
          currentBatch: batchIndex + 1,
          totalBatches,
        });
      }

      try {
        await this.relateBatch(fromLabel, relationType, toLabel, batch, direction);
        successful.push(...batch);
        processed += batch.length;
      } catch (error) {
        if (continueOnError) {
          for (let i = 0; i < batch.length; i++) {
            const item = batch[i];
            if (!item) continue;
            try {
              await this.relateBatch(fromLabel, relationType, toLabel, [item], direction);
              successful.push(item);
              processed++;
            } catch (e) {
              failed.push({ data: item, error: e as Error, index: start + i });
              processed++;
            }
          }
        } else {
          for (let i = 0; i < batch.length; i++) {
            const item = batch[i];
            if (!item) continue;
            failed.push({ data: item, error: error as Error, index: start + i });
          }
          processed += batch.length;
          break;
        }
      }
    }

    return {
      successful,
      failed,
      summary: {
        total,
        successful: successful.length,
        failed: failed.length,
        duration: Date.now() - startTime,
      },
    };
  }

  private async relateBatch(
    fromLabel: string,
    relationType: string,
    toLabel: string,
    batch: Array<{ fromId: string; toId: string; properties?: Record<string, unknown> }>,
    direction: 'IN' | 'OUT' | 'BOTH',
  ): Promise<void> {
    const statements: string[] = [];
    const params: Record<string, unknown> = {};

    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      if (!item) continue;
      const { fromId, toId, properties } = item;
      const paramPrefix = `b${i}_`;

      let relClause: string;
      if (direction === 'OUT') {
        relClause = `CREATE (a)-[r:${relationType}]->(b)`;
      } else if (direction === 'IN') {
        relClause = `CREATE (a)<-[r:${relationType}]-(b)`;
      } else {
        relClause = `CREATE (a)-[r:${relationType}]-(b)`;
      }

      if (properties && Object.keys(properties).length > 0) {
        const propClauses: string[] = [];
        for (const [key, value] of Object.entries(properties)) {
          const paramName = `${paramPrefix}p_${key}`;
          propClauses.push(`r.${key} = $${paramName}`);
          params[paramName] = value;
        }
        relClause = relClause.replace(
          `[r:${relationType}]`,
          `[r:${relationType} { ${propClauses.join(', ')} }]`,
        );
      }

      const cypher = `MATCH (a:${fromLabel} {id: $${paramPrefix}fromId}), (b:${toLabel} {id: $${paramPrefix}toId}) ${relClause}`;
      statements.push(cypher);
      params[`${paramPrefix}fromId`] = fromId;
      params[`${paramPrefix}toId`] = toId;
    }

    if (statements.length === 0) return;

    const cypher = statements.join('\n');
    await this.driver.runQuery(cypher, params);
  }
}

export function createBatchProcessor(config: {
  driver: DriverAdapter;
  schema?: GraphSchemaRegistry;
  defaultBatchSize?: number;
  defaultConcurrency?: number;
}): BatchProcessor {
  return new BatchProcessor(config);
}

// CSV Import
export async function importFromCSV(
  config: CSVImportOptions,
): Promise<BulkResult<Record<string, unknown>>> {
  const fs = await import('node:fs/promises');
  const content = await fs.readFile(config.filePath, 'utf-8');

  const lines = content.trim().split('\n');
  if (lines.length < 2 && config.hasHeader !== false) {
    return {
      successful: [],
      failed: [],
      summary: { total: 0, successful: 0, failed: 0, duration: 0 },
    };
  }

  const hasHeader = config.hasHeader ?? true;
  const delimiter = config.delimiter ?? ',';
  const startLine = hasHeader ? 1 : 0;

  let headers: string[];
  if (hasHeader) {
    const firstLine = lines[0];
    if (!firstLine)
      return {
        successful: [],
        failed: [],
        summary: { total: 0, successful: 0, failed: 0, duration: 0 },
      };
    headers = firstLine.split(delimiter).map((h) => h.trim());
  } else {
    // Generate generic headers
    const firstLine = lines[0];
    if (!firstLine)
      return {
        successful: [],
        failed: [],
        summary: { total: 0, successful: 0, failed: 0, duration: 0 },
      };
    headers = firstLine.split(delimiter).map((_, i) => `col${i}`);
  }

  const data: Record<string, unknown>[] = [];

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const values = line.split(delimiter).map((v) => v.trim());
    const row: Record<string, unknown> = {};

    headers.forEach((header, idx) => {
      let value: unknown = values[idx] ?? '';
      // Type inference
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (!Number.isNaN(Number(value)) && value !== '') value = Number(value);

      const mappedKey = config.mapping?.[header] ?? header;
      row[mappedKey] = value;
    });

    if (config.transform) {
      const transformed = config.transform(row as Record<string, string>);
      data.push(transformed);
    } else {
      data.push(row);
    }
  }

  // We need a driver to actually insert - this would be called with a BatchProcessor
  // For now return the parsed data
  return {
    successful: data,
    failed: [],
    summary: { total: data.length, successful: data.length, failed: 0, duration: 0 },
  };
}

// JSON Import
export async function importFromJSON(
  config: JSONImportOptions,
): Promise<BulkResult<Record<string, unknown>>> {
  const fs = await import('node:fs/promises');
  const content = await fs.readFile(config.filePath, 'utf-8');
  let data: Record<string, unknown>[] = JSON.parse(content);

  if (!Array.isArray(data)) {
    data = [data];
  }

  if (config.transform) {
    data = data.map(config.transform);
  }

  return {
    successful: data,
    failed: [],
    summary: { total: data.length, successful: data.length, failed: 0, duration: 0 },
  };
}

// Export to CSV
export function exportToCSV(
  data: Record<string, unknown>[],
  options: { delimiter?: string } = {},
): string {
  const delimiter = options.delimiter ?? ',';

  if (data.length === 0) return '';

  const firstRow = data[0];
  if (!firstRow) return '';

  const headers = Object.keys(firstRow);
  const rows = data.map((row) =>
    headers
      .map((h) => {
        const value = row[h];
        if (value === null || value === undefined) return '';
        if (
          typeof value === 'string' &&
          (value.includes(delimiter) || value.includes('"') || value.includes('\n'))
        ) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return String(value);
      })
      .join(delimiter),
  );

  return [headers.join(delimiter), ...rows].join('\n');
}

// Export to JSON
export function exportToJSON(data: Record<string, unknown>[], pretty = true): string {
  return JSON.stringify(data, null, pretty ? 2 : 0);
}
