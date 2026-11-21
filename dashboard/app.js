(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA || !Array.isArray(DATA.rows)) {
    var ps = document.getElementById('panel-sub');
    if (ps) ps.textContent = 'Missing window.RADAR data.';
    return;
  }

  var state = { q: '', category: '', chain: '', view: 'board' };
  var el = {
    stats: document.getElementById('stats'),
    q: document.getElementById('q'),
    category: document.getElementById('category'),
    chain: document.getElementById('chain'),
    view: document.getElementById('view'),
    panelTitle: document.getElementById('panel-title'),
    panelSub: document.getElementById('panel-sub'),
    countPill: document.getElementById('count-pill'),
    thead: document.getElementById('thead'),
    tbody: document.getElementById('tbody'),
    empty: document.getElementById('empty'),
    foot: document.getElementById('foot-meta'),
    detail: document.getElementById('detail'),
    detailBody: document.getElementById('detail-body'),
  };

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function txt(value) {
    return document.createTextNode(value === null || value === undefined ? '' : String(value));
  }

  function elem(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (k === 'className') node.className = v;
        else if (k === 'text') node.textContent = v;
        else node.setAttribute(k, v);
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i++) {
        var c = children[i];
        if (c === null || c === undefined || c === false) continue;
        node.appendChild(typeof c === 'string' ? txt(c) : c);
      }
    }
    return node;
  }

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    var abs = Math.abs(n);
    var sign = n < 0 ? '-' : '';
    if (abs >= 1e12) return sign + '$' + (abs / 1e12).toFixed(2) + 'T';
    if (abs >= 1e9) return sign + '$' + (abs / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return sign + '$' + (abs / 1e3).toFixed(1) + 'K';
    return sign + '$' + Math.round(abs).toLocaleString('en-US');
  }

  function pctNode(n) {
    if (n === null || n === undefined || !isFinite(n)) {
      return elem('span', { className: 'muted', text: '—' });
    }
    var cls = n > 0 ? 'pos' : n < 0 ? 'neg' : '';
    var sign = n > 0 ? '+' : '';
    return elem('span', cls ? { className: cls, text: sign + n.toFixed(2) + '%' } : { text: sign + n.toFixed(2) + '%' });
  }

  function fmtDate(s) {
    return s ? String(s) : '—';
  }

  function uniqSorted(arr) {
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var v = arr[i];
      if (v && !seen[v]) { seen[v] = true; out.push(v); }
    }
    out.sort();
    return out;
  }

  function allCategories(rows) {
    return uniqSorted(rows.map(function (r) { return r.category; }).filter(Boolean));
  }

  function allChains(rows) {
    var chains = [];
    for (var i = 0; i < rows.length; i++) {
      var cs = rows[i].chains || [];
      for (var j = 0; j < cs.length; j++) chains.push(cs[j]);
    }
    return uniqSorted(chains);
  }

  function fillSelect(select, values, firstLabel) {
    var current = select.value;
    clear(select);
    select.appendChild(elem('option', { value: '', text: firstLabel }));
    for (var i = 0; i < values.length; i++) {
      select.appendChild(elem('option', { value: values[i], text: values[i] }));
    }
    if (current && values.indexOf(current) !== -1) select.value = current;
  }

  function rowMatches(r, q, cat, chain) {
    if (cat && r.category !== cat) return false;
    if (chain && (r.chains || []).indexOf(chain) === -1) return false;
    if (q) {
      var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + (r.chains || []).join(' ')).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  function getActiveRows() {
    var src = state.view === 'live' ? DATA.live : DATA.rows;
    var q = state.q.trim().toLowerCase();
    var out = [];
    for (var i = 0; i < src.length; i++) {
      if (rowMatches(src[i], q, state.category, state.chain)) out.push(src[i]);
    }
    return out;
  }

  function renderStats() {
    var avgImplied = 0;
    for (var i = 0; i < DATA.rows.length; i++) avgImplied += DATA.rows[i].implied_value_usd || 0;
    avgImplied = DATA.rows.length ? avgImplied / DATA.rows.length : 0;
    var cards = [
      { label: 'Board size', value: String(DATA.board_size), sub: 'ranked pre-token protocols' },
      { label: 'Watchlist floor', value: String(DATA.watchlist_size), sub: 'always included' },
      { label: 'Early additions', value: String(DATA.early_size), sub: 'below watchlist floor' },
      { label: 'Live tokens', value: String(DATA.live_size), sub: 'already have market cap/token' },
      { label: 'Avg implied value', value: fmtUsd(avgImplied), sub: 'across board rows' },
      { label: 'Snapshot', value: String(DATA.as_of), sub: 'frozen DefiLlama data' },
    ];
    clear(el.stats);
    for (var j = 0; j < cards.length; j++) {
      var c = cards[j];
      el.stats.appendChild(elem('div', { className: 'stat' }, [
        elem('span', { className: 'label', text: c.label }),
        elem('span', { className: 'value', text: c.value }),
        elem('span', { className: 'sub', text: c.sub }),
      ]));
    }
  }

  function renderHead() {
    clear(el.thead);
    var tr = document.createElement('tr');
    var cols = state.view === 'live'
      ? ['Name', 'Category', 'Chains', 'TVL', '7d', 'Mcap', 'Listed']
      : ['#', 'Name', 'Category', 'Chains', 'TVL', '7d', 'Implied value', 'Listed'];
    for (var i = 0; i < cols.length; i++) {
      var th = elem('th', { text: cols[i] });
      if (!state.view || state.view === 'board') {
        if (cols[i] === '#') th.className = 'rank';
      }
      tr.appendChild(th);
    }
    el.thead.appendChild(tr);
  }

  function chainCell(chains) {
    var td = document.createElement('td');
    var cs = chains || [];
    if (!cs.length) {
      td.appendChild(elem('span', { className: 'muted', text: '—' }));
      return td;
    }
    var max = Math.min(3, cs.length);
    for (var i = 0; i < max; i++) {
      td.appendChild(elem('span', { className: 'tag tag-chain', text: cs[i] }));
      if (i < max - 1) td.appendChild(txt(' '));
    }
    if (cs.length > 3) {
      td.appendChild(txt(' '));
      td.appendChild(elem('span', { className: 'muted', text: '+' + (cs.length - 3) }));
    }
    return td;
  }

  function categoryCell(category) {
    var td = document.createElement('td');
    if (category) td.appendChild(elem('span', { className: 'tag', text: category }));
    else td.appendChild(elem('span', { className: 'muted', text: '—' }));
    return td;
  }

  function renderBoardRows(rows) {
    clear(el.tbody);
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var tr = document.createElement('tr');

      var tdRank = elem('td', { className: 'rank num', text: String(r.rank) });
      tr.appendChild(tdRank);

      var tdName = document.createElement('td');
      var btn = elem('button', { className: 'row-btn', 'data-slug': r.slug });
      btn.appendChild(elem('span', { className: 'name', text: r.name }));
      btn.appendChild(elem('span', { className: 'slug', text: r.slug }));
      tdName.appendChild(btn);
      tr.appendChild(tdName);

      tr.appendChild(categoryCell(r.category));
      tr.appendChild(chainCell(r.chains));

      tr.appendChild(elem('td', { className: 'num', text: fmtUsd(r.tvl_usd) }));
      var tdChange = elem('td', { className: 'num' });
      tdChange.appendChild(pctNode(r.change_7d));
      tr.appendChild(tdChange);

      var tdImplied = elem('td', { className: 'num' });
      tdImplied.appendChild(elem('strong', { text: fmtUsd(r.implied_value_usd) }));
      tr.appendChild(tdImplied);

      tr.appendChild(elem('td', { className: 'num', text: fmtDate(r.listed_at) }));
      el.tbody.appendChild(tr);
    }
  }

  function renderLiveRows(rows) {
    clear(el.tbody);
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var tr = document.createElement('tr');

      var tdName = document.createElement('td');
      tdName.appendChild(elem('span', { className: 'name', text: r.name }));
      var slugText = r.slug + (r.symbol ? ' · ' + r.symbol : '');
      tdName.appendChild(elem('span', { className: 'slug', text: slugText }));
      tr.appendChild(tdName);

      tr.appendChild(categoryCell(r.category));
      tr.appendChild(chainCell(r.chains));
      tr.appendChild(elem('td', { className: 'num', text: fmtUsd(r.tvl_usd) }));
      var tdChange = elem('td', { className: 'num' });
      tdChange.appendChild(pctNode(r.change_7d));
      tr.appendChild(tdChange);
      tr.appendChild(elem('td', { className: 'num', text: fmtUsd(r.mcap_usd) }));
      tr.appendChild(elem('td', { className: 'num', text: fmtDate(r.listed_at) }));
      el.tbody.appendChild(tr);
    }
  }

  function kv(k, vNode) {
    var box = elem('div', { className: 'kv' });
    box.appendChild(elem('span', { className: 'k', text: k }));
    var v = elem('span', { className: 'v' });
    if (typeof vNode === 'string') v.textContent = vNode;
    else v.appendChild(vNode);
    box.appendChild(v);
    return box;
  }

  function modelRow(k, v) {
    var tr = document.createElement('tr');
    tr.appendChild(elem('td', { text: k }));
    tr.appendChild(elem('td', { text: v }));
    return tr;
  }

  function openDetail(slug) {
    var row = null;
    for (var i = 0; i < DATA.rows.length; i++) {
      if (DATA.rows[i].slug === slug) { row = DATA.rows[i]; break; }
    }
    if (!row) return;

    clear(el.detailBody);
    el.detailBody.appendChild(elem('h3', { text: row.name }));
    el.detailBody.appendChild(elem('p', { className: 'meta', text: '#' + row.rank + ' · ' + row.slug + (row.category ? ' · ' + row.category : '') }));

    var grid = elem('div', { className: 'detail-grid' });
    grid.appendChild(kv('Implied value', fmtUsd(row.implied_value_usd)));
    grid.appendChild(kv('TVL', fmtUsd(row.tvl_usd)));
    var changeBox = elem('div', { className: 'kv' });
    changeBox.appendChild(elem('span', { className: 'k', text: '7d change' }));
    var changeV = elem('span', { className: 'v' });
    changeV.appendChild(pctNode(row.change_7d));
    changeBox.appendChild(changeV);
    grid.appendChild(changeBox);
    grid.appendChild(kv('Listed', fmtDate(row.listed_at)));
    el.detailBody.appendChild(grid);

    el.detailBody.appendChild(elem('h4', { text: 'Chains' }));
    var chainsP = document.createElement('p');
    var cs = row.chains || [];
    if (!cs.length) {
      chainsP.appendChild(elem('span', { className: 'muted', text: '—' }));
    } else {
      for (var c = 0; c < cs.length; c++) {
        chainsP.appendChild(elem('span', { className: 'tag tag-chain', text: cs[c] }));
        if (c < cs.length - 1) chainsP.appendChild(txt(' '));
      }
    }
    el.detailBody.appendChild(chainsP);

    el.detailBody.appendChild(elem('h4', { text: 'Why this ranks here' }));
    el.detailBody.appendChild(elem('p', { text: row.why || '' }));

    el.detailBody.appendChild(elem('h4', { text: 'Farm plan' }));
    var ol = elem('ol', { className: 'steps' });
    var steps = row.farm_steps || [];
    for (var s = 0; s < steps.length; s++) ol.appendChild(elem('li', { text: steps[s] }));
    el.detailBody.appendChild(ol);

    el.detailBody.appendChild(elem('h4', { text: 'Model inputs' }));
    var table = elem('table', { className: 'model-table' });
    var tbody = document.createElement('tbody');
    var m = row.model || {};
    tbody.appendChild(modelRow('Base USD', fmtUsd(m.base_usd)));
    tbody.appendChild(modelRow('Growth %', m.growth_pct === null || m.growth_pct === undefined ? '—' : Number(m.growth_pct).toFixed(2) + '%'));
    tbody.appendChild(modelRow('Growth multiplier', m.growth_multiplier === null || m.growth_multiplier === undefined ? '—' : Number(m.growth_multiplier).toFixed(6)));
    tbody.appendChild(modelRow('Maturity', m.maturity === null || m.maturity === undefined ? '—' : Number(m.maturity).toFixed(6)));
    tbody.appendChild(modelRow('Age days', m.age_days === null || m.age_days === undefined ? '—' : String(m.age_days)));
    table.appendChild(tbody);
    el.detailBody.appendChild(table);

    if (typeof el.detail.showModal === 'function') el.detail.showModal();
    else el.detail.setAttribute('open', '');
  }

  function render() {
    var rows = getActiveRows();
    var isBoard = state.view === 'board';
    el.panelTitle.textContent = isBoard ? 'Pre-token board' : 'Live tokens';
    el.panelSub.textContent = isBoard
      ? 'Ranked by implied launch value from sealed snapshot data. Click a row for the model and farm plan.'
      : 'Protocols with a live token/market cap in the same snapshot, shown for context.';
    el.countPill.textContent = rows.length + ' row' + (rows.length === 1 ? '' : 's');
    renderHead();
    if (isBoard) renderBoardRows(rows); else renderLiveRows(rows);
    el.empty.hidden = rows.length !== 0;
  }

  function bind() {
    el.q.addEventListener('input', function (e) { state.q = e.target.value; render(); });
    el.category.addEventListener('change', function (e) { state.category = e.target.value; render(); });
    el.chain.addEventListener('change', function (e) { state.chain = e.target.value; render(); });
    el.view.addEventListener('change', function (e) { state.view = e.target.value; render(); });
    el.tbody.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-slug]') : null;
      if (btn) openDetail(btn.getAttribute('data-slug'));
    });
    el.detail.addEventListener('click', function (e) {
      if (e.target === el.detail) el.detail.close();
    });
  }

  function init() {
    fillSelect(el.category, allCategories(DATA.rows.concat(DATA.live)), 'All categories');
    fillSelect(el.chain, allChains(DATA.rows.concat(DATA.live)), 'All chains');
    renderStats();
    el.foot.textContent = 'Source: ' + DATA.source + ' · Floor: ' + fmtUsd(DATA.floor_usd) + ' TVL · Model: base ' + DATA.model.base_multiple + 'x, growth ' + DATA.model.growth_weight + ', maturity ' + DATA.model.maturity_weight + '.';
    bind();
    render();
  }

  init();
})();
