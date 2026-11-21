(function () {
  'use strict';

  const R = window.RADAR;
  if (!R || !Array.isArray(R.rows)) {
    document.getElementById('metaLine').textContent = 'Missing window.RADAR data.js';
    return;
  }

  const catStatsMap = new Map(R.category_stats.map((c) => [c.category, c]));
  const baseParams = { ...R.params };
  const state = {
    tier: 'all',
    q: '',
    category: '',
    chain: '',
    sortKey: 'rank',
    sortDir: 'asc',
    params: { ...baseParams },
    computedRows: R.rows.map((r) => ({ ...r, sim_rank: r.rank, sim_value: r.implied_value_usd, rank_delta: 0 })),
  };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const round4 = (v) => Math.round(v * 10000) / 10000;

  function fmtUsd(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
    return `$${Math.round(n)}`;
  }

  function fmtPct(v) {
    if (v === null || v === undefined) return '—';
    return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
  }

  function blendedMultiple(category, categoryBlend) {
    const cs = catStatsMap.get(category);
    const globalMed = R.global_median_multiple;
    if (!cs || cs.sample_count === 0 || cs.raw_median === null) {
      return round4(clamp(globalMed, 0.04, 2.5));
    }
    const emp = cs.sample_count >= 3 ? cs.raw_median : (cs.sample_count / 3) * cs.raw_median + (1 - cs.sample_count / 3) * globalMed;
    return round4(clamp(categoryBlend * emp + (1 - categoryBlend) * globalMed, 0.04, 2.5));
  }

  function computeImpliedValue(tvlUsd, change7d, ageDays, catMultiple, p) {
    const g = change7d === null || !Number.isFinite(change7d) ? 0 : clamp(change7d / 100, -p.growth_cap, p.growth_cap);
    const growth_multiplier = round4(Math.max(0.4, 1 + p.growth_weight * g));
    const maturityProgress = clamp(ageDays / 540, 0, 1);
    const maturity_multiplier = round4(p.maturity_floor + (1.18 - p.maturity_floor) * Math.sqrt(maturityProgress));
    const raw = tvlUsd * catMultiple * growth_multiplier * maturity_multiplier * p.global_scale;
    return {
      implied_value_usd: Math.max(1, Math.min(100000000000000, Math.round(raw))),
      growth_multiplier,
      maturity_multiplier,
    };
  }

  function verifyFormulaParity() {
    let ok = 0;
    for (const row of R.rows) {
      const mult = blendedMultiple(row.category, baseParams.category_blend);
      const res = computeImpliedValue(row.tvl_usd, row.change_7d, row.age_days, mult, baseParams);
      if (res.implied_value_usd === row.implied_value_usd) ok++;
    }
    const badge = document.getElementById('formulaBadge');
    badge.textContent = `Formula Check: ${ok}/${R.rows.length} Verified`;
    badge.className = ok === R.rows.length ? 'badge badge-ok' : 'badge badge-watch';
  }

  function recomputeSandbox() {
    const p = state.params;
    const next = R.rows.map((row) => {
      const catMult = blendedMultiple(row.category, p.category_blend);
      const val = computeImpliedValue(row.tvl_usd, row.change_7d, row.age_days, catMult, p);
      return {
        ...row,
        sim_cat_mult: catMult,
        sim_growth_mult: val.growth_multiplier,
        sim_maturity_mult: val.maturity_multiplier,
        sim_value: val.implied_value_usd,
        sim_multiple: round4(val.implied_value_usd / Math.max(1, row.tvl_usd)),
        sim_rank: 0,
        rank_delta: 0,
      };
    });
    next.sort((a, b) => b.sim_value - a.sim_value || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
    let shifted = 0;
    next.forEach((row, i) => {
      row.sim_rank = i + 1;
      row.rank_delta = row.rank - row.sim_rank;
      if (row.rank_delta !== 0) shifted++;
    });
    state.computedRows = next;
    document.getElementById('sandboxSummary').textContent = `${shifted} ranks shifted`;
  }

  const SVG_NS = 'http:' + '//www.w3.org/2000/svg';

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function svgEl(tag, attrs, text) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      node.setAttribute(k, String(v));
    }
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function renderKpis() {
    const strip = document.getElementById('kpiStrip');
    clearNode(strip);
    const kpis = [
      { label: 'Watchlist Coverage', val: `${R.watchlist_count}/${R.watchlist_count}`, sub: 'Floor >= $50M TVL' },
      { label: 'Ranked Pre-Token', val: String(R.rows.length), sub: `${R.early_count} early gems < $50M` },
      { label: 'Live Token Comps', val: String(R.live_count), sub: 'Empirical MCap/TVL peers' },
      { label: 'Global Median MCap/TVL', val: `${R.global_median_multiple.toFixed(2)}x`, sub: 'Snapshot live-token median' },
      { label: 'Top Implied Valuation', val: fmtUsd(state.computedRows[0]?.sim_value ?? 0), sub: state.computedRows[0]?.name ?? '' },
    ];
    for (const k of kpis) {
      const card = el('div', 'kpi');
      card.append(el('div', 'kpi-label', k.label), el('div', 'kpi-val', k.val), el('div', 'kpi-sub', k.sub));
      strip.appendChild(card);
    }
  }

  function renderCharts() {
    const byCat = new Map();
    for (const r of state.computedRows) {
      byCat.set(r.category, (byCat.get(r.category) ?? 0) + r.sim_value);
    }
    const topCats = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const maxVal = topCats[0]?.[1] ?? 1;
    const catBox = document.getElementById('catChart');
    clearNode(catBox);
    const barSvg = svgEl('svg', { viewBox: '0 0 460 185', width: '100%', height: '180' });
    topCats.forEach(([cat, total], i) => {
      const y = 10 + i * 21;
      const w = Math.max(4, Math.round((total / maxVal) * 250));
      barSvg.append(
        svgEl('text', { x: 0, y: y + 11, fill: '#8b98b0', 'font-size': 10 }, cat.slice(0, 18)),
        svgEl('rect', { x: 115, y, width: w, height: 13, rx: 2, fill: '#38bdf8', 'fill-opacity': 0.82 }),
        svgEl('text', { x: 121 + w, y: y + 11, fill: '#e6edf7', 'font-size': 10, 'font-family': 'monospace' }, fmtUsd(total)),
      );
    });
    catBox.appendChild(barSvg);

    const scatterBox = document.getElementById('scatterChart');
    clearNode(scatterBox);
    const scSvg = svgEl('svg', { viewBox: '0 0 460 185', width: '100%', height: '180' });
    scSvg.append(
      svgEl('line', { x1: 36, y1: 160, x2: 440, y2: 160, stroke: '#2e384d' }),
      svgEl('line', { x1: 36, y1: 16, x2: 36, y2: 160, stroke: '#2e384d' }),
      svgEl('text', { x: 200, y: 177, fill: '#8b98b0', 'font-size': 10 }, 'Log10 TVL ($)'),
      svgEl('text', { x: 6, y: 14, fill: '#8b98b0', 'font-size': 10 }, 'Implied'),
    );
    const minX = 6.6;
    const maxX = 10.3;
    const minY = 5.5;
    const maxY = 10.0;
    for (const r of state.computedRows.slice(0, 140)) {
      const lx = Math.log10(Math.max(1e6, r.tvl_usd));
      const ly = Math.log10(Math.max(1e5, r.sim_value));
      const cx = 36 + ((clamp(lx, minX, maxX) - minX) / (maxX - minX)) * 400;
      const cy = 160 - ((clamp(ly, minY, maxY) - minY) / (maxY - minY)) * 140;
      const c = svgEl('circle', {
        cx: cx.toFixed(1),
        cy: cy.toFixed(1),
        r: r.on_watchlist ? 3.5 : 2.5,
        fill: r.on_watchlist ? '#f59e0b' : '#38bdf8',
        'fill-opacity': 0.78,
      });
      c.appendChild(svgEl('title', {}, `${r.name}: TVL ${fmtUsd(r.tvl_usd)}, Implied ${fmtUsd(r.sim_value)}`));
      scSvg.appendChild(c);
    }
    scatterBox.appendChild(scSvg);
  }

  function filteredRows() {
    const q = state.q.trim().toLowerCase();
    const list = state.tier === 'live' ? R.live_comps : state.computedRows;
    return list
      .filter((r) => {
        if (state.tier === 'watchlist' && !r.on_watchlist) return false;
        if (state.tier === 'early_radar' && r.on_watchlist) return false;
        if (state.category && r.category !== state.category) return false;
        if (state.chain && !r.chains.includes(state.chain)) return false;
        if (q) {
          const hay = `${r.name} ${r.slug} ${r.category} ${r.chains.join(' ')} ${r.symbol ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const k = state.sortKey;
        const dir = state.sortDir === 'asc' ? 1 : -1;
        const val = (x) => {
          if (state.tier === 'live') {
            if (k === 'name') return x.name;
            if (k === 'category') return x.category;
            if (k === 'tvl_usd') return x.tvl_usd;
            if (k === 'change_7d') return x.change_7d ?? -999;
            if (k === 'mcap_tvl_ratio') return x.mcap_tvl_ratio;
            return x.mcap_usd;
          }
          if (k === 'rank') return x.sim_rank;
          if (k === 'name') return x.name;
          if (k === 'category') return x.category;
          if (k === 'tvl_usd') return x.tvl_usd;
          if (k === 'change_7d') return x.change_7d ?? -999;
          if (k === 'age_days') return x.age_days;
          if (k === 'sim_cat_mult') return x.sim_cat_mult ?? x.model_breakdown.category_multiple;
          return x.sim_value;
        };
        const av = val(a);
        const bv = val(b);
        if (typeof av === 'string') return av.localeCompare(bv) * dir;
        return (av - bv) * dir;
      });
  }

  function renderTable() {
    const thead = document.getElementById('tableHead');
    const tbody = document.getElementById('tableBody');
    clearNode(thead);
    clearNode(tbody);

    const isLive = state.tier === 'live';
    const cols = isLive
      ? [
          { key: 'name', label: 'Protocol' },
          { key: 'category', label: 'Category' },
          { key: 'tvl_usd', label: 'TVL', num: true },
          { key: 'mcap_usd', label: 'Market Cap', num: true },
          { key: 'mcap_tvl_ratio', label: 'MCap/TVL', num: true },
          { key: 'change_7d', label: '7d %', num: true },
          { key: 'chains', label: 'Chains' },
        ]
      : [
          { key: 'rank', label: 'Rank', num: true },
          { key: 'name', label: 'Protocol' },
          { key: 'category', label: 'Category' },
          { key: 'tvl_usd', label: 'TVL', num: true },
          { key: 'change_7d', label: '7d %', num: true },
          { key: 'age_days', label: 'Age', num: true },
          { key: 'sim_cat_mult', label: 'Cat Mult', num: true },
          { key: 'sim_value', label: 'Implied Value', num: true },
          { key: 'chains', label: 'Chains' },
        ];

    const trHead = document.createElement('tr');
    for (const c of cols) {
      const th = el('th', c.num ? 'num' : '', c.label + (state.sortKey === c.key ? (state.sortDir === 'asc' ? ' ▲' : ' ▼') : ''));
      if (c.key !== 'chains') {
        th.addEventListener('click', () => {
          if (state.sortKey === c.key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
          else {
            state.sortKey = c.key;
            state.sortDir = c.key === 'rank' || c.key === 'name' || c.key === 'category' ? 'asc' : 'desc';
          }
          renderTable();
        });
      }
      trHead.appendChild(th);
    }
    thead.appendChild(trHead);

    const rows = filteredRows();
    document.getElementById('rowCountLabel').textContent = `${rows.length} ${isLive ? 'live-token peers' : 'pre-token protocols'}`;

    for (const r of rows.slice(0, 150)) {
      const tr = document.createElement('tr');
      if (isLive) {
        const nameCell = el('td');
        nameCell.append(el('strong', '', r.name), el('span', 'muted mono', r.symbol ? ` (${r.symbol})` : ''));
        tr.append(
          nameCell,
          el('td', '', r.category),
          el('td', 'num mono', fmtUsd(r.tvl_usd)),
          el('td', 'num mono', fmtUsd(r.mcap_usd)),
          el('td', 'num mono', `${r.mcap_tvl_ratio.toFixed(2)}x`),
          el('td', `num mono ${r.change_7d > 0 ? 'pos' : r.change_7d < 0 ? 'neg' : ''}`, fmtPct(r.change_7d)),
          el('td', 'muted', r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ` +${r.chains.length - 3}` : '')),
        );
      } else {
        const rankTd = el('td', 'num mono', `#${r.sim_rank}`);
        if (r.rank_delta !== 0) {
          rankTd.appendChild(el('span', `delta ${r.rank_delta > 0 ? 'pos' : 'neg'}`, r.rank_delta > 0 ? `+${r.rank_delta}` : String(r.rank_delta)));
        }
        const protoTd = el('td');
        const wrap = el('div', 'proto-cell');
        wrap.append(
          el('strong', '', r.name),
          el('span', `badge ${r.on_watchlist ? 'badge-watch' : 'badge-early'}`, r.on_watchlist ? 'WATCH' : 'EARLY'),
        );
        protoTd.appendChild(wrap);
        const catMult = r.sim_cat_mult ?? r.model_breakdown.category_multiple;
        tr.append(
          rankTd,
          protoTd,
          el('td', '', r.category),
          el('td', 'num mono', fmtUsd(r.tvl_usd)),
          el('td', `num mono ${r.change_7d > 0 ? 'pos' : r.change_7d < 0 ? 'neg' : ''}`, fmtPct(r.change_7d)),
          el('td', 'num mono', `${r.age_days}d`),
          el('td', 'num mono', `${catMult.toFixed(2)}x`),
          el('td', 'num mono pos', fmtUsd(r.sim_value)),
          el('td', 'muted', r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ` +${r.chains.length - 3}` : '')),
        );
        tr.addEventListener('click', () => openDrawer(r));
      }
      tbody.appendChild(tr);
    }
  }

  function openDrawer(row) {
    const dlg = document.getElementById('detailDrawer');
    const box = document.getElementById('drawerContent');
    clearNode(box);

    const head = el('div', 'drawer-head');
    const left = el('div');
    const title = el('h2', '', `#${row.sim_rank} ${row.name}`);
    const sub = el('p', 'sub', `${row.slug} · ${row.category} · ${row.chains.join(', ')} · Listed ${row.listed_at ?? 'unknown'} (${row.age_days}d)`);
    left.append(title, sub);
    const closeBtn = el('button', 'btn', 'Close');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', () => dlg.close());
    head.append(left, closeBtn);
    box.appendChild(head);

    const grid = el('div', 'drawer-grid');
    const mathCard = el('div', 'card');
    mathCard.appendChild(el('h3', '', 'Valuation Formula Audit'));
    const catMult = row.sim_cat_mult ?? row.model_breakdown.category_multiple;
    const gMult = row.sim_growth_mult ?? row.model_breakdown.growth_multiplier;
    const mMult = row.sim_maturity_mult ?? row.model_breakdown.maturity_multiplier;
    const lines = [
      ['Protocol TVL', fmtUsd(row.tvl_usd)],
      [`Category Multiple (${row.model_breakdown.base_multiple_source}, n=${row.model_breakdown.category_sample_count})`, `${catMult.toFixed(3)}x`],
      [`7d Growth Multiplier (${fmtPct(row.change_7d)})`, `${gMult.toFixed(3)}x`],
      [`Maturity Multiplier (${row.age_days}d)`, `${mMult.toFixed(3)}x`],
      ['Global Scale', `${state.params.global_scale.toFixed(2)}x`],
    ];
    for (const [k, v] of lines) {
      const m = el('div', 'math-line');
      m.append(el('span', 'muted', k), el('span', 'mono', v));
      mathCard.appendChild(m);
    }
    const tot = el('div', 'math-line math-total');
    tot.append(el('span', '', 'Implied Token Value'), el('span', 'mono', fmtUsd(row.sim_value)));
    mathCard.appendChild(tot);

    const peerCard = el('div', 'card');
    peerCard.appendChild(el('h3', '', `Live-Token Peers (${row.category})`));
    const peers = R.live_comps.filter((c) => c.category === row.category).slice(0, 5);
    if (peers.length === 0) {
      peerCard.appendChild(el('p', 'muted', 'No same-category live comps; global median fallback applied.'));
    } else {
      for (const p of peers) {
        const pr = el('div', 'peer-row');
        pr.append(el('span', '', `${p.name} (${p.symbol ?? '—'})`), el('span', 'mono', `MCap ${fmtUsd(p.mcap_usd)} · ${p.mcap_tvl_ratio.toFixed(2)}x`));
        peerCard.appendChild(pr);
      }
    }
    grid.append(mathCard, peerCard);
    box.appendChild(grid);

    const farmCard = el('div', 'card');
    farmCard.appendChild(el('h3', '', 'Concrete Farm Plan (USD Cost & Time Cadence)'));
    const stepsList = el('div', 'steps-list');
    row.farm_steps.forEach((step, idx) => {
      const item = el('div', 'step-item');
      item.append(el('span', 'step-num', `0${idx + 1}`), el('span', '', step));
      stepsList.appendChild(item);
    });
    farmCard.appendChild(stepsList);
    box.appendChild(farmCard);

    dlg.showModal();
  }

  function populateFilters() {
    const cats = [...new Set([...R.rows.map((r) => r.category), ...R.live_comps.map((c) => c.category)])].sort();
    const catSel = document.getElementById('catSelect');
    for (const c of cats) {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      catSel.appendChild(opt);
    }
    const chains = [...new Set(R.rows.flatMap((r) => r.chains))].sort();
    const chainSel = document.getElementById('chainSelect');
    for (const ch of chains) {
      const opt = document.createElement('option');
      opt.value = ch;
      opt.textContent = ch;
      chainSel.appendChild(opt);
    }
  }

  function bindEvents() {
    document.getElementById('tierTabs').addEventListener('click', (e) => {
      const btn = e.target.closest('.tab');
      if (!btn) return;
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      btn.classList.add('active');
      state.tier = btn.dataset.tier;
      state.sortKey = state.tier === 'live' ? 'mcap_usd' : 'rank';
      state.sortDir = state.tier === 'live' ? 'desc' : 'asc';
      renderTable();
    });
    document.getElementById('searchInput').addEventListener('input', (e) => {
      state.q = e.target.value;
      renderTable();
    });
    document.getElementById('catSelect').addEventListener('change', (e) => {
      state.category = e.target.value;
      renderTable();
    });
    document.getElementById('chainSelect').addEventListener('change', (e) => {
      state.chain = e.target.value;
      renderTable();
    });
    document.getElementById('resetBtn').addEventListener('click', () => {
      state.q = '';
      state.category = '';
      state.chain = '';
      document.getElementById('searchInput').value = '';
      document.getElementById('catSelect').value = '';
      document.getElementById('chainSelect').value = '';
      renderTable();
    });
    document.getElementById('sandboxBtn').addEventListener('click', () => {
      const panel = document.getElementById('sandboxPanel');
      const hidden = panel.classList.toggle('hidden');
      document.getElementById('sandboxBtn').setAttribute('aria-expanded', String(!hidden));
    });
    const sliders = [
      ['slGrowthWeight', 'valGrowthWeight', 'growth_weight'],
      ['slGrowthCap', 'valGrowthCap', 'growth_cap'],
      ['slMaturityFloor', 'valMaturityFloor', 'maturity_floor'],
      ['slCatBlend', 'valCatBlend', 'category_blend'],
      ['slGlobalScale', 'valGlobalScale', 'global_scale'],
    ];
    for (const [id, valId, key] of sliders) {
      document.getElementById(id).addEventListener('input', (e) => {
        const v = Number(e.target.value);
        state.params[key] = v;
        document.getElementById(valId).textContent = v.toFixed(2);
        recomputeSandbox();
        renderKpis();
        renderCharts();
        renderTable();
      });
    }
    document.getElementById('sandboxReset').addEventListener('click', () => {
      state.params = { ...baseParams };
      for (const [id, valId, key] of sliders) {
        document.getElementById(id).value = String(baseParams[key]);
        document.getElementById(valId).textContent = baseParams[key].toFixed(2);
      }
      recomputeSandbox();
      renderKpis();
      renderCharts();
      renderTable();
    });
  }

  document.getElementById('metaLine').textContent = `Snapshot ${R.as_of} · ${R.source}`;
  verifyFormulaParity();
  populateFilters();
  recomputeSandbox();
  renderKpis();
  renderCharts();
  renderTable();
  bindEvents();
})();
