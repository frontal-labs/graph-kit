// @graph-kit/sdk/src/observability/index.ts
// Query logging, profiling, and observability for Graph-Kit

import { errorCode } from '../errors';
import type { DriverAdapter, QueryResult, TransactionContext } from '../types';

export interface QueryLogEntry {
  timestamp: Date;
  query: string;
  params: Record<string, unknown>;
  duration: number;
  rowsAffected: number;
  success: boolean;
  error?: Error;
  context?: Record<string, unknown>;
}

export interface QueryProfile {
  query: string;
  params: Record<string, unknown>;
  plan?: QueryPlan;
  duration: number;
  rowsReturned: number;
  rowsAffected: number;
  cacheHit: boolean;
  indexUsage: IndexUsage[];
}

export interface QueryPlan {
  operatorType: string;
  estimatedRows: number;
  estimatedCost: number;
  children?: QueryPlan[];
  details: Record<string, unknown>;
}

export interface IndexUsage {
  indexName: string;
  label: string;
  properties: string[];
  hits: number;
  scans: number;
}

export interface ProfilingOptions {
  enabled: boolean;
  logSlowQueries?: boolean;
  slowQueryThreshold?: number; // ms
  logAllQueries?: boolean;
  capturePlan?: boolean;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export const defaultLogger: Logger = {
  debug: (msg, meta) => console.debug(`[DEBUG] ${msg}`, meta ?? ''),
  info: (msg, meta) => console.info(`[INFO] ${msg}`, meta ?? ''),
  warn: (msg, meta) => console.warn(`[WARN] ${msg}`, meta ?? ''),
  error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta ?? ''),
};

export class QueryLogger {
  private logs: QueryLogEntry[] = [];
  private profiles: QueryProfile[] = [];
  private options: ProfilingOptions;
  private logger: Logger;
  private maxLogs: number;

  constructor(
    options: Partial<ProfilingOptions> = {},
    logger: Logger = defaultLogger,
    maxLogs = 1000,
  ) {
    this.options = {
      enabled: true,
      logSlowQueries: true,
      slowQueryThreshold: 100,
      logAllQueries: false,
      capturePlan: false,
      ...options,
    };
    this.logger = logger;
    this.maxLogs = maxLogs;
  }

  log(entry: Omit<QueryLogEntry, 'timestamp'>): void {
    if (!this.options.enabled) return;

    const logEntry: QueryLogEntry = {
      ...entry,
      timestamp: new Date(),
    };

    this.logs.push(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    if (this.options.logAllQueries) {
      this.logger.debug('Query executed', {
        query: entry.query,
        params: entry.params,
        duration: entry.duration,
        rowsAffected: entry.rowsAffected,
        success: entry.success,
      });
    }

    if (this.options.logSlowQueries && entry.duration > (this.options.slowQueryThreshold ?? 100)) {
      this.logger.warn('Slow query detected', {
        query: entry.query,
        params: entry.params,
        duration: entry.duration,
        threshold: this.options.slowQueryThreshold,
      });
    }

    if (!entry.success) {
      this.logger.error('Query failed', {
        query: entry.query,
        params: entry.params,
        error: entry.error?.message,
        errorCode: errorCode(entry.error),
      });
    }
  }

  profile(profile: QueryProfile): void {
    if (!this.options.enabled) return;
    this.profiles.push(profile);
    if (this.profiles.length > this.maxLogs) {
      this.profiles.shift();
    }
  }

  getLogs(filter?: {
    since?: Date;
    until?: Date;
    minDuration?: number;
    success?: boolean;
    queryContains?: string;
  }): QueryLogEntry[] {
    let filtered = [...this.logs];

    if (filter) {
      const { since, until, minDuration, queryContains } = filter;
      if (since) filtered = filtered.filter((l) => l.timestamp >= since);
      if (until) filtered = filtered.filter((l) => l.timestamp <= until);
      if (minDuration) filtered = filtered.filter((l) => l.duration >= minDuration);
      if (filter.success !== undefined)
        filtered = filtered.filter((l) => l.success === filter.success);
      if (queryContains) {
        filtered = filtered.filter((l) => l.query.includes(queryContains));
      }
    }

    return filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  getProfiles(): QueryProfile[] {
    return [...this.profiles].sort((a, b) => b.duration - a.duration);
  }

  getSlowQueries(threshold?: number): QueryLogEntry[] {
    return this.getLogs({ minDuration: threshold ?? this.options.slowQueryThreshold });
  }

  getFailedQueries(): QueryLogEntry[] {
    return this.getLogs({ success: false });
  }

  getStats(): {
    totalQueries: number;
    successfulQueries: number;
    failedQueries: number;
    avgDuration: number;
    maxDuration: number;
    slowQueries: number;
  } {
    const total = this.logs.length;
    if (total === 0) {
      return {
        totalQueries: 0,
        successfulQueries: 0,
        failedQueries: 0,
        avgDuration: 0,
        maxDuration: 0,
        slowQueries: 0,
      };
    }

    const successful = this.logs.filter((l) => l.success).length;
    const failed = total - successful;
    const durations = this.logs.map((l) => l.duration);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / total;
    const maxDuration = Math.max(...durations);
    const slowQueries = this.logs.filter(
      (l) => l.duration > (this.options.slowQueryThreshold ?? 100),
    ).length;

    return {
      totalQueries: total,
      successfulQueries: successful,
      failedQueries: failed,
      avgDuration,
      maxDuration,
      slowQueries,
    };
  }

  clear(): void {
    this.logs = [];
    this.profiles = [];
  }

  setOptions(options: Partial<ProfilingOptions>): void {
    this.options = { ...this.options, ...options };
  }
}

export function createQueryLogger(
  options?: Partial<ProfilingOptions>,
  logger?: Logger,
): QueryLogger {
  return new QueryLogger(options, logger);
}

// Driver wrapper for automatic query logging
export class LoggingDriverAdapter implements DriverAdapter {
  private driver: DriverAdapter;
  private queryLogger: QueryLogger;

  constructor(driver: DriverAdapter, queryLogger: QueryLogger) {
    this.driver = driver;
    this.queryLogger = queryLogger;
  }

  async connect(): Promise<void> {
    return this.driver.connect();
  }

  async disconnect(): Promise<void> {
    return this.driver.disconnect();
  }

  async runQuery(cypher: string, params?: Record<string, unknown>): Promise<QueryResult> {
    const start = process.hrtime.bigint();
    let success = true;
    let error: Error | undefined;
    let result: QueryResult = {
      records: [],
      summary: {
        query: { text: cypher, parameters: params ?? {} },
        counters: {},
        notifications: [],
        resultAvailableAfter: 0,
        resultConsumedAfter: 0,
        database: { name: '' },
      },
      keys: [],
    };

    try {
      result = await this.driver.runQuery(cypher, params);
    } catch (e) {
      success = false;
      error = e as Error;
      throw e;
    } finally {
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1_000_000; // Convert to ms

      const counters = result?.summary?.counters ?? {};
      const rowsAffected =
        (counters['nodesCreated'] ?? 0) +
        (counters['nodesDeleted'] ?? 0) +
        (counters['relationshipsCreated'] ?? 0) +
        (counters['relationshipsDeleted'] ?? 0);

      this.queryLogger.log({
        query: cypher,
        params: params ?? {},
        duration,
        rowsAffected,
        success,
        error,
      });
    }

    return result;
  }

  async runInTransaction<T>(work: (txc: TransactionContext) => Promise<T>): Promise<T> {
    const start = process.hrtime.bigint();
    let success = true;
    let error: Error | undefined;

    try {
      return await this.driver.runInTransaction(async (txc) => {
        const wrappedTxc: TransactionContext = {
          run: async (query: string, params?: Record<string, unknown>) => {
            const qStart = process.hrtime.bigint();
            let qSuccess = true;
            let qError: Error | undefined;
            let qResult: QueryResult = {
              records: [],
              summary: {
                query: { text: query, parameters: params ?? {} },
                counters: {},
                notifications: [],
                resultAvailableAfter: 0,
                resultConsumedAfter: 0,
                database: { name: '' },
              },
              keys: [],
            };

            try {
              qResult = await txc.run(query, params);
            } catch (e) {
              qSuccess = false;
              qError = e as Error;
              throw e;
            } finally {
              const qEnd = process.hrtime.bigint();
              const qDuration = Number(qEnd - qStart) / 1_000_000;

              const qCounters = qResult?.summary?.counters ?? {};
              const qRowsAffected =
                (qCounters['nodesCreated'] ?? 0) +
                (qCounters['nodesDeleted'] ?? 0) +
                (qCounters['relationshipsCreated'] ?? 0) +
                (qCounters['relationshipsDeleted'] ?? 0);

              this.queryLogger.log({
                query,
                params: params ?? {},
                duration: qDuration,
                rowsAffected: qRowsAffected,
                success: qSuccess,
                error: qError,
                context: { transaction: true },
              });
            }

            return qResult;
          },
        };
        return work(wrappedTxc);
      });
    } catch (e) {
      success = false;
      error = e as Error;
      throw e;
    } finally {
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1_000_000;

      this.queryLogger.log({
        query: 'TRANSACTION',
        params: {},
        duration,
        rowsAffected: 0,
        success,
        error,
        context: { transaction: true },
      });
    }
  }

  async runInReadTransaction<T>(work: (txc: TransactionContext) => Promise<T>): Promise<T> {
    return this.driver.runInReadTransaction(work);
  }

  async verifyConnectivity(): Promise<boolean> {
    return this.driver.verifyConnectivity();
  }

  async getServerInfo(): Promise<{ address: string; version: string; protocol: string }> {
    return this.driver.getServerInfo();
  }

  getQueryLogger(): QueryLogger {
    return this.queryLogger;
  }
}

export function withQueryLogging(
  driver: DriverAdapter,
  options?: Partial<ProfilingOptions>,
): LoggingDriverAdapter {
  const logger = createQueryLogger(options);
  return new LoggingDriverAdapter(driver, logger);
}

// Query explain plan helper
export interface ExplainResult {
  plan: QueryPlan;
  profile?: QueryProfile;
}

export class QueryProfiler {
  private driver: DriverAdapter;

  constructor(driver: DriverAdapter) {
    this.driver = driver;
  }

  async explain(cypher: string, params?: Record<string, unknown>): Promise<ExplainResult> {
    const explainCypher = `EXPLAIN ${cypher}`;
    const result = await this.driver.runQuery(explainCypher, params);
    return this.parseExplainResult(result);
  }

  async profile(cypher: string, params?: Record<string, unknown>): Promise<ExplainResult> {
    const profileCypher = `PROFILE ${cypher}`;
    const result = await this.driver.runQuery(profileCypher, params);
    return this.parseExplainResult(result);
  }

  private parseExplainResult(result: QueryResult): ExplainResult {
    // Parse Neo4j EXPLAIN/PROFILE output
    // The result structure varies by Neo4j version
    const record = result.records[0];
    if (!record) {
      return { plan: { operatorType: 'Unknown', estimatedRows: 0, estimatedCost: 0, details: {} } };
    }

    // Try to extract plan from various possible columns
    const planData = record.get('plan') || record.get('Plan') || record.toObject();

    return {
      plan: this.parsePlan(planData),
      profile: result.records.length > 1 ? this.parseProfile(result) : undefined,
    };
  }

  private parsePlan(data: unknown): QueryPlan {
    if (!data || typeof data !== 'object') {
      return { operatorType: 'Unknown', estimatedRows: 0, estimatedCost: 0, details: {} };
    }

    const obj = data as Record<string, unknown>;

    return {
      operatorType: String(obj['operatorType'] ?? obj['operator-type'] ?? obj['name'] ?? 'Unknown'),
      estimatedRows: Number(obj['estimatedRows'] ?? obj['estimated-rows'] ?? obj['rows'] ?? 0),
      estimatedCost: Number(obj['estimatedCost'] ?? obj['estimated-cost'] ?? obj['cost'] ?? 0),
      children: Array.isArray(obj['children'])
        ? obj['children'].map((c) => this.parsePlan(c))
        : undefined,
      details: obj,
    };
  }

  private parseProfile(result: QueryResult): QueryProfile {
    // Simplified profile parsing
    return {
      query: '',
      params: {},
      duration: 0,
      rowsReturned: result.records.length,
      rowsAffected: 0,
      cacheHit: false,
      indexUsage: [],
    };
  }
}

export function createQueryProfiler(driver: DriverAdapter): QueryProfiler {
  return new QueryProfiler(driver);
}

// Metrics collector for Prometheus/OpenTelemetry
export interface MetricsCollector {
  incrementCounter(name: string, labels?: Record<string, string>): void;
  recordHistogram(name: string, value: number, labels?: Record<string, string>): void;
  setGauge(name: string, value: number, labels?: Record<string, string>): void;
}

export class PrometheusMetricsCollector implements MetricsCollector {
  private counters: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private gauges: Map<string, number> = new Map();

  incrementCounter(name: string, labels?: Record<string, string>): void {
    const key = this.getKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.getKey(name, labels);
    const arr = this.histograms.get(key) ?? [];
    arr.push(value);
    this.histograms.set(key, arr);
  }

  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.getKey(name, labels);
    this.gauges.set(key, value);
  }

  getMetrics(): string {
    const lines: string[] = [];

    for (const [key, value] of this.counters) {
      lines.push(`# TYPE ${key} counter`);
      lines.push(`${key} ${value}`);
    }

    for (const [key, values] of this.histograms) {
      lines.push(`# TYPE ${key} histogram`);
      const sum = values.reduce((a, b) => a + b, 0);
      const count = values.length;
      const avg = count > 0 ? sum / count : 0;
      lines.push(`${key}_sum ${sum}`);
      lines.push(`${key}_count ${count}`);
      lines.push(`${key}_avg ${avg}`);
    }

    for (const [key, value] of this.gauges) {
      lines.push(`# TYPE ${key} gauge`);
      lines.push(`${key} ${value}`);
    }

    return lines.join('\n');
  }

  private getKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return name;
    const labelStr = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `${name}{${labelStr}}`;
  }
}

export function createPrometheusMetricsCollector(): PrometheusMetricsCollector {
  return new PrometheusMetricsCollector();
}

export function withMetrics(driver: DriverAdapter, collector: MetricsCollector): DriverAdapter {
  return {
    ...driver,
    async runQuery(cypher: string, params?: Record<string, unknown>) {
      const start = process.hrtime.bigint();
      try {
        const result = await driver.runQuery(cypher, params);
        collector.incrementCounter('metal_queries_total', { status: 'success' });
        collector.recordHistogram(
          'metal_query_duration_ms',
          Number(process.hrtime.bigint() - start) / 1_000_000,
        );
        return result;
      } catch (error) {
        collector.incrementCounter('metal_queries_total', {
          status: 'error',
          code: errorCode(error) ?? 'unknown',
        });
        throw error;
      }
    },
  };
}
