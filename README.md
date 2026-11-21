# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/cimotsimilikitiw/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/cimotsimilikitiw/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Deterministic pre-token valuation and farming terminal for the `token-radar-01` bounty. It reads the sealed DefiLlama snapshot, calibrates category `mcap_usd / tvl_usd` multiples from live-token peers in the snapshot, ranks pre-token protocols by implied launch valuation, and emits a static offline dashboard dossier.

## Outputs

- `board.json` — ranked board (198 rows: all 40 watchlist protocols + 158 early-radar pre-token protocols below the $50M floor, contiguous ranks `1..198`).
- `data.js` — `window.RADAR` payload including `rows`, `category_stats`, and `live_comps` (128 live-token peer benchmarks).
- `dashboard/` — static offline terminal (`index.html`, `app.css`, `app.js`, 34 KB total, zero network URLs) with multi-column sorting, tier/category/chain filtering, interactive Model Sandbox, SVG charts, and protocol detail drawer.
- `screenshots/` — 4 headless Chromium captures (`1-board.png`, `2-detail.png`, `3-filtered.png`, `4-sandbox.png`).
- `dossier.json` — canonical dossier written by `vendor/makefun-board.ts:buildDossier`.

## Valuation Model

All multiples are derived empirically from the snapshot's own figures:

- **Category Multiple**: median `mcap_usd / tvl_usd` of live-token protocols in the same category (blended with the global live-token median when `sample_count < 3`, clamped to `[0.04, 2.50]`).
- **Growth Multiplier**: clamped 7-day TVL momentum (`change_7d`) weighted by `growth_weight`.
- **Maturity Multiplier**: protocol longevity (`listed_at` to `as_of`) on a concave curve from `maturity_floor` to `1.18x`.
- **Implied Value**: `round(tvl_usd * category_multiple * growth_multiplier * maturity_multiplier * global_scale)`.

Each row includes 5 category- and chain-tailored `farm_steps` with explicit USD capital/gas ranges and time commitments.

## Run

```bash
node main.ts --input <snapshot.json|dir> --output <dir>
```

Defaults: `/input/snapshot.json` and `MAKEFUN_OUTPUT_DIR` or `/output`. Node 22+ standard library only.

---

<sub>Entered on [make.fun](https://make.fun/?ref=fe0p3md4&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
