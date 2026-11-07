// @graph-om/core/src/schema/parser.ts
// AST-based schema parser using TypeScript compiler API

import * as ts from 'typescript';
import type {
  GraphSchemaRegistry,
  PropertyConfig,
  PropertyType,
  RelationConfig,
  RelationDirection,
} from '../types';

export interface ParsedNode {
  label: string;
  properties: Record<string, PropertyConfig>;
  relations: Record<string, RelationConfig<string, string>>;
  indexes: Array<{ fields: string[]; unique?: boolean }>;
  constraints: Array<{ fields: string[]; type: 'UNIQUE' | 'EXISTS' }>;
}

export interface ParseResult {
  nodes: ParsedNode[];
  schema: GraphSchemaRegistry;
  errors: ParseError[];
}

export interface ParseError {
  message: string;
  file: string;
  line: number;
  column: number;
}

const TYPE_MAP: Record<string, PropertyType> = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  date: 'date',
  bigint: 'bigint',
  float: 'float',
  uuid: 'uuid',
  json: 'json',
};

const DIRECTION_MAP: Record<string, RelationDirection> = {
  IN: 'IN',
  OUT: 'OUT',
  BOTH: 'BOTH',
};

export function parseSchemaFile(filePath: string): ParseResult {
  const sourceCode = readFile(filePath);
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const parser = new SchemaParser(sourceFile, filePath);
  return parser.parse();
}

function readFile(filePath: string): string {
  const fs = require('node:fs');
  return fs.readFileSync(filePath, 'utf-8');
}

class SchemaParser {
  private sourceFile: ts.SourceFile;
  private filePath: string;
  private errors: ParseError[] = [];
  private nodes: ParsedNode[] = [];

  constructor(sourceFile: ts.SourceFile, filePath: string) {
    this.sourceFile = sourceFile;
    this.filePath = filePath;
  }

  parse(): ParseResult {
    const program = ts.createProgram([this.filePath], {
      target: ts.ScriptTarget.Latest,
      module: ts.ModuleKind.ESNext,
      strict: true,
      skipLibCheck: true,
    });
    this.typeChecker = program.getTypeChecker();

    this.visitNode(this.sourceFile);

    const schema: GraphSchemaRegistry = {};
    for (const node of this.nodes) {
      schema[node.label] = {
        label: node.label,
        properties: node.properties,
        relations: node.relations,
        indexes: node.indexes,
        constraints: node.constraints,
      };
    }

    return {
      nodes: this.nodes,
      schema,
      errors: this.errors,
    };
  }

  private visitNode(node: ts.Node): void {
    // Check for variable declarations with node builder chains
    if (ts.isVariableDeclaration(node) && node.initializer) {
      console.log('[DEBUG] Found variable declaration:', node.name?.getText());
      this.parseVariableInitializer(node.initializer);
    }
    ts.forEachChild(node, (child) => this.visitNode(child));
  }

  private parseVariableInitializer(initializer: ts.Expression): void {
    console.log('[DEBUG] Parsing initializer:', initializer.getText().substring(0, 100));
    // Look for a call chain ending with .build()
    let current: ts.Expression = initializer;
    while (ts.isCallExpression(current) || ts.isPropertyAccessExpression(current)) {
      if (ts.isCallExpression(current) && this.isBuildCall(current)) {
        console.log('[DEBUG] Found build() call');
        // Found the build() call, now walk back to find the node() call
        const builderChain = this.collectBuilderChain(current);
        console.log('[DEBUG] Builder chain length:', builderChain.length);
        // Find the node() call in the chain
        const nodeCall = builderChain.find((call) => this.isNodeCall(call));
        console.log('[DEBUG] Found node call:', !!nodeCall);
        if (nodeCall) {
          const labelArg = nodeCall.arguments[0];
          if (labelArg && ts.isStringLiteral(labelArg)) {
            const label = labelArg.text;
            const parsed = this.parseBuilderChain(label, builderChain);
            if (parsed) {
              this.nodes.push(parsed);
            }
          }
        }
        return;
      }
      if (ts.isPropertyAccessExpression(current)) {
        current = current.expression;
      } else if (ts.isCallExpression(current)) {
        current = current.expression;
      } else {
        break;
      }
    }
    console.log('[DEBUG] No build() call found in initializer');
  }

  private isNodeCall(node: ts.CallExpression): boolean {
    const expr = node.expression;
    if (ts.isIdentifier(expr) && expr.text === 'node') {
      return true;
    }
    if (ts.isPropertyAccessExpression(expr) && expr.name.text === 'node') {
      return true;
    }
    return false;
  }

  private isBuildCall(node: ts.CallExpression): boolean {
    if (ts.isPropertyAccessExpression(node.expression)) {
      return node.expression.name.text === 'build';
    }
    return false;
  }

  private collectBuilderChain(buildCall: ts.CallExpression): ts.CallExpression[] {
    const chain: ts.CallExpression[] = [];
    let current: ts.Expression = buildCall.expression;

    while (ts.isPropertyAccessExpression(current) || ts.isCallExpression(current)) {
      if (ts.isCallExpression(current) && this.isAddCall(current)) {
        chain.unshift(current);
      }
      if (ts.isPropertyAccessExpression(current)) {
        current = current.expression;
      } else if (ts.isCallExpression(current)) {
        current = current.expression;
      } else {
        break;
      }
    }

    return chain;
  }

  private isAddCall(node: ts.CallExpression): boolean {
    if (ts.isPropertyAccessExpression(node.expression)) {
      return node.expression.name.text === 'add';
    }
    return false;
  }

  private parseBuilderChain(label: string, addCalls: ts.CallExpression[]): ParsedNode | null {
    const properties: Record<string, PropertyConfig> = {};
    const relations: Record<string, RelationConfig<string, string>> = {};
    const indexes: Array<{ fields: string[]; unique?: boolean }> = [];
    const constraints: Array<{ fields: string[]; type: 'UNIQUE' | 'EXISTS' }> = [];

    for (const addCall of addCalls) {
      const args = addCall.arguments;
      if (args.length < 2) continue;

      const nameArg = args[0];
      const configArg = args[1];
      if (!configArg) continue;
      if (!nameArg) continue;

      if (!ts.isStringLiteral(nameArg)) continue;
      const name = nameArg.text;

      // Check if it's a relation call
      if (this.isRelationCall(configArg)) {
        const relation = this.parseRelation(configArg, name);
        if (relation) {
          relations[name] = relation;
        }
      } else if (this.isIndexCall(addCall)) {
        const index = this.parseIndex(configArg);
        if (index) indexes.push(index);
      } else if (this.isConstraintCall(addCall)) {
        const constraint = this.parseConstraint(configArg);
        if (constraint) constraints.push(constraint);
      } else {
        const property = this.parseProperty(configArg, name);
        if (property) {
          properties[name] = property;
        }
      }
    }

    return {
      label,
      properties,
      relations,
      indexes,
      constraints,
    };
  }

  private isRelationCall(node: ts.Expression): boolean {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr) && (expr.text === 'relation' || expr.text === 'defineRel')) {
        return true;
      }
      if (
        ts.isPropertyAccessExpression(expr) &&
        (expr.name.text === 'relation' || expr.name.text === 'defineRel')
      ) {
        return true;
      }
    }
    return false;
  }

  private parseRelation(node: ts.Expression, _name: string): RelationConfig<string, string> | null {
    if (!ts.isCallExpression(node)) return null;

    const args = node.arguments;
    if (args.length < 4) return null;

    const typeArg = args[0]!;
    const directionArg = args[1]!;
    const targetArg = args[2]!;
    const optionsArg = args[3]!;

    if (
      !ts.isStringLiteral(typeArg) ||
      !ts.isStringLiteral(directionArg) ||
      !ts.isStringLiteral(targetArg)
    ) {
      return null;
    }

    const type = typeArg.text;
    const direction = DIRECTION_MAP[directionArg.text] ?? 'OUT';
    const target = targetArg.text;

    let multiple = false;
    let properties: Record<string, PropertyConfig> | undefined;

    if (ts.isObjectLiteralExpression(optionsArg)) {
      for (const prop of optionsArg.properties) {
        if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
          if (
            prop.name.text === 'multiple' &&
            prop.initializer.kind === ts.SyntaxKind.TrueKeyword
          ) {
            multiple = true;
          } else if (
            prop.name.text === 'properties' &&
            ts.isObjectLiteralExpression(prop.initializer)
          ) {
            properties = this.parseRelationProperties(prop.initializer);
          }
        }
      }
    }

    return {
      type,
      direction,
      target,
      multiple,
      properties,
    };
  }

  private parseRelationProperties(obj: ts.ObjectLiteralExpression): Record<string, PropertyConfig> {
    const props: Record<string, PropertyConfig> = {};
    for (const prop of obj.properties) {
      if (ts.isPropertyAssignment(prop) && ts.isStringLiteral(prop.name)) {
        const propName = prop.name.text;
        const propConfig = this.parseProperty(prop.initializer, propName);
        if (propConfig) {
          props[propName] = propConfig;
        }
      }
    }
    return props;
  }

  private parseProperty(node: ts.Expression, _name: string): PropertyConfig | null {
    // Handle string('...'), number('...'), etc.
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      let type: PropertyType | null = null;

      if (ts.isIdentifier(expr)) {
        type = TYPE_MAP[expr.text] ?? null;
      } else if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.name)) {
        type = TYPE_MAP[expr.name.text] ?? null;
      }

      if (!type) return null;

      const config: PropertyConfig = { type };

      if (node.arguments.length > 0 && ts.isObjectLiteralExpression(node.arguments[0]!)) {
        const obj = node.arguments[0];
        for (const prop of obj.properties) {
          if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
            const key = prop.name.text;
            const value = prop.initializer;

            switch (key) {
              case 'primary':
                config.primary = value.kind === ts.SyntaxKind.TrueKeyword;
                break;
              case 'unique':
                config.unique = value.kind === ts.SyntaxKind.TrueKeyword;
                break;
              case 'index':
                config.index = value.kind === ts.SyntaxKind.TrueKeyword;
                break;
              case 'nullable':
                config.nullable = value.kind === ts.SyntaxKind.TrueKeyword;
                break;
              case 'array':
                config.array = value.kind === ts.SyntaxKind.TrueKeyword;
                break;
              case 'default':
                config.default = this.evaluateDefaultValue(value);
                break;
            }
          }
        }
      }

      return config;
    }

    return null;
  }

  private evaluateDefaultValue(node: ts.Expression): unknown {
    if (ts.isStringLiteral(node)) return node.text;
    if (ts.isNumericLiteral(node)) return parseFloat(node.text);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      // Return a marker for function defaults
      return { __defaultFunction: true, text: node.getText(this.sourceFile) };
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Date'
    ) {
      return { __defaultFunction: true, text: 'new Date()' };
    }
    return undefined;
  }

  private isIndexCall(addCall: ts.CallExpression): boolean {
    // Check if the .add() call is actually an .index() call
    // This is determined by looking at the property access
    if (ts.isPropertyAccessExpression(addCall.expression)) {
      return addCall.expression.name.text === 'index';
    }
    return false;
  }

  private parseIndex(node: ts.Expression): { fields: string[]; unique?: boolean } | null {
    if (!ts.isCallExpression(node)) return null;

    const args = node.arguments;
    if (args.length === 0) return null;

    let fields: string[] = [];
    let unique = false;

    if (args[0] && ts.isArrayLiteralExpression(args[0])) {
      fields = args[0].elements
        .filter((e): e is ts.StringLiteral => ts.isStringLiteral(e))
        .map((e) => e.text);
    }

    if (args[1] && args[1].kind === ts.SyntaxKind.TrueKeyword) {
      unique = true;
    }

    return { fields, unique };
  }

  private isConstraintCall(addCall: ts.CallExpression): boolean {
    if (ts.isPropertyAccessExpression(addCall.expression)) {
      return addCall.expression.name.text === 'constraint';
    }
    return false;
  }

  private parseConstraint(
    node: ts.Expression,
  ): { fields: string[]; type: 'UNIQUE' | 'EXISTS' } | null {
    if (!ts.isCallExpression(node)) return null;

    const args = node.arguments;
    if (args.length < 2) return null;

    let fields: string[] = [];

    if (args[0] && ts.isArrayLiteralExpression(args[0])) {
      fields = args[0].elements
        .filter((e): e is ts.StringLiteral => ts.isStringLiteral(e))
        .map((e) => e.text);
    }

    const typeArg = args[1];
    if (!typeArg || !ts.isStringLiteral(typeArg)) return null;

    const type = typeArg.text as 'UNIQUE' | 'EXISTS';
    if (type !== 'UNIQUE' && type !== 'EXISTS') return null;

    return { fields, type };
  }
}

export function parseSchemaFromSource(sourceCode: string, fileName = 'schema.ts'): ParseResult {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const parser = new SchemaParser(sourceFile, fileName);
  return parser.parse();
}
