// The few Node APIs the scripts use. The project has no @types/node on purpose: it would change the global
// timer types the browser code relies on.
declare module 'node:fs' {
  export function writeFileSync(path: string, data: Uint8Array): void;
}
declare module 'node:os' {
  export function tmpdir(): string;
}
declare module 'node:path' {
  export function join(...parts: string[]): string;
}
declare module 'node:child_process' {
  export function spawnSync(
    command: string,
    args: string[],
    options?: { stdio?: 'inherit' | 'ignore' },
  ): { status: number | null; error?: Error };
}
