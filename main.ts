import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const ROOT_DIR = fileURLToPath(new URL('.', import.meta.url));
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const IMAGE_NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function readFlag(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1]!;
  const prefix = `--${name}=`;
  const eq = process.argv.find((a) => a.startsWith(prefix));
  return eq ? eq.slice(prefix.length) : fallback;
}

function copyFlatDir(srcDir: string, dstDir: string): string[] {
  if (!existsSync(srcDir)) return [];
  mkdirSync(dstDir, { recursive: true });
  const names = readdirSync(srcDir).sort();
  const copied: string[] = [];
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const src = join(srcDir, name);
    if (!statSync(src).isFile()) continue;
    copyFileSync(src, join(dstDir, name));
    copied.push(name);
  }
  return copied;
}

function main(): void {
  const inputArg = readFlag('input', '/input');
  const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
  if (!existsSync(inputFile)) {
    process.stderr.write(`token-radar: missing snapshot at ${inputFile}\n`);
    process.exit(2);
  }

  const outDir = readFlag('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
  const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
  const { board, radar } = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot);
  if (issue !== null) {
    process.stderr.write(`token-radar: invalid board: ${issue}\n`);
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, 'board.json'),
    `${JSON.stringify({
      as_of: radar.as_of,
      source: radar.source,
      global_median_multiple: radar.global_median_multiple,
      params: radar.params,
      rows: board,
    })}\n`,
  );
  writeFileSync(join(outDir, 'data.js'), dataScript(radar));

  const dashFiles = copyFlatDir(join(ROOT_DIR, 'dashboard'), join(outDir, 'dashboard'));
  const shotFiles = copyFlatDir(join(ROOT_DIR, 'screenshots'), join(outDir, 'screenshots'));

  if (shotFiles.length < 3 || shotFiles.length > 4) {
    process.stderr.write(`token-radar: expected 3..4 screenshots, found ${shotFiles.length}\n`);
    process.exit(1);
  }
  for (const name of shotFiles) {
    if (!IMAGE_NAME_RE.test(name)) {
      process.stderr.write(`token-radar: invalid screenshot name ${name}\n`);
      process.exit(1);
    }
  }

  const dossier = buildDossier(outDir, {
    text_max_bytes: TEXT_MAX_BYTES,
    screenshots: SCREENSHOT_CAPS,
    dashboard: DASHBOARD_CAPS,
  });
  writeFileSync(join(outDir, 'dossier.json'), dossier);

  process.stdout.write(
    `token-radar: ${board.length} rows (${radar.watchlist_count} watchlist, ${radar.early_count} early, ${radar.live_count} live comps), ${dashFiles.length} dashboard files, ${shotFiles.length} screenshots\n`,
  );
}

main();
