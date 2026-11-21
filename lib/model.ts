export interface Protocol {
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
  protocols: Protocol[];
  watchlist: string[];
}

export interface ModelParams {
  growth_weight: number;
  growth_cap: number;
  maturity_floor: number;
  category_blend: number;
  global_scale: number;
}

export const DEFAULT_PARAMS: ModelParams = {
  growth_weight: 0.45,
  growth_cap: 0.65,
  maturity_floor: 0.72,
  category_blend: 1.0,
  global_scale: 1.0,
};

export interface CategoryStats {
  category: string;
  sample_count: number;
  raw_median: number | null;
  blended_multiple: number;
  source: 'category_median' | 'blended_global' | 'global_fallback';
}

export interface ModelBreakdown {
  base_multiple_source: string;
  category_sample_count: number;
  category_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  peer_live_median_ratio: number | null;
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  tvl_usd: number;
  change_7d: number | null;
  category: string;
  chains: string[];
  listed_at: string | null;
  age_days: number;
  on_watchlist: boolean;
  tier: 'watchlist' | 'early_radar';
  multiple: number;
  model_breakdown: ModelBreakdown;
  farm_steps: string[];
}

export interface LiveComp {
  slug: string;
  name: string;
  symbol: string | null;
  category: string;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  mcap_tvl_ratio: number;
  change_7d: number | null;
  listed_at: string | null;
}

export interface RadarPayload {
  as_of: string;
  source: string;
  floor_usd: number;
  params: ModelParams;
  global_median_multiple: number;
  live_count: number;
  early_count: number;
  watchlist_count: number;
  category_stats: CategoryStats[];
  rows: BoardRow[];
  live_comps: LiveComp[];
}

const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

const VERSION_SUFFIX_RE = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_STAKED_RE = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX_RE = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function round4(v: number): number {
  return Math.round(v * 10_000) / 10_000;
}

function median(values: number[]): number {
  if (values.length === 0) return 0.25;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Partial<Snapshot>;
  if (!raw || typeof raw.as_of !== 'string' || typeof raw.source !== 'string') {
    throw new Error('snapshot: missing as_of or source');
  }
  if (typeof raw.floor_usd !== 'number' || !Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot: missing floor_usd, protocols, or watchlist');
  }
  return {
    as_of: raw.as_of,
    source: raw.source,
    floor_usd: raw.floor_usd,
    protocols: raw.protocols,
    watchlist: raw.watchlist,
  };
}

export function daysBetween(listedAt: string | null, asOf: string): number {
  if (!listedAt) return 180;
  const start = Date.parse(`${listedAt}T00:00:00Z`);
  const end = Date.parse(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 180;
  return clamp(Math.floor((end - start) / 86_400_000), 0, 3650);
}

export function isPreTokenCandidate(p: Protocol): boolean {
  if (p.gecko_id !== null || p.symbol !== null || p.mcap_usd !== null) return false;
  if (VERSION_SUFFIX_RE.test(p.name)) return false;
  if (EXCLUDED_CATEGORIES.has(p.category ?? '')) return false;
  if (WRAPPED_STAKED_RE.test(p.name)) return false;
  if (EXCHANGE_PREFIX_RE.test(p.name)) return false;
  return true;
}

export function calibrateCategoryMultiples(
  protocols: Protocol[],
  categoryBlend = 1.0,
): { globalMedian: number; statsByCategory: Map<string, CategoryStats> } {
  const liveRatios: number[] = [];
  const byCategory = new Map<string, number[]>();

  for (const p of protocols) {
    if (p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0) {
      const ratio = clamp(p.mcap_usd / p.tvl_usd, 0.02, 5.0);
      liveRatios.push(ratio);
      const cat = p.category ?? 'Uncategorized';
      const arr = byCategory.get(cat);
      if (arr) arr.push(ratio);
      else byCategory.set(cat, [ratio]);
    }
  }

  const globalMedian = round4(median(liveRatios));
  const allCategories = new Set<string>(byCategory.keys());
  for (const p of protocols) {
    allCategories.add(p.category ?? 'Uncategorized');
  }

  const statsByCategory = new Map<string, CategoryStats>();
  for (const cat of [...allCategories].sort()) {
    const arr = byCategory.get(cat) ?? [];
    const n = arr.length;
    if (n >= 3) {
      const raw = round4(median(arr));
      const blended = round4(clamp(categoryBlend * raw + (1 - categoryBlend) * globalMedian, 0.04, 2.5));
      statsByCategory.set(cat, {
        category: cat,
        sample_count: n,
        raw_median: raw,
        blended_multiple: blended,
        source: 'category_median',
      });
    } else if (n > 0) {
      const raw = round4(median(arr));
      const w = n / 3;
      const empirical = w * raw + (1 - w) * globalMedian;
      const blended = round4(clamp(categoryBlend * empirical + (1 - categoryBlend) * globalMedian, 0.04, 2.5));
      statsByCategory.set(cat, {
        category: cat,
        sample_count: n,
        raw_median: raw,
        blended_multiple: blended,
        source: 'blended_global',
      });
    } else {
      statsByCategory.set(cat, {
        category: cat,
        sample_count: 0,
        raw_median: null,
        blended_multiple: round4(clamp(globalMedian, 0.04, 2.5)),
        source: 'global_fallback',
      });
    }
  }

  return { globalMedian, statsByCategory };
}

export function computeImpliedValue(
  tvlUsd: number,
  change7d: number | null,
  ageDays: number,
  catMultiple: number,
  params: ModelParams,
): { implied_value_usd: number; growth_multiplier: number; maturity_multiplier: number } {
  const g = change7d === null || !Number.isFinite(change7d)
    ? 0
    : clamp(change7d / 100, -params.growth_cap, params.growth_cap);
  const growth_multiplier = round4(Math.max(0.4, 1 + params.growth_weight * g));
  const maturityProgress = clamp(ageDays / 540, 0, 1);
  const maturity_multiplier = round4(
    params.maturity_floor + (1.18 - params.maturity_floor) * Math.sqrt(maturityProgress),
  );
  const raw = tvlUsd * catMultiple * growth_multiplier * maturity_multiplier * params.global_scale;
  return {
    implied_value_usd: Math.max(1, Math.min(100_000_000_000_000, Math.round(raw))),
    growth_multiplier,
    maturity_multiplier,
  };
}

function gasEstimateForChains(chains: string[]): string {
  const set = new Set(chains.map((c) => c.toLowerCase()));
  if (set.size === 1 && set.has('ethereum')) return '$12-$35 L1 gas';
  if (set.has('solana') || set.has('sui') || set.has('aptos')) return '$0.01-$0.15 gas';
  if (set.has('base') || set.has('arbitrum') || set.has('optimism') || set.has('polygon')) {
    return '$0.05-$0.60 L2 gas';
  }
  return '$0.25-$3.00 network gas';
}

function primaryChain(chains: string[]): string {
  return chains.length > 0 ? chains[0]! : 'Mainnet';
}

function formatUsdCompact(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n / 1000)}K`;
}

export function farmSteps(p: Protocol, ageDays: number): string[] {
  const cat = p.category ?? 'DeFi';
  const chain = primaryChain(p.chains);
  const gas = gasEstimateForChains(p.chains);
  const tvlStr = formatUsdCompact(p.tvl_usd);
  const momentum = p.change_7d === null
    ? 'steady TVL'
    : p.change_7d >= 8
      ? `surging +${p.change_7d.toFixed(1)}% 7d TVL`
      : p.change_7d <= -8
        ? `pulling back ${p.change_7d.toFixed(1)}% 7d TVL`
        : `${p.change_7d >= 0 ? '+' : ''}${p.change_7d.toFixed(1)}% 7d TVL`;

  const coreActionByCategory: Record<string, string> = {
    Lending: `Supply $500-$2,500 stablecoins or blue-chip collateral on ${p.name} (${chain}) and borrow 35% LTV to earn points (${gas}; 20m setup).`,
    Dexs: `Seed $300-$1,500 in the deepest ${chain} pool on ${p.name} and route 2-4 weekly swaps ($100+ each) to log LP + taker volume (${gas}; 15m/wk).`,
    Derivatives: `Deposit $250-$1,000 margin on ${p.name} (${chain}) and execute 5+ hedged perp trades/wk for $10k-$50k notional volume (${gas}; 25m/wk).`,
    Yield: `Deposit $400-$2,000 into ${p.name}'s flagship ${chain} vault and hold the receipt token unleveraged across a 30-90d epoch (${gas}; 15m setup).`,
    'Yield Aggregator': `Allocate $300-$1,500 into ${p.name} auto-compounding vaults on ${chain} to stack underlying + aggregator points (${gas}; 15m setup).`,
    RWA: `Mint or hold $500-$2,500 of ${p.name}'s treasury-backed yield asset on ${chain} after completing KYC if required (${gas}; 25m setup).`,
    'Basis Trading': `Mint $500-$2,000 of ${p.name}'s delta-neutral synthetic dollar on ${chain} and stake in the s-vault for funding yield (${gas}; 15m setup).`,
    Restaking: `Deposit $300-$1,500 LST/LRT collateral into ${p.name} on ${chain} and delegate to an active AVS operator (${gas}; 20m setup).`,
  };

  const step1 = `Wallet & chain prep: bridge $250-$2,000 liquidity to ${chain} for ${p.name} (${tvlStr} TVL, ${momentum}) keeping $10-$40 gas buffer (${gas}; 10m setup).`;
  const step2 = coreActionByCategory[cat] ??
    `Deploy $300-$1,500 core position into ${p.name} (${cat}) on ${chain} using a primary wallet with clean on-chain history (${gas}; 20m setup).`;
  const step3 = p.chains.length > 1
    ? `Cross-chain footprint: split 20% ($100-$400) onto ${p.chains[1]} in addition to ${chain} so multi-chain snapshots capture both deployments (${gas}; 15m).`
    : `Epoch consistency: maintain active position on ${chain} for 30-90d and interact on 2 distinct days/wk to clear anti-sybil filters (${gas}; 5m/wk).`;
  const step4 = ageDays < 180
    ? `Early-protocol cadence: ${p.name} is ${ageDays}d old—join governance/testnet quests ($0 gas-only; 10m) and verify points dashboard weekly (5m/wk).`
    : `Mature-protocol retention: ${p.name} has run ${ageDays}d without a token—compound rewards biweekly (${gas}; 5m) and avoid full withdrawals before snapshots.`;
  const step5 = `Risk & exit check: cap exposure at 5-10% of farm bankroll ($0 cost; 5m/wk) and monitor ${p.name} audit status, withdrawal queues, and 7d TVL outflows.`;

  return [step1, step2, step3, step4, step5];
}

export function buildRadar(
  snapshot: Snapshot,
  params: ModelParams = DEFAULT_PARAMS,
): { board: BoardRow[]; radar: RadarPayload } {
  const { globalMedian, statsByCategory } = calibrateCategoryMultiples(
    snapshot.protocols,
    params.category_blend,
  );
  const watchlistSet = new Set(snapshot.watchlist);

  const selected: Protocol[] = [];
  const seen = new Set<string>();
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));

  for (const slug of snapshot.watchlist) {
    const p = bySlug.get(slug);
    if (p && !seen.has(p.slug)) {
      selected.push(p);
      seen.add(p.slug);
    }
  }

  const extraCandidates = snapshot.protocols
    .filter((p) => !seen.has(p.slug) && isPreTokenCandidate(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));

  for (const p of extraCandidates.slice(0, 260)) {
    selected.push(p);
    seen.add(p.slug);
  }

  const unscored = selected.map((p) => {
    const cat = p.category ?? 'Uncategorized';
    const catStats = statsByCategory.get(cat) ?? {
      category: cat,
      sample_count: 0,
      raw_median: null,
      blended_multiple: globalMedian,
      source: 'global_fallback' as const,
    };
    const ageDays = daysBetween(p.listed_at, snapshot.as_of);
    const val = computeImpliedValue(
      p.tvl_usd,
      p.change_7d,
      ageDays,
      catStats.blended_multiple,
      params,
    );
    const onWatchlist = watchlistSet.has(p.slug);
    return {
      slug: p.slug,
      name: p.name,
      rank: 0,
      implied_value_usd: val.implied_value_usd,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      category: cat,
      chains: [...p.chains],
      listed_at: p.listed_at,
      age_days: ageDays,
      on_watchlist: onWatchlist,
      tier: onWatchlist ? ('watchlist' as const) : ('early_radar' as const),
      multiple: round4(val.implied_value_usd / Math.max(1, p.tvl_usd)),
      model_breakdown: {
        base_multiple_source: catStats.source,
        category_sample_count: catStats.sample_count,
        category_multiple: catStats.blended_multiple,
        growth_multiplier: val.growth_multiplier,
        maturity_multiplier: val.maturity_multiplier,
        peer_live_median_ratio: catStats.raw_median,
      },
      farm_steps: farmSteps(p, ageDays),
    };
  });

  unscored.sort(
    (a, b) =>
      b.implied_value_usd - a.implied_value_usd ||
      b.tvl_usd - a.tvl_usd ||
      (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
  );

  const board: BoardRow[] = unscored.map((row, idx) => ({ ...row, rank: idx + 1 }));

  const live_comps: LiveComp[] = snapshot.protocols
    .filter((p): p is Protocol & { mcap_usd: number } => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      symbol: p.symbol,
      category: p.category ?? 'Uncategorized',
      chains: [...p.chains],
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      mcap_tvl_ratio: round4(p.mcap_usd / p.tvl_usd),
      change_7d: p.change_7d,
      listed_at: p.listed_at,
    }))
    .sort((a, b) => b.mcap_usd - a.mcap_usd || (a.slug < b.slug ? -1 : 1));

  const radar: RadarPayload = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    params,
    global_median_multiple: globalMedian,
    live_count: live_comps.length,
    early_count: board.filter((r) => r.tier === 'early_radar').length,
    watchlist_count: board.filter((r) => r.tier === 'watchlist').length,
    category_stats: [...statsByCategory.values()],
    rows: board,
    live_comps,
  };

  return { board, radar };
}

export function dataScript(radar: RadarPayload): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) {
    return `row count ${board.length} outside 100..4000`;
  }
  const validSlugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seenSlugs = new Set<string>();
  const seenRanks = new Set<number>();
  let prevVal = Infinity;
  let allSame = true;
  const firstVal = board[0]?.implied_value_usd;

  for (const row of board) {
    if (!validSlugs.has(row.slug)) return `unknown slug: ${row.slug}`;
    if (seenSlugs.has(row.slug)) return `duplicate slug: ${row.slug}`;
    seenSlugs.add(row.slug);
    if (!row.name || row.name.trim().length === 0) return `empty name: ${row.slug}`;
    if (!Number.isInteger(row.rank) || row.rank < 1 || row.rank > board.length) {
      return `invalid rank ${row.rank} for ${row.slug}`;
    }
    if (seenRanks.has(row.rank)) return `duplicate rank ${row.rank}`;
    seenRanks.add(row.rank);
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd < 1 || row.implied_value_usd > 100_000_000_000_000) {
      return `invalid implied_value_usd for ${row.slug}`;
    }
    if (row.implied_value_usd > prevVal) {
      return `implied_value_usd rises at rank ${row.rank} (${row.slug})`;
    }
    prevVal = row.implied_value_usd;
    if (row.implied_value_usd !== firstVal) allSame = false;
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `invalid farm_steps count for ${row.slug}`;
    }
    for (const step of row.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) return `farm_step length ${len} out of 20..600 for ${row.slug}`;
    }
  }
  if (allSame) return 'all implied_value_usd values are identical';
  for (const w of snapshot.watchlist) {
    if (!seenSlugs.has(w)) return `missing watchlist slug: ${w}`;
  }
  return null;
}

