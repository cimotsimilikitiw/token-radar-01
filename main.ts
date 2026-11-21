import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';
import {
  boardIssue,
  buildRadar,
  dataScript,
  modelConstants,
  parseSnapshot,
  type RadarData,
} from './lib/model.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IMAGE_NAME = /^[A-Za-z0-9._-]{1,128}$/;
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };

function usage(): never {
  process.stderr.write(
    'usage: node main.ts [--input <file|dir>] [--output <dir>]\n' +
      'defaults: MAKEFUN_INPUT_DIR or /input, MAKEFUN_OUTPUT_DIR or /output\n',
  );
  process.exit(1);
}

function parseArgs(argv: string[]): { input?: string; output?: string } {
  const out: { input?: string; output?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--input') {
      if (i + 1 >= argv.length) usage();
      out.input = argv[++i];
    } else if (arg === '--output') {
      if (i + 1 >= argv.length) usage();
      out.output = argv[++i];
    } else {
      usage();
    }
  }
  return out;
}

function resolveSnapshotPath(inputArg: string | undefined): string {
  const root = inputArg ?? process.env.MAKEFUN_INPUT_DIR ?? '/input';
  const abs = resolve(root);
  try {
    const stat = readFileSync(abs);
    // If it's a file, readFileSync succeeded; but directories also error differently on some systems.
    // Use stat via readdirSync fallback below.
    if (stat) {
      // Could be a file or we read it; check if it's actually snapshot.json or a directory path.
    }
  } catch {
    // fall through
  }
  // Prefer explicit file path, else <dir>/snapshot.json
  try {
    const { statSync } = require('node:fs') as typeof import('node:fs');
    const st = statSync(abs);
    if (st.isDirectory()) return join(abs, 'snapshot.json');
    return abs;
  } catch {
    // If stat fails, assume it's a file path.
    return abs.endsWith('.json') ? abs : join(abs, 'snapshot.json');
  }
}

function loadSnapshot(snapshotPath: string) {
  let rawText: string;
  try {
    rawText = readFileSync(snapshotPath, 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`token-radar: failed to read snapshot ${snapshotPath}: ${msg}\n`);
    process.exit(1);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`token-radar: invalid snapshot JSON: ${msg}\n`);
    process.exit(1);
  }
  try {
    return parseSnapshot(parsed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`token-radar: invalid snapshot: ${msg}\n`);
    process.exit(1);
  }
}

function ensureScreenshots(screenshotsDir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(screenshotsDir).filter((n) => n.toLowerCase().endsWith('.png')).sort();
  } catch {
    process.stderr.write(`token-radar: missing screenshots directory: ${screenshotsDir}\n`);
    process.exit(1);
  }
  if (entries.length < 3) {
    process.stderr.write(
      `token-radar: screenshots/ needs at least 3 png files, found ${entries.length}\n`,
    );
    process.exit(1);
  }
  for (const name of entries) {
    if (!IMAGE_NAME.test(name)) {
      process.stderr.write(`token-radar: invalid screenshot name: ${name}\n`);
      process.exit(1);
    }
  }
  return entries;
}

function copyDashboard(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const snapshotPath = resolveSnapshotPath(args.input);
  const outDir = resolve(args.output ?? process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

  const snapshot = loadSnapshot(snapshotPath);
  const { rows, live } = buildRadar(snapshot);

  const issue = boardIssue(rows, snapshot);
  if (issue) {
    process.stderr.write(`token-radar: board validation failed: ${issue}\n`);
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });

  const boardPath = join(outDir, 'board.json');
  writeFileSync(boardPath, JSON.stringify(rows));

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    watchlist_size: snapshot.watchlist.length,
    board_size: rows.length,
    early_size: rows.filter((r) => !snapshot.watchlist.includes(r.slug)).length,
    live_size: live.length,
    model: modelConstants(),
    rows,
    live,
  };

  writeFileSync(join(outDir, 'data.js'), dataScript(radar));

  const dashboardSrc = join(__dirname, 'dashboard');
  const dashboardDest = join(outDir, 'dashboard');
  copyDashboard(dashboardSrc, dashboardDest);

  const screenshotsSrc = join(__dirname, 'screenshots');
  const screenshotsDest = join(outDir, 'screenshots');
  mkdirSync(screenshotsDest, { recursive: true });
  const shots = ensureScreenshots(screenshotsSrc);
  for (const name of shots) {
    cpSync(join(screenshotsSrc, name), join(screenshotsDest, name));
  }

  // Dossier must be written last: it summarizes the dashboard and screenshots as delivered.
  const dossier = buildDossier(outDir, {
    text_max_bytes: TEXT_MAX_BYTES,
    screenshots: SCREENSHOT_CAPS,
    dashboard: DASHBOARD_CAPS,
  });
  writeFileSync(join(outDir, 'dossier.json'), dossier);

  process.stdout.write(
    `token-radar: snapshot=${snapshot.protocols.length} protocols, watchlist=${snapshot.watchlist.length}, board=${rows.length}, live=${live.length}\n`,
  );
  process.stdout.write(`token-radar: wrote ${boardPath}\n`);
}

main();
