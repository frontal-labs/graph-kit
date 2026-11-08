// @graph-om/sdk/src/otel/index.ts
// OpenTelemetry integration for Graph-OM

import { errorCode, isFrontalError } from '../errors';
import type { MetricsCollector } from '../observability';
import type { DriverAdapter, QueryResult, TransactionContext } from '../types';

export interface OTelConfig {
  serviceName: string;
  serviceVersion?: string;
  endpoint?: string; // OTLP endpoint
  headers?: Record<string, string>;
  sampler?: 'always_on' | 'always_off' | 'traceidratio' | 'parentbased_traceidratio';
  samplerRatio?: number;
  instrumentations?: {
    neo4j?: boolean;
    http?: boolean;
    grpc?: boolean;
    dns?: boolean;
    fs?: boolean;
  };
}

export interface SpanAttributes {
  'db.system': string;
  'db.operation': string;
  'db.statement': string;
  'db.name'?: string;
  'db.user'?: string;
  'net.peer.name'?: string;
  'net.peer.port'?: number;
  error?: boolean;
  'error.message'?: string;
  'error.stack'?: string;
  [key: string]: unknown;
}

export interface MetricAttributes {
  'db.system': string;
  'db.operation': string;
  'db.name'?: string;
  error?: boolean;
  [key: string]: unknown;
}

declare global {
  interface Window {
    __OTEL_INIT__?: boolean;
  }
}

// OpenTelemetry types (simplified - would import from @opentelemetry/api in real usage)
export interface Tracer {
  startSpan(name: string, options?: SpanOptions): Span;
  startActiveSpan(name: string, options?: SpanOptions, callback?: (span: Span) => void): void;
}

export interface SpanOptions {
  attributes?: Record<string, unknown>;
  kind?: SpanKind;
  startTime?: number;
}

export interface Span {
  setAttribute(key: string, value: unknown): void;
  setAttributes(attributes: Record<string, unknown>): void;
  addEvent(name: string, attributes?: Record<string, unknown>): void;
  recordException(exception: Error, timeOrAttributes?: unknown): void;
  setStatus(status: SpanStatus): void;
  end(endTime?: number): void;
  spanContext(): SpanContext;
}

export interface SpanContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
}

export interface SpanStatus {
  code: SpanStatusCode;
  message?: string;
}

export enum SpanKind {
  INTERNAL = 0,
  SERVER = 1,
  CLIENT = 2,
  PRODUCER = 3,
  CONSUMER = 4,
}

export enum SpanStatusCode {
  UNSET = 0,
  OK = 1,
  ERROR = 2,
}

export interface Meter {
  createCounter(name: string, options?: MetricOptions): Counter;
  createHistogram(name: string, options?: MetricOptions): Histogram;
  createUpDownCounter(name: string, options?: MetricOptions): UpDownCounter;
  createObservableGauge(name: string, options?: MetricOptions, callback?: ObservableCallback): void;
}

export type ValueType = string;

export interface MetricOptions {
  description?: string;
  unit?: string;
  valueType?: ValueType;
}

export interface Counter {
  add(value: number, attributes?: unknown): void;
}

export interface Histogram {
  record(value: number, attributes?: unknown): void;
}

export interface UpDownCounter {
  add(value: number, attributes?: unknown): void;
}

export type ObservableCallback = (result: ObservableResult) => void;

export interface ObservableResult {
  observe(value: number, attributes?: Record<string, unknown>): void;
}

export interface PropagationContext {
  baggage?: Record<string, string>;
  traceparent?: string;
  tracestate?: string;
}

// No-op implementations for when OTel is not configured
class NoopSpan implements Span {
  setAttribute(): void {}
  setAttributes(): void {}
  addEvent(): void {}
  recordException(): void {}
  setStatus(): void {}
  end(): void {}
  spanContext(): SpanContext {
    return { traceId: '', spanId: '', traceFlags: 0 };
  }
}

class NoopTracer implements Tracer {
  startSpan(): Span {
    return new NoopSpan();
  }
  startActiveSpan(_name: string, _options?: SpanOptions, callback?: (span: Span) => void): void {
    if (callback) callback(new NoopSpan());
  }
}

class NoopMeter implements Meter {
  createCounter(): Counter {
    return { add(): void {} };
  }
  createHistogram(): Histogram {
    return { record(): void {} };
  }
  createUpDownCounter(): UpDownCounter {
    return { add(): void {} };
  }
  createObservableGauge(): void {}
}

let globalTracer: Tracer = new NoopTracer();
let globalMeter: Meter = new NoopMeter();
let isInitialized = false;

/** Tag a span with the graph-om error code and HTTP-style status, when the error has them. */
function setErrorCode(span: Span, error: unknown): void {
  const code = errorCode(error);
  if (code === undefined) return;
  span.setAttribute('error.code', code);
  if (isFrontalError(error) && error.statusCode !== undefined) {
    span.setAttribute('error.status_code', error.statusCode);
  }
}

export function getTracer(): Tracer {
  return globalTracer;
}

export function getMeter(): Meter {
  return globalMeter;
}

export function isOTelInitialized(): boolean {
  return isInitialized;
}

// Initialize OpenTelemetry
export async function initializeOTel(config: OTelConfig): Promise<void> {
  if (isInitialized) return;

  try {
    // Dynamic imports to avoid requiring OTel as a dependency
    const { NodeTracerProvider } = await import('@opentelemetry/sdk-trace-node');
    const { resourceFromAttributes } = await import('@opentelemetry/resources');
    const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = await import(
      '@opentelemetry/semantic-conventions'
    );
    const { BatchSpanProcessor } = await import('@opentelemetry/sdk-trace-base');
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
    const { trace } = await import('@opentelemetry/api');
    const { MeterProvider } = await import('@opentelemetry/sdk-metrics');
    const { PeriodicExportingMetricReader } = await import('@opentelemetry/sdk-metrics');
    const { OTLPMetricExporter } = await import('@opentelemetry/exporter-metrics-otlp-http');
    const { registerInstrumentations } = await import('@opentelemetry/instrumentation');
    const { HttpInstrumentation } = await import('@opentelemetry/instrumentation-http');
    const { GrpcInstrumentation } = await import('@opentelemetry/instrumentation-grpc');
    const { DnsInstrumentation } = await import('@opentelemetry/instrumentation-dns');

    // Create resource
    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.serviceName,
      [ATTR_SERVICE_VERSION]: config.serviceVersion ?? '1.0.0',
    });

    // Create trace provider with its exporter
    const spanProcessors = config.endpoint
      ? [
          new BatchSpanProcessor(
            new OTLPTraceExporter({
              url: `${config.endpoint}/v1/traces`,
              headers: config.headers,
            }),
          ),
        ]
      : [];
    const traceProvider = new NodeTracerProvider({ resource, spanProcessors });

    // Register trace provider
    traceProvider.register();

    // Create meter provider
    const readers = config.endpoint
      ? [
          new PeriodicExportingMetricReader({
            exporter: new OTLPMetricExporter({
              url: `${config.endpoint}/v1/metrics`,
              headers: config.headers,
            }),
          }),
        ]
      : [];
    const meterProvider = new MeterProvider({ resource, readers });

    // Set global instances
    globalTracer = trace.getTracer(config.serviceName, config.serviceVersion);
    // OpenTelemetry is an optional runtime dependency, so its API types are not imported here.
    // The dynamically imported meter is bridged to the local structural `Meter` interface.
    globalMeter = meterProvider.getMeter(
      config.serviceName,
      config.serviceVersion,
    ) as unknown as Meter;

    // Register instrumentations
    const instrumentations = [];
    if (config.instrumentations?.http !== false) instrumentations.push(new HttpInstrumentation());
    if (config.instrumentations?.grpc !== false) instrumentations.push(new GrpcInstrumentation());
    if (config.instrumentations?.dns !== false) instrumentations.push(new DnsInstrumentation());

    if (instrumentations.length > 0) {
      registerInstrumentations({ instrumentations });
    }

    isInitialized = true;
  } catch (error) {
    console.warn('Failed to initialize OpenTelemetry:', error);
    // Fall back to noop implementations
  }
}

// Create a traced driver wrapper
export class TracedDriverAdapter implements DriverAdapter {
  private driver: DriverAdapter;
  private tracer: Tracer;
  private meter: Meter;
  private dbName: string;

  // Metrics
  private queryCounter: Counter;
  private queryDuration: Histogram;
  private activeQueries: UpDownCounter;

  constructor(driver: DriverAdapter, config: { dbName: string; tracer?: Tracer; meter?: Meter }) {
    this.driver = driver;
    this.tracer = config.tracer ?? getTracer();
    this.meter = config.meter ?? getMeter();
    this.dbName = config.dbName;

    // Initialize metrics
    this.queryCounter = this.meter.createCounter('metal.db.queries.total', {
      description: 'Total number of database queries',
      unit: '1',
    });

    this.queryDuration = this.meter.createHistogram('metal.db.query.duration', {
      description: 'Database query duration',
      unit: 'ms',
      valueType: 'double',
    });

    this.activeQueries = this.meter.createUpDownCounter('metal.db.queries.active', {
      description: 'Number of active database queries',
      unit: '1',
    });
  }

  async connect(): Promise<void> {
    return this.driver.connect();
  }

  async disconnect(): Promise<void> {
    return this.driver.disconnect();
  }

  async runQuery(cypher: string, params?: Record<string, unknown>): Promise<QueryResult> {
    const operation = this.extractOperation(cypher);
    const attributes: MetricAttributes = {
      'db.system': 'neo4j',
      'db.operation': operation,
      'db.name': this.dbName,
    };

    this.activeQueries.add(1, attributes);
    this.queryCounter.add(1, attributes);

    const span = this.tracer.startSpan(`db.query.${operation}`, {
      kind: SpanKind.CLIENT,
      attributes: {
        'db.system': 'neo4j',
        'db.operation': operation,
        'db.statement': this.sanitizeQuery(cypher),
        'db.name': this.dbName,
      } as SpanAttributes,
    });

    const startTime = Date.now();

    try {
      const result = await this.driver.runQuery(cypher, params);

      span.setStatus({ code: SpanStatusCode.OK });
      attributes.error = false;

      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      span.recordException(error as Error);
      setErrorCode(span, error);
      attributes.error = true;
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      span.end();
      this.activeQueries.add(-1, attributes);
      this.queryDuration.record(duration, attributes);
    }
  }

  async runInTransaction<T>(work: (txc: TransactionContext) => Promise<T>): Promise<T> {
    const span = this.tracer.startSpan('db.transaction', {
      kind: SpanKind.CLIENT,
      attributes: {
        'db.system': 'neo4j',
        'db.name': this.dbName,
      } as SpanAttributes,
    });

    try {
      const result = await this.driver.runInTransaction(async (txc) => {
        const tracedTxc: TransactionContext = {
          run: async (query: string, params?: Record<string, unknown>) => {
            const childSpan = this.tracer.startSpan(`db.query.${this.extractOperation(query)}`, {
              kind: SpanKind.CLIENT,
              attributes: {
                'db.system': 'neo4j',
                'db.operation': this.extractOperation(query),
                'db.statement': this.sanitizeQuery(query),
                'db.name': this.dbName,
              } as SpanAttributes,
            });

            try {
              const result = await txc.run(query, params);
              childSpan.setStatus({ code: SpanStatusCode.OK });
              return result;
            } catch (error) {
              childSpan.setStatus({
                code: SpanStatusCode.ERROR,
                message: (error as Error).message,
              });
              childSpan.recordException(error as Error);
              setErrorCode(childSpan, error);
              throw error;
            } finally {
              childSpan.end();
            }
          },
        };
        return work(tracedTxc);
      });

      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      span.recordException(error as Error);
      setErrorCode(span, error);
      throw error;
    } finally {
      span.end();
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

  private extractOperation(cypher: string): string {
    const trimmed = cypher.trim().toUpperCase();
    if (trimmed.startsWith('MATCH')) return 'MATCH';
    if (trimmed.startsWith('CREATE')) return 'CREATE';
    if (trimmed.startsWith('MERGE')) return 'MERGE';
    if (trimmed.startsWith('DELETE') || trimmed.startsWith('DETACH DELETE')) return 'DELETE';
    if (trimmed.startsWith('SET')) return 'SET';
    if (trimmed.startsWith('CALL')) return 'CALL';
    if (trimmed.startsWith('RETURN')) return 'RETURN';
    if (trimmed.startsWith('WITH')) return 'WITH';
    if (trimmed.startsWith('UNWIND')) return 'UNWIND';
    return 'UNKNOWN';
  }

  private sanitizeQuery(cypher: string): string {
    // Remove sensitive data from query for tracing
    return cypher
      .replace(/\$[a-zA-Z_][a-zA-Z0-9_]*/g, '$param')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1000);
  }
}

export function withTracing(driver: DriverAdapter, dbName: string): TracedDriverAdapter {
  return new TracedDriverAdapter(driver, { dbName });
}

// Create OTel metrics collector that bridges to Graph's MetricsCollector
export class OTelMetricsCollector implements MetricsCollector {
  private meter: Meter;
  private counters: Map<string, Counter> = new Map();
  private histograms: Map<string, Histogram> = new Map();
  private gauges: Map<string, UpDownCounter> = new Map();

  constructor(meter?: Meter) {
    this.meter = meter ?? getMeter();
  }

  incrementCounter(name: string, labels?: Record<string, string>): void {
    let counter = this.counters.get(name);
    if (!counter) {
      counter = this.meter.createCounter(name, { description: `Counter for ${name}` });
      this.counters.set(name, counter);
    }
    counter.add(1, labels);
  }

  recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    let histogram = this.histograms.get(name);
    if (!histogram) {
      histogram = this.meter.createHistogram(name, {
        description: `Histogram for ${name}`,
        unit: 'ms',
      });
      this.histograms.set(name, histogram);
    }
    histogram.record(value, labels);
  }

  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    let gauge = this.gauges.get(name);
    if (!gauge) {
      gauge = this.meter.createUpDownCounter(name, { description: `Gauge for ${name}` });
      this.gauges.set(name, gauge);
    }
    gauge.add(value, labels);
  }
}

export function createOTelMetricsCollector(meter?: Meter): OTelMetricsCollector {
  return new OTelMetricsCollector(meter);
}

// Context propagation helpers
export function injectContext(context: PropagationContext, carrier: Record<string, string>): void {
  if (context['traceparent']) carrier['traceparent'] = context['traceparent'];
  if (context['tracestate']) carrier['tracestate'] = context['tracestate'];
  if (context.baggage) {
    for (const [key, value] of Object.entries(context.baggage)) {
      carrier[`baggage-${key}`] = value;
    }
  }
}

export function extractContext(carrier: Record<string, string>): PropagationContext {
  return {
    traceparent: carrier['traceparent'],
    tracestate: carrier['tracestate'],
    baggage: Object.fromEntries(
      Object.entries(carrier)
        .filter(([k]) => k.startsWith('baggage-'))
        .map(([k, v]) => [k.slice(8), v]),
    ),
  };
}

// Express/Fastify middleware for context propagation
export function createOTelMiddleware() {
  return async (
    request: { headers: Record<string, string>; otelContext?: unknown },
    response: { setHeader: (name: string, value: string) => void },
    next: () => Promise<void>,
  ) => {
    const context = extractContext(request.headers);
    // Store context for downstream use
    request.otelContext = context;

    // Propagate to response
    const responseCarrier: Record<string, string> = {};
    injectContext(context, responseCarrier);
    for (const [key, value] of Object.entries(responseCarrier)) {
      response.setHeader(key, value);
    }

    await next();
  };
}
