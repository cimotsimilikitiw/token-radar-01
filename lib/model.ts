/**
 * Token radar scoring model.
 *
 * Reads a sealed DefiLlama snapshot and produces a ranked board of pre-token protocols.
 * The watchlist is always included; additional pre-token protocols are selected by implied value.
 * All computation is deterministic: only snapshot fields and fixed constants are used.
 */

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor_pct: number;
  growth_cap_pct: number;
  maturity_floor: number;
  maturity_span_days: number;
  maturity_weight: number;
  unknown_age_days: number;
}

export interface ModelBreakdown {
  base_usd: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity: number;
  age_days: number | null;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  implied_value_usd: number;
  why: string;
  farm_steps: string[];
  model: ModelBreakdown;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  model: ModelConstants;
  rows: BoardRow[];
  live: LiveRow[];
}

export const MODEL: ModelConstants = {
  base_multiple: 0.45,
  growth_weight: 0.35,
  growth_floor_pct: -60,
  growth_cap_pct: 120,
  maturity_floor: 0.6,
  maturity_span_days: 1095,
  maturity_weight: 0.4,
  unknown_age_days: 365,
};

const VERSIONED_NAME_RE = /\sv\d+$/i;
const BOARD_TARGET = 200;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: unknown, field: string): string {
  if (typeof v !== 'string') throw new Error(`snapshot: ${field} must be a string`);
  return v;
}

function asNullableString(v: unknown, field: string): string | null {
  if (v === null) return null;
  if (typeof v !== 'string') throw new Error(`snapshot: ${field} must be string|null`);
  return v;
}

function asFiniteNumber(v: unknown, field: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`snapshot: ${field} must be a finite number`);
  }
  return v;
}

function asNullableNumber(v: unknown, field: string): number | null {
  if (v === null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`snapshot: ${field} must be number|null`);
  }
  return v;
}

function asStringArray(v: unknown, field: string): string[] {
  if (!Array.isArray(v)) throw new Error(`snapshot: ${field} must be an array`);
  return v.map((item, i) => asString(item, `${field}[${i}]`));
}

export function parseSnapshot(raw: unknown): Snapshot {
  if (!isObject(raw)) throw new Error('snapshot: root must be an object');
  const as_of = asString(raw.as_of, 'as_of');
  const source = asString(raw.source, 'source');
  const floor_usd = asFiniteNumber(raw.floor_usd, 'floor_usd');
  if (!Array.isArray(raw.protocols)) throw new Error('snapshot: protocols must be an array');
  if (!Array.isArray(raw.watchlist)) throw new Error('snapshot: watchlist must be an array');

  const protocols: SnapshotProtocol[] = raw.protocols.map((entry, i) => {
    if (!isObject(entry)) throw new Error(`snapshot: protocols[${i}] must be an object`);
    const p: SnapshotProtocol = {
      slug: asString(entry.slug, `protocols[${i}].slug`),
      name: asString(entry.name, `protocols[${i}].name`),
      category: asNullableString(entry.category, `protocols[${i}].category`),
      chains: asStringArray(entry.chains, `protocols[${i}].chains`),
      tvl_usd: asFiniteNumber(entry.tvl_usd, `protocols[${i}].tvl_usd`),
      change_7d: asNullableNumber(entry.change_7d, `protocols[${i}].change_7d`),
      mcap_usd: asNullableNumber(entry.mcap_usd, `protocols[${i}].mcap_usd`),
      listed_at: asNullableString(entry.listed_at, `protocols[${i}].listed_at`),
      gecko_id: asNullableString(entry.gecko_id, `protocols[${i}].gecko_id`),
      symbol: asNullableString(entry.symbol, `protocols[${i}].symbol`),
    };
    return p;
  });

  const watchlist = raw.watchlist.map((s, i) => asString(s, `watchlist[${i}]`));
  return { as_of, source, floor_usd, protocols, watchlist };
}

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function daysBetween(isoDate: string, asOf: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  const n = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asOf);
  if (!m || !n) return null;
  const a = Date.UTC(+n[1], +n[2] - 1, +n[3]);
  const b = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const diff = Math.floor((a - b) / 86_400_000);
  return Number.isFinite(diff) ? diff : null;
}

function ageDays(p: SnapshotProtocol, asOf: string): number | null {
  if (!p.listed_at) return null;
  const days = daysBetween(p.listed_at, asOf);
  if (days === null) return null;
  return Math.max(0, days);
}

function fmtUsdCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function fmtPct(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return 'n/a';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

export function scoreProtocol(p: SnapshotProtocol, asOf: string, model: ModelConstants = MODEL): { implied_value_usd: number; breakdown: ModelBreakdown; why: string } {
  const baseUsd = p.tvl_usd * model.base_multiple;
  const growthPct = clamp(p.change_7d ?? 0, model.growth_floor_pct, model.growth_cap_pct);
  const growthMultiplier = 1 + (growthPct / 100) * model.growth_weight;
  const age = ageDays(p, asOf);
  const ageForMaturity = age ?? model.unknown_age_days;
  const maturity = model.maturity_floor + (Math.min(ageForMaturity, model.maturity_span_days) / model.maturity_span_days) * model.maturity_weight;
  const implied = Math.max(1, Math.round(baseUsd * growthMultiplier * maturity));

  const chainText = p.chains.length > 0 ? p.chains.slice(0, 3).join(', ') : 'unknown chains';
  const ageText = age === null ? 'unknown age' : `${age}d old`;
  const why = `${p.name} is a pre-token ${p.category ?? 'protocol'} on ${chainText} with ${fmtUsdCompact(p.tvl_usd)} TVL, ${fmtPct(p.change_7d)} 7d change, ${ageText}. Implied launch value ${fmtUsdCompact(implied)} from TVL base x growth x maturity.`;

  return {
    implied_value_usd: implied,
    breakdown: {
      base_usd: Math.round(baseUsd),
      growth_pct: growthPct,
      growth_multiplier: Number(growthMultiplier.toFixed(6)),
      maturity: Number(maturity.toFixed(6)),
      age_days: age,
    },
    why,
  };
}

function farmSteps(p: SnapshotProtocol): string[] {
  const category = p.category ?? 'Protocol';
  const chain = p.chains[0] ?? 'its primary chain';
  const chains = p.chains.length > 0 ? p.chains.join(', ') : chain;
  const name = p.name;
  return [
    `Research ${name} (${category}) on ${chains}: confirm the official docs, audit links, and contract addresses before interacting.`,
    `Bridge assets to ${chain} and keep gas for multiple transactions; use a dedicated wallet to isolate protocol risk.`,
    `Use the core ${category.toLowerCase()} flow with small size first: deposit, swap, lend, or provide liquidity depending on the product's primary action.`,
    `Maintain recurring activity over several weeks: repeat meaningful transactions, avoid single-block sybil patterns, and track volume and positions.`,
    `Monitor governance/forum channels for points, snapshots, or token announcements; record tx hashes and dates so eligibility can be proven later.`,
  ];
}

function compareRows(a: BoardRow, b: BoardRow): number {
  if (b.implied_value_usd !== a.implied_value_usd) return b.implied_value_usd - a.implied_value_usd;
  if (b.tvl_usd !== a.tvl_usd) return b.tvl_usd - a.tvl_usd;
  if (a.slug < b.slug) return -1;
  if (a.slug > b.slug) return 1;
  return 0;
}

function toLiveRow(p: SnapshotProtocol): LiveRow {
  return {
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: [...p.chains],
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: p.mcap_usd,
    listed_at: p.listed_at,
    gecko_id: p.gecko_id,
    symbol: p.symbol,
  };
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { rows: BoardRow[]; live: LiveRow[] } {
  const bySlug = new Map<string, SnapshotProtocol>();
  for (const p of snapshot.protocols) bySlug.set(p.slug, p);

  const live: LiveRow[] = [];
  const pretokenCandidates: SnapshotProtocol[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p)) pretokenCandidates.push(p);
    else live.push(toLiveRow(p));
  }
  live.sort((a, b) => b.tvl_usd - a.tvl_usd || a.slug.localeCompare(b.slug));

  const selected = new Map<string, SnapshotProtocol>();
  // Watchlist floor: include every watchlist slug that exists in snapshot.
  for (const slug of snapshot.watchlist) {
    const p = bySlug.get(slug);
    if (p && isPreToken(p)) selected.set(slug, p);
  }

  // Fill remaining slots with best pre-token candidates not already selected.
  // Exclude versioned forks and CEX entries from auto-fill; watchlist floor still wins.
  const remaining = pretokenCandidates
    .filter((p) => !selected.has(p.slug) && p.category !== 'CEX' && !VERSIONED_NAME_RE.test(p.name))
    .map((p) => ({ p, score: scoreProtocol(p, snapshot.as_of, model).implied_value_usd }))
    .sort((a, b) => b.score - a.score || b.p.tvl_usd - a.p.tvl_usd || a.p.slug.localeCompare(b.p.slug));

  for (const item of remaining) {
    if (selected.size >= BOARD_TARGET) break;
    selected.set(item.p.slug, item.p);
  }

  // If watchlist somehow exceeds target, keep all watchlist (floor) but that's unlikely.
  const scored = Array.from(selected.values()).map((p) => {
    const s = scoreProtocol(p, snapshot.as_of, model);
    const row: BoardRow = {
      rank: 0,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: [...p.chains],
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd,
      listed_at: p.listed_at,
      gecko_id: p.gecko_id,
      symbol: p.symbol,
      implied_value_usd: s.implied_value_usd,
      why: s.why,
      farm_steps: farmSteps(p),
      model: s.breakdown,
    };
    return row;
  });

  scored.sort(compareRows);
  scored.forEach((row, i) => { row.rank = i + 1; });

  return { rows: scored, live };
}

export function modelConstants(model: ModelConstants = MODEL): ModelConstants {
  return { ...model };
}

export function boardIssue(rows: BoardRow[], snapshot: Snapshot): string | null {
  if (rows.length < 100 || rows.length > 4000) return `board size ${rows.length} outside 100-4000`;
  const seen = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.rank !== i + 1) return `rank mismatch at index ${i}: got ${r.rank}`;
    if (seen.has(r.slug)) return `duplicate slug ${r.slug}`;
    seen.add(r.slug);
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd <= 0) {
      return `invalid implied_value_usd for ${r.slug}`;
    }
    if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 3 || r.farm_steps.length > 12) {
      return `farm_steps count out of range for ${r.slug}`;
    }
    for (const step of r.farm_steps) {
      if (typeof step !== 'string' || step.length < 20 || step.length > 600) {
        return `farm step length out of range for ${r.slug}`;
      }
    }
  }
  for (let i = 1; i < rows.length; i++) {
    if (compareRows(rows[i - 1], rows[i]) > 0) return `sort violation at ${i - 1}/${i}`;
  }
  // Watchlist floor check
  const rowSlugs = new Set(rows.map((r) => r.slug));
  for (const slug of snapshot.watchlist) {
    const p = snapshot.protocols.find((x) => x.slug === slug);
    if (p && isPreToken(p) && !rowSlugs.has(slug)) return `watchlist slug missing: ${slug}`;
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
