// @graph-kit/cli/src/commands/studio.ts

import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseSchemaFile } from '@graph-kit/sdk/schema';
import { generateDocumentation, generateERDiagram } from '@graph-kit/sdk/visualization';
import { Command } from 'commander';
import { loadProjectConfig } from './generate.js';

interface StudioOptions {
  port?: number;
  open?: boolean;
}

interface VisualizeOptions {
  format?: 'mermaid' | 'dot' | 'plantuml';
  output?: string;
  includeProperties?: boolean;
}

interface DocOptions {
  format?: 'markdown' | 'html';
  output?: string;
  title?: string;
}

export function createStudioCommand(): Command {
  const studio = new Command('studio')
    .description('Visualize and explore your schema')
    .addCommand(createVisualizeCommand())
    .addCommand(createDocCommand())
    .addCommand(createServeCommand());

  return studio;
}

function createVisualizeCommand(): Command {
  return new Command('visualize')
    .description('Generate ER diagram from schema')
    .option('--format <type>', 'Output format (mermaid, dot, plantuml)', 'mermaid')
    .option('--output <path>', 'Output file path')
    .option('--no-properties', 'Exclude properties from diagram')
    .action(async (options: VisualizeOptions) => {
      await visualizeSchema(options);
    });
}

function createDocCommand(): Command {
  return new Command('doc')
    .description('Generate documentation from schema')
    .option('--format <type>', 'Output format (markdown, html)', 'markdown')
    .option('--output <path>', 'Output file path')
    .option('--title <title>', 'Documentation title', 'Metal Schema Documentation')
    .action(async (options: DocOptions) => {
      await generateDocs(options);
    });
}

function createServeCommand(): Command {
  return new Command('serve')
    .description('Start local schema visualization server')
    .option('--port <number>', 'Port to serve on', '3000')
    .option('--open', 'Open browser automatically')
    .action(async (options: StudioOptions) => {
      await serveStudio(options.port, options.open);
    });
}

async function visualizeSchema(options: VisualizeOptions): Promise<void> {
  const projectRoot = process.cwd();
  const config = loadProjectConfig(projectRoot);
  const { schemaPath } = config;

  const result = parseSchemaFile(schemaPath);

  if (result.errors.length > 0) {
    console.warn('Schema parsing warnings:');
    for (const error of result.errors) {
      console.warn(`  ${error.file}:${error.line}:${error.column} - ${error.message}`);
    }
  }

  const output = generateERDiagram({
    schema: result.schema,
    options: {
      format: options.format ?? 'mermaid',
      includeProperties: options.includeProperties ?? true,
    },
  });

  if (options.output) {
    const fullPath = path.resolve(projectRoot, options.output);
    fs.writeFileSync(fullPath, output);
    console.log(`✓ ER diagram saved to ${fullPath}`);
  } else {
    console.log(output);
  }
}

async function generateDocs(options: DocOptions): Promise<void> {
  const projectRoot = process.cwd();
  const config = loadProjectConfig(projectRoot);
  const { schemaPath } = config;

  const result = parseSchemaFile(schemaPath);

  if (result.errors.length > 0) {
    console.warn('Schema parsing warnings:');
    for (const error of result.errors) {
      console.warn(`  ${error.file}:${error.line}:${error.column} - ${error.message}`);
    }
  }

  const output = generateDocumentation(result.schema, {
    format: options.format ?? 'markdown',
    title: options.title ?? 'Metal Schema Documentation',
  });

  if (options.output) {
    const fullPath = path.resolve(projectRoot, options.output);
    fs.writeFileSync(fullPath, output);
    console.log(`✓ Documentation saved to ${fullPath}`);
  } else {
    console.log(output);
  }
}

async function serveStudio(port: number = 3000, open: boolean = false): Promise<void> {
  const projectRoot = process.cwd();
  const config = loadProjectConfig(projectRoot);
  const { schemaPath } = config;

  const result = parseSchemaFile(schemaPath);

  if (result.errors.length > 0) {
    console.warn('Schema parsing warnings:');
    for (const error of result.errors) {
      console.warn(`  ${error.file}:${error.line}:${error.column} - ${error.message}`);
    }
  }

  // Generate all formats for the studio
  const mermaid = generateERDiagram({ schema: result.schema, options: { format: 'mermaid' } });
  const markdown = generateDocumentation(result.schema, { format: 'markdown' });
  const json = generateERDiagram({ schema: result.schema, options: { format: 'json' } });

  // Simple HTTP server
  const http = await import('node:http');
  const url = await import('node:url');

  const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url ?? '', true);

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (parsedUrl.pathname === '/' || parsedUrl.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(generateStudioHTML(mermaid, markdown, json));
    } else if (parsedUrl.pathname === '/api/schema') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(json);
    } else if (parsedUrl.pathname === '/api/mermaid') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(mermaid);
    } else if (parsedUrl.pathname === '/api/markdown') {
      res.writeHead(200, { 'Content-Type': 'text/markdown' });
      res.end(markdown);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });

  server.listen(port, () => {
    console.log(`\n🎨 Metal Studio running at http://localhost:${port}`);
    console.log('  Press Ctrl+C to stop\n');

    if (open) {
      const openCmd =
        process.platform === 'darwin'
          ? 'open'
          : process.platform === 'win32'
            ? 'start'
            : 'xdg-open';
      exec(`${openCmd} http://localhost:${port}`);
    }
  });

  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down studio...');
    server.close(() => process.exit(0));
  });
}

function generateStudioHTML(mermaid: string, markdown: string, json: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Metal Studio</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <style>
    * { box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
      margin: 0; padding: 0; background: #f5f5f5; 
    }
    header { 
      background: #1a1a2e; color: white; padding: 1rem 2rem; 
      display: flex; justify-content: space-between; align-items: center;
    }
    header h1 { margin: 0; font-size: 1.5rem; }
    .tabs { display: flex; gap: 0.5rem; }
    .tab { 
      padding: 0.5rem 1rem; background: rgba(255,255,255,0.1); 
      border: none; color: white; cursor: pointer; border-radius: 4px;
      transition: background 0.2s;
    }
    .tab:hover, .tab.active { background: #e94560; }
    main { padding: 2rem; max-width: 1200px; margin: 0 auto; }
    .panel { display: none; }
    .panel.active { display: block; }
    .mermaid { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .markdown { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-height: 70vh; overflow: auto; }
    pre { background: #1e1e1e; color: #d4d4d4; padding: 1rem; border-radius: 4px; overflow: auto; }
    code { font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 0.9rem; }
    @media (max-width: 768px) {
      header { flex-direction: column; gap: 1rem; }
      .tabs { flex-wrap: wrap; justify-content: center; }
    }
  </style>
</head>
<body>
  <header>
    <h1>🎨 Metal Studio</h1>
    <div class="tabs">
      <button class="tab active" data-tab="diagram">ER Diagram</button>
      <button class="tab" data-tab="docs">Documentation</button>
      <button class="tab" data-tab="json">Raw JSON</button>
    </div>
  </header>
  <main>
    <div id="diagram" class="panel active">
      <div class="mermaid" id="mermaid-chart"></div>
    </div>
    <div id="docs" class="panel">
      <div class="markdown" id="markdown-content"></div>
    </div>
    <div id="json" class="panel">
      <pre><code id="json-content"></code></pre>
    </div>
  </main>
  <script>
    mermaid.initialize({ startOnLoad: true, theme: 'default' });
    
    // Render Mermaid diagram
    const mermaidDiv = document.getElementById('mermaid-chart');
    mermaidDiv.innerHTML = \`<pre class="mermaid">\${atob(\`${btoa(mermaid)}\`)}</pre>\`;
    mermaid.run({ nodes: [mermaidDiv] });
    
    // Render Markdown
    document.getElementById('markdown-content').innerHTML = marked.parse(atob(\`${btoa(markdown)}\`));
    
    // Render JSON
    document.getElementById('json-content').textContent = atob(\`${btoa(json)}\`);
    
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');
      });
    });
  </script>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
</body>
</html>`;
}
