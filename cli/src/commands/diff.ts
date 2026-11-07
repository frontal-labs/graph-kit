// @graph-om/cli/src/commands/diff.ts

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createNeo4jDriver } from '@graph-om/neo4j';
import { env } from '@graph-om/sdk';
import { diffSchemas } from '@graph-om/sdk/migration';
import { parseSchemaFile } from '@graph-om/sdk/schema';
import { Command } from 'commander';
import { loadProjectConfig } from './generate.js';

interface DiffOptions {
  from?: string;
  to?: string;
  output?: string;
  format?: 'text' | 'json' | 'markdown';
}

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

  let fromSchema: any;
  let toSchema: any;

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

async function introspectDatabase(driver: any): Promise<any> {
  // Query database for existing schema
  const labelsResult = await driver.runQuery('CALL db.labels()');
  const labels = labelsResult.records.map((r: any) => r.get('label'));

  const relTypesResult = await driver.runQuery('CALL db.relationshipTypes()');
  const _relTypes = relTypesResult.records.map((r: any) => r.get('relationshipType'));

  const propertyKeysResult = await driver.runQuery('CALL db.propertyKeys()');
  const _propertyKeys = propertyKeysResult.records.map((r: any) => r.get('propertyKey'));

  // Build schema from introspection
  const schema: any = {};

  for (const label of labels) {
    // Get sample node to infer properties
    const sampleResult = await driver.runQuery(`MATCH (n:${label}) RETURN n LIMIT 1`);
    const properties: any = {};

    if (sampleResult.records.length > 0) {
      const node = sampleResult.records[0].get('n');
      const props = node.properties || node;
      for (const [key, value] of Object.entries(props)) {
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

    const relations: any = {};
    for (const record of relsResult.records) {
      const type = record.get('type');
      const target = record.get('target');
      relations[type.toLowerCase()] = {
        type,
        direction: 'OUT',
        target,
        multiple: true,
      };
    }

    schema[label] = {
      label,
      properties,
      relations,
      indexes: [],
      constraints: [],
    };
  }

  return schema;
}

function inferType(value: any): string {
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

async function parseGitRef(projectRoot: string, ref: string, schemaPath: string): Promise<any> {
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

function formatDiff(diff: any, format: string): string {
  switch (format) {
    case 'json':
      return JSON.stringify(diff, null, 2);
    case 'markdown':
      return formatDiffMarkdown(diff);
    default:
      return formatDiffText(diff);
  }
}

function formatDiffText(diff: any): string {
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

      if (nodeDiff.addedProperties.length > 0) {
        for (const prop of nodeDiff.addedProperties) {
          lines.push(`    + Property: ${prop}`);
        }
      }
      if (nodeDiff.removedProperties.length > 0) {
        for (const prop of nodeDiff.removedProperties) {
          lines.push(`    - Property: ${prop}`);
        }
      }
      if (nodeDiff.modifiedProperties.size > 0) {
        for (const [propName, propDiff] of nodeDiff.modifiedProperties) {
          lines.push(`    ~ Property: ${propName}`);
          for (const [key, change] of Object.entries(propDiff)) {
            lines.push(
              `      ${key}: ${JSON.stringify((change as any).from)} → ${JSON.stringify((change as any).to)}`,
            );
          }
        }
      }
      if (nodeDiff.addedIndexes.length > 0) {
        for (const idx of nodeDiff.addedIndexes) {
          lines.push(`    + Index: ${idx}`);
        }
      }
      if (nodeDiff.removedIndexes.length > 0) {
        for (const idx of nodeDiff.removedIndexes) {
          lines.push(`    - Index: ${idx}`);
        }
      }
    }
    lines.push('');
  }

  if (diff.addedRelations.length > 0) {
    lines.push('🔗 Added Relations:');
    for (const rel of diff.addedRelations) {
      lines.push(
        `  + ${rel.fromNode}.${rel.relationName} (${rel.type} ${rel.direction} ${rel.target})${rel.multiple ? ' [multiple]' : ''}`,
      );
    }
    lines.push('');
  }

  if (diff.removedRelations.length > 0) {
    lines.push('🔗 Removed Relations:');
    for (const rel of diff.removedRelations) {
      lines.push(
        `  - ${rel.fromNode}.${rel.relationName} (${rel.type} ${rel.direction} ${rel.target})`,
      );
    }
    lines.push('');
  }

  if (
    diff.addedNodes.length === 0 &&
    diff.removedNodes.length === 0 &&
    diff.modifiedNodes.size === 0 &&
    diff.addedRelations.length === 0 &&
    diff.removedRelations.length === 0
  ) {
    lines.push('No changes detected.');
  }

  return lines.join('\n');
}

function formatDiffMarkdown(diff: any): string {
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
          for (const [key, change] of Object.entries(propDiff)) {
            lines.push(
              `| ${propName}.${key} | \`${JSON.stringify((change as any).from)}\` → \`${JSON.stringify((change as any).to)}\` |`,
            );
          }
        }
        lines.push('');
      }
    }
    lines.push('');
  }

  if (diff.addedRelations.length > 0) {
    lines.push('## 🔗 Added Relations');
    lines.push('');
    lines.push('| From | Relation | Type | Direction | Target | Multiple |');
    lines.push('|------|----------|------|-----------|--------|----------|');
    for (const rel of diff.addedRelations) {
      lines.push(
        `| ${rel.fromNode} | ${rel.relationName} | ${rel.type} | ${rel.direction} | ${rel.target} | ${rel.multiple ? 'Yes' : 'No'} |`,
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
      lines.push(
        `| ${rel.fromNode} | ${rel.relationName} | ${rel.type} | ${rel.direction} | ${rel.target} |`,
      );
    }
    lines.push('');
  }

  if (
    diff.addedNodes.length === 0 &&
    diff.removedNodes.length === 0 &&
    diff.modifiedNodes.size === 0 &&
    diff.addedRelations.length === 0 &&
    diff.removedRelations.length === 0
  ) {
    lines.push('No changes detected.');
  }

  return lines.join('\n');
}
