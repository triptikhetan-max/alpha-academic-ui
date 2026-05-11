/* ============================================================
   charts.js — tiny SVG chart library for BTX Brain
   No deps. All charts read CSS vars for colors (theme-aware).
   ============================================================ */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000';
  const fmt = (n, d = 0) => (typeof n === 'number' ? n.toFixed(d) : n);

  // ---------- TREND LINE ----------
  // opts: { data:[{label,value}], height, showAxis, showDots, series (2D array), labels, yMin, yMax, areaFill }
  function trendLine(container, opts) {
    const W = container.clientWidth || 400;
    const H = opts.height || 140;
    const pad = { t: 14, r: 10, b: 22, l: 30 };
    const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
    container.innerHTML = '';
    container.appendChild(svg);

    const series = opts.series || [opts.data.map(d => d.value)];
    const labels = opts.labels || opts.data.map(d => d.label);
    const all = series.flat();
    const yMin = opts.yMin ?? Math.min(...all) * 0.95;
    const yMax = opts.yMax ?? Math.max(...all) * 1.03;
    const x = (i, n) => pad.l + (i / Math.max(1, n - 1)) * (W - pad.l - pad.r);
    const y = (v) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);

    // gridlines
    const gridN = 4;
    for (let i = 0; i <= gridN; i++) {
      const yy = pad.t + (i / gridN) * (H - pad.t - pad.b);
      el('line', { x1: pad.l, x2: W - pad.r, y1: yy, y2: yy, stroke: cssVar('--border'), 'stroke-width': 1 }, svg);
      const val = yMax - (i / gridN) * (yMax - yMin);
      el('text', { x: pad.l - 6, y: yy + 3, 'text-anchor': 'end', 'font-size': 9, fill: cssVar('--mute'), 'font-family': 'JetBrains Mono, monospace' }, svg).textContent = fmt(val);
    }
    // x labels
    labels.forEach((lb, i) => {
      if (labels.length > 10 && i % Math.ceil(labels.length / 8) !== 0 && i !== labels.length - 1) return;
      el('text', { x: x(i, labels.length), y: H - 6, 'text-anchor': 'middle', 'font-size': 9, fill: cssVar('--mute'), 'font-family': 'JetBrains Mono, monospace' }, svg).textContent = lb;
    });

    const palette = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6'];
    series.forEach((s, si) => {
      const color = cssVar(palette[si % palette.length]);
      // area fill for single series
      if (opts.areaFill && series.length === 1) {
        const pts = s.map((v, i) => `${x(i, s.length)},${y(v)}`).join(' ');
        const base = y(yMin);
        el('polygon', { points: `${pad.l},${base} ${pts} ${W - pad.r},${base}`, fill: color, opacity: 0.08 }, svg);
      }
      const d = s.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i, s.length)},${y(v)}`).join(' ');
      el('path', { d, stroke: color, 'stroke-width': 1.75, fill: 'none', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
      if (opts.showDots !== false) {
        s.forEach((v, i) => el('circle', { cx: x(i, s.length), cy: y(v), r: 2.2, fill: color }, svg));
      }
    });
    return svg;
  }

  // ---------- SPARKLINE (inline in tables) ----------
  function sparkline(values, opts = {}) {
    const W = opts.width || 80, H = opts.height || 18;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const min = Math.min(...values), max = Math.max(...values);
    const span = max - min || 1;
    const x = (i) => (i / (values.length - 1)) * (W - 2) + 1;
    const y = (v) => H - 3 - ((v - min) / span) * (H - 6);
    const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ');
    const trending = values[values.length - 1] - values[0];
    const color = opts.color || (trending < 0 ? cssVar('--danger') : trending > 0 ? cssVar('--success') : cssVar('--mute'));
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '1.3');
    path.setAttribute('fill', 'none');
    svg.appendChild(path);
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', x(values.length - 1));
    dot.setAttribute('cy', y(values[values.length - 1]));
    dot.setAttribute('r', '1.8');
    dot.setAttribute('fill', color);
    svg.appendChild(dot);
    return svg;
  }

  // ---------- BAR CHART ----------
  // opts: {data:[{label,value,flag?}], height, horizontal?, maxValue?, valueSuffix?}
  function bar(container, opts) {
    const W = container.clientWidth || 400;
    const H = opts.height || 180;
    const pad = { t: 10, r: 12, b: 34, l: 30 };
    const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
    container.innerHTML = '';
    container.appendChild(svg);
    const data = opts.data;
    const max = opts.maxValue || Math.max(...data.map(d => d.value)) * 1.1;
    const bw = (W - pad.l - pad.r) / data.length;
    // gridlines
    for (let i = 0; i <= 4; i++) {
      const yy = pad.t + (i / 4) * (H - pad.t - pad.b);
      el('line', { x1: pad.l, x2: W - pad.r, y1: yy, y2: yy, stroke: cssVar('--border') }, svg);
      const val = max - (i / 4) * max;
      el('text', { x: pad.l - 6, y: yy + 3, 'text-anchor': 'end', 'font-size': 9, fill: cssVar('--mute'), 'font-family': 'JetBrains Mono, monospace' }, svg).textContent = fmt(val);
    }
    data.forEach((d, i) => {
      const h = ((d.value / max) * (H - pad.t - pad.b));
      const x = pad.l + i * bw + 4;
      const y = H - pad.b - h;
      const col = d.flag === 'systemic' ? cssVar('--danger') : d.flag === 'watch' ? cssVar('--warn') : cssVar('--s1');
      el('rect', { x, y, width: bw - 8, height: h, fill: col, opacity: 0.85 }, svg);
      el('text', { x: x + (bw - 8) / 2, y: y - 3, 'text-anchor': 'middle', 'font-size': 9, fill: cssVar('--ink'), 'font-family': 'JetBrains Mono, monospace' }, svg).textContent = d.value + (opts.valueSuffix || '');
      el('text', { x: x + (bw - 8) / 2, y: H - 18, 'text-anchor': 'middle', 'font-size': 9, fill: cssVar('--mute'), 'font-family': 'JetBrains Mono, monospace' }, svg).textContent = d.label;
      if (d.sublabel) el('text', { x: x + (bw - 8) / 2, y: H - 6, 'text-anchor': 'middle', 'font-size': 8, fill: cssVar('--faint'), 'font-family': 'JetBrains Mono, monospace' }, svg).textContent = d.sublabel;
    });
    return svg;
  }

  // ---------- HEATMAP ----------
  // opts: { rows:[label], cols:[label], matrix:[[v,...]], min?, max?, container-CSS-grid }
  function heatmap(container, opts) {
    const { rows, cols, matrix } = opts;
    const vals = matrix.flat();
    const min = opts.min ?? Math.min(...vals);
    const max = opts.max ?? Math.max(...vals);
    container.innerHTML = '';
    container.className = 'heatmap';
    container.style.gridTemplateColumns = `90px repeat(${cols.length}, 1fr)`;
    const hd0 = document.createElement('div');
    hd0.className = 'hd';
    container.appendChild(hd0);
    cols.forEach(c => {
      const d = document.createElement('div');
      d.className = 'hd';
      d.textContent = c;
      container.appendChild(d);
    });
    rows.forEach((r, ri) => {
      const lb = document.createElement('div');
      lb.className = 'lbl';
      lb.textContent = r;
      container.appendChild(lb);
      matrix[ri].forEach(v => {
        const t = (v - min) / (max - min || 1);
        const cell = document.createElement('div');
        cell.className = 'cell';
        // blend from panel → accent
        cell.style.background = `color-mix(in oklab, var(--accent) ${Math.round(t * 70)}%, var(--panel))`;
        cell.style.color = t > 0.55 ? cssVar('--panel') : cssVar('--ink');
        cell.style.fontWeight = '600';
        cell.textContent = v;
        container.appendChild(cell);
      });
    });
    return container;
  }

  // ---------- BUMP CHART ----------
  // opts: { series: [{name, ranks:[1,2,1,...]}], weeks:[...], height }
  function bump(container, opts) {
    const W = container.clientWidth || 500;
    const H = opts.height || 180;
    const pad = { t: 18, r: 70, b: 22, l: 28 };
    const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
    container.innerHTML = '';
    container.appendChild(svg);
    const weeks = opts.weeks;
    const N = opts.series[0].ranks.length;
    const K = opts.series.length;
    const x = (i) => pad.l + (i / (N - 1)) * (W - pad.l - pad.r);
    const y = (r) => pad.t + ((r - 1) / (K - 1)) * (H - pad.t - pad.b);
    // week labels
    weeks.forEach((w, i) => el('text', { x: x(i), y: H - 6, 'text-anchor': 'middle', 'font-size': 9, fill: cssVar('--mute'), 'font-family': 'JetBrains Mono, monospace' }, svg).textContent = w);
    // rank labels
    for (let r = 1; r <= K; r++) {
      el('text', { x: pad.l - 8, y: y(r) + 3, 'text-anchor': 'end', 'font-size': 9, fill: cssVar('--mute'), 'font-family': 'JetBrains Mono, monospace' }, svg).textContent = '#' + r;
    }
    const palette = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6'];
    opts.series.forEach((s, si) => {
      const color = cssVar(palette[si % palette.length]);
      const d = s.ranks.map((r, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(r)}`).join(' ');
      el('path', { d, stroke: color, 'stroke-width': 2, fill: 'none', 'stroke-linejoin': 'round' }, svg);
      s.ranks.forEach((r, i) => el('circle', { cx: x(i), cy: y(r), r: 3.2, fill: color, stroke: cssVar('--panel'), 'stroke-width': 1.5 }, svg));
      // label at end
      el('text', { x: x(N - 1) + 8, y: y(s.ranks[N - 1]) + 3, 'font-size': 10, fill: color, 'font-weight': 600 }, svg).textContent = s.name;
    });
    return svg;
  }

  // ---------- STACKED AREA ----------
  // opts: { keys:['stuck','at_risk',...], data:{stuck:[], at_risk:[]}, labels, height, colors }
  function stackedArea(container, opts) {
    const W = container.clientWidth || 500;
    const H = opts.height || 180;
    const pad = { t: 10, r: 12, b: 22, l: 32 };
    const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
    container.innerHTML = '';
    container.appendChild(svg);
    const keys = opts.keys;
    const labels = opts.labels;
    const N = labels.length;
    // compute stacked totals
    const totals = [];
    for (let i = 0; i < N; i++) {
      totals.push(keys.reduce((a, k) => a + (opts.data[k][i] || 0), 0));
    }
    const maxTotal = Math.max(...totals) * 1.02;
    const x = (i) => pad.l + (i / (N - 1)) * (W - pad.l - pad.r);
    const y = (v) => pad.t + (1 - v / maxTotal) * (H - pad.t - pad.b);
    // grid
    for (let i = 0; i <= 3; i++) {
      const yy = pad.t + (i / 3) * (H - pad.t - pad.b);
      el('line', { x1: pad.l, x2: W - pad.r, y1: yy, y2: yy, stroke: cssVar('--border') }, svg);
      el('text', { x: pad.l - 6, y: yy + 3, 'text-anchor': 'end', 'font-size': 9, fill: cssVar('--mute'), 'font-family': 'JetBrains Mono, monospace' }, svg).textContent = fmt(maxTotal - (i / 3) * maxTotal);
    }
    labels.forEach((lb, i) => {
      if (N > 8 && i % 2 !== 0 && i !== N - 1) return;
      el('text', { x: x(i), y: H - 6, 'text-anchor': 'middle', 'font-size': 9, fill: cssVar('--mute'), 'font-family': 'JetBrains Mono, monospace' }, svg).textContent = lb;
    });
    // stack bottom-up
    const colorMap = opts.colors || { stuck: '--danger', at_risk: '--warn', active: '--s3', ceiling: '--success', inactive: '--mute' };
    const accum = Array(N).fill(0);
    keys.forEach(k => {
      const top = accum.map((a, i) => a + opts.data[k][i]);
      const ptsTop = top.map((v, i) => `${x(i)},${y(v)}`).join(' ');
      const ptsBot = accum.map((v, i) => `${x(i)},${y(v)}`).reverse().join(' ');
      el('polygon', { points: `${ptsTop} ${ptsBot}`, fill: cssVar(colorMap[k] || '--mute'), opacity: 0.75 }, svg);
      for (let i = 0; i < N; i++) accum[i] = top[i];
    });
    return svg;
  }

  // ---------- HISTOGRAM ----------
  function histogram(container, opts) {
    bar(container, { data: opts.data.map(d => ({ label: d.bucket, value: d.count })), height: opts.height || 160 });
  }

  // ---------- SCATTER ----------
  // opts: { data:[{x,y,label,group}], xLabel, yLabel, height, quadrantLines, groupColors }
  function scatter(container, opts) {
    const W = container.clientWidth || 500;
    const H = opts.height || 220;
    const pad = { t: 14, r: 14, b: 30, l: 38 };
    const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
    container.innerHTML = '';
    container.appendChild(svg);
    const data = opts.data;
    const xMin = opts.xMin ?? 0, xMax = opts.xMax ?? Math.max(...data.map(d => d.x)) * 1.05;
    const yMin = opts.yMin ?? 0, yMax = opts.yMax ?? 100;
    const x = (v) => pad.l + ((v - xMin) / (xMax - xMin)) * (W - pad.l - pad.r);
    const y = (v) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);
    // grid
    for (let i = 0; i <= 4; i++) {
      const yy = pad.t + (i / 4) * (H - pad.t - pad.b);
      el('line', { x1: pad.l, x2: W - pad.r, y1: yy, y2: yy, stroke: cssVar('--border') }, svg);
      el('text', { x: pad.l - 6, y: yy + 3, 'text-anchor': 'end', 'font-size': 9, fill: cssVar('--mute'), 'font-family': 'JetBrains Mono, monospace' }, svg).textContent = fmt(yMax - (i / 4) * (yMax - yMin));
    }
    // quadrant lines
    if (opts.quadrantLines) {
      const mx = x((xMin + xMax) / 2);
      const my = y((yMin + yMax) / 2);
      el('line', { x1: mx, x2: mx, y1: pad.t, y2: H - pad.b, stroke: cssVar('--faint'), 'stroke-dasharray': '3 3' }, svg);
      el('line', { x1: pad.l, x2: W - pad.r, y1: my, y2: my, stroke: cssVar('--faint'), 'stroke-dasharray': '3 3' }, svg);
    }
    const groupColor = {
      STUCK: cssVar('--danger'),
      AT_RISK: cssVar('--warn'),
      CEILING: cssVar('--success'),
      ACTIVE: cssVar('--s3'),
      INACTIVE: cssVar('--mute'),
    };
    data.forEach(d => {
      const c = (opts.groupColors && opts.groupColors[d.group]) || groupColor[d.group] || cssVar('--s1');
      el('circle', { cx: x(d.x), cy: y(d.y), r: 4, fill: c, opacity: 0.85, stroke: cssVar('--panel'), 'stroke-width': 1 }, svg);
    });
    // axis labels
    if (opts.xLabel) el('text', { x: (W + pad.l - pad.r) / 2, y: H - 4, 'text-anchor': 'middle', 'font-size': 9, fill: cssVar('--mute'), 'font-family': 'JetBrains Mono, monospace', 'letter-spacing': '0.08em' }, svg).textContent = opts.xLabel.toUpperCase();
    if (opts.yLabel) {
      const yt = el('text', { x: 10, y: (H + pad.t - pad.b) / 2, 'text-anchor': 'middle', 'font-size': 9, fill: cssVar('--mute'), 'font-family': 'JetBrains Mono, monospace', 'letter-spacing': '0.08em', transform: `rotate(-90, 10, ${(H + pad.t - pad.b) / 2})` }, svg);
      yt.textContent = opts.yLabel.toUpperCase();
    }
    return svg;
  }

  // ---------- GROUPED BAR (before/after) ----------
  function groupedBar(container, opts) {
    const W = container.clientWidth || 400;
    const H = opts.height || 180;
    const pad = { t: 10, r: 12, b: 34, l: 32 };
    const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
    container.innerHTML = ''; container.appendChild(svg);
    const data = opts.data; // [{label, before, after}]
    const all = data.flatMap(d => [d.before, d.after]);
    const max = Math.max(...all) * 1.05;
    const gw = (W - pad.l - pad.r) / data.length;
    for (let i = 0; i <= 4; i++) {
      const yy = pad.t + (i / 4) * (H - pad.t - pad.b);
      el('line', { x1: pad.l, x2: W - pad.r, y1: yy, y2: yy, stroke: cssVar('--border') }, svg);
      el('text', { x: pad.l - 6, y: yy + 3, 'text-anchor': 'end', 'font-size': 9, fill: cssVar('--mute'), 'font-family': 'JetBrains Mono, monospace' }, svg).textContent = fmt(max - (i / 4) * max);
    }
    data.forEach((d, i) => {
      const bw = (gw - 10) / 2;
      const x0 = pad.l + i * gw + 3;
      [['before', d.before, cssVar('--mute')], ['after', d.after, d.after >= d.before ? cssVar('--success') : cssVar('--danger')]].forEach(([k, v, c], j) => {
        const h = (v / max) * (H - pad.t - pad.b);
        const x = x0 + j * (bw + 2);
        const y = H - pad.b - h;
        el('rect', { x, y, width: bw, height: h, fill: c, opacity: 0.88 }, svg);
        el('text', { x: x + bw / 2, y: y - 3, 'text-anchor': 'middle', 'font-size': 8.5, fill: cssVar('--ink'), 'font-family': 'JetBrains Mono, monospace' }, svg).textContent = v;
      });
      el('text', { x: x0 + (gw - 10) / 2, y: H - 18, 'text-anchor': 'middle', 'font-size': 9, fill: cssVar('--mute'), 'font-family': 'JetBrains Mono, monospace' }, svg).textContent = d.label;
      const delta = d.after - d.before;
      el('text', { x: x0 + (gw - 10) / 2, y: H - 6, 'text-anchor': 'middle', 'font-size': 8, fill: delta >= 0 ? cssVar('--success') : cssVar('--danger'), 'font-family': 'JetBrains Mono, monospace' }, svg).textContent = (delta >= 0 ? '+' : '') + delta;
    });
    return svg;
  }

  // ---------- TIMELINE (Gantt-ish, per-student) ----------
  function timeline(container, opts) {
    const W = container.clientWidth || 500;
    const rowH = 22;
    const H = opts.rows.length * rowH + 30;
    const pad = { t: 18, r: 12, b: 12, l: 90 };
    const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
    container.innerHTML = ''; container.appendChild(svg);
    const xStart = pad.l, xEnd = W - pad.r;
    // x axis date labels
    opts.ticks.forEach((t, i) => {
      const xx = xStart + (i / (opts.ticks.length - 1)) * (xEnd - xStart);
      el('line', { x1: xx, x2: xx, y1: pad.t - 4, y2: H - pad.b, stroke: cssVar('--border'), 'stroke-dasharray': '2 3' }, svg);
      el('text', { x: xx, y: pad.t - 8, 'text-anchor': 'middle', 'font-size': 9, fill: cssVar('--mute'), 'font-family': 'JetBrains Mono, monospace' }, svg).textContent = t;
    });
    opts.rows.forEach((row, i) => {
      const yy = pad.t + i * rowH + 10;
      el('text', { x: pad.l - 8, y: yy + 4, 'text-anchor': 'end', 'font-size': 10, fill: cssVar('--ink-soft'), 'font-weight': 600 }, svg).textContent = row.label;
      row.spans.forEach(s => {
        const x0 = xStart + s.start * (xEnd - xStart);
        const x1 = xStart + s.end * (xEnd - xStart);
        const color = s.kind === 'test' ? cssVar('--s3') : s.kind === 'coach' ? cssVar('--accent') : s.kind === 'stuck' ? cssVar('--danger') : s.kind === 'ceiling' ? cssVar('--success') : cssVar('--s1');
        el('rect', { x: x0, y: yy - 6, width: Math.max(4, x1 - x0), height: 12, fill: color, opacity: 0.85, rx: 2 }, svg);
      });
    });
    return svg;
  }

  window.Charts = { trendLine, sparkline, bar, heatmap, bump, stackedArea, histogram, scatter, groupedBar, timeline };
})();
