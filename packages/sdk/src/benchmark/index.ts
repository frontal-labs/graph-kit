// @graph-kit/sdk/src/benchmark/index.ts
// Benchmark suite for Graph-Kit - performance testing and regression detection

import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { QueryCompiler } from '../query';
import type { DriverAdapter } from '../types';

export interface BenchmarkConfig {
  name?: string;
  iterations?: number;
  warmupIterations?: number;
  concurrency?: number;
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
}

export interface BenchmarkResult {
  name: string;
  iterations: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  p50: number;
  p95: number;
  p99: number;
  opsPerSecond: number;
  memoryUsed?: number;
  timestamp: Date;
}

export interface BenchmarkSuiteResult {
  suiteName: string;
  results: BenchmarkResult[];
  summary: {
    totalBenchmarks: number;
    passed: number;
    failed: number;
    regressions: Regression[];
  };
}

export interface Regression {
  benchmark: string;
  currentAvg: number;
  baselineAvg: number;
  changePercent: number;
  threshold: number;
}

export interface BaselineConfig {
  storagePath?: string;
  autoSave?: boolean;
}

export class BenchmarkRunner {
  private baselines: Map<string, BenchmarkResult> = new Map();
  private storagePath: string;
  private autoSave: boolean;

  constructor(config: BaselineConfig = {}) {
    this.storagePath = config.storagePath ?? './benchmarks/baselines.json';
    this.autoSave = config.autoSave ?? true;
    this.loadBaselines();
  }

  private loadBaselines(): void {
    try {
      if (fs.existsSync(this.storagePath)) {
        const content = fs.readFileSync(this.storagePath, 'utf-8');
        const data = JSON.parse(content);
        for (const [key, value] of Object.entries(data)) {
          this.baselines.set(key, value as BenchmarkResult);
        }
      }
    } catch {
      // Ignore errors, start fresh
    }
  }

  private saveBaselines(): void {
    if (!this.autoSave) return;
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Object.fromEntries(this.baselines);
      fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2));
    } catch {
      // Ignore save errors
    }
  }

  async runBenchmark(
    name: string,
    fn: () => Promise<void>,
    config: BenchmarkConfig = { name },
  ): Promise<BenchmarkResult> {
    const iterations = config.iterations ?? 100;
    const warmupIterations = config.warmupIterations ?? 10;
    const concurrency = config.concurrency ?? 1;

    // Setup
    if (config.setup) {
      await config.setup();
    }

    // Warmup
    for (let i = 0; i < warmupIterations; i++) {
      await fn();
    }

    // Run benchmark
    const times: number[] = [];
    const startMemory = process.memoryUsage().heapUsed;

    if (concurrency === 1) {
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await fn();
        const end = performance.now();
        times.push(end - start);
      }
    } else {
      // Concurrent execution
      const batches = Math.ceil(iterations / concurrency);
      for (let b = 0; b < batches; b++) {
        const batchSize = Math.min(concurrency, iterations - b * concurrency);
        const promises = Array.from({ length: batchSize }, async () => {
          const start = performance.now();
          await fn();
          const end = performance.now();
          times.push(end - start);
        });
        await Promise.all(promises);
      }
    }

    const endMemory = process.memoryUsage().heapUsed;

    // Teardown
    if (config.teardown) {
      await config.teardown();
    }

    // Calculate statistics
    times.sort((a, b) => a - b);
    const totalTime = times.reduce((a, b) => a + b, 0);
    const avgTime = totalTime / iterations;
    const minTime = times[0] ?? 0;
    const maxTime = times[times.length - 1] ?? 0;
    const p50 = times[Math.floor(iterations * 0.5)] ?? 0;
    const p95 = times[Math.floor(iterations * 0.95)] ?? 0;
    const p99 = times[Math.floor(iterations * 0.99)] ?? 0;
    const opsPerSecond = 1000 / avgTime;

    const result: BenchmarkResult = {
      name,
      iterations,
      totalTime,
      avgTime,
      minTime,
      maxTime,
      p50,
      p95,
      p99,
      opsPerSecond,
      memoryUsed: endMemory - startMemory,
      timestamp: new Date(),
    };

    return result;
  }

  async runSuite(
    suiteName: string,
    benchmarks: Array<{ name: string; fn: () => Promise<void>; config?: BenchmarkConfig }>,
  ): Promise<BenchmarkSuiteResult> {
    const results: BenchmarkResult[] = [];
    const regressions: Regression[] = [];

    for (const bench of benchmarks) {
      const result = await this.runBenchmark(bench.name, bench.fn, bench.config);
      results.push(result);

      // Check for regression
      const baseline = this.baselines.get(bench.name);
      if (baseline) {
        const changePercent = ((result.avgTime - baseline.avgTime) / baseline.avgTime) * 100;
        if (changePercent > 20) {
          // 20% regression threshold
          regressions.push({
            benchmark: bench.name,
            currentAvg: result.avgTime,
            baselineAvg: baseline.avgTime,
            changePercent,
            threshold: 20,
          });
        }
      }

      // Update baseline if better
      if (!baseline || result.avgTime < baseline.avgTime) {
        this.baselines.set(bench.name, result);
      }
    }

    this.saveBaselines();

    return {
      suiteName,
      results,
      summary: {
        totalBenchmarks: results.length,
        passed: results.length - regressions.length,
        failed: regressions.length,
        regressions,
      },
    };
  }

  getBaseline(name: string): BenchmarkResult | undefined {
    return this.baselines.get(name);
  }

  setBaseline(name: string, result: BenchmarkResult): void {
    this.baselines.set(name, result);
    this.saveBaselines();
  }

  clearBaselines(): void {
    this.baselines.clear();
    this.saveBaselines();
  }

  exportResults(results: BenchmarkResult[], format: 'json' | 'csv' | 'markdown' = 'json'): string {
    switch (format) {
      case 'json':
        return JSON.stringify(results, null, 2);
      case 'csv': {
        const headers = [
          'name',
          'iterations',
          'avgTime',
          'minTime',
          'maxTime',
          'p50',
          'p95',
          'p99',
          'opsPerSecond',
          'memoryUsed',
        ];
        const rows = results.map((r) => [
          r.name,
          r.iterations,
          r.avgTime.toFixed(2),
          r.minTime.toFixed(2),
          r.maxTime.toFixed(2),
          r.p50.toFixed(2),
          r.p95.toFixed(2),
          r.p99.toFixed(2),
          r.opsPerSecond.toFixed(2),
          r.memoryUsed ?? 0,
        ]);
        return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      }
      case 'markdown': {
        let md =
          '| Benchmark | Iterations | Avg (ms) | Min (ms) | Max (ms) | P50 (ms) | P95 (ms) | P99 (ms) | Ops/sec |\n';
        md +=
          '|-----------|------------|----------|----------|----------|----------|----------|----------|---------|\n';
        for (const r of results) {
          md += `| ${r.name} | ${r.iterations} | ${r.avgTime.toFixed(2)} | ${r.minTime.toFixed(2)} | ${r.maxTime.toFixed(2)} | ${r.p50.toFixed(2)} | ${r.p95.toFixed(2)} | ${r.p99.toFixed(2)} | ${r.opsPerSecond.toFixed(2)} |\n`;
        }
        return md;
      }
      default:
        return JSON.stringify(results, null, 2);
    }
  }
}

export function createBenchmarkRunner(config?: BaselineConfig): BenchmarkRunner {
  return new BenchmarkRunner(config);
}

// Pre-defined benchmarks for Graph-Kit
export const graphBenchmarks = {
  async createNode(driver: DriverAdapter, label: string, count: number): Promise<void> {
    // Index the id lookups used by every later benchmark step; without it each MATCH scans the label
    await driver.runQuery(
      `CREATE INDEX bench_${label}_id IF NOT EXISTS FOR (n:${label}) ON (n.id)`,
    );
    const rows = Array.from({ length: count }, (_, i) => ({
      id: `bench_${i}`,
      name: `Benchmark ${i}`,
      value: i,
    }));
    await driver.runQuery(
      `UNWIND $rows AS row CREATE (n:${label} {id: row.id, name: row.name, value: row.value})`,
      { rows },
    );
  },

  async findNodes(driver: DriverAdapter, label: string, limit: number): Promise<void> {
    await driver.runQuery(`MATCH (n:${label}) RETURN n LIMIT ${limit}`);
  },

  async updateNodes(driver: DriverAdapter, label: string, count: number): Promise<void> {
    await driver.runQuery(
      `UNWIND range(0, $count - 1) AS i MATCH (n:${label} {id: 'bench_' + toString(i)}) SET n.updated = $updated`,
      { count, updated: Date.now() },
    );
  },

  async deleteNodes(driver: DriverAdapter, label: string, count: number): Promise<void> {
    await driver.runQuery(
      `UNWIND range(0, $count - 1) AS i MATCH (n:${label} {id: 'bench_' + toString(i)}) DETACH DELETE n`,
      { count },
    );
  },

  async createRelations(
    driver: DriverAdapter,
    fromLabel: string,
    toLabel: string,
    type: string,
    count: number,
  ): Promise<void> {
    await driver.runQuery(
      `UNWIND range(0, $count - 1) AS i MATCH (a:${fromLabel} {id: 'bench_' + toString(i)}), (b:${toLabel} {id: 'bench_' + toString(i)}) CREATE (a)-[:${type}]->(b)`,
      { count },
    );
  },

  async traverse(
    driver: DriverAdapter,
    fromLabel: string,
    type: string,
    toLabel: string,
    depth: number,
  ): Promise<void> {
    await driver.runQuery(
      `MATCH (a:${fromLabel})-[:${type}*1..${depth}]->(b:${toLabel}) RETURN a, b LIMIT 100`,
    );
  },

  async transaction(driver: DriverAdapter, operations: number): Promise<void> {
    await driver.runInTransaction(async (txc) => {
      for (let i = 0; i < operations; i++) {
        await txc.run(`CREATE (n:TxBench {id: 'tx_${i}', seq: ${i}})`);
      }
    });
  },
};

// Benchmark suite definitions
export const benchmarkSuites = {
  crud: [
    {
      name: 'create_100_nodes',
      fn: (driver: DriverAdapter) => graphBenchmarks.createNode(driver, 'BenchNode', 100),
    },
    {
      name: 'create_1000_nodes',
      fn: (driver: DriverAdapter) => graphBenchmarks.createNode(driver, 'BenchNode', 1000),
    },
    {
      name: 'find_100_nodes',
      fn: (driver: DriverAdapter) => graphBenchmarks.findNodes(driver, 'BenchNode', 100),
    },
    {
      name: 'find_1000_nodes',
      fn: (driver: DriverAdapter) => graphBenchmarks.findNodes(driver, 'BenchNode', 1000),
    },
    {
      name: 'update_100_nodes',
      fn: (driver: DriverAdapter) => graphBenchmarks.updateNodes(driver, 'BenchNode', 100),
    },
    {
      name: 'delete_100_nodes',
      fn: (driver: DriverAdapter) => graphBenchmarks.deleteNodes(driver, 'BenchNode', 100),
    },
  ],
  relations: [
    {
      name: 'create_100_relations',
      fn: (driver: DriverAdapter) =>
        graphBenchmarks.createRelations(driver, 'User', 'Post', 'POSTED', 100),
    },
    {
      name: 'create_1000_relations',
      fn: (driver: DriverAdapter) =>
        graphBenchmarks.createRelations(driver, 'User', 'Post', 'POSTED', 1000),
    },
    {
      name: 'traverse_depth_1',
      fn: (driver: DriverAdapter) => graphBenchmarks.traverse(driver, 'User', 'POSTED', 'Post', 1),
    },
    {
      name: 'traverse_depth_3',
      fn: (driver: DriverAdapter) => graphBenchmarks.traverse(driver, 'User', 'POSTED', 'Post', 3),
    },
  ],
  transactions: [
    {
      name: 'transaction_10_ops',
      fn: (driver: DriverAdapter) => graphBenchmarks.transaction(driver, 10),
    },
    {
      name: 'transaction_100_ops',
      fn: (driver: DriverAdapter) => graphBenchmarks.transaction(driver, 100),
    },
    {
      name: 'transaction_1000_ops',
      fn: (driver: DriverAdapter) => graphBenchmarks.transaction(driver, 1000),
    },
  ],
  queryCompiler: [
    {
      name: 'compile_find_many_simple',
      fn: async () => {
        const compiler = new QueryCompiler();
        compiler.compileFindMany('User', { limit: 10 });
      },
    },
    {
      name: 'compile_find_many_complex',
      fn: async () => {
        const compiler = new QueryCompiler();
        compiler.compileFindMany<Record<string, unknown>>('User', {
          where: {
            name: { contains: 'test' },
            age: { gte: 18 },
            AND: [{ active: { eq: true } }, { role: { in: ['admin', 'user'] } }],
          },
          orderBy: { name: 'asc', createdAt: 'desc' },
          limit: 50,
          skip: 100,
        });
      },
    },
    {
      name: 'compile_upsert',
      fn: async () => {
        const compiler = new QueryCompiler();
        compiler.compileUpsert(
          'User',
          { id: '1' },
          { name: 'Test' },
          { name: 'Updated' },
          { label: 'User', properties: {}, relations: {} },
        );
      },
    },
    {
      name: 'compile_path_traversal',
      fn: async () => {
        const compiler = new QueryCompiler();
        compiler.compilePath('User', 'FRIENDS', 'User', { fromId: '1', minDepth: 1, maxDepth: 3 });
      },
    },
  ],
};

// Run all benchmarks
export async function runAllBenchmarks(
  driver: DriverAdapter,
  runner: BenchmarkRunner,
): Promise<BenchmarkSuiteResult[]> {
  const suiteResults: BenchmarkSuiteResult[] = [];

  // CRUD benchmarks
  const crudSuite = await runner.runSuite(
    'crud',
    benchmarkSuites.crud.map((b) => ({
      name: b.name,
      fn: () => b.fn(driver),
      config: { iterations: 50, warmupIterations: 5 },
    })),
  );
  suiteResults.push(crudSuite);

  // Relations benchmarks
  const relationsSuite = await runner.runSuite(
    'relations',
    benchmarkSuites.relations.map((b) => ({
      name: b.name,
      fn: () => b.fn(driver),
      config: { iterations: 50, warmupIterations: 5 },
    })),
  );
  suiteResults.push(relationsSuite);

  // Transactions benchmarks
  const txSuite = await runner.runSuite(
    'transactions',
    benchmarkSuites.transactions.map((b) => ({
      name: b.name,
      fn: () => b.fn(driver),
      config: { iterations: 20, warmupIterations: 3 },
    })),
  );
  suiteResults.push(txSuite);

  // Query compiler benchmarks (no driver needed)
  const compilerSuite = await runner.runSuite(
    'queryCompiler',
    benchmarkSuites.queryCompiler.map((b) => ({
      name: b.name,
      fn: b.fn,
      config: { iterations: 1000, warmupIterations: 100 },
    })),
  );
  suiteResults.push(compilerSuite);

  return suiteResults;
}

// CI integration
export interface CIBenchmarkConfig {
  threshold?: number; // Percent regression threshold
  failOnRegression?: boolean;
  outputFormat?: 'json' | 'markdown' | 'github-actions';
  outputPath?: string;
}

export async function runCIOBenchmarks(
  driver: DriverAdapter,
  config: CIBenchmarkConfig = {},
): Promise<void> {
  const {
    threshold = 20,
    failOnRegression = true,
    outputFormat = 'github-actions',
    outputPath,
  } = config;

  const runner = createBenchmarkRunner();
  const suites = await runAllBenchmarks(driver, runner);

  let hasRegressions = false;
  let output = '';

  for (const suite of suites) {
    if (outputFormat === 'github-actions') {
      output += `## ${suite.suiteName}\n\n`;
      output += `| Benchmark | Avg (ms) | P95 (ms) | Ops/sec | Status |\n`;
      output += `|-----------|----------|----------|---------|--------|\n`;

      for (const result of suite.results) {
        const baseline = runner.getBaseline(result.name);
        let status = '✅';
        if (baseline) {
          const change = ((result.avgTime - baseline.avgTime) / baseline.avgTime) * 100;
          if (change > threshold) {
            status = `❌ Regression: +${change.toFixed(1)}%`;
            hasRegressions = true;
          } else if (change < -5) {
            status = `✅ Improved: ${change.toFixed(1)}%`;
          }
        }
        output += `| ${result.name} | ${result.avgTime.toFixed(2)} | ${result.p95.toFixed(2)} | ${result.opsPerSecond.toFixed(2)} | ${status} |\n`;
      }
      output += '\n';
    }
  }

  if (outputPath) {
    fs.writeFileSync(outputPath, output);
  } else {
    console.log(output);
  }

  if (hasRegressions && failOnRegression) {
    process.exit(1);
  }
}
