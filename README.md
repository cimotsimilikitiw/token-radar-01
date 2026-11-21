# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/cimotsimilikitiw/rank.svg?cb=22453987)](https://make.fun/bounty/token-radar-01/entries/cimotsimilikitiw?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![score](https://make.fun/badge/token-radar-01/cimotsimilikitiw/score.svg?cb=22453987)](https://make.fun/bounty/token-radar-01/entries/cimotsimilikitiw?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Deterministic token launch radar for the `token-radar-01` bounty. It reads the sealed DefiLlama snapshot, scores pre-token protocols by implied launch value, and emits a ranked board plus a static dashboard dossier.

## What it produces

- `board.json` — ranked board (200 rows, contiguous ranks, sorted by implied value desc then TVL desc then slug asc).
- `data.js` — `window.RADAR` payload for the dashboard.
- `dashboard/` — static offline dashboard (index.html, app.css, app.js).
- `screenshots/` — 3 headless Chromium captures of distinct dashboard states.
- `dossier.json` — generated last by `vendor/makefun-board.ts:buildDossier`.

## Model

The model is deterministic and uses only snapshot fields:

- **Base**: `tvl_usd * base_multiple`
- **Growth**: 7d change clamped to configured bounds, applied as a growth multiplier
- **Maturity**: age since `listed_at` relative to snapshot `as_of`, clamped into a maturity span
- **Implied value**: `round(base * growth_multiplier * maturity)`, minimum 1 USD

Watchlist protocols are always included when pre-token. Remaining board slots are filled by the highest implied-value pre-token candidates (excluding CEX and versioned forks).

## Run

```bash
node main.ts --input <file|dir> --output <dir>
```

Defaults: `MAKEFUN_INPUT_DIR` or `/input`, `MAKEFUN_OUTPUT_DIR` or `/output`.

## Contract notes

- Node 22, standard library only.
- No network access.
- Deterministic outputs for the same input.
- `vendor/makefun-board.ts` is byte-identical to the pinned kit file.

---

<sub>Entered on [make.fun](https://make.fun/?ref=fe0p3md4&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
