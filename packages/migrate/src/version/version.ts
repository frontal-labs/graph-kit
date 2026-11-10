// @graph-kit/migrate/src/version/version.ts
// Migration version generation

export function generateVersion(): string {
  return Date.now().toString();
}
