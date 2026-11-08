// The CLI version, injected at build time from packages/cli/package.json (see tsup.config.ts)
declare const __GRAPH_OM_CLI_VERSION__: string | undefined;

export function cliVersion(): string {
  try {
    return typeof __GRAPH_OM_CLI_VERSION__ !== 'undefined' ? __GRAPH_OM_CLI_VERSION__ : '0.0.0';
  } catch {
    return '0.0.0';
  }
}
