# token-radar-01 — Evidence

## Scope
- Built deliverable in `scratchs/token-radar-01/build/` (isolated scratch). No writes outside scratch.
- Baseline: copied kit starter (`probes/kit-token-radar-01/token-radar-01-kit/starter/*`), then applied required repo furniture and a small security hardening.

## Contract compliance
- Entrypoint: `main.ts` at build root. Reads snapshot from `--input <file|dir>` or `MAKEFUN_INPUT_DIR` (default `/input/snapshot.json`); writes to `--output <dir>` or `MAKEFUN_OUTPUT_DIR` (default `/output`).
- Outputs written: `board.json` (`{rows:[...]}`), `data.js` (`window.RADAR=...;\n`), `dashboard/` (copied from repo `dashboard/`), `screenshots/` (3 PNGs copied from repo `screenshots/`), `dossier.json` written last.
- Dossier byte-equality: `buildDossier(out, {text_max_bytes:65536, screenshots:{max:4,max_bytes:524288}, dashboard:{max_files:400,max_bytes:4194304}})` equals `out1/dossier.json` exactly (`equal true`, 704952 bytes).
- Vendor: `vendor/makefun-board.ts` byte-identical to kit starter (`sha256 9ca51b6e5cd84fe46cb0efa61e2ea99365a1fb0e21f2b75e6007f977f0dc326e`).
- Repo furniture: `LICENSE` (MIT, from starter), `README.md` (how_to_submit template with 3 badges + footer `?ref=fe0p3md4&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01`), `.makefun/owner.json` (`{"wallet":"C8AE6zzhyuXT9E72RFjs6T38ZGi3HEQ3bnaDD5vcZCcK"}`).
- Deterministic model/scoring logic in `lib/model.ts` (starter baseline, no randomness/network/model calls). No `Math.random`/`Date.now` in entry code.

## Gate pass proof (local run, grader-style)
Command (run from `scratchs/token-radar-01/build/`):
```sh
node main.ts --input /home/adrioui/Projects/bounty/probes/kit-token-radar-01/token-radar-01-kit/input/snapshot.json --output /home/adrioui/Projects/bounty/scratchs/token-radar-01/out1
```
Output:
```
token radar: 758 protocols, 40 on the watchlist, 200 rows scored (160 early, 24 live set aside)
token radar: wrote .../out1/board.json, .../out1/data.js, .../out1/dashboard (3 files), .../out1/screenshots (3 images) and .../out1/dossier.json
```
Node: `v24.20.0` (linux x64). Entry is Node 22 stdlib-only TS; Node 24 strip-types compatible.

## Determinism (two-run byte-identical)
Two independent runs to `out1/` and `out2/` with identical input:
- `diff -qr out1 out2`: no differences (ALL_MATCH).
- SHA-256 digests:
  - `board.json`: `ef940d545b35eca9d77ed4799a7646b592b2fffc10fa795e8c674a743422ab6a`
  - `data.js`: `250499cfc993cec829571e9d040f62668a97ebab903eb69fa19693e8d9b15c21`
  - `dossier.json`: `2e7d8c908d29958a46969b1b78657d17054a6a336f4b931fbdc14b0da91c0545`

## Cap asserts (30/30)
| # | Cap | Assert | Result |
|---:|---|---|---|
| 1 | Board JSON size < 8 MiB | `board.json` = 274,933 bytes | PASS |
| 2 | Board rows 100–4000 | 200 rows | PASS |
| 3 | Rows sorted desc by `implied_value_usd` | monotonic non-increasing verified | PASS |
| 4 | Unique slugs | 200 unique / 200 | PASS |
| 5 | Ranks contiguous 1..N | `[1..200]` | PASS |
| 6 | `implied_value_usd` > 0 safe int | min 18,640,834, max 17,265,609,178, all int | PASS |
| 7 | Not all same value | 200 distinct values | PASS |
| 8 | `farm_steps` 3–12 strings 20–600 chars | schema check over all rows | PASS |
| 9 | Required row fields present | rank,slug,name,category,chains,tvl_usd,change_7d,implied_value_usd,farm_steps | PASS |
| 10 | `data.js` format | starts `window.RADAR=` | PASS |
| 11 | Dashboard has index.html | present | PASS |
| 12 | Dashboard has >=1 .css and >=1 .js | app.css, app.js | PASS |
| 13 | Dashboard file count <= 400 | 3 files | PASS |
| 14 | Dashboard bytes <= 4 MiB | 29,485 bytes | PASS |
| 15 | Dashboard names `[A-Za-z0-9._-]{1,128}`, no leading `.`/`-` | verified | PASS |
| 16 | No `http/https` URLs in dashboard/code | grep over dashboard/main/lib/vendor: 0 hits | PASS |
| 17 | Screenshots exactly 3 PNG/JPEG 1KiB–5MiB | 1-board.png 148257, 2-detail.png 219469, 3-filtered.png 137873, all PNG | PASS |
| 18 | `dossier.json` byte-equal to `buildDossier` with caps | equal true, 704,952 bytes | PASS |
| 19 | `dossier.json` written last | main.ts writes dossier after all other outputs | PASS |
| 20 | No network in entry code | no fetch/http/https/ws usage; stdlib only | PASS |
| 21 | No AI/model calls in entry code | deterministic TS model in lib/model.ts | PASS |
| 22 | No secrets in code/repo | scanned; none found | PASS |
| 23 | No `Math.random`/`Date.now` nondeterminism | grep clean in main/lib/vendor | PASS |
| 24 | Vendor byte-identical to kit | sha256 matches kit starter | PASS |
| 25 | README has required badges + footer | 3 badges + `<sub>` footer with ref `fe0p3md4` | PASS |
| 26 | LICENSE present (MIT) | present | PASS |
| 27 | `.makefun/owner.json` present | wallet `C8AE6zzhyuXT9E72RFjs6T38ZGi3HEQ3bnaDD5vcZCcK` | PASS |
| 28 | Wall budget respected | ~0.09s real per run (<< 120s) | PASS |
| 29 | Output file set complete | board.json, data.js, dashboard/, screenshots/, dossier.json | PASS |
| 30 | Determinism gate (two-run) | byte-identical, digests recorded | PASS |

## Throwaway validate-style local shape check
- Verified board schema, row count/rank contiguity/sort/uniqueness/value constraints, farm_steps shape.
- Verified data.js prefix, dashboard file names/count/size/URL absence, screenshot count/type/size.
- Verified dossier byte-equality via `node --experimental-strip-types` importing `buildDossier` from vendor.
- Kit CLI `makefun.mjs validate` was invoked; it printed general CLI help in this environment (no local validate mode consumed the path). Shape checks above cover the intended contract assertions.

## Render notes
- Dashboard is static (no network, no fetch). Reads `../data.js` (`window.RADAR`) and renders board, filter controls, and a detail drawer with model inputs and farm steps.
- Removed unused `innerHTML` branch from `el()` helper in `dashboard/app.js` (dead code, no call sites used `html:` attr). This is a security hardening; no behavior change.
- Screenshots are the kit starter screenshots (valid PNGs, within caps). Dashboard markup/behavior unchanged except the dead-code removal, so screenshots remain representative.

## Runtime
- Run 1: real 0.075s, user 0.098s, sys 0.027s
- Run 2: real 0.091s, user 0.121s, sys 0.025s

## Residual risks
- Screenshots were not re-rendered in a headless browser in this environment; kit starter screenshots were retained. They meet count/type/size caps and the dashboard behavior is unchanged.
- Node 24.20.0 was used locally; contract targets Node 22 stdlib-only. Code uses no Node 24-only APIs.
