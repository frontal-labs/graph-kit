// @graph-om/cli/src/commands/diff.ts

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createNeo4jDriver } from '@graph-om/neo4j';
import {
  type DriverAdapter,
  env,
  type GraphSchemaRegistry,
  type NodeConfig,
  type PropertyConfig,
  type PropertyType,
  type RelationConfig,
} from '@graph-om/sdk';
import {
  diffSchemas,
  type NodeDiff,
  type PropertyDiff,
  type RelationDiff,
  type SchemaDiff,
} from '@graph-om/sdk/migration';
import { parseSchemaFile } from '@graph-om/sdk/schema';
import { Command } from 'commander';
import { loadProjectConfig } from './generate.js';

interface DiffOptions {
  from?: string;
  to?: string;
  output?: string;
  format?: 'text' | 'json' | 'markdown';
}

type Side = 'from' | 'to';

export function createDiffCommand(): Command {
  return new Command('diff')
    .description('Compare schema versions')
    .argument('[from]', 'Source schema (file, git ref, or "live")', 'live')
    .argument('[to]', 'Target schema (file or git ref)', 'HEAD')
    .option('--output <path>', 'Output file path')
    .option('--format <type>', 'Output format (text, json, markdown)', 'text')
    .action(async (from: string, to: string, options: DiffOptions) => {
      await runDiff(from, to, options);
    });
}

async function runDiff(from: string, to: string, options: DiffOptions): Promise<void> {
  const projectRoot = process.cwd();
  const config = loadProjectConfig(projectRoot);
  const { schemaPath } = config;

  let fromSchema: GraphSchemaRegistry;
  let toSchema: GraphSchemaRegistry;

  // Parse "from" schema
  if (from === 'live') {
    // Connect to database and introspect
    const driver = createNeo4jDriver({
      type: 'neo4j',
      uri: env.NEO4J_URI,
      username: env.NEO4J_USER,
      password: env.NEO4J_PASSWORD,
    });
    await driver.connect();

    try {
      fromSchema = await introspectDatabase(driver);
    } finally {
      await driver.disconnect();
    }
  } else if (from.endsWith('.ts') || from.endsWith('.js')) {
    const result = parseSchemaFile(path.resolve(projectRoot, from));
    fromSchema = result.schema;
  } else {
    // Git ref - checkout and parse
    fromSchema = await parseGitRef(projectRoot, from, schemaPath);
  }

  // Parse "to" schema
  if (to === 'HEAD' || to === 'working') {
    const result = parseSchemaFile(schemaPath);
    toSchema = result.schema;
  } else if (to.endsWith('.ts') || to.endsWith('.js')) {
    const result = parseSchemaFile(path.resolve(projectRoot, to));
    toSchema = result.schema;
  } else {
    toSchema = await parseGitRef(projectRoot, to, schemaPath);
  }

  // Compute diff
  const diff = diffSchemas(fromSchema, toSchema);

  // Format output
  const output = formatDiff(diff, options.format ?? 'text');

  if (options.output) {
    fs.writeFileSync(path.resolve(projectRoot, options.output), output);
    console.log(`✓ Diff saved to ${options.output}`);
  } else {
    console.log(output);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function introspectDatabase(driver: DriverAdapter): Promise<GraphSchemaRegistry> {
  // Query database for existing schema
  const labelsResult = await driver.runQuery('CALL db.labels()');
  const labels = labelsResult.records.map((record) => String(record.get('label')));

  const relTypesResult = await driver.runQuery('CALL db.relationshipTypes()');
  const _relTypes = relTypesResult.records.map((record) => record.get('relationshipType'));

  const propertyKeysResult = await driver.runQuery('CALL db.propertyKeys()');
  const _propertyKeys = propertyKeysResult.records.map((record) => record.get('propertyKey'));

  // Build schema from introspection
  const schema: GraphSchemaRegistry = {};

  for (const label of labels) {
    // Get sample node to infer properties
    const sampleResult = await driver.runQuery(`MATCH (n:${label}) RETURN n LIMIT 1`);
    const properties: Record<string, PropertyConfig> = {};

    const sample = sampleResult.records[0];
    if (sample) {
      for (const [key, value] of Object.entries(toPropertyBag(sample.get('n')))) {
        properties[key] = {
          type: inferType(value),
          primary: key === 'id',
        };
      }
    }

    // Get relationships for this label
    const relsResult = await driver.runQuery(
      `MATCH (n:${label})-[r]->() RETURN DISTINCT type(r) as type, labels(endNode(r))[0] as target LIMIT 100`,
    );

    const relations: Record<string, RelationConfig<string, string>> = {};
    for (const record of relsResult.records) {
      const type = String(record.get('type'));
      const target = String(record.get('target'));
      relations[type.toLowerCase()] = {
        type,
        direction: 'OUT',
        target,
        multiple: true,
      };
    }

    const node: NodeConfig<string, Record<string, PropertyConfig>> = {
      label,
      properties,
      relations,
      indexes: [],
      constraints: [],
    };
    schema[label] = node;
  }

  return schema;
}

/** Returns the property map of a node value, or the value itself when it has no `properties` */
function toPropertyBag(node: unknown): Record<string, unknown> {
  if (!isRecord(node)) {
    throw new TypeError(`Expected a node value, got ${typeof node}`);
  }
  const properties = node['properties'];
  return isRecord(properties) ? properties : node;
}

function inferType(value: unknown): PropertyType {
  if (typeof value === 'string') {
    if (value.match(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
      return 'uuid';
    }
    return 'string';
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'number' : 'float';
  }
  if (typeof value === 'boolean') return 'boolean';
  if (value instanceof Date) return 'date';
  if (typeof value === 'bigint') return 'bigint';
  return 'json';
}

async function parseGitRef(
  projectRoot: string,
  ref: string,
  schemaPath: string,
): Promise<GraphSchemaRegistry> {
  // Create temp directory
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metal-diff-'));

  try {
    // Checkout the ref
    execSync(`git show ${ref}:${schemaPath}`, { cwd: projectRoot, stdio: 'pipe' });
    const content = execSync(`git show ${ref}:${schemaPath}`, {
      cwd: projectRoot,
      encoding: 'utf-8',
    });

    const tempSchemaPath = path.join(tempDir, 'schema.ts');
    fs.writeFileSync(tempSchemaPath, content);

    const result = parseSchemaFile(tempSchemaPath);
    return result.schema;
  } finally {
    // Cleanup
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

/** Reads the `from` and `to` values of a property or relation change */
function changeValues(change: unknown): { from: unknown; to: unknown } {
  if (!isRecord(change)) return { from: undefined, to: undefined };
  return { from: change['from'], to: change['to'] };
}

/** Relation diffs keep `{ from, to }` pairs; added relations read the `to` side, removed the `from` side */
function relationFields(rel: RelationDiff, side: Side) {
  return {
    type: rel.type?.[side] ?? '',
    direction: rel.direction?.[side] ?? '',
    target: rel.target?.[side] ?? '',
    multiple: rel.multiple?.[side] ?? false,
  };
}

function formatDiff(diff: SchemaDiff, format: string): string {
  switch (format) {
    case 'json':
      return JSON.stringify(diff, null, 2);
    case 'markdown':
      return formatDiffMarkdown(diff);
    default:
      return formatDiffText(diff);
  }
}

function formatDiffText(diff: SchemaDiff): string {
  const lines: string[] = [];

  lines.push('Schema Diff');
  lines.push('═══════════');
  lines.push('');

  if (diff.addedNodes.length > 0) {
    lines.push('✅ Added Nodes:');
    for (const node of diff.addedNodes) {
      lines.push(`  + ${node}`);
    }
    lines.push('');
  }

  if (diff.removedNodes.length > 0) {
    lines.push('❌ Removed Nodes:');
    for (const node of diff.removedNodes) {
      lines.push(`  - ${node}`);
    }
    lines.push('');
  }

  if (diff.modifiedNodes.size > 0) {
    lines.push('🔄 Modified Nodes:');
    for (const [nodeName, nodeDiff] of diff.modifiedNodes) {
      lines.push(`  ~ ${nodeName}`);
      appendNodeChangesText(lines, nodeDiff);
    }
    lines.push('');
  }

  if (diff.addedRelations.length > 0) {
    lines.push('🔗 Added Relations:');
    for (const rel of diff.addedRelations) {
      const { type, direction, target, multiple } = relationFields(rel, 'to');
      lines.push(
        `  + ${rel.fromNode}.${rel.relationName} (${type} ${direction} ${target})${multiple ? ' [multiple]' : ''}`,
      );
    }
    lines.push('');
  }

  if (diff.removedRelations.length > 0) {
    lines.push('🔗 Removed Relations:');
    for (const rel of diff.removedRelations) {
      const { type, direction, target } = relationFields(rel, 'from');
      lines.push(`  - ${rel.fromNode}.${rel.relationName} (${type} ${direction} ${target})`);
    }
    lines.push('');
  }

  if (isEmptyDiff(diff)) {
    lines.push('No changes detected.');
  }

  return lines.join('\n');
}

function appendNodeChangesText(lines: string[], nodeDiff: NodeDiff): void {
  for (const prop of nodeDiff.addedProperties) {
    lines.push(`    + Property: ${prop}`);
  }
  for (const prop of nodeDiff.removedProperties) {
    lines.push(`    - Property: ${prop}`);
  }
  for (const [propName, propDiff] of nodeDiff.modifiedProperties) {
    lines.push(`    ~ Property: ${propName}`);
    for (const [key, change] of Object.entries(propDiff)) {
      const { from, to } = changeValues(change);
      lines.push(`      ${key}: ${JSON.stringify(from)} → ${JSON.stringify(to)}`);
    }
  }
  for (const idx of nodeDiff.addedIndexes) {
    lines.push(`    + Index: ${idx}`);
  }
  for (const idx of nodeDiff.removedIndexes) {
    lines.push(`    - Index: ${idx}`);
  }
}

function formatDiffMarkdown(diff: SchemaDiff): string {
  const lines: string[] = [];

  lines.push('# Schema Diff');
  lines.push('');

  if (diff.addedNodes.length > 0) {
    lines.push('## ✅ Added Nodes');
    lines.push('');
    for (const node of diff.addedNodes) {
      lines.push(`- \`${node}\``);
    }
    lines.push('');
  }

  if (diff.removedNodes.length > 0) {
    lines.push('## ❌ Removed Nodes');
    lines.push('');
    for (const node of diff.removedNodes) {
      lines.push(`- \`${node}\``);
    }
    lines.push('');
  }

  if (diff.modifiedNodes.size > 0) {
    lines.push('## 🔄 Modified Nodes');
    lines.push('');
    for (const [nodeName, nodeDiff] of diff.modifiedNodes) {
      lines.push(`### \`${nodeName}\``);
      lines.push('');
      appendNodeChangesMarkdown(lines, nodeDiff);
    }
    lines.push('');
  }

  if (diff.addedRelations.length > 0) {
    lines.push('## 🔗 Added Relations');
    lines.push('');
    lines.push('| From | Relation | Type | Direction | Target | Multiple |');
    lines.push('|------|----------|------|-----------|--------|----------|');
    for (const rel of diff.addedRelations) {
      const { type, direction, target, multiple } = relationFields(rel, 'to');
      lines.push(
        `| ${rel.fromNode} | ${rel.relationName} | ${type} | ${direction} | ${target} | ${multiple ? 'Yes' : 'No'} |`,
      );
    }
    lines.push('');
  }

  if (diff.removedRelations.length > 0) {
    lines.push('## 🔗 Removed Relations');
    lines.push('');
    lines.push('| From | Relation | Type | Direction | Target |');
    lines.push('|------|----------|------|-----------|--------|');
    for (const rel of diff.removedRelations) {
      const { type, direction, target } = relationFields(rel, 'from');
      lines.push(`| ${rel.fromNode} | ${rel.relationName} | ${type} | ${direction} | ${target} |`);
    }
    lines.push('');
  }

  if (isEmptyDiff(diff)) {
    lines.push('No changes detected.');
  }

  return lines.join('\n');
}

function appendNodeChangesMarkdown(lines: string[], nodeDiff: NodeDiff): void {
  if (nodeDiff.addedProperties.length > 0) {
    lines.push('**Added Properties:**');
    for (const prop of nodeDiff.addedProperties) {
      lines.push(`- \`${prop}\``);
    }
    lines.push('');
  }
  if (nodeDiff.removedProperties.length > 0) {
    lines.push('**Removed Properties:**');
    for (const prop of nodeDiff.removedProperties) {
      lines.push(`- \`${prop}\``);
    }
    lines.push('');
  }
  if (nodeDiff.modifiedProperties.size > 0) {
    lines.push('**Modified Properties:**');
    lines.push('');
    lines.push('| Property | Change |');
    lines.push('|----------|--------|');
    for (const [propName, propDiff] of nodeDiff.modifiedProperties) {
      appendPropertyChangeRows(lines, propName, propDiff);
    }
    lines.push('');
  }
}

function appendPropertyChangeRows(lines: string[], propName: string, propDiff: PropertyDiff): void {
  for (const [key, change] of Object.entries(propDiff)) {
    const { from, to } = changeValues(change);
    lines.push(`| ${propName}.${key} | \`${JSON.stringify(from)}\` → \`${JSON.stringify(to)}\` |`);
  }
}

function isEmptyDiff(diff: SchemaDiff): boolean {
  return (
    diff.addedNodes.length === 0 &&
    diff.removedNodes.length === 0 &&
    diff.modifiedNodes.size === 0 &&
    diff.addedRelations.length === 0 &&
    diff.removedRelations.length === 0
  );
}
