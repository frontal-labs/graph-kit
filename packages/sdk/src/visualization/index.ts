// @graph-kit/sdk/src/visualization/index.ts
// Schema visualization and ER diagram generation for Graph-Kit

import { raiseGraphError } from '../errors';
import type { GraphSchemaRegistry, NodeConfig, PropertyConfig, RelationConfig } from '../types';

export interface VisualizationOptions {
  format: 'mermaid' | 'dot' | 'plantuml' | 'json' | 'svg';
  includeProperties?: boolean;
  includeIndexes?: boolean;
  includeConstraints?: boolean;
  direction?: 'TB' | 'LR' | 'RL' | 'BT';
  theme?: 'default' | 'dark' | 'forest' | 'neutral';
}

export interface ERDiagramConfig {
  schema: GraphSchemaRegistry;
  options?: VisualizationOptions;
}

export function generateERDiagram(config: ERDiagramConfig): string {
  const { schema } = config;
  const options = config.options ?? ({} as Partial<VisualizationOptions>);
  const format = options.format ?? 'mermaid';
  const includeProperties = options.includeProperties ?? true;
  const includeIndexes = options.includeIndexes ?? false;
  const includeConstraints = options.includeConstraints ?? false;
  const direction = options.direction ?? 'LR';

  switch (format) {
    case 'mermaid':
      return generateMermaidERD(schema, {
        includeProperties,
        includeIndexes,
        includeConstraints,
        direction,
      });
    case 'dot':
      return generateDotERD(schema, { includeProperties, includeIndexes, includeConstraints });
    case 'plantuml':
      return generatePlantUMLERD(schema, { includeProperties, includeIndexes, includeConstraints });
    case 'json':
      return generateJSONSchema(schema, { includeProperties, includeIndexes, includeConstraints });
    case 'svg':
      return generateMermaidERD(schema, {
        includeProperties,
        includeIndexes,
        includeConstraints,
        direction,
      });
    default:
      raiseGraphError(`Unsupported format: ${String(format)}`, {
        code: 'unsupported_option',
        statusCode: 400,
      });
  }
}

function generateMermaidERD(
  schema: GraphSchemaRegistry,
  options: {
    includeProperties: boolean;
    includeIndexes: boolean;
    includeConstraints: boolean;
    direction: string;
  },
): string {
  const { includeProperties, direction } = options;
  const lines: string[] = [];

  lines.push(`erDiagram`);
  lines.push(`    direction ${direction}`);

  // Define entities
  for (const [label, nodeConfig] of Object.entries(schema as GraphSchemaRegistry)) {
    const typedNodeConfig = nodeConfig as NodeConfig<string, Record<string, PropertyConfig>>;
    if (includeProperties) {
      const properties: string[] = [];
      for (const [propName, propConfig] of Object.entries(typedNodeConfig.properties) as [
        string,
        PropertyConfig,
      ][]) {
        let propStr = `${propName} ${propertyTypeToMermaid(propConfig.type)}`;
        if (propConfig.primary) propStr += ' PK';
        if (propConfig.unique) propStr += ' UK';
        if (propConfig.nullable) propStr += ' NULL';
        else propStr += ' NOT NULL';
        if (propConfig.array) propStr += ' ARRAY';
        properties.push(propStr);
      }
      lines.push(`    ${label} {`);
      for (const prop of properties) {
        lines.push(`        ${prop}`);
      }
      lines.push(`    }`);
    } else {
      lines.push(`    ${label} { }`);
    }
  }

  // Define relationships
  for (const [label, nodeConfig] of Object.entries(schema as GraphSchemaRegistry)) {
    const typedNodeConfig = nodeConfig as NodeConfig<string, Record<string, PropertyConfig>>;
    for (const [_relName, relConfig] of Object.entries(typedNodeConfig.relations) as [
      string,
      RelationConfig<string, string>,
    ][]) {
      const cardinality = getMermaidCardinality(relConfig);
      lines.push(`    ${label} ${cardinality} ${relConfig.target} : "${relConfig.type}"`);
    }
  }

  return lines.join('\n');
}

function propertyTypeToMermaid(type: string): string {
  switch (type) {
    case 'string':
      return 'varchar';
    case 'number':
      return 'int';
    case 'float':
      return 'float';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'datetime';
    case 'bigint':
      return 'bigint';
    case 'uuid':
      return 'uuid';
    case 'json':
      return 'json';
    default:
      return 'varchar';
  }
}

function getMermaidCardinality(relConfig: RelationConfig<string, string>): string {
  const multiple = relConfig.multiple ?? false;
  const direction = relConfig.direction;

  if (direction === 'OUT') {
    return multiple ? '||--o{' : '||--o|';
  } else if (direction === 'IN') {
    return multiple ? '}o--||' : '|o--||';
  } else {
    return multiple ? '}o--o{' : '}o--o|';
  }
}

function generateDotERD(
  schema: GraphSchemaRegistry,
  options: { includeProperties: boolean; includeIndexes: boolean; includeConstraints: boolean },
): string {
  const { includeProperties } = options;
  const lines: string[] = [];

  lines.push('digraph ERD {');
  lines.push('  rankdir=LR;');
  lines.push('  node [shape=record, fontname="Arial"];');
  lines.push('  edge [fontname="Arial"];');

  // Define nodes
  for (const [label, nodeConfig] of Object.entries(schema as GraphSchemaRegistry)) {
    const typedNodeConfig = nodeConfig as NodeConfig<string, Record<string, PropertyConfig>>;
    let labelStr = `{${label}|`;
    if (includeProperties) {
      const props: string[] = [];
      for (const [propName, propConfig] of Object.entries(typedNodeConfig.properties) as [
        string,
        PropertyConfig,
      ][]) {
        let propStr = `${propName}: ${propConfig.type}`;
        if (propConfig.primary) propStr += ' (PK)';
        if (propConfig.unique) propStr += ' (UK)';
        if (!propConfig.nullable) propStr += ' (NN)';
        if (propConfig.array) propStr += ' []';
        props.push(propStr);
      }
      labelStr += props.join('|');
    }
    labelStr += '}';
    lines.push(`  ${label} [label="${labelStr}"];`);
  }

  // Define edges
  for (const [label, nodeConfig] of Object.entries(schema as GraphSchemaRegistry)) {
    const typedNodeConfig = nodeConfig as NodeConfig<string, Record<string, PropertyConfig>>;
    for (const [relName, relConfig] of Object.entries(typedNodeConfig.relations) as [
      string,
      RelationConfig<string, string>,
    ][]) {
      const arrowhead =
        relConfig.direction === 'OUT' ? 'normal' : relConfig.direction === 'IN' ? 'inv' : 'both';
      const labelStr = `${relConfig.type}\\n(${relName})`;
      lines.push(
        `  ${label} -> ${relConfig.target} [label="${labelStr}", arrowhead=${arrowhead}];`,
      );
    }
  }

  lines.push('}');
  return lines.join('\n');
}

function generatePlantUMLERD(
  schema: GraphSchemaRegistry,
  options: { includeProperties: boolean; includeIndexes: boolean; includeConstraints: boolean },
): string {
  const { includeProperties } = options;
  const lines: string[] = [];

  lines.push('@startuml');
  lines.push('skinparam linetype ortho');
  lines.push('hide circle');
  lines.push('');

  // Define entities
  for (const [label, nodeConfig] of Object.entries(schema as GraphSchemaRegistry)) {
    const typedNodeConfig = nodeConfig as NodeConfig<string, Record<string, PropertyConfig>>;
    lines.push(`entity ${label} {`);
    if (includeProperties) {
      for (const [propName, propConfig] of Object.entries(typedNodeConfig.properties) as [
        string,
        PropertyConfig,
      ][]) {
        let propStr = `${propName} : ${propConfig.type}`;
        if (propConfig.primary) propStr += ' <<PK>>';
        if (propConfig.unique) propStr += ' <<UK>>';
        if (!propConfig.nullable) propStr += ' <<NN>>';
        if (propConfig.array) propStr += ' []';
        lines.push(`  ${propStr}`);
      }
    }
    lines.push('}');
    lines.push('');
  }

  // Define relationships
  for (const [label, nodeConfig] of Object.entries(schema as GraphSchemaRegistry)) {
    const typedNodeConfig = nodeConfig as NodeConfig<string, Record<string, PropertyConfig>>;
    for (const [relName, relConfig] of Object.entries(typedNodeConfig.relations) as [
      string,
      RelationConfig<string, string>,
    ][]) {
      let arrow = '';
      if (relConfig.direction === 'OUT') {
        arrow = relConfig.multiple ? '||--o{' : '||--o|';
      } else if (relConfig.direction === 'IN') {
        arrow = relConfig.multiple ? '}o--||' : '|o--||';
      } else {
        arrow = relConfig.multiple ? '}o--o{' : '}o--o|';
      }
      lines.push(`${label} ${arrow} ${relConfig.target} : ${relConfig.type} (${relName})`);
    }
  }

  lines.push('@enduml');
  return lines.join('\n');
}

function generateJSONSchema(
  schema: GraphSchemaRegistry,
  options: { includeProperties: boolean; includeIndexes: boolean; includeConstraints: boolean },
): string {
  const { includeProperties, includeIndexes, includeConstraints } = options;
  const output: { nodes: Record<string, unknown>; relationships: unknown[] } = {
    nodes: {},
    relationships: [],
  };

  for (const [label, nodeConfig] of Object.entries(schema as GraphSchemaRegistry)) {
    const node: {
      label: string;
      properties?: unknown[];
      indexes?: unknown[];
      constraints?: unknown[];
    } = { label };
    const typedNodeConfig = nodeConfig as NodeConfig<string, Record<string, PropertyConfig>>;

    if (includeProperties) {
      node.properties = (
        Object.entries(typedNodeConfig.properties) as [string, PropertyConfig][]
      ).map(([name, config]) => ({
        name,
        type: config.type,
        primary: config.primary,
        unique: config.unique,
        nullable: config.nullable,
        array: config.array,
        default: config.default,
      }));
    }

    if (includeIndexes && typedNodeConfig.indexes) {
      node.indexes = typedNodeConfig.indexes;
    }

    if (includeConstraints && typedNodeConfig.constraints) {
      node.constraints = typedNodeConfig.constraints;
    }

    output.nodes[label] = node;
  }

  for (const [label, nodeConfig] of Object.entries(schema as GraphSchemaRegistry)) {
    const typedNodeConfig = nodeConfig as NodeConfig<string, Record<string, PropertyConfig>>;
    for (const [relName, relConfig] of Object.entries(typedNodeConfig.relations) as [
      string,
      RelationConfig<string, string>,
    ][]) {
      output.relationships.push({
        from: label,
        name: relName,
        type: relConfig.type,
        direction: relConfig.direction,
        target: relConfig.target,
        multiple: relConfig.multiple,
        properties: relConfig.properties
          ? (Object.entries(relConfig.properties) as [string, PropertyConfig][]).map(
              ([name, config]) => ({
                name,
                type: config.type,
                primary: config.primary,
                unique: config.unique,
                nullable: config.nullable,
                array: config.array,
              }),
            )
          : [],
      });
    }
  }

  return JSON.stringify(output, null, 2);
}

// Generate schema documentation
export interface DocumentationOptions {
  format: 'markdown' | 'html' | 'json';
  includeExamples?: boolean;
  includeRelations?: boolean;
  title?: string;
}

export function generateDocumentation(
  schema: GraphSchemaRegistry,
  options: DocumentationOptions = { format: 'markdown' },
): string {
  const {
    format,
    includeExamples = true,
    includeRelations = true,
    title = 'Graph Schema Documentation',
  } = options;

  switch (format) {
    case 'markdown':
      return generateMarkdownDocs(schema, { includeExamples, includeRelations, title });
    case 'html':
      return generateHTMLDocs(schema, { includeExamples, includeRelations, title });
    case 'json':
      return generateJSONSchema(schema, {
        includeProperties: true,
        includeIndexes: true,
        includeConstraints: true,
      });
    default:
      raiseGraphError(`Unsupported format: ${format}`, {
        code: 'unsupported_option',
        statusCode: 400,
      });
  }
}

function generateMarkdownDocs(
  schema: GraphSchemaRegistry,
  options: { includeExamples: boolean; includeRelations: boolean; title: string },
): string {
  const { includeExamples, includeRelations, title } = options;
  const lines: string[] = [];

  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`Generated on ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`## Overview`);
  lines.push('');
  lines.push(
    `This document describes the graph schema with **${Object.keys(schema).length}** node types.`,
  );
  lines.push('');

  for (const [label, nodeConfig] of Object.entries(schema as GraphSchemaRegistry)) {
    const typedNodeConfig = nodeConfig as NodeConfig<string, Record<string, PropertyConfig>>;
    lines.push(`## Node: \`${label}\``);
    lines.push('');

    if (Object.keys(typedNodeConfig.properties).length > 0) {
      lines.push(`### Properties`);
      lines.push('');
      lines.push('| Name | Type | Primary | Unique | Nullable | Array | Default |');
      lines.push('|------|------|---------|--------|----------|-------|---------|');

      for (const [propName, propConfig] of Object.entries(typedNodeConfig.properties)) {
        const defaultStr = propConfig.default
          ? typeof propConfig.default === 'function'
            ? 'function()'
            : String(propConfig.default)
          : '';
        lines.push(
          `| ${propName} | ${propConfig.type} | ${propConfig.primary ? '✓' : ''} | ` +
            `${propConfig.unique ? '✓' : ''} | ${propConfig.nullable ? '✓' : ''} | ` +
            `${propConfig.array ? '✓' : ''} | ${defaultStr} |`,
        );
      }
      lines.push('');
    }

    if (includeRelations && Object.keys(typedNodeConfig.relations).length > 0) {
      lines.push(`### Relationships`);
      lines.push('');
      lines.push('| Name | Type | Direction | Target | Multiple |');
      lines.push('|------|------|-----------|--------|----------|');

      for (const [relName, relConfig] of Object.entries(typedNodeConfig.relations)) {
        lines.push(
          `| ${relName} | ${relConfig.type} | ${relConfig.direction} | ${relConfig.target} | ${relConfig.multiple ? '✓' : ''} |`,
        );
      }
      lines.push('');
    }

    if (includeExamples) {
      lines.push(`### Example Cypher`);
      lines.push('');
      lines.push('```cypher');
      lines.push(`CREATE (n:${label} {`);
      const props = Object.entries(typedNodeConfig.properties)
        .filter(([, c]) => !c.primary)
        .map(([name, config]) => {
          let value: string;
          switch (config.type) {
            case 'string':
              value = '"example"';
              break;
            case 'number':
              value = '42';
              break;
            case 'float':
              value = '3.14';
              break;
            case 'boolean':
              value = 'true';
              break;
            case 'date':
              value = 'datetime()';
              break;
            case 'uuid':
              value = '"00000000-0000-0000-0000-000000000000"';
              break;
            default:
              value = 'null';
          }
          return `  ${name}: ${value}`;
        })
        .join(',\n');
      lines.push(props);
      lines.push('})');
      lines.push('```');
      lines.push('');
    }
  }

  return lines.join('\n');
}

function generateHTMLDocs(
  schema: GraphSchemaRegistry,
  options: { includeExamples: boolean; includeRelations: boolean; title: string },
): string {
  const markdown = generateMarkdownDocs(schema, options);
  // Simple markdown to HTML conversion
  return `<!DOCTYPE html>
<html>
<head>
  <title>${options.title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 2rem; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #ddd; padding: 0.5rem; text-align: left; }
    th { background-color: #f5f5f5; }
    code { background: #f4f4f4; padding: 0.2rem 0.4rem; border-radius: 3px; }
    pre { background: #f4f4f4; padding: 1rem; border-radius: 5px; overflow-x: auto; }
    h1 { color: #333; border-bottom: 2px solid #eee; padding-bottom: 0.5rem; }
    h2 { color: #555; margin-top: 2rem; }
    h3 { color: #666; }
  </style>
</head>
<body>
${markdown
  .replace(/^# (.+)$/gm, '<h1>$1</h1>')
  .replace(/^## (.+)$/gm, '<h2>$1</h2>')
  .replace(/^### (.+)$/gm, '<h3>$1</h3>')
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/`(.+?)`/g, '<code>$1</code>')
  .replace(/\n\n/g, '</p><p>')
  .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
  .replace(/\|(.+)\|/g, (match) => {
    const cells = match
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    return `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
  })}
</body>
</html>`;
}

// Export to various formats
export interface ExportOptions {
  schema: GraphSchemaRegistry;
  format: 'mermaid' | 'dot' | 'plantuml' | 'json' | 'markdown' | 'html';
  outputPath?: string;
  options?: VisualizationOptions | DocumentationOptions;
}

export async function exportSchema(config: ExportOptions): Promise<string> {
  const { schema, format, outputPath, options } = config;

  let output: string;

  if (['mermaid', 'dot', 'plantuml', 'json'].includes(format)) {
    output = generateERDiagram({ schema, options: options as VisualizationOptions });
  } else {
    output = generateDocumentation(schema, options as DocumentationOptions);
  }

  if (outputPath) {
    const fs = await import('node:fs/promises');
    await fs.writeFile(outputPath, output);
  }

  return output;
}
