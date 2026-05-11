/* ============================================================
   render.js — reads data.json and populates every view
   ============================================================ */
(function () {
  let DATA = null;
  let CURRENT_CAMPUS = null;  // set to first real campus once DATA loads
  let DD_SLUG = null;
  let SUBJECT_SLUG = null;
  let LESSON_SLUG = null;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const _esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const _attr = (s) => _esc(s).replace(/"/g, '&quot;');
  const fmt = (v, fallback = '—') => {
    if (v === null || v === undefined || v === '') return fallback;
    return typeof v === 'number' ? v.toLocaleString() : _esc(v);
  };
  const pct = (v, digits = 0) => {
    if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
    return `${Number(v).toFixed(digits)}%`;
  };
  const scoreTone = (v, inverse = false) => {
    if (v === null || v === undefined || Number.isNaN(Number(v))) return 'muted';
    const n = Number(v);
    if (inverse) return n >= 70 ? 'danger' : n >= 45 ? 'warn' : 'success';
    return n < 55 ? 'danger' : n < 75 ? 'warn' : 'success';
  };

  const tier = (t) => {
    const v = (t || 'active').toLowerCase();
    return `<span class="tier tier-${v}">${v.replace('_', ' ')}</span>`;
  };
  const mbar = (v) => {
    const cls = v < 65 ? 'danger' : v < 78 ? 'warn' : 'good';
    return `<span class="mbar ${cls}"><span style="width:${v}%"></span></span>`;
  };
  const sparkEl = (arr) => {
    const wrap = document.createElement('span');
    wrap.appendChild(Charts.sparkline(arr));
    return wrap.innerHTML;
  };

  // ---------- "Flag wrong data" button (modal-based feedback) ----------
  // Renders a small 🚩 link in section headers. Click opens the structured
  // feedback modal (see DRI SCOPING block below) which captures what's wrong /
  // missing / to improve, logs to localStorage, and offers mailto + copy.
  // Keep this dependency-free + safe to call during innerHTML construction.
  function _flagButton(opts) {
    opts = opts || {};
    const kidName = opts.kid_name || 'Student';
    const kidSlug = opts.kid_slug || '';
    const section = opts.section || 'Section';
    const summary = opts.summary || '(see dashboard)';
    const tip = `Flag "${section}" — opens feedback modal`;
    return `<a class="dd-flag-btn" href="#" role="button"
      data-flag-trigger="1"
      data-flag-kid-name="${_attr(kidName)}"
      data-flag-kid-slug="${_attr(kidSlug)}"
      data-flag-section="${_attr(section)}"
      data-flag-summary="${_attr(summary)}"
      title="${_attr(tip)}" aria-label="${_attr(tip)}">🚩</a>`;
  }

  // ============================================================
  // ==== DRI SCOPING ==== (Agent D territory)
  // ============================================================
  // Per-DRI scoped dashboard views.
  //   * Master (Tripti) sees everything across all 4 campuses + 206 students.
  //   * Each DRI sees only the campuses + levels in their scope.
  //   * Switching is honor-system: ?as=<slug> in the URL hash, or the
  //     dropdown (only visible when the active mode is master).
  //   * Persistence: localStorage key "dri.mode". URL ?as= wins on first load.
  //
  // This block also owns the structured feedback modal (the modern
  // replacement for the old mailto-only 🚩 button). All submissions append
  // to localStorage["dashboard_feedback_log"] so they're reviewable client-
  // side until a /flag write API exists.
  // ------------------------------------------------------------

  const DRI_SCOPES = {
    'tripti': {
      name: 'Tripti Khetan',
      email: 'tripti.khetan@trilogy.com',
      role: 'Master / Operator',
      campuses: ['BTX', 'GT', 'Miami', 'Nova Bastrop'],
      levels: ['WL', 'LL', 'L1', 'L2', 'MS'],
      note: 'Sees everything across all 4 campuses + 206 students.',
    },
    'claudio': {
      name: 'Claudio Ibe',
      email: 'claudio.ibe@alpha.school',
      role: 'BTX Campus DRI · WL/LL/L1',
      campuses: ['BTX'],
      levels: ['WL', 'LL', 'L1'],
      note: 'Brownsville WonderLab, K-8 LL, K-8 L1.',
    },
    'ana': {
      name: 'Anastasiia Klechenko',
      email: 'anastasiia.klechenko@alpha.school',
      role: 'BTX Campus DRI · L2/MS',
      campuses: ['BTX'],
      levels: ['L2', 'MS'],
      note: 'Brownsville K-8 L2, K-8 L3, K-8 MS.',
    },
    'bruna': {
      name: 'Bruna Rodrigues',
      email: 'bruna.rodrigues@2hourlearning.com',
      role: 'Miami Campus DRI',
      campuses: ['Miami'],
      levels: ['WL', 'LL', 'L1', 'L2', 'MS'],
      note: 'Alpha Miami (PK-12).',
    },
    'soaham': {
      name: 'Soaham Sharma',
      email: 'soaham.sharma@alpha.school',
      role: 'Nova Bastrop Campus DRI',
      campuses: ['Nova Bastrop'],
      levels: ['WL', 'LL', 'L1', 'L2', 'MS'],
      note: 'Valenta Academy / Nova Bastrop (PK-L2).',
    },
    'piri': {
      name: 'Piriyanga Janakarajan',
      email: 'piriyanga.janakarajan@2hourlearning.com',
      role: 'GT Campus DRI · Pre/Post-test Coaching Lead',
      campuses: ['GT'],
      levels: ['WL', 'LL', 'L1', 'L2', 'MS'],
      note: 'GT School K-8 Guide; cross-campus pre/post coaching focus.',
    },
  };

  let CURRENT_DRI_MODE = 'tripti';

  // Aliases: campus.id values use lowercased + dash forms (e.g. "nova-bastrop"),
  // while DRI_SCOPES.campuses uses display names ("BTX", "Nova Bastrop").
  // Normalize before comparing.
  const _DRI_CAMPUS_ID_BY_NAME = {
    'btx': ['btx', 'BTX', 'Brownsville', 'Alpha School Brownsville'],
    'gt':  ['gt', 'GT', 'GT School'],
    'miami': ['miami', 'Miami', 'Alpha School Miami'],
    'nova-bastrop': ['nova-bastrop', 'Nova Bastrop', 'Bastrop', 'Nova Academy Bastrop', 'Valenta Academy'],
  };
  function _driCampusIdMatches(campusId, scopeNames) {
    if (!campusId || !scopeNames) return false;
    const cidLow = String(campusId).toLowerCase();
    const idAliases = _DRI_CAMPUS_ID_BY_NAME[cidLow] || [campusId];
    const idLowSet = new Set(idAliases.map(a => String(a).toLowerCase().trim()));
    return scopeNames.some(n => idLowSet.has(String(n).toLowerCase().trim()));
  }

  function currentDriScope() {
    const dri = DRI_SCOPES[CURRENT_DRI_MODE] || DRI_SCOPES.tripti;
    return {
      slug: CURRENT_DRI_MODE,
      name: dri.name,
      email: dri.email,
      role: dri.role,
      note: dri.note,
      campuses: new Set(dri.campuses),
      levels: new Set(dri.levels),
      isMaster: CURRENT_DRI_MODE === 'tripti',
    };
  }

  // True if a campus row from DATA.campuses is in the active DRI scope.
  function isCampusInScope(campus) {
    if (!campus) return false;
    const scope = currentDriScope();
    if (scope.isMaster) return true;
    return _driCampusIdMatches(campus.id, [...scope.campuses])
      || _driCampusIdMatches(campus.name, [...scope.campuses]);
  }

  // True if a student is in the active DRI scope (campus AND level).
  function isInScope(student) {
    if (!student) return false;
    const scope = currentDriScope();
    if (scope.isMaster) return true;
    const campusVal = student.campus || student.campus_id || '';
    const inCampus = _driCampusIdMatches(campusVal, [...scope.campuses]);
    if (!inCampus) return false;
    const lvl = (student.level || '').toUpperCase();
    if (!lvl) return true; // unknown level → don't accidentally hide
    return scope.levels.has(lvl);
  }

  // True if a guide row matches the active DRI scope.
  function isGuideInScope(guide) {
    if (!guide) return false;
    const scope = currentDriScope();
    if (scope.isMaster) return true;
    return _driCampusIdMatches(guide.campus, [...scope.campuses])
      || _driCampusIdMatches(guide.campus_id, [...scope.campuses]);
  }

  // Parse "?as=<slug>" out of the URL hash. The hash may be "#?as=foo" or
  // "#/student/x?as=foo".
  // SECURITY TODO (PR1): client-side ?as= can only narrow the *display* — the
  // server-side /api/dashboard-data filter uses session.email and IGNORES this
  // value entirely, so the worst case is the viewer sees less than their
  // server scope allows, never more. Production should ignore ?as= here too;
  // for now we leave the legacy parse in place but the security boundary is
  // enforced server-side.
  function _readDriFromHash() {
    const h = (typeof location !== 'undefined' ? location.hash : '') || '';
    const qi = h.indexOf('?');
    if (qi === -1) return null;
    const params = h.slice(qi + 1).split('&');
    for (const kv of params) {
      const [k, v] = kv.split('=');
      if (k === 'as' && v) return decodeURIComponent(v).toLowerCase();
    }
    return null;
  }

  function _readDriFromStorage() {
    try {
      const v = localStorage.getItem('dri.mode');
      return v && DRI_SCOPES[v] ? v : null;
    } catch (e) { return null; }
  }

  function _persistDriMode(slug) {
    try { localStorage.setItem('dri.mode', slug); } catch (e) {}
  }

  function setDriMode(slug, opts) {
    opts = opts || {};
    const next = (slug && DRI_SCOPES[slug]) ? slug : 'tripti';
    CURRENT_DRI_MODE = next;
    _persistDriMode(next);
    renderDriModePill();
    applyDRIToSidebar();
    // Sync the campus + monitoring level sets to the DRI's allowed levels so
    // filters Just Work for non-master DRIs (master = full set).
    const scope = currentDriScope();
    if (typeof _campusActiveLevels !== 'undefined' && _campusActiveLevels) {
      _campusActiveLevels.clear();
      scope.levels.forEach(l => _campusActiveLevels.add(l));
    }
    if (typeof _monActiveLevels !== 'undefined' && _monActiveLevels) {
      _monActiveLevels.clear();
      scope.levels.forEach(l => _monActiveLevels.add(l));
    }
    // Pick a campus that's in scope when current selection isn't.
    if (typeof CURRENT_CAMPUS !== 'undefined' && DATA && DATA.campuses) {
      const cur = DATA.campuses.find(c => c.id === CURRENT_CAMPUS);
      if (!cur || !isCampusInScope(cur)) {
        const inScope = DATA.campuses.find(isCampusInScope);
        if (inScope) CURRENT_CAMPUS = inScope.id;
      }
    }
    if (!opts.skipRerender && DATA) {
      try { renderAll(); } catch (e) { /* noop */ }
      try { go('district', { skipHash: true }); } catch (e) {}
    }
  }

  function renderDriModePill() {
    const pill = document.getElementById('dri-mode-pill');
    const labelEl = document.getElementById('dri-mode-pill-label');
    const scopeEl = document.getElementById('dri-mode-pill-scope');
    if (!pill || !labelEl || !scopeEl) return;
    const scope = currentDriScope();
    const isMaster = scope.isMaster;
    pill.classList.toggle('dri-mode-pill-master', isMaster);
    pill.classList.toggle('dri-mode-pill-dri', !isMaster);
    pill.classList.toggle('locked', !isMaster);
    labelEl.textContent = isMaster ? 'Master' : 'DRI';
    if (isMaster) {
      scopeEl.textContent = `${scope.name} · all campuses`;
    } else {
      const campusList = [...scope.campuses].join('/');
      const allLevels = scope.levels.size === 5;
      const lvlList = allLevels ? 'all levels' : [...scope.levels].join('/');
      scopeEl.textContent = `${scope.name} · ${campusList} · ${lvlList}`;
    }
    // Build the dropdown only for master.
    const dd = document.getElementById('dri-mode-dropdown');
    if (!dd) return;
    if (!isMaster) {
      dd.hidden = true;
      dd.innerHTML = '';
      return;
    }
    const slugs = Object.keys(DRI_SCOPES);
    dd.innerHTML = slugs.map(slug => {
      const d = DRI_SCOPES[slug];
      const tag = slug === 'tripti' ? 'MASTER' : 'DRI';
      const isActive = slug === CURRENT_DRI_MODE;
      const camps = d.campuses.length ? d.campuses.join(', ') : 'all';
      const lvls = d.levels.length === 5 ? 'all levels' : d.levels.join('/');
      return `
        <div class="dri-mode-option${isActive ? ' active' : ''}" data-dri-slug="${_attr(slug)}">
          <span class="dri-mode-option-name">${_esc(d.name)}</span>
          <span class="dri-mode-option-tag">${tag}</span>
          <span class="dri-mode-option-sub">${_esc(d.role)} · ${_esc(camps)} · ${_esc(lvls)}</span>
        </div>
      `;
    }).join('');
  }

  function setupDriModeUI() {
    const wrap = document.getElementById('dri-mode-wrap');
    const pill = document.getElementById('dri-mode-pill');
    const dd = document.getElementById('dri-mode-dropdown');
    if (!wrap || !pill || !dd) return;
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      const scope = currentDriScope();
      if (!scope.isMaster) return; // locked for non-Tripti
      dd.hidden = !dd.hidden;
    });
    dd.addEventListener('click', (e) => {
      const opt = e.target.closest('.dri-mode-option');
      if (!opt) return;
      const slug = opt.dataset.driSlug;
      if (!slug) return;
      dd.hidden = true;
      setDriMode(slug);
    });
    document.addEventListener('click', (e) => {
      if (dd.hidden) return;
      if (!wrap.contains(e.target)) dd.hidden = true;
    });
  }

  // Hide / show campus rows in the sidebar according to the active DRI scope.
  // Also hides the "Compare campuses" link for non-master modes (irrelevant
  // since they only see one campus). Called after renderSidebarCampuses().
  function applyDRIToSidebar() {
    const scope = currentDriScope();
    const isMaster = scope.isMaster;
    // Campus rows
    const campusRows = document.querySelectorAll('#sidebar-campuses .side-item[data-campus]');
    campusRows.forEach(el => {
      const cid = el.dataset.campus;
      const campus = DATA && (DATA.campuses || []).find(c => c.id === cid);
      const visible = isMaster || (campus && isCampusInScope(campus));
      el.style.display = visible ? '' : 'none';
    });
    // Cmd-palette campus rows
    const cmdCampusRows = document.querySelectorAll('#cmd-campuses .cmd-item[data-campus]');
    cmdCampusRows.forEach(el => {
      const cid = el.dataset.campus;
      const campus = DATA && (DATA.campuses || []).find(c => c.id === cid);
      const visible = isMaster || (campus && isCampusInScope(campus));
      el.style.display = visible ? '' : 'none';
    });
    // Compare campuses → only useful for master
    const compareEl = document.querySelector('.side-item[data-view="compare"]');
    if (compareEl) compareEl.style.display = isMaster ? '' : 'none';
  }

  // ------------------------------------------------------------
  // Structured feedback modal — backs the 🚩 button.
  // ------------------------------------------------------------

  let _feedbackContext = null;

  function _openFeedbackModal(ctx) {
    _feedbackContext = ctx || {};
    const modal = document.getElementById('dd-feedback-modal');
    const sub = document.getElementById('dd-feedback-modal-sub');
    const ctxEl = document.getElementById('dd-feedback-modal-context');
    const ta = document.getElementById('dd-feedback-modal-textarea');
    if (!modal) return;
    const scope = currentDriScope();
    if (sub) sub.textContent = `Viewer: ${scope.name} (${scope.isMaster ? 'master' : scope.role})`;
    if (ctxEl) {
      ctxEl.textContent = [
        `Student: ${ctx.kid_name || 'Student'}${ctx.kid_slug ? ' (' + ctx.kid_slug + ')' : ''}`,
        `Section: ${ctx.section || '—'}`,
        `URL: ${typeof window !== 'undefined' ? window.location.href : ''}`,
        '',
        '--- Current data ---',
        ctx.summary || '(see dashboard)',
      ].join('\n');
    }
    if (ta) ta.value = '';
    const checked = modal.querySelector('input[name="dd-feedback-kind"][value="wrong"]');
    if (checked) checked.checked = true;
    _setFeedbackStatus('', '');
    modal.hidden = false;
    setTimeout(() => ta && ta.focus(), 30);
  }

  function _closeFeedbackModal() {
    const modal = document.getElementById('dd-feedback-modal');
    if (modal) modal.hidden = true;
    _feedbackContext = null;
  }

  function _feedbackKind() {
    const checked = document.querySelector('input[name="dd-feedback-kind"]:checked');
    return checked ? checked.value : 'wrong';
  }

  function _kindLabel(kind) {
    if (kind === 'missing') return "What's missing";
    if (kind === 'improve') return 'What to improve';
    return "What's wrong";
  }

  function _composeFeedbackPayload() {
    const ctx = _feedbackContext || {};
    const kind = _feedbackKind();
    const ta = document.getElementById('dd-feedback-modal-textarea');
    const details = (ta && ta.value || '').trim();
    const scope = currentDriScope();
    const subject = `[Brain Dashboard] Flag (${kind}) — ${ctx.kid_name || 'Student'} / ${ctx.section || 'Section'}`;
    const body = [
      `Student: ${ctx.kid_name || 'Student'}${ctx.kid_slug ? ' (' + ctx.kid_slug + ')' : ''}`,
      `Section: ${ctx.section || '—'}`,
      `Kind: ${_kindLabel(kind)}`,
      `Date: ${new Date().toISOString()}`,
      `Viewer: ${scope.name} (${scope.role})`,
      `URL: ${typeof window !== 'undefined' ? window.location.href : ''}`,
      '',
      '--- Current data ---',
      ctx.summary || '(see dashboard)',
      '',
      `--- ${_kindLabel(kind)} ---`,
      details || '(no details provided)',
    ].join('\n');
    return { subject, body, kind, details, ctx, scope };
  }

  function _logFeedbackEntry(payload) {
    try {
      const raw = localStorage.getItem('dashboard_feedback_log');
      const arr = raw ? JSON.parse(raw) : [];
      arr.push({
        ts: new Date().toISOString(),
        viewer_slug: payload.scope.slug,
        viewer_name: payload.scope.name,
        kid_name: payload.ctx.kid_name || '',
        kid_slug: payload.ctx.kid_slug || '',
        section: payload.ctx.section || '',
        kind: payload.kind,
        details: payload.details,
        url: typeof window !== 'undefined' ? window.location.href : '',
      });
      localStorage.setItem('dashboard_feedback_log', JSON.stringify(arr));
    } catch (e) { /* swallow */ }
  }

  // POST a feedback event to the durable server-side log. Throws on failure.
  // Endpoint: POST /api/dashboard/feedback (NextAuth-gated, server-scoped).
  async function submitDashboardFeedback(payload) {
    const response = await fetch('/api/dashboard/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
    });
    let result = null;
    try { result = await response.json(); } catch (_) { result = null; }
    if (!response.ok || !result || result.ok !== true) {
      throw new Error((result && result.error) || 'Could not save feedback');
    }
    return result;
  }

  function _setFeedbackStatus(state, msg) {
    const el = document.getElementById('dd-feedback-modal-status');
    if (!el) return;
    el.dataset.state = state || '';
    el.textContent = msg || '';
  }

  // Map the legacy modal payload into the durable feedback event schema.
  function _toDashboardFeedbackBody(p) {
    const ctx = p.ctx || {};
    const kind = p.kind;
    // Modal "kind" is wrong/missing/improve. Treat all three as a "note"
    // action for now — the lifecycle actions (acknowledge/resolved/etc.)
    // come from a future card-level button, not the legacy 🚩 modal.
    const action = (kind === 'wrong') ? 'incorrect' : 'note';
    const studentId = ctx.kid_slug || ctx.kid_name || 'unknown';
    const sectionId = ctx.section || 'unknown';
    return {
      studentId: String(studentId).slice(0, 200),
      sectionId: String(sectionId).slice(0, 300),
      action,
      note: (p.details || '').slice(0, 2000) || undefined,
      sourceView: 'dashboard_flag_modal',
    };
  }

  async function _sendFeedbackMailto() {
    const p = _composeFeedbackPayload();
    _setFeedbackStatus('saving', 'Saving…');
    let saved = false;
    try {
      await submitDashboardFeedback(_toDashboardFeedbackBody(p));
      saved = true;
      _setFeedbackStatus('ok', 'Saved ✓');
      // Brief delay so the user sees the confirmation before the modal closes.
      setTimeout(_closeFeedbackModal, 700);
    } catch (e) {
      _setFeedbackStatus('error', 'Could not save — falling back to email');
    }
    // Best-effort fallback: keep the legacy mailto + localStorage log only
    // when the durable endpoint failed. The server-side event log is the
    // source of truth; this is just a safety net.
    if (!saved) {
      _logFeedbackEntry(p);
      const href = `mailto:tripti.khetan@trilogy.com?subject=${encodeURIComponent(p.subject)}&body=${encodeURIComponent(p.body)}`;
      window.location.href = href;
      _closeFeedbackModal();
    }
  }

  function _copyFeedbackToClipboard() {
    const p = _composeFeedbackPayload();
    _logFeedbackEntry(p);
    const text = `Subject: ${p.subject}\n\n${p.body}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('dd-feedback-modal-copy');
        if (btn) {
          const orig = btn.textContent;
          btn.textContent = 'Copied ✓';
          setTimeout(() => { btn.textContent = orig; }, 1200);
        }
      });
    }
  }

  function setupFeedbackModal() {
    const modal = document.getElementById('dd-feedback-modal');
    if (!modal) return;
    // Inject a small status row for save/error states (kept inline to avoid
    // a body.html edit). Three visual states: saving / ok / error.
    if (!document.getElementById('dd-feedback-modal-status')) {
      const statusEl = document.createElement('div');
      statusEl.id = 'dd-feedback-modal-status';
      statusEl.setAttribute('data-feedback-status', '');
      statusEl.style.cssText = 'margin-top:8px;font-size:12px;min-height:16px;color:var(--mute);';
      const foot = document.getElementById('dd-feedback-modal-foot');
      if (foot && foot.parentNode) {
        foot.parentNode.insertBefore(statusEl, foot);
      } else {
        modal.appendChild(statusEl);
      }
    }
    const closeBtn = document.getElementById('dd-feedback-modal-close');
    const sendBtn = document.getElementById('dd-feedback-modal-send');
    const copyBtn = document.getElementById('dd-feedback-modal-copy');
    if (closeBtn) closeBtn.addEventListener('click', _closeFeedbackModal);
    if (sendBtn) sendBtn.addEventListener('click', _sendFeedbackMailto);
    if (copyBtn) copyBtn.addEventListener('click', _copyFeedbackToClipboard);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) _closeFeedbackModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.hidden) _closeFeedbackModal();
    });
    // Delegated click for every 🚩 button (current + future renders).
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-flag-trigger]');
      if (!btn) return;
      e.preventDefault();
      _openFeedbackModal({
        kid_name: btn.dataset.flagKidName || 'Student',
        kid_slug: btn.dataset.flagKidSlug || '',
        section: btn.dataset.flagSection || 'Section',
        summary: btn.dataset.flagSummary || '(see dashboard)',
      });
    });
  }

  function _initDriModeFromEnv() {
    const fromHash = _readDriFromHash();
    const fromStore = _readDriFromStorage();
    const slug = fromHash || fromStore || 'tripti';
    if (DRI_SCOPES[slug]) CURRENT_DRI_MODE = slug;
    _persistDriMode(CURRENT_DRI_MODE);
  }

  // ==== /DRI SCOPING ====

  // ---------- Brain enrichment (joined alpha-academic-api/knowledge.db) -
  // dd.brain_enrichment is populated by build_ui_kit_data._student_brain_enrichment.
  // These helpers render the four DD touchpoints described in the IA:
  //   - identity rail policy-violations pill
  //   - tests tab bad-test callout
  //   - activity tab platform DRI badges
  //   - subjects tab subject DRI line
  function _brainEnrich(dd) {
    return (dd && dd.brain_enrichment) || {};
  }

  // Identity-rail pill: "⚠ N policy violations" with click-to-expand list.
  function _renderBrainPolicyPill(dd) {
    const be = _brainEnrich(dd);
    const pv = be.policy_violations || [];
    if (!pv.length) return '';
    // Build a tooltip listing policies + evidence so a guide can scan w/o clicking.
    const tip = pv.slice(0, 8).map(p =>
      `${p.policy_title || p.policy} — ${p.evidence}`
    ).join('\n');
    const id = `dd-brain-pv-${(dd && dd.id) || 'kid'}`;
    return `
      <button type="button"
              class="dd-brain-policy-pill"
              title="${_attr(tip)}"
              onclick="(function(){var el=document.getElementById('${id}');if(el)el.style.display=el.style.display==='block'?'none':'block';})();return false;">
        ⚠ ${pv.length} policy violation${pv.length === 1 ? '' : 's'}
      </button>
      <div id="${id}" class="dd-brain-pv-list" style="display:none;">
        ${pv.map(p => `
          <div class="dd-brain-pv-row">
            <div class="dd-brain-pv-head"><b>${_esc(p.policy_title || p.policy)}</b>${p.policy_dri ? ` · DRI ${_esc(p.policy_dri)}` : ''}</div>
            <div class="dd-brain-pv-evidence">${_esc(p.evidence)}</div>
            ${p.policy_summary ? `<div class="dd-brain-pv-summary muted">${_esc(p.policy_summary)}</div>` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }

  // Tests-tab callout: known bad tests (joined from systemic-issues table).
  function _renderBrainBadTestsCallout(dd) {
    const be = _brainEnrich(dd);
    const warns = be.bad_test_warnings || [];
    if (!warns.length) return '';
    const issueTitle = warns[0].issue_summary || 'bad-tests-questions';
    return `
      <div class="dd-brain-bad-test">
        <div class="dd-brain-bad-test-head">
          🔴 Known bad tests · ${warns.length} of this kid's tests are on the district "${_esc(issueTitle)}" list — points to test quality, not kid prep.
        </div>
        <table class="dd-brain-bad-test-table">
          <thead><tr><th>Test</th><th class="r">Attempts</th><th>First seen</th></tr></thead>
          <tbody>
            ${warns.map(w => `
              <tr>
                <td><b>${_esc(w.test_name)}</b></td>
                <td class="r tnum">${_esc(w.n_attempts)}</td>
                <td class="muted">${_esc(w.first_seen || '—')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ---------- DISTRICT OVERVIEW ----------
  function renderDistrict() {
    const d = DATA.district;

    // eyebrow + meta from real data
    const t = d.totals || {};
    const totalStuck = DATA.campuses.reduce((a,c) => a + (c.tiers?.stuck||0), 0);
    const totalAtRisk = DATA.campuses.reduce((a,c) => a + (c.tiers?.at_risk||0), 0);
    const totalCeiling = DATA.campuses.reduce((a,c) => a + (c.tiers?.ceiling||0), 0);
    $('#district-eyebrow')     && ($('#district-eyebrow').textContent = `Campus Console · ${d.name}`);
    $('#district-headline')    && ($('#district-headline').innerHTML = `${d.campuses_count} campuses. <em>One system</em> to hold.`);
    $('#district-meta')        && ($('#district-meta').innerHTML = `DRI <b>${d.dri}</b> · ${d.students_count} students · cutoff <b>${(d.cutoff_time||'').replace('T',' ').slice(0,16)}</b>`);
    $('#district-dateline')    && ($('#district-dateline').innerHTML = `<span class="pulse"></span>LIVE · ${DATA._note || ''}`);

    // hero
    $('#district-hero-stats').innerHTML = `
      <div class="big-stat"><div class="v tnum">${d.campuses_count}</div><div class="k">Campuses</div></div>
      <div class="big-stat"><div class="v tnum">${d.students_count}</div><div class="k">Students</div></div>
      <div class="big-stat"><div class="v tnum">${totalStuck}</div><div class="k danger">Stuck</div></div>
      <div class="big-stat"><div class="v tnum">${totalAtRisk}</div><div class="k warn">At Risk</div></div>
      <div class="big-stat"><div class="v tnum">${totalCeiling}</div><div class="k success">Ceiling</div></div>
    `;

    // ── AI district-level hero — TLDR + 3 priorities + ranked systemic flags ──
    const dai = DATA.district_ai_synthesis || {};
    const tldrEl = $('#district-ai-tldr');
    const prioEl = $('#district-ai-priorities');
    const sysEl = $('#district-ai-systemic');
    const nextEl = $('#district-ai-next-monday');
    if (tldrEl) tldrEl.innerHTML = dai.tldr ? _esc(dai.tldr) : '<span class="muted">No district AI synthesis yet — run aggregator_reason_district.py.</span>';
    if (prioEl) {
      const pris = [
        { rank: 1, p: dai.highest_leverage_pursuit },
        { rank: 2, p: dai.second_priority },
        { rank: 3, p: dai.third_priority },
      ].filter(x => x.p && x.p.title);
      prioEl.innerHTML = pris.length ? `
        <div style="margin-top:12px;">
          ${pris.map(({rank, p}) => `
            <div style="padding:10px 12px;border:1px solid var(--border);border-radius:6px;margin-top:6px;background:var(--panel);">
              <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--mute);text-transform:uppercase;letter-spacing:0.5px;">Priority #${rank} · ${_esc((p.owner || 'tripti'))} ${p.estimated_kids_affected ? '· ~' + p.estimated_kids_affected + ' kids' : ''}</div>
              <div style="font-weight:500;color:var(--ink);margin-top:3px;font-size:13px;">${_esc(p.title)}</div>
              <div class="muted" style="margin-top:3px;font-size:11px;">${_esc(p.rationale || '')}</div>
              ${p.first_action ? `<div style="margin-top:6px;padding:6px 8px;background:var(--bg);border-radius:4px;font-size:11.5px;"><b>First action:</b> ${_esc(p.first_action)}</div>` : ''}
            </div>
          `).join('')}
        </div>
      ` : '';
    }
    if (sysEl) {
      const flags = (dai.systemic_flags_ranked || []).slice(0, 7);
      sysEl.innerHTML = flags.length ? `
        <div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--border);">
          <div style="font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.7px;color:var(--mute);margin-bottom:6px;">Systemic flags ranked by leverage</div>
          ${flags.map(f => `
            <div style="display:grid;grid-template-columns:50px 1fr 100px;gap:8px;padding:4px 0;font-size:12px;border-bottom:1px dashed var(--border);">
              <span class="tnum" style="font-family:'JetBrains Mono',monospace;color:var(--accent);">${_esc(f.leverage_score)}</span>
              <span style="color:var(--ink);">${_esc(f.flag)}</span>
              <span class="muted" style="text-align:right;font-family:'JetBrains Mono',monospace;font-size:10.5px;">${_esc(f.kids_affected || '?')} kids · ${_esc(f.owner || '?')}</span>
            </div>
          `).join('')}
        </div>
      ` : '';
    }
    if (nextEl) nextEl.textContent = dai.next_monday_check ? `Next Monday check: ${dai.next_monday_check}` : '';

    // "Start here" triage strip — worst campus + worst subject + top-3 stuck
    const ts = DATA.triage_strip || {};
    const wc = ts.worst_campus, ws = ts.worst_subject, ts3 = ts.top_stuck_3 || [];
    if ($('#triage-strip')) {
      $('#triage-strip').innerHTML = `
        <div class="panel-inner" style="padding:12px;border:1px solid var(--border);border-radius:6px;">
          <div class="kind" style="font-size:10px;letter-spacing:1.5px;">WORST CAMPUS</div>
          <div style="font-size:22px;font-weight:600;margin-top:4px;">${wc ? wc.name : '—'}</div>
          <div class="muted">${wc ? `Avg mastery ${wc.mastery_avg}%` : ''}</div>
        </div>
        <div class="panel-inner" style="padding:12px;border:1px solid var(--border);border-radius:6px;">
          <div class="kind" style="font-size:10px;letter-spacing:1.5px;">WORST SUBJECT</div>
          <div style="font-size:22px;font-weight:600;margin-top:4px;">${ws ? ws.name : '—'}</div>
          <div class="muted">${ws ? `Avg pass rate ${ws.avg_pass_rate}%` : ''}</div>
        </div>
        <div class="panel-inner" style="padding:12px;border:1px solid var(--border);border-radius:6px;">
          <div class="kind" style="font-size:10px;letter-spacing:1.5px;">TOP 3 STUCK</div>
          ${ts3.map(s => `
            <div class="clickable triage-row" data-slug="${s.slug || ''}" style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:12.5px;cursor:pointer;">
              <b>${s.name || '?'}</b>
              <span class="muted">${s.campus || ''} · ${s.attempts || 0} doom</span>
            </div>
          `).join('') || '<div class="muted">—</div>'}
        </div>
      `;
      $$('#triage-strip [data-slug]').forEach(el => el.addEventListener('click', () => {
        DD_SLUG = el.dataset.slug || el.dataset.id || DD_SLUG;
        go('student-dd');
      }));
    }

    // leaderboard
    const ranked = [...DATA.campuses].sort((a, b) => (b.mastery_avg||0) - (a.mastery_avg||0));
    $('#leaderboard').innerHTML = ranked.map((c, i) => {
      const trendV = (typeof c.mastery_trend_4wk === 'number') ? c.mastery_trend_4wk : null;
      return `
      <div class="leader-row" data-campus="${c.id}">
        <div class="rk">${String(i + 1).padStart(2, '0')}</div>
        <div class="nm">${c.name}<div class="sub">${c.city} · DRI ${c.dri}</div></div>
        <div class="num tnum">${(c.mastery_avg ?? 0).toFixed(1)}%</div>
        <div class="pill-row">
          <span class="pill doom">${c.tiers.stuck} stuck</span>
          <span class="pill warn">${c.tiers.at_risk} risk</span>
          <span class="pill ceiling">${c.tiers.ceiling} ceil</span>
          <span class="pill">${c.students} total</span>
        </div>
        <div class="trend tnum" style="font-size:11px;">${trendV != null ? (trendV > 0 ? '+' : '') + trendV + ' Δ4wk' : '—'}</div>
        <div class="num tnum muted">${c.tiers.active}/${c.students}</div>
      </div>
    `;}).join('');
    $$('#leaderboard .leader-row').forEach(row => row.addEventListener('click', () => {
      CURRENT_CAMPUS = row.dataset.campus;
      go('campus');
    }));

    // small multiples — mastery avg per campus (history not yet tracked)
    const sm = $('#small-multiples');
    sm.innerHTML = DATA.campuses.map(c => `
      <div class="panel" style="padding:10px 12px;">
        <div class="flex sb ac mb-6"><div class="panel-title" style="font-size:13px;">${c.name}</div><span class="num tnum">${(c.mastery_avg ?? 0).toFixed(1)}%</span></div>
        <div class="muted" style="font-size:10.5px;">${c.tiers.stuck} stuck · ${c.tiers.at_risk} at-risk · ${c.tiers.active} active</div>
        <div class="chart-cap" style="margin-top:8px;">${c.mastery_trend_4wk != null ? ((c.mastery_trend_4wk > 0 ? '+' : '') + c.mastery_trend_4wk + ' UNITS 4WK') : 'VELOCITY: INSUFFICIENT DATA'}</div>
      </div>
    `).join('');

    // Bump chart / history — skip until we have snapshots
    if ($('#bump')) $('#bump').innerHTML = '<div class="muted" style="padding:20px;text-align:center;">Rank history will appear after 2+ nightly snapshots.</div>';

    // stacked tier composition — needs ≥2 weeks; show empty state otherwise
    const tcw = DATA.tier_composition_weeks || {};
    if ($('#tier-stack')) {
      if ((tcw.weeks || []).length < 2) {
        $('#tier-stack').innerHTML = '<div class="muted" style="padding:20px;text-align:center;">Stacked tier composition appears after 2+ nightly snapshots.</div>';
      } else {
        Charts.stackedArea($('#tier-stack'), {
          keys: ['stuck', 'at_risk', 'active', 'ceiling', 'inactive'],
          labels: tcw.weeks,
          data: tcw,
          height: 180,
        });
      }
    }

    // histogram
    if ($('#hist')) Charts.histogram($('#hist'), { data: DATA.mastery_histogram || [], height: 160 });

    // scatter
    if ($('#scatter')) Charts.scatter($('#scatter'), {
      data: (DATA.effort_mastery || []).map(e => ({ x: e.effort, y: e.mastery, group: e.tier, label: e.name })),
      xLabel: 'XP/week avg', yLabel: 'Mastery %', height: 220, quadrantLines: true, xMin: 0,
    });

    // systemic issues
    if ($('#systemic-list')) $('#systemic-list').innerHTML = (DATA.systemic || []).map(s => `
      <div class="systemic ${s.kind === 'bad_test' || s.kind === 'concentration' ? 'danger' : ''}">
        <div class="flex sb ac">
          <div class="kind">${s.kind || ''} · ${s.id || ''}</div>
          <div class="label">AFFECTS ${s.affects || 0}${s.first_seen ? ' · SINCE ' + s.first_seen : ''}</div>
        </div>
        <h4>${s.title || ''}</h4>
        <div class="ev">${s.detail || ''} ${s.campuses && s.campuses.length ? '<b>Campuses:</b> ' + s.campuses.join(', ') + '.' : ''}</div>
      </div>
    `).join('');

    // priority queue (district-wide)
    const priorities = DATA.priorities || [];
    $('#priority-list').innerHTML = priorities.length === 0
      ? '<div class="dd-empty">No district priorities yet — every kid in green.</div>'
      : priorities.map(p => `
          <div class="priority ${p.urgency}">
            <div class="u">${p.urgency === 'high' ? '▲ HIGH' : p.urgency === 'med' ? '● MED' : '○ LOW'}<br><span style="color:var(--mute);font-size:9px;font-weight:500;letter-spacing:.08em;">${p.campus}</span></div>
            <div><div class="a">${p.who} · ${p.subject}</div><div class="r">${p.reason}</div></div>
            <div class="act">Review</div>
          </div>
        `).join('');
  }

  // ---------- District baseline helper (used for campus deltas) ----------
  let _districtBaselineCache = null;
  function computeDistrictBaseline() {
    if (_districtBaselineCache) return _districtBaselineCache;
    const all = DATA.students || [];
    const masteries = all.map(s => s.mastery).filter(m => m != null && m > 0);
    const velocities = all.map(s => s.mastery_velocity_4wk).filter(v => v != null);
    const xp = all.map(s => s.weekly_xp_avg).filter(v => v != null && v > 0);
    const stuck = all.filter(s => s.tier === 'stuck').length;
    const at_risk = all.filter(s => s.tier === 'at_risk').length;
    _districtBaselineCache = {
      n_students: all.length,
      mastery_avg: masteries.length ? masteries.reduce((a,b)=>a+b,0) / masteries.length : null,
      velocity_avg: velocities.length ? velocities.reduce((a,b)=>a+b,0) / velocities.length : null,
      weekly_xp_avg: xp.length ? xp.reduce((a,b)=>a+b,0) / xp.length : null,
      stuck, at_risk,
    };
    return _districtBaselineCache;
  }

  // ==== CAMPUS + MONITORING ==== (Agent B territory)
  // Campus pages: 3 tabs (Overview · Activity · Need Coaching) with a multi-select
  // level filter (WL/LL/L1/L2/MS). Reads campus.attention_students,
  // campus.good_news_students, campus.coaching_buckets, and student.level from the
  // adapter (Agent A). Also computes per-subject weekly XP from
  // student_dds[<slug>].subject_breakdown when available.
  // Students Monitoring view (further down in this section) replaces the legacy
  // "All students" table: card list with level filter, name search, and per-
  // flagged-subject status that persists in localStorage.
  // Do NOT touch student DD code (Agent C territory) below this section.

  const _CAMPUS_LEVELS = ['WL', 'LL', 'L1', 'L2', 'MS'];
  const _CAMPUS_TAB_KEYS = ['overview', 'activity', 'coaching', 'guides'];
  let _campusActiveLevels = new Set(_CAMPUS_LEVELS);
  let _campusActiveTab = 'overview';
  let _campusActivityFrom = null;
  let _campusActivityTo = null;

  function _isoMondayToToday() {
    const today = new Date();
    const dow = today.getDay();
    const offset = dow === 0 ? 6 : dow - 1;
    const mon = new Date(today);
    mon.setDate(today.getDate() - offset);
    const fmt = (d) => d.toISOString().slice(0, 10);
    return { from: fmt(mon), to: fmt(today) };
  }

  function _campusEnsureActivityDefaults() {
    if (!_campusActivityFrom || !_campusActivityTo) {
      const r = _isoMondayToToday();
      _campusActivityFrom = r.from;
      _campusActivityTo = r.to;
    }
  }

  function _levelPill(lvl) {
    const v = (lvl || '').toUpperCase();
    if (!v) return '';
    return `<span class="level-pill">${_esc(v)}</span>`;
  }

  function _campusStudentsAtLevel(campus) {
    const all = (DATA.students || []).filter(s => s.campus === campus.name);
    return all.filter(s => {
      // DRI scoping (Agent D): for non-master DRIs, drop students outside scope.
      if (typeof isInScope === 'function' && !isInScope(s)) return false;
      const lvl = (s.level || '').toUpperCase();
      if (!lvl) return true;
      return _campusActiveLevels.has(lvl);
    });
  }

  function _campusFilterAdapterRows(rows) {
    const scope = (typeof currentDriScope === 'function') ? currentDriScope() : null;
    return (rows || []).filter(r => {
      const lvl = (r.level || '').toUpperCase();
      if (lvl && !_campusActiveLevels.has(lvl)) return false;
      // DRI scoping (Agent D): non-master DRIs honor allowed levels even
      // when _campusActiveLevels has been widened by user toggles.
      if (scope && !scope.isMaster && lvl && !scope.levels.has(lvl)) return false;
      return true;
    });
  }

  function _renderCampusOverview(campus) {
    const attEl = $('#campus-attention-list');
    if (attEl) {
      const rows = _campusFilterAdapterRows(campus.attention_students);
      attEl.innerHTML = rows.length ? rows.map(r => `
        <div class="attention-row" data-slug="${_attr(r.slug || '')}">
          <div class="attention-row-name">
            ${_levelPill(r.level)}
            <span>${_esc(r.name || '')}</span>
            ${r.tier ? tier(r.tier) : ''}
          </div>
          ${r.attention_reason ? `<div class="attention-row-reason">${_esc(r.attention_reason)}</div>` : ''}
        </div>
      `).join('') : '<div class="dd-empty">No students need attention with these filters.</div>';
      $$('#campus-attention-list .attention-row').forEach(el => {
        el.onclick = () => {
          const slug = el.dataset.slug;
          if (slug) { DD_SLUG = slug; go('student-dd'); }
        };
      });
    }

    const gnEl = $('#campus-good-news-list');
    if (gnEl) {
      const rows = _campusFilterAdapterRows(campus.good_news_students);
      gnEl.innerHTML = rows.length ? rows.map(r => {
        const tests = (r.recent_passes || []).map(p => `
          <div class="good-news-row-test">
            <span><b>${_esc(p.test_name || '')}</b>${p.subject ? ' · ' + _esc(p.subject) : ''}</span>
            ${p.score != null ? `<span class="muted">${_esc(p.score)}${typeof p.score === 'number' ? '%' : ''}</span>` : ''}
            ${p.grade ? `<span class="muted">G${_esc(p.grade)}</span>` : ''}
            ${p.escaped_doom_loop ? `<span class="escaped-loop-badge">🎯 escaped doom loop</span>` : ''}
          </div>
        `).join('');
        return `
          <div class="good-news-row" data-slug="${_attr(r.slug || '')}">
            <div class="good-news-row-head">
              ${_levelPill(r.level)}
              <span>${_esc(r.name || '')}</span>
            </div>
            <div class="good-news-row-tests">${tests || '<span class="muted">—</span>'}</div>
          </div>
        `;
      }).join('') : '<div class="dd-empty">No recent passes for these filters.</div>';
      $$('#campus-good-news-list .good-news-row').forEach(el => {
        el.onclick = () => {
          const slug = el.dataset.slug;
          if (slug) { DD_SLUG = slug; go('student-dd'); }
        };
      });
    }
  }

  function _renderCampusActivity(campus) {
    _campusEnsureActivityDefaults();
    const fromEl = $('#campus-activity-from');
    const toEl = $('#campus-activity-to');
    if (fromEl && fromEl.value !== _campusActivityFrom) fromEl.value = _campusActivityFrom;
    if (toEl && toEl.value !== _campusActivityTo) toEl.value = _campusActivityTo;
    if (fromEl) fromEl.onchange = () => { _campusActivityFrom = fromEl.value; _renderCampusActivity(campus); };
    if (toEl) toEl.onchange = () => { _campusActivityTo = toEl.value; _renderCampusActivity(campus); };

    const listEl = $('#campus-activity-list');
    if (!listEl) return;
    const students = _campusStudentsAtLevel(campus);
    const dds = DATA.student_dds || {};

    const rows = students.map(s => {
      const dd = dds[s.id] || dds[s.slug] || {};
      const subjBreak = (dd.subject_breakdown || []).filter(sb => sb && sb.subject);
      const flaggedSet = new Set((s.flagged_subjects || []).map(f => (f.subject || '').toLowerCase()));
      const cells = subjBreak.map(sb => {
        const subj = sb.subject || '';
        const actual = sb.wk_xp_actual;
        const target = sb.wk_xp_target;
        const onTrack = sb.wk_on_track;
        const isFlagged = flaggedSet.has(subj.toLowerCase());
        const xpStr = (actual != null && target != null)
          ? `${Math.round(actual)} / ${Math.round(target)}`
          : (actual != null ? `${Math.round(actual)}` : '—');
        const flagIcon = (onTrack === false || isFlagged) ? `<span class="activity-flag" title="Off track or flagged">🚩</span>` : '';
        return `
          <span class="activity-subject-cell" title="${_attr(subj)} · weekly XP ${xpStr}">
            <span class="subj">${_esc(subj)}</span>
            <span class="xp">${xpStr}</span>
            ${flagIcon}
          </span>`;
      }).join('');
      if (!cells) return '';
      return `
        <div class="activity-row" data-slug="${_attr(s.id || s.slug || '')}">
          <div class="activity-row-head">
            ${_levelPill(s.level)}
            <span>${_esc(s.name)}</span>
          </div>
          <div class="activity-subjects">${cells}</div>
        </div>`;
    }).filter(Boolean).join('');

    listEl.innerHTML = rows || '<div class="dd-empty">No activity data for these students.</div>';
    $$('#campus-activity-list .activity-row').forEach(el => {
      el.onclick = () => {
        const slug = el.dataset.slug;
        if (slug) { DD_SLUG = slug; go('student-dd'); }
      };
    });

    const r = _isoMondayToToday();
    const isWeekDefault = (_campusActivityFrom === r.from && _campusActivityTo === r.to);
    const muteEl = listEl.parentElement && listEl.parentElement.querySelector('.activity-range-note');
    if (muteEl) muteEl.remove();
    if (!isWeekDefault) {
      const note = document.createElement('div');
      note.className = 'muted activity-range-note';
      note.style.cssText = 'font-size:10.5px;margin-top:8px;';
      note.textContent = 'Note: showing precomputed weekly XP. Custom date ranges populate after the brain pipeline supports per-day rollups.';
      listEl.parentElement.appendChild(note);
    }
  }

  function _renderCampusCoaching(campus) {
    const wrap = $('#campus-coaching-groups');
    if (!wrap) return;
    const buckets = campus.coaching_buckets || {};
    const groups = [
      { key: 'pre_test',  label: 'Pre-test coaching',  rows: buckets.pre_test  || [] },
      { key: 'post_test', label: 'Post-test coaching', rows: buckets.post_test || [] },
      { key: 'academic',  label: 'Academic coaching',  rows: buckets.academic  || [] },
    ];
    wrap.innerHTML = groups.map(g => {
      const filtered = _campusFilterAdapterRows(g.rows);
      const rowsHtml = filtered.length ? filtered.map(r => `
        <div class="coaching-group-row" data-slug="${_attr(r.slug || '')}">
          <div class="coaching-group-row-name">
            ${_levelPill(r.level)}
            <span>${_esc(r.name || '')}</span>
          </div>
          ${r.reason ? `<div class="coaching-group-row-reason">${_esc(r.reason)}</div>` : ''}
        </div>
      `).join('') : '<div class="dd-empty" style="padding:8px;font-size:11.5px;">No students in this bucket.</div>';
      return `
        <div class="coaching-group">
          <div class="coaching-group-head">${_esc(g.label)} · ${filtered.length} student${filtered.length === 1 ? '' : 's'}</div>
          ${rowsHtml}
        </div>`;
    }).join('');
    $$('#campus-coaching-groups .coaching-group-row').forEach(el => {
      el.onclick = () => {
        const slug = el.dataset.slug;
        if (slug) { DD_SLUG = slug; go('student-dd'); }
      };
    });
  }

  function _setCampusTab(tab) {
    if (!_CAMPUS_TAB_KEYS.includes(tab)) tab = 'overview';
    _campusActiveTab = tab;
    $$('#campus-tabs .campus-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.campusTab === tab);
    });
    $$('[data-campus-panel]').forEach(p => {
      p.classList.toggle('active', p.dataset.campusPanel === tab);
    });
    updateURLHash('campus');
  }

  function _wireCampusControls(campus) {
    // Level chips
    $$('#campus-level-filter .campus-level-chip').forEach(chip => {
      const lvl = chip.dataset.level;
      chip.classList.toggle('active', _campusActiveLevels.has(lvl));
      chip.onclick = () => {
        if (_campusActiveLevels.has(lvl)) _campusActiveLevels.delete(lvl);
        else _campusActiveLevels.add(lvl);
        // Don't allow zero — re-add if user toggled all off
        if (_campusActiveLevels.size === 0) _CAMPUS_LEVELS.forEach(l => _campusActiveLevels.add(l));
        chip.classList.toggle('active', _campusActiveLevels.has(lvl));
        // Re-render whichever tab is active
        if (_campusActiveTab === 'overview') _renderCampusOverview(campus);
        if (_campusActiveTab === 'activity') _renderCampusActivity(campus);
        if (_campusActiveTab === 'coaching') _renderCampusCoaching(campus);
        if (_campusActiveTab === 'guides') renderGuidesView(campus);
        updateURLHash('campus');
      };
    });
    // Tab buttons
    $$('#campus-tabs .campus-tab').forEach(b => {
      b.onclick = () => {
        _setCampusTab(b.dataset.campusTab);
        // Render active tab's content
        const c = (DATA.campuses || []).find(x => x.id === CURRENT_CAMPUS) || campus;
        if (_campusActiveTab === 'overview') _renderCampusOverview(c);
        if (_campusActiveTab === 'activity') _renderCampusActivity(c);
        if (_campusActiveTab === 'coaching') _renderCampusCoaching(c);
        if (_campusActiveTab === 'guides') renderGuidesView(c);
      };
    });
  }

  function renderCampus() {
    const c = (DATA.campuses || []).find(x => x.id === CURRENT_CAMPUS) || (DATA.campuses || [])[0];
    if (!c) return;

    const setIf = (sel, val) => { const el = $(sel); if (el) el.textContent = val; };
    setIf('#campus-crumb', c.name);
    setIf('#campus-switcher-name', c.name);
    setIf('#campus-name', c.name);
    setIf('#campus-city', c.city || '');
    setIf('#campus-dri', c.dri || '');

    // Hero KPI tiles (kept compact — same comparators as before)
    const district = computeDistrictBaseline();
    const heroEl = $('#campus-hero-stats');
    if (heroEl) {
      const stuckPct = c.students ? (100 * (c.tiers?.stuck ?? 0) / c.students).toFixed(1) : null;
      const dStuckPct = district.n_students ? (100 * district.stuck / district.n_students).toFixed(1) : null;
      const masteryDelta = c.mastery_avg != null && district.mastery_avg != null
        ? (c.mastery_avg - district.mastery_avg).toFixed(1) : null;
      heroEl.innerHTML = `
        <div class="big-stat"><div class="v tnum">${c.students}</div><div class="k">Students</div></div>
        <div class="big-stat"><div class="v tnum">${c.mastery_avg != null ? c.mastery_avg.toFixed(1) + '%' : '—'}</div><div class="k">Mastery${masteryDelta != null ? ' (vs district ' + (masteryDelta > 0 ? '+' : '') + masteryDelta + 'pp)' : ''}</div></div>
        <div class="big-stat"><div class="v tnum">${c.tiers?.stuck ?? 0}</div><div class="k danger">Stuck${stuckPct != null && dStuckPct != null ? ' (' + stuckPct + '% vs ' + dStuckPct + '%)' : ''}</div></div>
        <div class="big-stat"><div class="v tnum">${c.tiers?.at_risk ?? 0}</div><div class="k warn">At risk</div></div>
        <div class="big-stat"><div class="v tnum">${c.tiers?.ceiling ?? 0}</div><div class="k success">Ceiling</div></div>
      `;
    }

    _wireCampusControls(c);
    // Set current tab UI
    _setCampusTab(_campusActiveTab);
    // Render whatever tab is active
    if (_campusActiveTab === 'overview') _renderCampusOverview(c);
    if (_campusActiveTab === 'activity') _renderCampusActivity(c);
    if (_campusActiveTab === 'coaching') _renderCampusCoaching(c);
    if (_campusActiveTab === 'guides') renderGuidesView(c);
  }
  // (continued in MONITORING block below — same Agent B territory)

  // ---------- COMPARE ----------
  function renderCompare() {
    const grid = $('#compare-grid');
    if (!grid) return;
    const cols = (DATA.campuses || []).map(c => `
      <div class="compare-col">
        <h3>${c.name}</h3>
        <div class="sub">${c.city || ''} · DRI ${c.dri || '(pending)'} · ${c.students} students</div>
        <div class="stat-line"><span class="label">Mastery avg</span><b>${c.mastery_avg != null ? c.mastery_avg.toFixed(1) + '%' : '—'}</b></div>
        <div class="stat-line"><span class="label">4-wk velocity</span><b>${c.mastery_trend_4wk != null ? (c.mastery_trend_4wk > 0 ? '+' : '') + c.mastery_trend_4wk : '—'}</b></div>
        <div class="stat-line"><span class="label danger">Stuck</span><b>${c.tiers?.stuck ?? 0}</b></div>
        <div class="stat-line"><span class="label warn">At risk</span><b>${c.tiers?.at_risk ?? 0}</b></div>
        <div class="stat-line"><span class="label success">Ceiling</span><b>${c.tiers?.ceiling ?? 0}</b></div>
        <div class="stat-line"><span class="label">Active</span><b>${c.tiers?.active ?? 0}</b></div>
        <div class="stat-line"><span class="label">Inactive</span><b>${c.tiers?.inactive ?? 0}</b></div>
      </div>
    `).join('');
    grid.innerHTML = cols;

    const compHead = $('#compare-subjects thead');
    const compBody = $('#compare-subjects tbody');
    if (compHead) compHead.innerHTML = `<tr><th>Metric</th>${(DATA.campuses || []).map(c => `<th class="r">${c.short}</th>`).join('')}<th class="r">Δ spread</th></tr>`;
    if (compBody) {
      const metrics = [
        ['Stuck',         c => c.tiers?.stuck ?? 0,                         true],
        ['At risk',       c => c.tiers?.at_risk ?? 0,                       true],
        ['Active',        c => c.tiers?.active ?? 0,                        false],
        ['Mastery avg',   c => Math.round(c.mastery_avg ?? 0),              false, '%'],
        ['Velocity Δ4w',  c => Math.round((c.mastery_trend_4wk ?? 0) * 10) / 10, false],
        ['Students',      c => c.students,                                  false],
      ];
      compBody.innerHTML = metrics.map(([label, fn, danger, suffix]) => {
        const vals = (DATA.campuses || []).map(fn);
        const spread = Math.max(...vals) - Math.min(...vals);
        const flag = danger && spread > Math.max(...vals) * 0.5;
        return `<tr>
          <td><b>${label}</b></td>
          ${vals.map(v => `<td class="r tnum">${v}${suffix || ''}</td>`).join('')}
          <td class="r tnum ${flag ? 'danger' : ''}">${spread.toFixed(0)}</td>
        </tr>`;
      }).join('');
    }
  }

  // ---------- SUBJECT + LESSON DRILLDOWNS ----------
  const subjectRollups = () => Array.isArray(DATA?.subject_rollups) ? DATA.subject_rollups : [];
  const lessonDetails = () => Object.values(DATA?.lesson_details || {});
  const subjectRisk = (s) => {
    const h = s.hero_stats || {};
    const worstQ = Math.max(0, ...(s.bad_questions || []).map(q => q.fail_rate_pct || 0));
    const passGap = h.pass_rate == null ? 0 : Math.max(0, 100 - Number(h.pass_rate));
    return (h.stuck_count || 0) * 8 + (h.doom_loops || 0) * 2 + passGap + worstQ / 2;
  };
  const lessonRisk = (l) => {
    const worstQ = Math.max(0, ...(l.items || []).map(q => q.fail_rate_pct || 0));
    const passGap = l.pass_rate == null ? 0 : Math.max(0, 100 - Number(l.pass_rate));
    return worstQ * 1.2 + (l.failers || []).length * 3 + passGap + Math.log10((l.attempts || 0) + 1);
  };
  const subjectNameMatches = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  const clampPct = (v) => Math.max(0, Math.min(100, Number(v) || 0));

  function renderSubject() {
    const body = $('#subject-body');
    if (!body) return;
    const rows = subjectRollups();
    const statsEl = $('#subject-hero-stats');
    if (!rows.length) {
      if (statsEl) statsEl.innerHTML = '<div class="big-stat"><div class="v tnum">0</div><div class="k">Subjects</div></div>';
      body.innerHTML = '<div class="panel"><div class="muted" style="padding:20px;text-align:center;">No subject rollups are present in data.json yet. Rebuild with build_ui_kit_data.py.</div></div>';
      return;
    }
    const ordered = [...rows].sort((a, b) => subjectRisk(b) - subjectRisk(a));
    if (!SUBJECT_SLUG || !rows.some(s => s.slug === SUBJECT_SLUG)) SUBJECT_SLUG = ordered[0].slug;
    const current = rows.find(s => s.slug === SUBJECT_SLUG) || ordered[0];
    const h = current.hero_stats || {};
    const lessons = lessonDetails()
      .filter(l => subjectNameMatches(l.subject, current.name))
      .sort((a, b) => lessonRisk(b) - lessonRisk(a));
    const lessonByName = new Map(lessons.map(l => [l.test_name, l.slug]));
    const worstLesson = lessons[0];
    const worstQ = (current.bad_questions || [])[0];

    if (statsEl) statsEl.innerHTML = `
      <div class="big-stat"><div class="v tnum">${fmt(h.n_students)}</div><div class="k">Students</div></div>
      <div class="big-stat"><div class="v tnum ${scoreTone(h.pass_rate)}">${pct(h.pass_rate)}</div><div class="k">Avg pass</div></div>
      <div class="big-stat"><div class="v tnum ${h.stuck_count ? 'danger' : ''}">${fmt(h.stuck_count, 0)}</div><div class="k danger">Stuck</div></div>
      <div class="big-stat"><div class="v tnum">${fmt(lessons.length, 0)}</div><div class="k">Lessons</div></div>
    `;

    // AI synthesis hero panel (subject-level)
    const ai = current.ai_synthesis || {};
    const aiHeroHTML = ai.tldr ? `
      <div class="panel mb-14" style="border-left:3px solid var(--accent);">
        <div class="panel-head">
          <div>
            <div class="panel-title">${_esc(current.name)} — what's worth attention this week</div>
            <div class="panel-sub">Generated by Opus 4.7 from cross-campus data + bad-question index.</div>
          </div>
          ${ai.is_systemic === true ? '<span class="dd-finding-sev" style="background:var(--danger);color:white;padding:3px 8px;border-radius:3px;font-size:10px;">SYSTEMIC</span>' : ai.is_systemic === false ? '<span class="dd-finding-sev" style="background:var(--warn);color:white;padding:3px 8px;border-radius:3px;font-size:10px;">LOCAL</span>' : ''}
        </div>
        <p class="dd-tldr" style="margin-top:8px;">${_esc(ai.tldr)}</p>
        ${ai.worst_campus && ai.worst_campus !== 'none' ? `<div class="muted mt-4">Worst campus: <b>${_esc(ai.worst_campus)}</b> — ${_esc(ai.worst_campus_evidence || '')}</div>` : ''}
        ${(ai.leverage_points || []).length ? `
          <div style="margin-top:12px;">
            ${(ai.leverage_points || []).map(l => `
              <div style="padding:8px 10px;border:1px solid var(--border);border-radius:6px;margin-top:6px;background:var(--panel);font-size:12px;">
                <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--mute);text-transform:uppercase;letter-spacing:0.5px;">#${l.rank} · ${_esc(l.owner || 'subject_dri')} · ~${l.estimated_kids_affected || '?'} kids</div>
                <div style="font-weight:500;color:var(--ink);margin-top:2px;">${_esc(l.title || '')}</div>
                <div class="muted" style="margin-top:2px;font-size:11px;">${_esc(l.rationale || '')}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}
        ${ai.next_week_check ? `<div class="muted mt-8" style="font-size:11px;"><b>Next-Monday check:</b> ${_esc(ai.next_week_check)}</div>` : ''}
      </div>
    ` : '';

    body.innerHTML = `
      ${aiHeroHTML}
      <div class="panel-actions subject-picker mb-14">
        ${ordered.map(s => `
          <button class="chip ${s.slug === current.slug ? 'active' : ''}" data-subject-pick="${_attr(s.slug)}">
            ${_esc(s.name)} <span class="tag-count">${fmt((s.hero_stats || {}).n_students, 0)}</span>
          </button>
        `).join('')}
      </div>

      <div class="grid g-21 mb-14">
        <div class="panel">
          <div class="panel-head">
            <div><div class="panel-title">${_esc(current.name)} by campus</div><div class="panel-sub">Pass rate, stuck count, and most repeated issue.</div></div>
            <button class="btn ghost" data-go="lesson" data-lesson="${_attr(worstLesson?.slug || '')}">Open highest-risk lesson</button>
          </div>
          <table>
            <thead><tr><th>Campus</th><th class="r">Students</th><th class="r">Pass rate</th><th class="r">Stuck</th><th>Top issue</th></tr></thead>
            <tbody>
              ${(current.cross_campus || []).map(c => `
                <tr>
                  <td><b>${_esc(c.campus)}</b></td>
                  <td class="r tnum">${fmt(c.n_students, 0)}</td>
                  <td class="r tnum ${scoreTone(c.mastery_avg)}">${pct(c.mastery_avg)}</td>
                  <td class="r tnum ${c.stuck_count ? 'danger' : 'muted'}">${fmt(c.stuck_count, 0)}</td>
                  <td>${_esc(c.top_issue || '—')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="panel">
          <div class="panel-head"><div><div class="panel-title">DRI focus</div><div class="panel-sub">Owner and fastest evidence to inspect.</div></div></div>
          <div class="stat-line"><span>Subject DRI</span><b>${_esc(current.dri_name || '(pending)')}</b></div>
          <div class="stat-line"><span>Velocity proxy</span><b>${fmt(current.velocity_4wk)}</b></div>
          <div class="stat-line"><span>Doom loops</span><b class="${h.doom_loops ? 'danger' : ''}">${fmt(h.doom_loops, 0)}</b></div>
          <div class="stat-line"><span>Worst item</span><b>${worstQ ? `Q${fmt(worstQ.q_num)} · ${pct(worstQ.fail_rate_pct)}` : '—'}</b></div>
          <div class="dd-note mt-10">${worstLesson ? `Start with ${_esc(worstLesson.test_name)} before assigning more practice.` : 'No lesson drilldowns found for this subject yet.'}</div>
        </div>
      </div>

      <div class="grid g-2 mb-14">
        <div class="panel">
          <div class="panel-head"><div><div class="panel-title">Highest-fail questions</div><div class="panel-sub">From the question-level bad item index.</div></div></div>
          <table>
            <thead><tr><th>Test</th><th class="r">Q</th><th class="r">Fail rate</th><th class="r">Students</th></tr></thead>
            <tbody>
              ${(current.bad_questions || []).length ? (current.bad_questions || []).map(q => {
                const lessonSlug = lessonByName.get(q.test_name) || '';
                return `
                  <tr class="${lessonSlug ? 'clickable' : ''}" data-lesson-id="${_attr(lessonSlug)}">
                    <td><b>${_esc(q.test_name || '—')}</b></td>
                    <td class="r tnum">Q${fmt(q.q_num)}</td>
                    <td class="r tnum ${scoreTone(q.fail_rate_pct, true)}">${pct(q.fail_rate_pct)}</td>
                    <td class="r tnum">${fmt(q.n_students)}</td>
                  </tr>
                `;
              }).join('') : '<tr><td colspan="4" class="muted" style="text-align:center;padding:14px;">No bad-question rows found for this subject.</td></tr>'}
            </tbody>
          </table>
        </div>
        <div class="panel">
          <div class="panel-head"><div><div class="panel-title">Students needing subject support</div><div class="panel-sub">Sorted by subject doom loops and total doom loops.</div></div></div>
          <table>
            <thead><tr><th>Student</th><th>Campus</th><th class="r">Subject loops</th><th class="r">Pass</th></tr></thead>
            <tbody>
              ${(current.top_stuck || []).length ? (current.top_stuck || []).map(s => `
                <tr class="clickable" data-student-id="${_attr(s.slug)}">
                  <td><b>${_esc(s.name || '—')}</b></td>
                  <td>${_esc(s.campus || '—')}</td>
                  <td class="r tnum ${s.subject_doom_loops ? 'danger' : ''}">${fmt(s.subject_doom_loops, 0)}</td>
                  <td class="r tnum ${scoreTone(s.pass_rate_pct)}">${pct(s.pass_rate_pct)}</td>
                </tr>
              `).join('') : '<tr><td colspan="4" class="muted" style="text-align:center;padding:14px;">No stuck students attached to this subject.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><div><div class="panel-title">Lesson drilldowns</div><div class="panel-sub">Click a lesson to inspect failed items, failers, standards, and reteach prompt.</div></div></div>
        <table id="subject-lesson-table">
          <thead><tr><th>Lesson / test</th><th>Grade</th><th class="r">Attempts</th><th class="r">Pass rate</th><th class="r">Bad items</th><th class="r">Failers</th><th>Flag</th></tr></thead>
          <tbody>
            ${lessons.length ? lessons.slice(0, 40).map(l => {
              const maxFail = Math.max(0, ...(l.items || []).map(i => i.fail_rate_pct || 0));
              const flag = maxFail >= 70 ? 'bad item' : maxFail >= 45 ? 'watch' : ((l.failers || []).length ? 'reteach' : 'ok');
              return `
                <tr class="clickable" data-lesson-id="${_attr(l.slug)}">
                  <td><b>${_esc(l.test_name || '—')}</b><div class="muted">${_esc(l.latest || '')}</div></td>
                  <td>${_esc(l.grade || '—')}</td>
                  <td class="r tnum">${fmt(l.attempts, 0)}</td>
                  <td class="r tnum ${scoreTone(l.pass_rate)}">${pct(l.pass_rate)}</td>
                  <td class="r tnum ${maxFail >= 45 ? 'danger' : 'muted'}">${(l.items || []).length}</td>
                  <td class="r tnum">${(l.failers || []).length}</td>
                  <td><span class="pill ${flag === 'bad item' ? 'doom' : flag === 'watch' ? 'warn' : ''}">${flag}</span></td>
                </tr>
              `;
            }).join('') : '<tr><td colspan="7" class="muted" style="text-align:center;padding:14px;">No lesson details matched this subject.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    body.querySelectorAll('[data-subject-pick]').forEach(el => el.addEventListener('click', () => {
      SUBJECT_SLUG = el.dataset.subjectPick;
      LESSON_SLUG = null;
      renderSubject();
    }));
    body.querySelectorAll('[data-lesson-id]').forEach(el => el.addEventListener('click', () => {
      if (!el.dataset.lessonId) return;
      LESSON_SLUG = el.dataset.lessonId;
      go('lesson');
    }));
    body.querySelectorAll('[data-student-id]').forEach(el => el.addEventListener('click', () => {
      DD_SLUG = el.dataset.studentId;
      go('student-dd');
    }));
  }

  function renderLesson() {
    const body = $('#lesson-body');
    if (!body) return;
    const lessons = lessonDetails();
    const subjects = subjectRollups();
    if (!lessons.length) {
      $('#lesson-title') && ($('#lesson-title').textContent = 'Lesson drilldown.');
      $('#lesson-meta') && ($('#lesson-meta').textContent = 'No lesson detail rows are present in data.json yet.');
      $('#lesson-hero-stats') && ($('#lesson-hero-stats').innerHTML = '<div class="big-stat"><div class="v tnum">0</div><div class="k">Lessons</div></div>');
      body.innerHTML = '<div class="panel"><div class="muted" style="padding:20px;text-align:center;">Rebuild the dashboard data to emit lesson_details.</div></div>';
      return;
    }

    const scoped = SUBJECT_SLUG
      ? lessons.filter(l => {
          const sr = subjects.find(s => s.slug === SUBJECT_SLUG);
          return sr ? subjectNameMatches(l.subject, sr.name) : true;
        })
      : lessons;
    const ordered = [...(scoped.length ? scoped : lessons)].sort((a, b) => lessonRisk(b) - lessonRisk(a));
    if (!LESSON_SLUG || !lessons.some(l => l.slug === LESSON_SLUG)) LESSON_SLUG = ordered[0].slug;
    const lesson = lessons.find(l => l.slug === LESSON_SLUG) || ordered[0];
    const subj = subjects.find(s => subjectNameMatches(s.name, lesson.subject));
    if (subj) SUBJECT_SLUG = subj.slug;

    const items = [...(lesson.items || [])].sort((a, b) => (b.fail_rate_pct || 0) - (a.fail_rate_pct || 0));
    const failers = lesson.failers || [];
    const worst = items[0];
    const related = lessons
      .filter(l => l.slug !== lesson.slug && subjectNameMatches(l.subject, lesson.subject))
      .sort((a, b) => lessonRisk(b) - lessonRisk(a))
      .slice(0, 8);

    $('#lesson-title') && ($('#lesson-title').innerHTML = `${_esc(lesson.test_name || 'Lesson drilldown')}`);
    $('#lesson-meta') && ($('#lesson-meta').innerHTML = `
      <a data-go="subject" data-subject="${_attr(SUBJECT_SLUG || '')}">← ${_esc(lesson.subject || 'Subject')}</a>
      · DRI <b>${_esc(lesson.dri_name || '(pending)')}</b>
      ${lesson.grade ? ` · Grade ${_esc(lesson.grade)}` : ''}
      ${lesson.latest ? ` · latest ${_esc(lesson.latest)}` : ''}
    `);
    $('#lesson-hero-stats') && ($('#lesson-hero-stats').innerHTML = `
      <div class="big-stat"><div class="v tnum">${fmt(lesson.attempts, 0)}</div><div class="k">Attempts</div></div>
      <div class="big-stat"><div class="v tnum ${scoreTone(lesson.pass_rate)}">${pct(lesson.pass_rate)}</div><div class="k">Pass rate</div></div>
      <div class="big-stat"><div class="v tnum ${items.length ? 'danger' : ''}">${items.length}</div><div class="k danger">Bad items</div></div>
      <div class="big-stat"><div class="v tnum">${failers.length}</div><div class="k">Shown failers</div></div>
    `);

    // AI test-level synthesis hero (classification + qc ticket + reteach guidance)
    const ai = lesson.ai_synthesis || {};
    const aiHeroHTML = ai.narrative ? `
      <div class="panel mb-14" style="border-left:3px solid ${ai.classification === 'bad_item' ? 'var(--danger)' : ai.classification === 'mixed' ? 'var(--warn)' : 'var(--accent)'};">
        <div class="panel-head">
          <div>
            <div class="panel-title">AI diagnosis · ${_esc((ai.classification || 'unknown').replace(/_/g, ' '))} <span class="muted" style="font-size:11px;">(confidence: ${_esc(ai.confidence || 'unknown')})</span></div>
            <div class="panel-sub">Generated by Opus 4.7 from per-question stats + QTI metadata.</div>
          </div>
          ${ai.qc_ticket?.needed ? '<button class="btn" id="lesson-file-qc-btn" title="Pre-filled QC ticket — needs human send">📩 File QC ticket</button>' : ''}
        </div>
        <p class="dd-tldr" style="margin-top:8px;">${_esc(ai.narrative)}</p>
        ${ai.evidence ? `<div class="muted mt-4" style="font-size:11px;"><b>Evidence:</b> ${_esc(ai.evidence)}</div>` : ''}
        ${(ai.bad_questions || []).length ? `
          <div style="margin-top:12px;">
            ${(ai.bad_questions || []).slice(0, 5).map(bq => `
              <div style="padding:6px 10px;border:1px solid var(--border);border-radius:4px;margin-top:4px;background:var(--panel);font-size:12px;display:flex;gap:10px;align-items:center;">
                <span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--mute);background:var(--bg);padding:1px 6px;border-radius:3px;">Q${_esc(bq.q_num)}</span>
                <span class="${bq.fail_rate_pct >= 70 ? 'danger' : 'warn'}" style="font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:500;">${_esc(bq.fail_rate_pct)}% fail</span>
                <span style="flex:1;color:var(--ink-soft);">${_esc(bq.diagnosis || '')}</span>
                <span style="font-family:'JetBrains Mono',monospace;font-size:10px;background:${bq.action === 'pull' ? 'var(--danger)' : bq.action === 'reteach' ? 'var(--warn)' : 'var(--mute)'};color:white;padding:2px 6px;border-radius:3px;text-transform:uppercase;">${_esc(bq.action || 'monitor')}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    ` : '';

    const statusBlock = worst ? `
      <div class="doom-block mb-14">
        <div class="head"><span>${worst.fail_rate_pct >= 70 ? 'SYSTEMIC ITEM WATCH' : 'ITEM WATCH'} · Q${fmt(worst.q_num)}</span><span>${fmt(worst.n_students)} students · ${pct(worst.fail_rate_pct)} wrong</span></div>
        <div class="diag">Worst flagged item: Q${fmt(worst.q_num)} has ${pct(worst.fail_rate_pct)} fail rate across ${fmt(worst.n_attempts || worst.n_students)} attempts/students.</div>
        <div class="ev">Subject owner: ${_esc(lesson.dri_name || '(pending)')}. Use the reteach prompt below before routing more students into the same retake loop.</div>
      </div>
    ` : `
      <div class="panel mb-14">
        <div class="muted" style="padding:6px 0;">No bad-question rows are attached to this lesson. Use the failer list and standards to plan the reteach.</div>
      </div>
    `;

    body.innerHTML = `
      ${aiHeroHTML}
      ${statusBlock}

      <div class="grid g-2 mb-14">
        <div class="panel">
          <div class="panel-head"><div><div class="panel-title">Question fail rates</div><div class="panel-sub">Highest fail-rate items first.</div></div></div>
          <div class="lesson-bars">
            ${items.length ? items.slice(0, 12).map(i => `
              <div class="bar-row">
                <div class="bar-label">Q${fmt(i.q_num)}</div>
                <div class="bar-track"><span class="${scoreTone(i.fail_rate_pct, true)}" style="width:${clampPct(i.fail_rate_pct)}%"></span></div>
                <div class="bar-value tnum">${pct(i.fail_rate_pct)}</div>
                <div class="muted tnum">${fmt(i.n_students || i.n_attempts)}</div>
              </div>
            `).join('') : '<div class="muted" style="padding:14px;text-align:center;">No item rows for this lesson.</div>'}
          </div>
        </div>
        <div class="panel">
          <div class="panel-head"><div><div class="panel-title">Students not passed yet</div><div class="panel-sub">Most recent failed attempts from tests_aggregated_bruna.</div></div></div>
          <table id="lesson-stuck">
            <thead><tr><th>Student</th><th>Campus</th><th class="r">Score</th><th class="r">Attempt</th><th class="r">Mastery</th></tr></thead>
            <tbody>
              ${failers.length ? failers.map(f => `
                <tr class="clickable" data-student-id="${_attr(f.slug)}">
                  <td><b>${_esc(f.name || '—')}</b><div class="muted">${_esc(f.date || '')}</div></td>
                  <td>${_esc(f.campus || '—')}</td>
                  <td class="r tnum ${scoreTone(f.score)}">${pct(f.score)}</td>
                  <td class="r tnum">${fmt(f.attempts, '—')}</td>
                  <td class="r tnum">${pct(f.mastery)}</td>
                </tr>
              `).join('') : '<tr><td colspan="5" class="muted" style="text-align:center;padding:14px;">No current failers found for this lesson.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="grid g-12 mb-14">
        <div class="panel">
          <div class="panel-head"><div><div class="panel-title">Reteach prompt</div><div class="panel-sub">Generated from pass rate, failers, bad items, and subject DRI.</div></div></div>
          <pre class="copy-block">${_esc(lesson.reteach_prompt || 'No prompt generated.')}</pre>
        </div>
        <div class="panel">
          <div class="panel-head"><div><div class="panel-title">Standards & metadata</div></div></div>
          <div class="stat-line"><span>Subject</span><b>${_esc(lesson.subject || '—')}</b></div>
          <div class="stat-line"><span>Students</span><b>${fmt(lesson.n_students, 0)}</b></div>
          <div class="stat-line"><span>Items in test</span><b>${fmt(lesson.items_count, 0)}</b></div>
          <div class="pill-row mt-10">
            ${(lesson.standards || []).length ? (lesson.standards || []).map(s => `<span class="pill">${_esc(s)}</span>`).join('') : '<span class="muted">No standards metadata found.</span>'}
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><div><div class="panel-title">Related ${_esc(lesson.subject || 'subject')} lessons</div><div class="panel-sub">Other high-risk drilldowns in the same subject.</div></div></div>
        <table>
          <thead><tr><th>Lesson / test</th><th class="r">Attempts</th><th class="r">Pass rate</th><th class="r">Bad items</th><th class="r">Failers</th></tr></thead>
          <tbody>
            ${related.length ? related.map(l => `
              <tr class="clickable" data-lesson-id="${_attr(l.slug)}">
                <td><b>${_esc(l.test_name || '—')}</b></td>
                <td class="r tnum">${fmt(l.attempts, 0)}</td>
                <td class="r tnum ${scoreTone(l.pass_rate)}">${pct(l.pass_rate)}</td>
                <td class="r tnum">${(l.items || []).length}</td>
                <td class="r tnum">${(l.failers || []).length}</td>
              </tr>
            `).join('') : '<tr><td colspan="5" class="muted" style="text-align:center;padding:14px;">No related lesson rows found.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    body.querySelectorAll('[data-student-id]').forEach(el => el.addEventListener('click', () => {
      DD_SLUG = el.dataset.studentId;
      go('student-dd');
    }));
    body.querySelectorAll('[data-lesson-id]').forEach(el => el.addEventListener('click', () => {
      LESSON_SLUG = el.dataset.lessonId;
      renderLesson();
    }));

    // QC ticket button — opens mailto with pre-filled subject + body from AI synthesis
    const qcBtn = document.getElementById('lesson-file-qc-btn');
    if (qcBtn && ai.qc_ticket?.needed) {
      qcBtn.onclick = () => {
        const to = lesson.dri_email || 'tripti.khetan@trilogy.com';
        const subject = ai.qc_ticket.subject || `QC: ${lesson.test_name} — suspected bad item`;
        const bodyText = ai.qc_ticket.body || `${ai.narrative}\n\nEvidence: ${ai.evidence}`;
        window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
      };
    }
  }

  function renderStudent() {
    // Legacy route: point at the real Student Deep Dive.
    const dds = DATA.student_dds || {};
    const fallback = DATA.default_dd_slug || Object.keys(dds)[0];
    DD_SLUG = DD_SLUG || fallback;
    go('student-dd');
  }

  // ---------- ROUTING ----------
  function go(view, opts) {
    if (!view) return;
    opts = opts || {};
    // "guides" is a virtual view → opens campus view with the guides tab active.
    if (view === 'guides') {
      _campusActiveTab = 'guides';
      view = 'campus';
    }
    if (DATA) {
      if (view === 'campus') renderCampus();
      if (view === 'subject') renderSubject();
      if (view === 'lesson') renderLesson();
      if (view === 'student-dd') renderStudentDD();
      if (view === 'students') renderStudentsDir();
      if (view === 'testing') renderTesting();
      if (view === 'coaching') renderCoaching();
      if (view === 'systemic') renderSystemic();
      if (view === 'triage') renderTriage();
    }
    const target = $('#view-' + view);
    if (!target) {
      $$('.view').forEach(v => v.classList.remove('active'));
      const dist = $('#view-district');
      if (dist) dist.classList.add('active');
      return;
    }
    $$('.view').forEach(v => v.classList.remove('active'));
    target.classList.add('active');
    // Sidebar active-state: for views that have multiple sidebar entries (e.g. "campus"
    // has 4 items, one per campus), match on BOTH data-view and data-campus. For
    // single-instance views, just match data-view.
    $$('.side-item').forEach(el => {
      if (el.dataset.view !== view) {
        el.classList.remove('active');
        return;
      }
      // For campus view, only the matching campus row is active
      if (view === 'campus' && el.dataset.campus) {
        el.classList.toggle('active', el.dataset.campus === CURRENT_CAMPUS);
      } else {
        el.classList.add('active');
      }
    });
    window.scrollTo({ top: 0, behavior: 'instant' });

    // Phase 4: URL state for shareable links
    if (!opts.skipHash) updateURLHash(view);
  }

  // ── Phase 4: URL hash routing ──────────────────────────────────────────
  // Patterns:
  //   #/district
  //   #/students
  //   #/campus/btx
  //   #/subject/math
  //   #/lesson/<test-slug>
  //   #/student/<slug>
  //   #/student/<slug>/coaching   (open DD on a specific tab)
  function _levelsToQuery(set, full) {
    const arr = [...set];
    if (arr.length === full.length) return '';
    return '?lvl=' + arr.join(',');
  }

  function updateURLHash(view) {
    let hash = '#/' + view;
    if (view === 'campus' && CURRENT_CAMPUS) {
      hash = `#/campus/${CURRENT_CAMPUS}/${_campusActiveTab || 'overview'}`;
      const q = _levelsToQuery(_campusActiveLevels, _CAMPUS_LEVELS);
      if (q) hash += q;
    }
    else if (view === 'subject' && SUBJECT_SLUG) hash = `#/subject/${SUBJECT_SLUG}`;
    else if (view === 'lesson' && LESSON_SLUG) hash = `#/lesson/${LESSON_SLUG}`;
    else if (view === 'student-dd' && DD_SLUG) hash = `#/student/${DD_SLUG}`;
    else if (view === 'students' || view === 'monitoring') {
      hash = '#/monitoring';
      const parts = [];
      const lvlQ = _levelsToQuery(_monActiveLevels, _MONITORING_LEVELS);
      if (lvlQ) parts.push(lvlQ.slice(1)); // strip leading ?
      if (_monQuery) parts.push('q=' + encodeURIComponent(_monQuery));
      if (parts.length) hash += '?' + parts.join('&');
    }
    else if (view === 'triage') {
      hash = '#/triage';
      const parts = [];
      if (_triageFilters.status && _triageFilters.status !== 'open') parts.push('status=' + encodeURIComponent(_triageFilters.status));
      if (_triageFilters.kid) parts.push('kid=' + encodeURIComponent(_triageFilters.kid));
      if (_triageFilters.category) parts.push('category=' + encodeURIComponent(_triageFilters.category));
      if (parts.length) hash += '?' + parts.join('&');
    }
    if (location.hash !== hash) {
      try { history.replaceState(null, '', hash); } catch (e) { location.hash = hash; }
    }
  }

  function _parseHashQuery(hash) {
    const qi = hash.indexOf('?');
    if (qi === -1) return {};
    const out = {};
    hash.slice(qi + 1).split('&').forEach(kv => {
      const [k, v] = kv.split('=');
      if (k) out[decodeURIComponent(k)] = v == null ? '' : decodeURIComponent(v);
    });
    return out;
  }

  function _applyLevelsFromQuery(query, set, allowedList) {
    const lvl = query.lvl;
    if (!lvl) return;
    const wanted = lvl.split(',').map(x => x.toUpperCase()).filter(x => allowedList.includes(x));
    if (!wanted.length) return;
    set.clear();
    wanted.forEach(x => set.add(x));
  }

  function applyURLHash() {
    const hash = location.hash || '';
    const path = hash.split('?')[0];
    const m = path.match(/^#\/([\w-]+)(?:\/([\w-]+))?(?:\/([\w-]+))?/);
    if (!m) return;
    const view = m[1];
    const arg1 = m[2];
    const arg2 = m[3];
    const query = _parseHashQuery(hash);
    if (view === 'campus' && arg1) {
      CURRENT_CAMPUS = arg1;
      if (arg2 && _CAMPUS_TAB_KEYS.includes(arg2)) _campusActiveTab = arg2;
      _applyLevelsFromQuery(query, _campusActiveLevels, _CAMPUS_LEVELS);
    }
    else if (view === 'subject' && arg1) SUBJECT_SLUG = arg1;
    else if (view === 'lesson' && arg1) LESSON_SLUG = arg1;
    else if (view === 'student' && arg1) {
      DD_SLUG = arg1;
      go('student-dd', { skipHash: true });
      if (arg2) {
        setTimeout(() => {
          const tab = document.querySelector(`.dd-tab[data-dd-tab="${arg2}"]`);
          if (tab) tab.click();
        }, 50);
      }
      return;
    }
    else if (view === 'monitoring' || view === 'students') {
      _applyLevelsFromQuery(query, _monActiveLevels, _MONITORING_LEVELS);
      if (query.q) _monQuery = query.q.toLowerCase();
      go('students', { skipHash: true });
      return;
    }
    if (view === 'triage') {
      // Triage filters come from query string (status, kid, category)
      if (query.status) _triageFilters.status = query.status;
      if (query.kid) _triageFilters.kid = query.kid;
      if (query.category) _triageFilters.category = query.category;
      go('triage', { skipHash: true });
      return;
    }
    if (['district', 'campus', 'subject', 'lesson', 'students', 'testing', 'coaching', 'systemic'].includes(view)) {
      go(view, { skipHash: true });
    }
  }

  function captureRouteContext(el) {
    if (!el || !el.dataset) return;
    if (el.dataset.subject) SUBJECT_SLUG = el.dataset.subject;
    if (el.dataset.lesson) LESSON_SLUG = el.dataset.lesson;
    if (el.dataset.student) DD_SLUG = el.dataset.student;
  }

  // ---------- THEME ----------
  function setTheme(name) {
    document.documentElement.setAttribute('data-theme', name);
    localStorage.setItem('btx-theme', name);
    $$('.theme-picker button').forEach(b => b.classList.toggle('active', b.dataset.theme === name));
    // re-render charts since colors read CSS vars
    if (DATA) setTimeout(renderAll, 20);
  }

  // ---------- CAMPUS SWITCHER ----------
  function setupCampusSwitcher() {
    $('.campus-switcher').addEventListener('click', () => {
      const i = DATA.campuses.findIndex(c => c.id === CURRENT_CAMPUS);
      CURRENT_CAMPUS = DATA.campuses[(i + 1) % DATA.campuses.length].id;
      renderCampus();
      if ($('#view-campus').classList.contains('active')) {
        // stay on campus view
      } else {
        go('campus');
      }
    });
  }

  // ---------- CMD PALETTE ----------
  function setupCmd() {
    const bd = $('#cmd-backdrop');
    const inp = $('#cmd-input');
    const items = $$('.cmd-item');
    let sel = 0;
    const refresh = () => items.forEach((it, i) => it.classList.toggle('sel', i === sel && !it.hidden));
    const open = () => { bd.classList.add('open'); inp.value = ''; inp.focus(); items.forEach(i => i.hidden = false); sel = 0; refresh(); };
    const close = () => bd.classList.remove('open');
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); open(); }
      if (e.key === 'Escape') close();
      if (bd.classList.contains('open')) {
        const visible = items.filter(i => !i.hidden);
        if (e.key === 'ArrowDown') { sel = (sel + 1) % visible.length; refresh(); }
        if (e.key === 'ArrowUp') { sel = (sel - 1 + visible.length) % visible.length; refresh(); }
        if (e.key === 'Enter') { visible[sel]?.click(); close(); }
      }
    });
    bd.addEventListener('click', (e) => { if (e.target === bd) close(); });
    $('.cmd-open').addEventListener('click', open);
    inp.addEventListener('input', () => {
      const q = inp.value.toLowerCase();
      items.forEach(it => it.hidden = !it.textContent.toLowerCase().includes(q));
      sel = 0; refresh();
    });
    items.forEach(it => it.addEventListener('click', () => {
      captureRouteContext(it);
      const v = it.dataset.view;
      const c = it.dataset.campus;
      if (c) { CURRENT_CAMPUS = c; go('campus'); }
      else if (v) go(v);
      close();
    }));
  }

  // ---------- NAV ----------
  function setupNav() {
    // Use event delegation so dynamically-rendered data-go links also work
    document.addEventListener('click', (e) => {
      const sideItem = e.target.closest('.side-item[data-view]');
      if (sideItem) {
        captureRouteContext(sideItem);
        const v = sideItem.dataset.view;
        const c = sideItem.dataset.campus;
        if (c) CURRENT_CAMPUS = c;
        go(v);
        return;
      }
      const goLink = e.target.closest('[data-go]');
      if (goLink) {
        e.preventDefault();
        captureRouteContext(goLink);
        go(goLink.dataset.go);
        return;
      }
      const themeBtn = e.target.closest('.theme-picker button');
      if (themeBtn) setTheme(themeBtn.dataset.theme);
      const cmdItem = e.target.closest('.cmd-item[data-view]');
      if (cmdItem) {
        captureRouteContext(cmdItem);
        const v = cmdItem.dataset.view;
        const c = cmdItem.dataset.campus;
        if (c) CURRENT_CAMPUS = c;
        go(v);
        const palette = $('#cmd-palette');
        if (palette) palette.classList.remove('open');
      }
    });
  }

  // ==== MONITORING ====
  // Students Monitoring view — replaces the legacy "All students" table.
  // Card list with multi-select level filter (WL/LL/L1/L2/MS), name search,
  // and per-flagged-subject status that persists in localStorage.
  // Reads student.level, student.attention_reason, student.flagged_subjects[].
  // Local status keys: mon.status.<slug>.<subject>

  const _MONITORING_LEVELS = ['WL', 'LL', 'L1', 'L2', 'MS'];
  const _MONITORING_STATUSES = [
    { value: 'needs-action',  label: 'Needs action'  },
    { value: 'pending-reply', label: 'Pending reply' },
    { value: 'monitoring',    label: 'Monitoring'    },
  ];
  let _monActiveLevels = new Set(_MONITORING_LEVELS);
  let _monQuery = '';

  function _monStatusKey(slug, subject) {
    return `mon.status.${slug}.${(subject || '').toLowerCase()}`;
  }

  function _monGetStatus(slug, subject, fallback) {
    try {
      const v = localStorage.getItem(_monStatusKey(slug, subject));
      return v || fallback || 'monitoring';
    } catch (e) {
      return fallback || 'monitoring';
    }
  }

  function _monSetStatus(slug, subject, value) {
    try { localStorage.setItem(_monStatusKey(slug, subject), value); } catch (e) {}
  }

  function _normalizeDefaultStatus(s) {
    const v = (s || '').toLowerCase().replace(/\s+/g, '-').replace('_', '-');
    if (v.startsWith('need')) return 'needs-action';
    if (v.startsWith('pending')) return 'pending-reply';
    if (v.startsWith('monitor')) return 'monitoring';
    return 'monitoring';
  }

  function _monStatusSelect(slug, subject, defaultStatus) {
    const cur = _monGetStatus(slug, subject, _normalizeDefaultStatus(defaultStatus));
    const opts = _MONITORING_STATUSES.map(s =>
      `<option value="${s.value}"${s.value === cur ? ' selected' : ''}>${_esc(s.label)}</option>`
    ).join('');
    return `<select class="monitoring-status-select" data-slug="${_attr(slug)}" data-subject="${_attr(subject)}" data-status="${_attr(cur)}">${opts}</select>`;
  }

  function _matchesMonitoringFilters(s) {
    // DRI scoping (Agent D): non-master DRIs only see students in their scope.
    if (typeof isInScope === 'function' && !isInScope(s)) return false;
    const lvl = (s.level || '').toUpperCase();
    if (lvl && !_monActiveLevels.has(lvl)) return false;
    if (_monQuery) {
      const name = (s.name || '').toLowerCase();
      if (!name.includes(_monQuery)) return false;
    }
    return true;
  }

  function _monSortedStudents() {
    // Adapter sorts by total_flag_count desc within campus already.
    // Re-sort defensively so filter narrowing stays correct.
    const arr = (DATA.students || []).filter(_matchesMonitoringFilters);
    return arr.slice().sort((a, b) => {
      const af = (a.flagged_subjects || []).length;
      const bf = (b.flagged_subjects || []).length;
      const aFlags = a.total_flag_count != null ? a.total_flag_count : af;
      const bFlags = b.total_flag_count != null ? b.total_flag_count : bf;
      return bFlags - aFlags;
    });
  }

  function _renderMonitoringCard(s) {
    const slug = s.id || s.slug || '';
    const flagged = s.flagged_subjects || [];
    const reason = (s.attention_reason || '').slice(0, 80);
    const subjRows = flagged.map(fs => {
      const tags = (fs.flags || []).map(t =>
        `<span class="monitoring-flag-tag">${_esc(t)}</span>`
      ).join('');
      return `
        <div class="monitoring-subject-row">
          <span class="monitoring-subject-name">${_esc(fs.subject || '')}</span>
          <span class="monitoring-subject-flags">${tags || '<span class="muted" style="font-size:10.5px;">—</span>'}</span>
          ${_monStatusSelect(slug, fs.subject || '', fs.default_status)}
        </div>
      `;
    }).join('');
    return `
      <div class="monitoring-card" data-slug="${_attr(slug)}">
        <div class="monitoring-card-header">
          <span class="monitoring-card-name" data-open-dd="${_attr(slug)}">${_esc(s.name)}</span>
          ${_levelPill(s.level)}
          <span class="muted" style="font-size:10.5px;">${_esc(s.campus || '')}${s.grade ? ' · G' + _esc(s.grade) : ''}</span>
        </div>
        ${reason ? `<div class="monitoring-card-attention">${_esc(reason)}</div>` : ''}
        ${subjRows || '<div class="muted" style="font-size:11px;padding:6px 0;">No flagged subjects.</div>'}
      </div>`;
  }

  function renderStudentsDir() {
    const list = $('#monitoring-list');
    if (!list) return;
    const filtered = _monSortedStudents();

    $('#students-count').textContent = filtered.length;
    const countEl = $('#monitoring-result-count');
    if (countEl) countEl.textContent = `${filtered.length} student${filtered.length === 1 ? '' : 's'}`;

    list.innerHTML = filtered.length
      ? filtered.map(_renderMonitoringCard).join('')
      : '<div class="monitoring-empty">No students match these filters.</div>';

    // Hero stats — campus-distributed counts
    const heroEl = $('#students-hero-stats');
    if (heroEl) {
      const byLvl = (DATA.students || []).reduce((a, s) => {
        const k = (s.level || 'OTHER').toUpperCase();
        a[k] = (a[k] || 0) + 1;
        return a;
      }, {});
      const totalFlagged = (DATA.students || []).filter(s => (s.flagged_subjects || []).length > 0).length;
      heroEl.innerHTML = `
        <div class="big-stat"><div class="v tnum">${DATA.students.length}</div><div class="k">Students</div></div>
        <div class="big-stat"><div class="v tnum">${totalFlagged}</div><div class="k warn">With flags</div></div>
        <div class="big-stat"><div class="v tnum">${byLvl.WL || 0}</div><div class="k">WL</div></div>
        <div class="big-stat"><div class="v tnum">${byLvl.MS || 0}</div><div class="k">MS</div></div>
      `;
    }

    // Wire level chips
    $$('#monitoring-level-filter .campus-level-chip').forEach(chip => {
      const lvl = chip.dataset.level;
      chip.classList.toggle('active', _monActiveLevels.has(lvl));
      chip.onclick = () => {
        if (_monActiveLevels.has(lvl)) _monActiveLevels.delete(lvl);
        else _monActiveLevels.add(lvl);
        if (_monActiveLevels.size === 0) _MONITORING_LEVELS.forEach(l => _monActiveLevels.add(l));
        chip.classList.toggle('active', _monActiveLevels.has(lvl));
        renderStudentsDir();
        updateURLHash('students');
      };
    });

    // Wire search
    const searchEl = $('#monitoring-search');
    if (searchEl) {
      if (searchEl.value !== _monQuery) searchEl.value = _monQuery;
      searchEl.oninput = () => {
        _monQuery = (searchEl.value || '').toLowerCase().trim();
        renderStudentsDir();
        updateURLHash('students');
      };
    }

    // Wire card name → DD
    $$('#monitoring-list [data-open-dd]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        const slug = el.dataset.openDd;
        if (slug) { DD_SLUG = slug; go('student-dd'); }
      };
    });

    // Wire status selects → localStorage
    $$('#monitoring-list .monitoring-status-select').forEach(sel => {
      sel.onchange = () => {
        const slug = sel.dataset.slug;
        const subject = sel.dataset.subject;
        _monSetStatus(slug, subject, sel.value);
        sel.dataset.status = sel.value;
      };
    });
  }

  // Public-name alias used by the router and verification grep.
  function renderMonitoringView() { return renderStudentsDir(); }

  // ==== GUIDES ====
  // Per-campus guides surface. Renders the "Guides" tab on the campus view.
  // Reads data.coaches.{roster,sessions,heatmap,weekly_summary,impact},
  // data.campuses[*].coaching_buckets, and student DD coaching_history.events
  // to determine which kids are assigned to each guide.
  // Coach-side records use full-name campus strings (e.g. "Alpha School
  // Brownsville") while campus.name uses short codes ("BTX"). The alias map
  // below normalizes both sides. Touch only this section + the campus-tab
  // dispatch above. Don't touch student DD code (Agent C territory).

  const _GUIDE_CAMPUS_ALIASES = {
    'btx':           ['BTX', 'Alpha School Brownsville', 'Brownsville'],
    'gt':            ['GT', 'GT School'],
    'miami':         ['Miami', 'Alpha School Miami'],
    'nova-bastrop':  ['Nova Bastrop', 'Nova Academy Bastrop', 'Bastrop'],
  };

  const _GUIDE_SUBJECTS = ['Math', 'Language', 'Reading', 'Science', 'Writing', 'Social Studies', 'Vocabulary', 'FastMath'];
  let _guideActiveSubjects = new Set(_GUIDE_SUBJECTS);
  let _guideExpandedName = null;

  function _guideCampusMatchesAlias(campus, value) {
    if (!campus || !value) return false;
    const aliases = _GUIDE_CAMPUS_ALIASES[campus.id] || [campus.name];
    const v = String(value).toLowerCase().trim();
    return aliases.some(a => String(a).toLowerCase().trim() === v
      || v.includes(String(a).toLowerCase().trim())
      || String(a).toLowerCase().trim().includes(v));
  }

  function _guidesForCampus(campus) {
    const roster = (DATA.coaches && DATA.coaches.roster) || [];
    return roster.filter(g => {
      if (!_guideCampusMatchesAlias(campus, g.campus)) return false;
      // DRI scoping (Agent D): also gate by viewer scope so non-master DRIs
      // never see guides from out-of-scope campuses if a routing edge case
      // surfaces them.
      if (typeof isGuideInScope === 'function' && !isGuideInScope(g)) return false;
      return true;
    });
  }

  function _guideHeatmapIndex() {
    const hm = (DATA.coaches && DATA.coaches.heatmap) || {};
    const coaches = hm.coaches || [];
    const dates = hm.dates || [];
    const cells = hm.cells || [];
    const index = {};
    coaches.forEach((name, i) => {
      index[name] = { row: cells[i] || [], dates };
    });
    return index;
  }

  function _guideSessionsThisWeek(name, hmIdx) {
    const entry = hmIdx[name];
    if (!entry || !entry.row || !entry.row.length) return 0;
    // Heatmap dates are sorted ascending; "this week" = last 7 dates.
    const N = entry.row.length;
    const start = Math.max(0, N - 7);
    let total = 0;
    for (let i = start; i < N; i++) total += Number(entry.row[i] || 0);
    return total;
  }

  function _guideStudentsAssigned(name, campus) {
    // Walk every student DD's coaching_history.events for matches on coach
    // name; collect distinct slugs whose campus matches.
    const dds = DATA.student_dds || {};
    const seen = new Map();
    Object.values(dds).forEach(dd => {
      if (!dd || !dd.coaching_history || !Array.isArray(dd.coaching_history.events)) return;
      const matches = dd.coaching_history.events.some(ev => {
        const cn = ev && (ev.coach_name || ev.coach);
        return cn && String(cn).toLowerCase() === String(name).toLowerCase();
      });
      if (!matches) return;
      const ident = dd.identity || {};
      const slug = dd.id || ident.slug || ident.id;
      const studentName = ident.name || dd.name || slug;
      const studentCampus = ident.campus || dd.campus;
      if (campus && studentCampus && !_guideCampusMatchesAlias(campus, studentCampus)) return;
      if (!seen.has(slug)) {
        const baseStudent = (DATA.students || []).find(s => (s.id === slug) || (s.slug === slug)) || {};
        seen.set(slug, {
          slug,
          name: studentName,
          level: ident.level || baseStudent.level || '',
          flag_count: (baseStudent.flagged_subjects || []).length,
        });
      }
    });
    return [...seen.values()];
  }

  function _guideRecentSessions(name, campus, limit) {
    const sessions = (DATA.coaches && DATA.coaches.sessions) || [];
    const filtered = sessions.filter(s => {
      const cn = s.coach_name || s.coach;
      if (!cn || String(cn).toLowerCase() !== String(name).toLowerCase()) return false;
      if (campus && s.campus && !_guideCampusMatchesAlias(campus, s.campus)) return false;
      const subj = s.subject || '';
      if (subj && !_guideActiveSubjects.has(subj)) return false;
      return true;
    });
    filtered.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    return filtered.slice(0, limit || 5);
  }

  function _guideOpenNeedsForCampus(campus, guideName) {
    // Pull rows from campus.coaching_buckets and tag with the bucket type.
    // Filter by subject filter (where the bucket row has a subject) and by
    // assignment-to-this-guide (kids who have coaching events with this guide).
    const buckets = (campus && campus.coaching_buckets) || {};
    const groups = [
      { key: 'pre_test',  label: 'Pre-test',  rows: buckets.pre_test || [] },
      { key: 'post_test', label: 'Post-test', rows: buckets.post_test || [] },
      { key: 'academic',  label: 'Academic',  rows: buckets.academic || [] },
    ];
    const assigned = new Set(_guideStudentsAssigned(guideName, campus).map(s => s.slug));
    const out = [];
    groups.forEach(g => {
      g.rows.forEach(r => {
        if (!assigned.has(r.slug)) return;
        const subj = r.subject || '';
        if (subj && !_guideActiveSubjects.has(subj)) return;
        out.push({
          slug: r.slug,
          name: r.name,
          level: r.level,
          subject: subj,
          need_type: g.label,
          reason: r.reason || '',
        });
      });
    });
    return out;
  }

  function _guideMasteryBadge(rate) {
    const v = Number(rate);
    if (Number.isNaN(v)) return `<span class="guide-mastery-badge muted">—</span>`;
    let cls = 'success';
    if (v < 60) cls = 'danger';
    else if (v < 75) cls = 'warn';
    return `<span class="guide-mastery-badge guide-mastery-${cls}">${v.toFixed(1)}%</span>`;
  }

  function _guideOutcomeBreakdown(name) {
    // Read from data.coaches.impact (sample_sessions outcomes) when available.
    const impact = (DATA.coaches && DATA.coaches.impact) || [];
    const row = impact.find(i => String(i.coach_name || '').toLowerCase() === String(name).toLowerCase());
    if (!row) return null;
    const samples = row.sample_sessions || [];
    let good = 0, mixed = 0, concerning = 0;
    samples.forEach(s => {
      const v = String(s.outcome || s.outcome_quality || '').toLowerCase();
      if (v === 'yes' || v === 'good') good++;
      else if (v === 'mixed' || v === 'partial') mixed++;
      else if (v === 'no' || v === 'concerning') concerning++;
    });
    const tot = good + mixed + concerning;
    return {
      good, mixed, concerning, total: tot,
      avg_mastery_delta: row.avg_mastery_delta_7d,
      n_sessions: row.n_sessions,
    };
  }

  function _guideAntipatternRollup(name, campus) {
    const sessions = _guideRecentSessions(name, campus, 25);
    const counts = {};
    sessions.forEach(s => {
      const p = s.pattern || s.skill || s.objective || '';
      if (!p) return;
      counts[p] = (counts[p] || 0) + 1;
    });
    const arr = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4);
    return arr;
  }

  function _renderGuideCard(guide, campus, hmIdx) {
    const sessionsThisWeek = _guideSessionsThisWeek(guide.name, hmIdx);
    const students = _guideStudentsAssigned(guide.name, campus);
    const needs = _guideOpenNeedsForCampus(campus, guide.name);
    const recent = _guideRecentSessions(guide.name, campus, 5);
    const isExpanded = _guideExpandedName === guide.name;

    const studentsSummary = students.length
      ? `<span class="guide-students-count">${students.length}</span> ${students.slice(0, 3).map(s => `<a class="guide-student-link" data-go="student-dd" data-student="${_attr(s.slug)}">${_esc(s.name)}</a>`).join(', ')}${students.length > 3 ? ` <span class="muted">+${students.length - 3}</span>` : ''}`
      : '<span class="muted">No students linked yet.</span>';

    const needsHtml = needs.length
      ? needs.map(n => `
          <div class="guide-need-row" data-go="student-dd" data-student="${_attr(n.slug)}">
            ${_levelPill(n.level)}
            <span class="guide-need-name">${_esc(n.name)}</span>
            <span class="guide-need-type">${_esc(n.need_type)}</span>
            ${n.reason ? `<span class="guide-need-reason">${_esc(n.reason)}</span>` : ''}
          </div>`).join('')
      : '<div class="muted guide-empty-mini">No open coaching needs for this guide.</div>';

    const sessionsHtml = recent.length
      ? recent.map(s => {
          const oq = (s.outcome_quality || s.mastery_outcome || '').toLowerCase();
          let oqCls = 'muted';
          if (oq === 'good' || oq === 'yes') oqCls = 'success';
          else if (oq === 'mixed' || oq === 'partial') oqCls = 'warn';
          else if (oq === 'concerning' || oq === 'no') oqCls = 'danger';
          const summary = (s.ai_summary || s.notes || s.objective || '').slice(0, 80);
          return `
            <div class="guide-session-row" data-go="student-dd" data-student="${_attr(s.student_slug || '')}">
              <span class="guide-session-date">${_esc(s.date || '—')}</span>
              <span class="guide-session-student">${_esc(s.student_name || s.student || '—')}</span>
              <span class="guide-session-subject mono">${_esc(s.subject || '—')}</span>
              <span class="guide-session-outcome ${oqCls}">${_esc(oq || '—')}</span>
              ${s.pattern ? `<span class="guide-session-pattern">${_esc(s.pattern)}</span>` : ''}
              ${summary ? `<span class="guide-session-summary muted">${_esc(summary)}</span>` : ''}
            </div>`;
        }).join('')
      : '<div class="muted guide-empty-mini">No recent sessions for this filter.</div>';

    let expandHtml = '';
    if (isExpanded) {
      const sortedStudents = students.slice().sort((a, b) => (b.flag_count || 0) - (a.flag_count || 0));
      const studentsList = sortedStudents.length
        ? sortedStudents.map(s => `
            <div class="guide-detail-student-row" data-go="student-dd" data-student="${_attr(s.slug)}">
              ${_levelPill(s.level)}
              <span>${_esc(s.name)}</span>
              <span class="muted">${s.flag_count || 0} flag${s.flag_count === 1 ? '' : 's'}</span>
            </div>`).join('')
        : '<div class="muted guide-empty-mini">No students assigned.</div>';

      const cadence = (hmIdx[guide.name] && hmIdx[guide.name].row) || [];
      const cadenceMax = cadence.reduce((m, v) => Math.max(m, Number(v) || 0), 0);
      const cadenceBars = cadence.slice(-30).map(v => {
        const n = Number(v) || 0;
        const h = cadenceMax ? Math.max(2, Math.round((n / cadenceMax) * 22)) : 2;
        return `<span class="guide-cadence-bar" style="height:${h}px;" title="${n} sessions"></span>`;
      }).join('');

      const breakdown = _guideOutcomeBreakdown(guide.name);
      const outcomeHtml = breakdown && breakdown.total
        ? `
          <span class="success">good ${Math.round(100 * breakdown.good / breakdown.total)}%</span>
          · <span class="warn">mixed ${Math.round(100 * breakdown.mixed / breakdown.total)}%</span>
          · <span class="danger">concerning ${Math.round(100 * breakdown.concerning / breakdown.total)}%</span>
          ${breakdown.avg_mastery_delta != null ? `<span class="muted"> · avg Δmastery 7d ${breakdown.avg_mastery_delta}</span>` : ''}`
        : '<span class="muted">No outcome-tagged sessions in window.</span>';

      const patterns = _guideAntipatternRollup(guide.name, campus);
      const patternsHtml = patterns.length
        ? patterns.map(([p, n]) => `<span class="guide-pattern-chip">${_esc(p)} <span class="muted">×${n}</span></span>`).join(' ')
        : '<span class="muted">No repeating patterns.</span>';

      expandHtml = `
        <div class="guide-detail-expand">
          <div class="guide-detail-section">
            <div class="guide-detail-title">All students assigned (${sortedStudents.length})</div>
            <div class="guide-detail-students-list">${studentsList}</div>
          </div>
          <div class="guide-detail-section">
            <div class="guide-detail-title">Coaching cadence (last 30 days)</div>
            <div class="guide-cadence-chart">${cadenceBars || '<span class="muted">No cadence data.</span>'}</div>
          </div>
          <div class="guide-detail-section">
            <div class="guide-detail-title">Outcome breakdown</div>
            <div class="guide-detail-outcomes">${outcomeHtml}</div>
          </div>
          <div class="guide-detail-section">
            <div class="guide-detail-title">Antipattern roll-up</div>
            <div class="guide-detail-patterns">${patternsHtml}</div>
          </div>
        </div>`;
    }

    return `
      <div class="guide-card${isExpanded ? ' expanded' : ''}" data-guide-name="${_attr(guide.name)}">
        <div class="guide-card-head">
          <div class="guide-card-name" data-guide-toggle="${_attr(guide.name)}">${_esc(guide.name)}</div>
          <span class="guide-top-subject mono">${_esc(guide.top_subject || '—')}</span>
          ${_guideMasteryBadge(guide.mastery_rate_pct)}
        </div>
        <div class="guide-card-stats">
          <div class="big-stat"><div class="v tnum">${guide.sessions_total ?? 0}</div><div class="k">Sessions total</div></div>
          <div class="big-stat"><div class="v tnum">${sessionsThisWeek}</div><div class="k">This week</div></div>
          <div class="big-stat"><div class="v tnum">${students.length}</div><div class="k">Students</div></div>
          <div class="big-stat"><div class="v tnum">${needs.length}</div><div class="k warn">Open needs</div></div>
        </div>
        <div class="guide-card-row">
          <div class="guide-card-row-label">Students</div>
          <div class="guide-students-list">${studentsSummary}</div>
        </div>
        <div class="guide-card-row">
          <div class="guide-card-row-label">Open needs</div>
          <div class="guide-needs-list">${needsHtml}</div>
        </div>
        <div class="guide-card-row">
          <div class="guide-card-row-label">Recent sessions</div>
          <div class="guide-sessions-list">${sessionsHtml}</div>
        </div>
        ${expandHtml}
      </div>`;
  }

  function _renderGuidesStatsStrip(campus, guides) {
    const stripEl = $('#guides-stats-strip');
    if (!stripEl) return;
    const hmIdx = _guideHeatmapIndex();
    const sessionsThisWeek = guides.reduce((sum, g) => sum + _guideSessionsThisWeek(g.name, hmIdx), 0);
    const masteryRates = guides.map(g => Number(g.mastery_rate_pct)).filter(v => !Number.isNaN(v));
    const avgMastery = masteryRates.length
      ? (masteryRates.reduce((a, b) => a + b, 0) / masteryRates.length)
      : null;
    const buckets = (campus && campus.coaching_buckets) || {};
    const kidsNeeding = (buckets.pre_test || []).length + (buckets.post_test || []).length + (buckets.academic || []).length;

    stripEl.innerHTML = `
      <div class="big-stat"><div class="v tnum">${guides.length}</div><div class="k">Guides at ${_esc(campus.name)}</div></div>
      <div class="big-stat"><div class="v tnum">${sessionsThisWeek}</div><div class="k">Sessions this week</div></div>
      <div class="big-stat"><div class="v tnum">${avgMastery != null ? avgMastery.toFixed(1) + '%' : '—'}</div><div class="k">Avg mastery rate</div></div>
      <div class="big-stat"><div class="v tnum">${kidsNeeding}</div><div class="k warn">Kids needing coaching</div></div>
    `;
  }

  function _renderGuidesSubjectFilter(campus) {
    const filtEl = $('#guide-subject-filter');
    if (!filtEl) return;
    filtEl.innerHTML = _GUIDE_SUBJECTS.map(s => `
      <span class="guide-subject-chip${_guideActiveSubjects.has(s) ? ' active' : ''}" data-subject="${_attr(s)}">${_esc(s)}</span>
    `).join('');
    $$('#guide-subject-filter .guide-subject-chip').forEach(chip => {
      chip.onclick = () => {
        const s = chip.dataset.subject;
        if (_guideActiveSubjects.has(s)) _guideActiveSubjects.delete(s);
        else _guideActiveSubjects.add(s);
        if (_guideActiveSubjects.size === 0) _GUIDE_SUBJECTS.forEach(x => _guideActiveSubjects.add(x));
        renderGuidesView(campus);
      };
    });
  }

  function renderGuidesView(campus) {
    if (!campus) {
      campus = (DATA.campuses || []).find(x => x.id === CURRENT_CAMPUS) || (DATA.campuses || [])[0];
    }
    if (!campus) return;
    const guides = _guidesForCampus(campus);
    // Filter by subject — match top_subject. If no top_subject set, keep guide.
    const filteredGuides = guides.filter(g => !g.top_subject || _guideActiveSubjects.has(g.top_subject));

    _renderGuidesStatsStrip(campus, filteredGuides);
    _renderGuidesSubjectFilter(campus);

    const listEl = $('#guides-list');
    if (!listEl) return;
    if (!filteredGuides.length) {
      listEl.innerHTML = '<div class="dd-empty">No guides match these filters at this campus.</div>';
      return;
    }
    const hmIdx = _guideHeatmapIndex();
    listEl.innerHTML = filteredGuides
      .slice()
      .sort((a, b) => (b.sessions_total || 0) - (a.sessions_total || 0))
      .map(g => _renderGuideCard(g, campus, hmIdx))
      .join('');

    // Wire expand toggle on guide name
    $$('#guides-list [data-guide-toggle]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        const name = el.dataset.guideToggle;
        _guideExpandedName = (_guideExpandedName === name) ? null : name;
        renderGuidesView(campus);
      };
    });
  }
  // ==== /GUIDES ====
  // ==== /CAMPUS + MONITORING ====

  // ==== STUDENT DD ==== (Agent C territory)
  // Subject-based deep-dive page. Tabs are now dynamic per-subject (Overview /
  // Math / Language / Reading / Science / Writing / Social Studies / Vocabulary
  // / FastMath), built from the kid's actual data. Don't touch
  // campus/monitoring code outside this section.
  // ---------- STUDENT DEEP DIVE ----------
  // Helpers (scoped to renderStudentDD)
  const _sevClass = (s) => {
    const v = (s || '').toLowerCase();
    if (v === 'critical') return 'crit';
    if (v === 'high') return 'high';
    if (v === 'med' || v === 'medium' || v === 'mid') return 'med';
    return '';
  };

  // Canonical list of subjects we support as tabs, in priority order. Each
  // entry maps the URL slug to the canonical subject name used in the data.
  const DD_SUBJECTS = [
    { slug: 'math',           name: 'Math',           label: 'Math',           emoji: '🔢' },
    { slug: 'language',       name: 'Language',       label: 'Language',       emoji: '🗣️' },
    { slug: 'reading',        name: 'Reading',        label: 'Reading',        emoji: '📖' },
    { slug: 'science',        name: 'Science',        label: 'Science',        emoji: '🔬' },
    { slug: 'writing',        name: 'Writing',        label: 'Writing',        emoji: '✍️' },
    { slug: 'social-studies', name: 'Social Studies', label: 'Social Studies', emoji: '🌍' },
    { slug: 'vocabulary',     name: 'Vocabulary',     label: 'Vocabulary',     emoji: '📚' },
    { slug: 'fastmath',       name: 'FastMath',       label: 'FastMath',       emoji: '⚡' },
  ];
  const DD_LEGACY_TABS = ['ai-dd', 'findings', 'activity', 'tests', 'coaching', 'map', 'subjects', 'notes'];
  const DD_SUBJECT_BY_SLUG = {};
  const DD_SUBJECT_BY_NAME = {};
  DD_SUBJECTS.forEach(s => {
    DD_SUBJECT_BY_SLUG[s.slug] = s;
    DD_SUBJECT_BY_NAME[s.name.toLowerCase()] = s;
  });

  // Decide whether a kid has any data for a subject — checks
  // subject_breakdown, test_history.tests, lesson_log, coaching_history.
  function _ddSubjectHasData(dd, subjectName) {
    if (!dd || !subjectName) return false;
    const lc = subjectName.toLowerCase();
    const sb = (dd.subject_breakdown || []).some(s => (s.subject || '').toLowerCase() === lc);
    if (sb) return true;
    const th = (dd.test_history || {}).tests || [];
    if (th.some(t => (t.subject || '').toLowerCase().startsWith(lc))) return true;
    const ll = (dd.lesson_log || {}).by_date || {};
    for (const d of Object.keys(ll)) {
      const entry = ll[d];
      const list = Array.isArray(entry) ? entry : (entry && entry.entries) || [];
      if (list.some(e => (e.subject || '').toLowerCase() === lc)) return true;
    }
    const ch = (dd.coaching_history || {}).events || [];
    if (ch.some(e => (e.subject || '').toLowerCase() === lc)) return true;
    return false;
  }

  // Compute current active subject slug from DD_SUBJECT_SLUG (set by router)
  // or default to 'overview'.
  let DD_SUBJECT_SLUG = 'overview';

  function renderStudentDD() {
    // Prefer a specific kid via DD_SLUG, falling back to the default deep-dive kid.
    const byId = (DATA.student_dds || {});
    const fallbackSlug = DATA.default_dd_slug || Object.keys(byId)[0];
    const dd = (DD_SLUG && byId[DD_SLUG]) || (fallbackSlug && byId[fallbackSlug]);
    if (!dd || !dd.identity) return;
    const id = dd.identity;
    const stats = dd.stats || {};
    const ct = dd.contact || {};

    // ── 0. Identity rail (sticky left) — mastery % intentionally omitted ─
    const initials = (id.name || id.full_name || 'S')
      .split(/\s+/).filter(Boolean).slice(0, 2)
      .map(p => p[0].toUpperCase()).join('');
    const tierLabel = tier(id.tier || 'active');
    const railEmail = ct.email || id.email;
    const railPhone = ct.phone || id.phone;
    const guardianList = (ct.guardians || []).filter(g => g && (g.name || g.email)).slice(0, 5);
    const lc = dd.last_coaching;
    // Identity rail — vitals strip (no mastery %)
    const _railVel = stats.mastery_velocity_4wk;
    const _railDoom = stats.doom_loop_count;
    const _railXp = stats.weekly_xp_avg;
    const _doomCls = _railDoom == null ? 'mute' : (_railDoom >= 3 ? 'bad' : _railDoom >= 1 ? 'warn' : 'good');
    const _velCls = _railVel == null ? 'mute' : (_railVel <= 0 ? 'bad' : _railVel < 1 ? 'warn' : 'good');
    const _xpCls = _railXp == null ? 'mute' : (_railXp < 250 ? 'bad' : _railXp < 500 ? 'warn' : 'good');
    const _railSignals = `
      <div class="dd-rail-signals" title="This week — Doom / Velocity Δ / Weekly XP">
        <div class="dd-rail-signal ${_doomCls}"><div class="v">${_railDoom ?? 0}</div><div class="k">Doom</div></div>
        <div class="dd-rail-signal ${_velCls}"><div class="v">${_railVel != null ? (_railVel > 0 ? '+' : '') + _railVel : '—'}</div><div class="k">Vel Δ</div></div>
        <div class="dd-rail-signal ${_xpCls}"><div class="v">${_railXp != null ? Math.round(_railXp) : '—'}</div><div class="k">Wk XP</div></div>
      </div>
    `;

    $('#dd-identity-rail').innerHTML = `
      <div class="dd-rail-photo">${_esc(initials)}</div>
      <div class="dd-rail-name">${_esc(id.name || id.full_name || 'Student')}</div>
      <div class="dd-rail-meta">${_esc(id.campus || '—')} · Grade ${_esc(id.grade) || '—'}${id.coach ? ' · Coach ' + _esc(id.coach) : ''}</div>
      <div class="dd-rail-tier">${tierLabel}</div>
      ${_renderBrainPolicyPill(dd)}
      ${_railSignals}
      ${railEmail ? `<div class="dd-rail-row"><span class="k">Email</span><a class="v" href="mailto:${_esc(railEmail)}">${_esc(railEmail)}</a></div>` : ''}
      ${railPhone ? `<div class="dd-rail-row"><span class="k">Phone</span><a class="v" href="tel:${_esc(railPhone)}">${_esc(railPhone)}</a></div>` : ''}
      ${guardianList.length ? `
        <div class="dd-rail-section">
          <div class="dd-rail-label">Guardians</div>
          ${guardianList.map(g => `
            <div class="dd-rail-guardian">
              <div class="dd-rail-guardian-name">${_esc(g.name || '—')}${g.role ? ` <span class="dd-rail-guardian-role">${_esc(g.role)}</span>` : ''}</div>
              ${g.email ? `<a class="dd-rail-guardian-email" href="mailto:${_esc(g.email)}">${_esc(g.email)}</a>` : ''}
            </div>
          `).join('')}
        </div>
      ` : ''}
      <div class="dd-rail-section">
        <div class="dd-rail-row"><span class="k">Last coaching</span><span class="v">${lc && lc.date ? _esc(lc.date) : '—'}</span></div>
      </div>
    `;

    // ── 1. Bulleted summary hero ─────────────────────────────────────────
    // Inline bullet renderer — the student-DD-redesign agent stopped before
    // writing renderDDSummaryBullets. Render top issues + actions inline so
    // the page has real content while the full subject-tab view ships.
    (function renderSummaryBulletsInline() {
      const ul = document.getElementById('dd-summary-bullets');
      if (!ul) return;
      const ident = dd.identity || {};
      const f0 = (dd.findings || [])[0] || {};
      const cn = dd.coaching_need || {};
      const eng = (dd.engagement_diagnosis || {}).overall || {};
      const tests = (dd.test_history || {}).tests || [];
      const doom = tests.filter(t => t.doom_loop || ((t.n_attempts || 0) >= 3 && !t.passed));
      const enrich = dd.brain_enrichment || {};
      const polV = (enrich.policy_violations || []).length;
      const recent = (dd.recent_passes || []).length;
      const flagged = (dd.flagged_subjects || []).map(fs => fs.subject).filter(Boolean);
      const items = [];
      if (ident.tier && ident.tier !== 'active') items.push(`<li><b>Tier:</b> ${_esc(ident.tier)}</li>`);
      if (ident.level) items.push(`<li><b>Level:</b> ${_esc(ident.level)}</li>`);
      if (doom.length) items.push(`<li>🚨 <b>${doom.length} doom loop${doom.length === 1 ? '' : 's'}</b> — tests with 3+ failed attempts</li>`);
      if (polV) items.push(`<li>📜 <b>${polV} policy violation${polV === 1 ? '' : 's'}</b></li>`);
      if (eng.label && eng.label !== 'on_track') items.push(`<li>🔍 <b>Engagement:</b> ${_esc(eng.label)}${eng.severity ? ' (' + _esc(eng.severity) + ')' : ''}</li>`);
      if (cn.post_test) items.push(`<li>📞 <b>Post-test coaching gap</b> — failed recently, no coaching since</li>`);
      if (cn.pre_test) items.push(`<li>🎯 <b>Pre-test coaching needed</b></li>`);
      if (flagged.length) items.push(`<li>🚩 <b>Flagged subjects:</b> ${flagged.slice(0, 5).map(_esc).join(', ')}${flagged.length > 5 ? ` +${flagged.length - 5}` : ''}</li>`);
      if (recent) items.push(`<li>✅ <b>${recent} recent pass${recent === 1 ? '' : 'es'}</b> in last 14 days</li>`);
      if (f0.title) items.push(`<li><b>Top issue:</b> ${_esc(f0.title)}</li>`);
      ul.innerHTML = items.length ? items.join('') : '<li class="muted">No urgent flags · monitoring</li>';
    })();

    // Early-exit guard: the legacy renderStudentDD body below writes to
    // element IDs (#dd-findings, #dd-actions, etc.) that the redesigned
    // body.html no longer exposes. Skip the rest cleanly so the view
    // switches and the identity rail + summary bullets render. The full
    // subject-based deep-dive ships in the next iteration.
    if (!document.getElementById('dd-findings')) return;

    // ── 2. Findings — packed cards (risk badge + action chip + escalate chip inline)
    // Index escalations / l9_actions by subject so we can fold them into matching findings.
    const findings = dd.findings || [];
    const l9acts = dd.l9_actions || [];
    const escStrings = dd.escalations || [];
    const buckets = dd.action_plan_buckets || { this_week: [], this_month: [], watch: [] };
    const flags = dd.risk_flags || [];

    // Build a lookup of escalations keyed by subject (lowercased) and an "overall" pool.
    const escBySubject = {};
    const escOverall = [];
    l9acts.forEach(a => {
      const s = (a.subject || '').toLowerCase();
      if (s && s !== 'overall') (escBySubject[s] = escBySubject[s] || []).push(a);
      else escOverall.push(a);
    });

    // Build a lookup of action items by subject-kw match. Action items are flat strings or
    // objects; we only attach those that mention a finding's subject keyword.
    const allActions = [
      ...(buckets.this_week || []).map(a => ({ ...(typeof a === 'string' ? { title: a } : a), bucket: 'this_week' })),
      ...(buckets.this_month || []).map(a => ({ ...(typeof a === 'string' ? { title: a } : a), bucket: 'this_month' })),
    ];

    // Pair risk_flags onto findings whose module/subject matches the flag kind text. Also keep
    // an "overall" pool for findings without a matching subject.
    const flagsBySubject = {};
    const flagsOverall = [];
    flags.forEach(f => {
      const text = (f.kind + ' ' + (f.detail || '')).toLowerCase();
      let placed = false;
      ['math', 'reading', 'language', 'science', 'social'].forEach(s => {
        if (text.includes(s)) { (flagsBySubject[s] = flagsBySubject[s] || []).push(f); placed = true; }
      });
      if (!placed) flagsOverall.push(f);
    });
    let flagsOverallCursor = 0;
    let escOverallCursor = 0;

    // Build a lookup of action statuses keyed by action_id (read from dd.actions[]
    // which the adapter populates from actions/<slug>.json + initial defaults).
    // Phase 3 will swap localStorage for a real API. For now, localStorage overrides
    // adapter-loaded status so a Guide's clicks stick across reloads on the same device.
    const ddSlug = dd.id;
    const _actionLocalKey = (actionId) => `dd-action:${actionId}`;
    const _readActionStatus = (actionId, fallback) => localStorage.getItem(_actionLocalKey(actionId)) || fallback || 'open';
    const ddActionsById = {};
    (dd.actions || []).forEach(a => { if (a && a.id) ddActionsById[a.id] = a; });
    // Engagement diagnosis lookup for prepending a chip on each finding card
    const findingsEngBySubj = ((dd.engagement_diagnosis || {}).by_subject) || {};

    $('#dd-findings').innerHTML = findings.length
      ? findings.map((f, idx) => {
          const sev = _sevClass(f.severity);
          const subj = (f.subject || '').toLowerCase();
          const actionId = `${ddSlug}:finding:${idx}`;
          const adapterAction = ddActionsById[actionId] || {};
          const actionStatus = _readActionStatus(actionId, adapterAction.status);

          // Inline risk badges: prefer subject-matched flags; otherwise pull from "overall" pool.
          let inlineFlags = [];
          if (subj && subj !== 'overall' && flagsBySubject[subj] && flagsBySubject[subj].length) {
            inlineFlags = flagsBySubject[subj].splice(0, 2);
          } else if (flagsOverallCursor < flagsOverall.length) {
            inlineFlags = [flagsOverall[flagsOverallCursor++]];
          }
          const riskBadgeHTML = inlineFlags.map(rf => {
            const cls = rf.severity === 'high' ? 'crit' : rf.severity === 'med' ? 'high' : 'med';
            return `<span class="dd-risk-badge ${cls}" title="${_esc(rf.detail || '')}">${_esc(rf.kind || 'risk')}</span>`;
          }).join('');

          // Inline action chip: pick first matching this_week action by subject keyword, otherwise
          // attach to the first finding only (so we don't repeat).
          let inlineAction = null;
          for (let i = 0; i < allActions.length; i++) {
            const a = allActions[i];
            const txt = ((a.title || '') + ' ' + (a.action || '') + ' ' + (a.rationale || a.why || '')).toLowerCase();
            if (subj && subj !== 'overall' && txt.includes(subj)) {
              inlineAction = a; allActions.splice(i, 1); break;
            }
          }
          if (!inlineAction && idx === 0 && allActions.length) {
            inlineAction = allActions.shift();
          }
          const actionChip = inlineAction
            ? `<div class="dd-finding-action"><span class="dd-finding-action-label">${_esc((inlineAction.bucket || 'this_week').replace('_', ' '))}</span> ${_esc(inlineAction.title || inlineAction.action || '')}${(inlineAction.owner || inlineAction.owner_name) ? ` <span class="dd-finding-action-owner">· ${_esc(inlineAction.owner || inlineAction.owner_name)}</span>` : ''}</div>`
            : '';

          // Inline escalation chip: prefer subject match, fall back to overall queue.
          let escMatch = null;
          if (subj && subj !== 'overall' && escBySubject[subj] && escBySubject[subj].length) {
            escMatch = escBySubject[subj].shift();
          } else if (escOverallCursor < escOverall.length) {
            escMatch = escOverall[escOverallCursor++];
          }
          let escChip = '';
          if (escMatch) {
            const driName = escMatch.owner_name || f.owner_specific || f.owner || 'DRI';
            const mailto = escMatch.mailto || '';
            escChip = mailto
              ? `<a class="esc-chip" href="${_esc(mailto)}" target="_blank">✉ Escalate to ${_esc(driName)}</a>`
              : `<button class="esc-chip" type="button" data-esc-title="${_esc(escMatch.title || '')}">✉ Escalate to ${_esc(driName)}</button>`;
          } else if (escStrings.length && idx === 0) {
            // Last-resort: show one plain-string escalation on the first finding.
            const e = escStrings[0];
            escChip = `<span class="esc-chip esc-chip-static">⚑ ${_esc(typeof e === 'string' ? e : (e.title || ''))}</span>`;
          }

          // DRI name on chip
          const driName = f.owner_specific || f.owner;

          // ── Parse f.evidence prose into compact mini-stat pills ──────────
          // Patterns: "9 fails", "83% latest", "65d since", "RIT 198", "5 attempts",
          // "2/12 mastered", "level 7", "G3.2", "since 2024-08-12"
          const evidenceText = f.evidence || '';
          const pills = [];
          const seen = new Set();
          const pushPill = (label) => {
            if (!label) return;
            const k = label.toLowerCase();
            if (seen.has(k)) return;
            seen.add(k);
            pills.push(label);
          };
          const pillPatterns = [
            { re: /(\d+)\s*fail(?:s|ed|ing)?/i,                 fmt: m => `${m[1]} fails` },
            { re: /(\d+)\s*pass(?:es|ed)?/i,                    fmt: m => `${m[1]} passes` },
            { re: /(\d+)%\s*(latest|recent|current|last)/i,     fmt: m => `${m[1]}% ${m[2].toLowerCase()}` },
            { re: /(\d+)%\s*(?:on|in|across)?\s*(?:last|recent|past)\s*(\d+)/i, fmt: m => `${m[1]}% last ${m[2]}` },
            { re: /(\d+)%\s*(?:mastery|correct|accuracy|score)/i, fmt: m => `${m[1]}% mastery` },
            { re: /(\d+)\s*d(?:ays?)?\s*(?:since|stuck|stalled|without)/i, fmt: m => `${m[1]}d stuck` },
            { re: /(\d+)\s*attempt/i,                           fmt: m => `${m[1]} attempts` },
            { re: /\bRIT\s*(\d{2,3})/i,                         fmt: m => `RIT ${m[1]}` },
            { re: /(\d+)\s*\/\s*(\d+)\s*(?:mastered|passed|complete)?/i, fmt: m => `${m[1]}/${m[2]}` },
            { re: /\blevel\s*(\d+)/i,                           fmt: m => `lvl ${m[1]}` },
            { re: /\bG\s*(\d+(?:\.\d+)?)/,                      fmt: m => `G${m[1]}` },
            { re: /(\d+)\s*(?:doom|loop)/i,                     fmt: m => `${m[1]} doom` },
            { re: /(\d+)\s*streak/i,                            fmt: m => `${m[1]} streak` },
          ];
          pillPatterns.forEach(p => {
            const m = evidenceText.match(p.re);
            if (m) pushPill(p.fmt(m));
          });

          // Engagement chip prepended to pills row when this finding has a subject
          // with a classified label. Severity drives color (critical | warn | ok).
          let engPillHTML = '';
          const findingEng = (f.subject && f.subject !== 'overall') ? findingsEngBySubj[f.subject] : null;
          if (findingEng && findingEng.label) {
            const lbl = String(findingEng.label).replace(/_/g, ' ').toUpperCase();
            engPillHTML = `<span class="dd-finding-pill dd-eng-pill dd-eng-${_esc(findingEng.severity || 'warn')}" title="${_esc(findingEng.rationale || '')}">[${_esc(lbl)}]</span>`;
          }

          let pillsHTML = '';
          if (pills.length || engPillHTML) {
            pillsHTML = `<div class="dd-finding-pills">${engPillHTML}${pills.slice(0, 4).map(p => `<span class="dd-finding-pill">${_esc(p)}</span>`).join('')}</div>`;
          } else if (evidenceText) {
            // Fallback: truncate evidence at 80 chars
            const trunc = evidenceText.length > 80 ? evidenceText.slice(0, 80).trimEnd() + '…' : evidenceText;
            pillsHTML = `<div class="dd-finding-pills"><span class="dd-finding-pill dd-finding-pill-text">${_esc(trunc)}</span></div>`;
          }

          // ── Single-line action row ───────────────────────────────────────
          const recText = inlineAction
            ? (inlineAction.title || inlineAction.action || '')
            : (f.recommendation || f.action || '');
          const recOwner = inlineAction
            ? (inlineAction.owner || inlineAction.owner_name || driName || '')
            : driName || '';
          const actionRowHTML = recText
            ? `<div class="dd-finding-actionrow"><span class="dd-finding-arrow">→</span> ${_esc(recText)}${recOwner ? ` <span class="dd-finding-actionrow-owner">· ${_esc(recOwner)}</span>` : ''}</div>`
            : '';

          // ── Escalate button (mailto if available) ────────────────────────
          let escalateBtn = '';
          if (escMatch) {
            const escDri = escMatch.owner_name || driName || 'DRI';
            const mailto = escMatch.mailto || '';
            escalateBtn = mailto
              ? `<a class="dd-action-btn btn-escalate" href="${_esc(mailto)}" target="_blank" title="Email ${_esc(escDri)}">✉ Escalate to ${_esc(escDri)}</a>`
              : `<button class="dd-action-btn btn-escalate" type="button" data-esc-title="${_esc(escMatch.title || '')}" title="Escalate to ${_esc(escDri)}">✉ Escalate to ${_esc(escDri)}</button>`;
          } else if (driName) {
            escalateBtn = `<button class="dd-action-btn btn-escalate" type="button" title="Escalate to ${_esc(driName)}">✉ Escalate to ${_esc(driName)}</button>`;
          }

          const actionButtonsHTML = `
            <div class="dd-action-buttons">
              <button class="dd-action-btn btn-done" data-action-id="${_esc(actionId)}" data-action-status="done" title="Mark this action as handled — brain will deprioritize it next refresh">✓ Done</button>
              <button class="dd-action-btn btn-wrong" data-action-id="${_esc(actionId)}" data-action-status="wrong" title="AI got this wrong — flag for review by Tripti">✗ Wrong</button>
              <button class="dd-action-btn btn-snooze" data-action-id="${_esc(actionId)}" data-action-status="snoozed" title="Defer for a week — re-surface in 7 days">⏰ Snooze</button>
              ${escalateBtn}
            </div>
          `;

          // Compact heading: subject pill · category · severity tag (one line)
          const subjectPill = (f.subject && f.subject !== 'overall')
            ? `<span class="dd-finding-subject-pill">${_esc(f.subject)}</span>`
            : '';
          const categoryLabel = (f.module || f.category || '').toUpperCase();
          const sevTag = f.severity
            ? `<span class="dd-finding-sev">${_esc(f.severity)}</span>`
            : '';

          return `
            <div class="dd-finding dd-finding-card dd-finding-compact status-${_esc(actionStatus)} ${sev}" data-action-id="${_esc(actionId)}" data-finding-id="${_esc(actionId)}">
              <div class="dd-finding-head dd-finding-head-compact">
                <div class="dd-finding-head-left">
                  ${subjectPill}
                  ${categoryLabel ? `<span class="dd-finding-tag">${_esc(categoryLabel)}</span>` : ''}
                </div>
                <div class="dd-finding-badges">
                  ${riskBadgeHTML}
                  ${sevTag}
                </div>
              </div>
              <div class="dd-finding-title">${_esc(f.title || '')}</div>
              ${pillsHTML}
              ${actionRowHTML}
              ${actionButtonsHTML}
              <a class="dd-finding-detail-link" href="#ai-dd" data-finding-id="${_esc(actionId)}">View detail →</a>
            </div>
          `;
        }).join('')
      : '<div class="dd-empty">No findings.</div>';

    // Wire Mark Done / Wrong / Snooze button handlers (delegated)
    document.querySelectorAll('#dd-findings .dd-action-btn').forEach(btn => {
      btn.onclick = (e) => {
        const aid = btn.dataset.actionId;
        const status = btn.dataset.actionStatus;
        if (!aid || !status) return;
        // Optimistic UI update — Phase 3 will POST to API; for now localStorage
        localStorage.setItem(_actionLocalKey(aid), status);
        const card = btn.closest('.dd-finding-card');
        if (card) {
          card.classList.remove('status-open', 'status-done', 'status-wrong', 'status-snoozed');
          card.classList.add('status-' + status);
        }
        // Tiny toast feedback
        const original = btn.textContent;
        btn.textContent = status === 'done' ? '✓ Marked done' : status === 'wrong' ? '✗ Flagged' : '⏰ Snoozed';
        setTimeout(() => { btn.textContent = original; }, 1500);
      };
    });

    // Wire "View detail" links — switch to AI DD tab and scroll to matching finding.
    // The AI DD tab renderer (separate agent) is responsible for placing
    // matching `data-finding-id` anchors inside its panel content.
    document.querySelectorAll('#dd-findings .dd-finding-detail-link').forEach(link => {
      link.onclick = (e) => {
        e.preventDefault();
        const fid = link.dataset.findingId;
        const aiTab = document.querySelector('.dd-tab[data-dd-tab="ai-dd"]');
        if (aiTab) aiTab.click();
        // Scroll to matching anchor inside AI DD panel after the tab swap
        setTimeout(() => {
          const target = document.querySelector(`.dd-tab-panel[data-dd-panel="ai-dd"] [data-finding-id="${fid}"]`);
          if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      };
    });

    // ── 3. Subjects scorecard (with risk badge if doom>0) ────────────────
    const subjects = dd.subject_breakdown || [];
    const engBySubj = ((dd.engagement_diagnosis || {}).by_subject) || {};
    window.__handoffs = window.__handoffs || {};
    $('#dd-subjects').innerHTML = subjects.length ? subjects.map((s, idx) => {
      const passPct = s.pass_rate != null ? Math.round(s.pass_rate) : null;
      const passClass = passPct != null ? (passPct < 40 ? 'danger' : passPct < 70 ? 'warn' : 'good') : '';
      const masteryBar = passPct != null ? `<span class="mbar ${passClass}"><span style="width:${Math.max(0, Math.min(100, passPct))}%"></span></span>` : '';
      const gap = s.age_gap;
      const gapLabel = gap != null ? (gap < 0 ? `${gap}y below age` : gap > 0 ? `+${gap}y above age` : 'on-age') : null;

      const riskBadge = s.doom_loops > 0
        ? `<span class="dd-subject-pill doom">${_esc(s.doom_loops)} doom</span>`
        : s.out_of_content
        ? `<span class="dd-subject-pill" style="color:var(--warn);" title="pct_complete ≥ 95% — needs new content">out of content</span>`
        : s.tested_out
        ? `<span class="dd-subject-pill" style="color:var(--success);">tested out</span>`
        : s.ceiling
        ? `<span class="dd-subject-pill ceiling">ceiling</span>`
        : '';

      let handoffBtn = '';
      if (s.dri_handoff) {
        const key = `${dd.id || 'kid'}__${idx}`;
        window.__handoffs[key] = s.dri_handoff;
        handoffBtn = `<div class="dd-subject-handoff"><button class="copy-handoff" data-handoff-key="${_esc(key)}">⎘ Copy DRI handoff</button></div>`;
      }

      // Engagement diagnosis chip — WHY they're stuck (not just THAT they are).
      // Tooltip shows the rationale with actual numbers cited.
      const eng = engBySubj[s.subject];
      let engChip = '';
      if (eng && eng.label) {
        const labelText = String(eng.label).replace(/_/g, ' ').toUpperCase();
        engChip = `<span class="dd-eng-chip dd-eng-${_esc(eng.severity || 'warn')} dd-eng-${_esc(eng.label)}" title="${_esc(eng.rationale || '')}">${_esc(labelText)}</span>`;
      }

      // AI per-subject diagnostic — surfaces summary, weakest concepts,
      // pattern_label chip, and a one-click "next step" call-out from the
      // aggregator_reason_student_subject.py output.
      let aiBlock = '';
      const air = s.ai_subject_report;
      if (air && (air.summary || (air.weakest_concepts || []).length)) {
        const wc = (air.weakest_concepts || []).map(c =>
          `<li><b>${_esc(c.concept || '')}</b><div class="dd-ai-evidence">${_esc(c.evidence || '')}</div></li>`
        ).join('');
        const patternChip = air.pattern_label
          ? `<span class="dd-ai-pattern-chip dd-ai-pattern-${_esc(String(air.pattern_label).toLowerCase())}">${_esc(String(air.pattern_label).replace(/-/g, ' '))}</span>`
          : '';
        const confChip = air.confidence
          ? `<span class="dd-ai-conf-chip dd-ai-conf-${_esc(String(air.confidence).toLowerCase())}">${_esc(air.confidence)} confidence</span>`
          : '';
        const stats = [
          air.n_tests != null ? `${air.n_tests} tests` : null,
          air.n_wrong_questions != null ? `${air.n_wrong_questions} wrong Qs` : null,
        ].filter(Boolean).join(' · ');
        aiBlock = `
          <div class="dd-block dd-block-ai-subject">
            <div class="dd-ai-subject-head">
              <span class="dd-ai-subject-eyebrow">AI diagnostic${stats ? ' · ' + _esc(stats) : ''}</span>
              ${patternChip}
              ${confChip}
            </div>
            ${air.summary ? `<blockquote class="dd-ai-subject-summary">${_esc(air.summary)}</blockquote>` : ''}
            ${wc ? `<div class="dd-ai-subject-section-title">Weakest concepts</div><ul class="dd-ai-subject-concepts">${wc}</ul>` : ''}
            ${air.recommended_next_step ? `<div class="dd-ai-subject-next-step"><span class="dd-ai-subject-next-step-label">Next step</span><div class="dd-ai-subject-next-step-body">${_esc(air.recommended_next_step)}</div></div>` : ''}
          </div>
        `;
      }

      // Brain DRI line — pulled from brain knowledge.db via build_ui_kit_data
      // (subject_by_grade_subject lookup). Falls back to s.dri_name if the
      // brain join didn't resolve. Faint mono so it doesn't compete with
      // the diagnostic content below it.
      const brainSubjDri = (((_brainEnrich(dd).subject_dri_lookup) || {})[s.subject]) || null;
      const subjDriName = (brainSubjDri && brainSubjDri.dri_name) || s.dri_name || '';
      const subjDriEmail = (brainSubjDri && brainSubjDri.dri_email) || s.dri_email || '';
      const driLine = subjDriName
        ? `<div class="dd-brain-dri dd-brain-dri-subject" title="${_attr((brainSubjDri && brainSubjDri.subject_doc) ? 'Brain doc: ' + brainSubjDri.subject_doc : '')}">DRI · ${_esc(subjDriName)}${subjDriEmail ? ` · <a href="mailto:${_attr(subjDriEmail)}">${_esc(subjDriEmail)}</a>` : ''}</div>`
        : '';

      return `
        <div class="dd-subject">
          <div class="dd-subject-head">
            <div class="dd-subject-name">${_esc(s.subject)}</div>
            ${engChip}
            ${riskBadge}
          </div>
          ${driLine}
          <div class="dd-subject-row"><span class="k">Mastery</span><span class="v ${passClass}">${passPct != null ? passPct + '%' : '—'}${masteryBar}</span></div>
          ${s.map_rit != null ? `<div class="dd-subject-row"><span class="k">MAP RIT</span><span class="v">${_esc(s.map_rit)} (G${_esc(s.map_grade) || '—'})${gapLabel ? ' · ' + _esc(gapLabel) : ''}</span></div>` : ''}
          ${s.dri_name ? `<div class="dd-subject-row"><span class="k">DRI</span><span class="v">${_esc(s.dri_name)}</span></div>` : ''}
          ${handoffBtn}
          ${aiBlock}
        </div>
      `;
    }).join('') : '<div class="dd-empty">No subjects.</div>';

    // ── 4. Guide notes — localStorage-backed annotation slot per kid ─────
    const notesEl = document.getElementById('dd-guide-notes');
    const statusEl = document.getElementById('dd-guide-notes-status');
    if (notesEl) {
      const key = `guide-notes:${dd.id}`;
      const saved = localStorage.getItem(key) || '';
      notesEl.value = saved;
      if (statusEl) statusEl.textContent = saved ? `Saved locally · ${saved.length} chars` : 'Type to save locally (no backend yet — clears with browser).';
      const handler = () => {
        localStorage.setItem(key, notesEl.value);
        if (statusEl) statusEl.textContent = `Saved locally · ${notesEl.value.length} chars · ${new Date().toLocaleTimeString()}`;
      };
      notesEl.oninput = handler;
    }

    // ── 5. Render the AI deep dive tab + 4 other tab panels ──────────────
    renderAIDD(dd);
    renderActivityTab(dd);
    renderTestsTab(dd);
    renderCoachingTab(dd);
    renderMapTab(dd);

    // ── 6. Wire tab switching (AI deep dive is default-active) ───────────
    setupDDTabs();

    // ── 7. Update tab counts (derived from data) ─────────────────────────
    const tc = (dd.coaching_history || {}).event_count || 0;
    const tt = ((window.DATA?.tests?.library) || []).length;
    document.getElementById('dd-tab-count-findings').textContent = (dd.findings || []).length || '';
    document.getElementById('dd-tab-count-tests').textContent = tt || '';
    document.getElementById('dd-tab-count-coaching').textContent = tc || '';

    // ── 8. Wire top-level action bar buttons ─────────────────────────────
    setupDDActionBar(dd);

    // ── 9. Inject "Flag wrong data" buttons in every section header ──────
    injectDDFlagButtons(dd);
  }

  // Build a compact 1-2 line summary of what's currently shown in each
  // section so the email body has context. Kept defensive — every field
  // is optional and we fall back to "(see dashboard)" when empty.
  function _ddSectionSummaries(dd) {
    const id = dd.identity || {};
    const stats = dd.stats || {};
    const ch = dd.coaching_history || {};
    const at = dd.activity_timeline || {};
    const th = dd.test_history || {};
    const map = dd.map_targets || {};
    const subjects = dd.subject_breakdown || [];
    const findings = dd.findings || [];
    const wd = dd.worst_doom || {};

    const masteryStr = stats.overall_pass_rate_pct != null
      ? `${Math.round(stats.overall_pass_rate_pct)}%` : '—';
    const doomStr = stats.doom_loop_count != null ? stats.doom_loop_count : 0;
    const velStr = stats.mastery_velocity_4wk != null
      ? (stats.mastery_velocity_4wk > 0 ? '+' : '') + stats.mastery_velocity_4wk : '—';
    const xpStr = stats.weekly_xp_avg != null ? Math.round(stats.weekly_xp_avg) : '—';

    const tests = th.tests || [];
    const doomLoops = th.doom_loops || [];
    const wrongQs = (dd.question_patterns || {}).top_missed || [];
    const wrongPicks = ((dd.alphatest_picks || {}).by_test_slug) || {};

    return {
      identity: `${id.name || '—'} · ${id.campus || '—'} · Grade ${id.grade ?? '—'} · Tier ${id.tier || '—'} · Coach ${id.coach || '—'}`,
      hero: `Mastery ${masteryStr} · Doom ${doomStr} · Velocity 4wk ${velStr} · Weekly XP ${xpStr}`,
      tldr: (dd.narrative || '').split(/(?<=[.!?])\s+/)[0] || '(no narrative)',
      aiDD: `AI DD packet · narrative=${(dd.narrative || '').length} chars · findings=${findings.length} · escalations=${(dd.escalations || []).length}`,
      findings: findings.length
        ? `${findings.length} findings; top: "${(findings[0] && findings[0].title) || '—'}" (${(findings[0] && findings[0].severity) || '—'})`
        : 'no findings',
      activity: at.summary
        ? `${at.summary.days_with_activity ?? '—'} active days · ${Math.round(at.summary.total_minutes || 0)}m · ${Math.round(at.summary.total_xp || 0)} XP · ${at.summary.accuracy_pct ?? '—'}% accuracy`
        : 'no activity_timeline',
      testsHistory: tests.length
        ? `${tests.length} tests · ${th.passed_count ?? 0} passed · pass rate ${th.pass_rate_pct != null ? th.pass_rate_pct.toFixed(1) + '%' : '—'}`
        : 'no test history',
      doomLoops: doomLoops.length
        ? `${doomLoops.length} doom loops; worst: ${(doomLoops[0] && (doomLoops[0].test_title || doomLoops[0].test_name)) || '—'} (${(doomLoops[0] && doomLoops[0].fails) || '—'} fails, ${(doomLoops[0] && doomLoops[0].latest_pct != null) ? Math.round(doomLoops[0].latest_pct) + '%' : '—'} avg)`
        : 'no doom loops',
      wrongQs: wrongQs.length
        ? `${wrongQs.length} repeated wrongs; top: "${(wrongQs[0] && (wrongQs[0].test_name + ' Q' + wrongQs[0].q_num)) || '—'}"`
        : 'no question_patterns',
      wrongPicks: Object.keys(wrongPicks).length
        ? `${Object.keys(wrongPicks).length} alphatest_picks tests`
        : 'no alphatest_picks',
      coaching: ch.event_count
        ? `${ch.event_count} sessions · ${ch.first_session || '—'} → ${ch.last_session || '—'} · PTC=${ch.has_ptc ? 'yes' : 'no'}`
        : 'no coaching history',
      map: Object.keys(map).length
        ? `${Object.keys(map).length} subjects: ${Object.keys(map).join(', ')}`
        : 'no MAP data',
      subjects: subjects.length
        ? `${subjects.length} subjects: ${subjects.map(s => (s.subject || s.name) + (s.mastery_pct != null ? ` ${Math.round(s.mastery_pct)}%` : '')).join(' · ')}`
        : 'no subject_breakdown',
      worstDoom: (wd && (wd.test_title || wd.test_name))
        ? `${wd.test_title || wd.test_name} · ${wd.subject || '—'} · ${wd.fails ?? wd.attempts ?? '—'} fails · latest ${wd.latest_pct != null ? Math.round(wd.latest_pct) + '%' : '—'}`
        : 'no worst_doom',
      escalations: (dd.escalations || []).length
        ? `${(dd.escalations || []).length} escalations`
        : 'no escalations',
      actionPlan: (() => {
        const b = dd.action_plan_buckets || {};
        return `this_week=${(b.this_week || []).length} · this_month=${(b.this_month || []).length} · watch=${(b.watch || []).length}`;
      })(),
      doNow: (() => {
        const dn = dd.do_now || {};
        return dn.title || dn.rationale ? `${dn.title || ''} (urgency=${dn.urgency || '—'}, owner=${dn.owner || '—'})` : 'no do_now';
      })(),
      notes: (() => {
        try {
          const k = `guide-notes:${dd.id}`;
          const v = (typeof localStorage !== 'undefined' && localStorage.getItem(k)) || '';
          return v ? `${v.length} chars saved locally` : 'no notes saved';
        } catch (_) { return 'notes unavailable'; }
      })(),
    };
  }

  // Inject 🚩 buttons into every renderable section header in the DD view.
  // Uses textContent matching against rendered titles so we stay resilient
  // to the static index.html layout. Idempotent — strips existing flags first.
  function injectDDFlagButtons(dd) {
    if (!dd || !dd.identity) return;
    const ctx = {
      kid_name: dd.identity.name || dd.identity.full_name || 'Student',
      kid_slug: dd.id || '',
    };
    const summaries = _ddSectionSummaries(dd);

    // Strip any previously-injected flags so re-renders don't stack them.
    document.querySelectorAll('#view-student-dd .dd-flag-btn').forEach(b => b.remove());

    const inject = (el, section, summary) => {
      if (!el) return false;
      el.insertAdjacentHTML('beforeend', ' ' + _flagButton({ ...ctx, section, summary }));
      return true;
    };

    let count = 0;

    // Hero / identity rail — flag the identity header (rail name)
    const railName = document.querySelector('#dd-identity-rail .dd-rail-name');
    if (inject(railName, 'Identity rail', summaries.identity)) count++;

    // TL;DR + KPI tiles live in dd-hero-block — flag the TL;DR paragraph
    const tldr = document.getElementById('dd-tldr');
    if (inject(tldr, 'TL;DR · Hero KPIs', `${summaries.tldr} | ${summaries.hero}`)) count++;

    // Map static section titles → (section label, summary key)
    const titleMap = [
      ['AI deep dive',                  'AI deep dive · narrative',     'aiDD'],
      ['Findings & action items',       'Findings · action items',      'findings'],
      ['Findings &amp; action items',   'Findings · action items',      'findings'],
      ['Activity timeline',             'Activity · calendar heatmap',  'activity'],
      ['Test history',                  'Tests · history',              'testsHistory'],
      ['Coaching sessions',             'Coaching · sessions',          'coaching'],
      ['MAP scores & 2X growth targets','MAP · 2X targets',             'map'],
      ['MAP scores &amp; 2X growth targets','MAP · 2X targets',         'map'],
      ['Subjects scorecard',            'Subjects · scorecard',         'subjects'],
      ['Guide notes',                   'Guide notes',                  'notes'],
    ];
    document.querySelectorAll('#view-student-dd .dd-block-head .dd-block-title').forEach(el => {
      const text = (el.textContent || '').trim();
      const m = titleMap.find(t => t[0] === text);
      if (m) {
        if (inject(el, m[1], summaries[m[2]])) count++;
      }
    });

    // AI deep-dive subsections rendered inside #dd-ai-dd
    document.querySelectorAll('#dd-ai-dd .ai-dd-section-title').forEach(el => {
      const text = (el.textContent || '').trim();
      if (text === 'Findings · full reasoning') {
        if (inject(el, 'AI deep dive · Findings (full reasoning)', summaries.findings)) count++;
      } else if (text === 'Escalations') {
        if (inject(el, 'AI deep dive · Escalations', summaries.escalations)) count++;
      } else if (text === 'Action plan') {
        if (inject(el, 'AI deep dive · Action plan', summaries.actionPlan)) count++;
      }
    });

    // AI deep-dive special blocks: DO NOW, Worst doom
    const doNow = document.querySelector('#dd-ai-dd .ai-dd-do-now-eyebrow');
    if (inject(doNow, 'AI deep dive · DO THIS NOW', summaries.doNow)) count++;
    const worstDoom = document.querySelector('#dd-ai-dd .ai-dd-worst-doom-eyebrow');
    if (inject(worstDoom, 'AI deep dive · Worst doom dossier', summaries.worstDoom)) count++;

    // Tests tab subsections — these are rendered as <h3> / <h4> inside
    // #dd-tests-table. Match by text since they share style classes.
    document.querySelectorAll('#dd-tests-table h3, #dd-tests-table h4').forEach(el => {
      const text = (el.textContent || '').trim();
      // Strip leading symbols (⚠ ✓ ↻ ⚡) for matching
      const norm = text.replace(/^[^A-Za-z]*/, '').toLowerCase();
      if (norm.startsWith('doom loops')) {
        if (inject(el, 'Tests · Doom loops', summaries.doomLoops)) count++;
      } else if (norm.startsWith('weak topics')) {
        if (inject(el, 'Tests · Weak topics (patterns)', summaries.testsHistory)) count++;
      } else if (norm.startsWith('repeated failures')) {
        if (inject(el, 'Tests · Repeated failures', summaries.testsHistory)) count++;
      } else if (norm.startsWith('cross-subject patterns')) {
        if (inject(el, 'Tests · Cross-subject patterns', summaries.testsHistory)) count++;
      } else if (norm.startsWith('strong topics')) {
        if (inject(el, 'Tests · Strong topics', summaries.testsHistory)) count++;
      } else if (norm.startsWith('specific questions missed') || norm.startsWith('patterns across tests')) {
        if (inject(el, 'Tests · Specific questions missed', summaries.wrongQs)) count++;
      } else if (norm.startsWith('what they picked')) {
        if (inject(el, 'Tests · What they picked vs. correct', summaries.wrongPicks)) count++;
      } else if (norm.startsWith('recent tests')) {
        if (inject(el, 'Tests · Recent tests table', summaries.testsHistory)) count++;
      } else if (norm.startsWith('by subject')) {
        if (inject(el, 'Tests · By-subject pass rate', summaries.testsHistory)) count++;
      }
    });

    return count;
  }

  // ── DD: AI deep dive tab — full editorial narrative (read-only) ──────
  // Renders dd.narrative as a hero pull-quote, the do_now action card,
  // a worst_doom dossier, every finding in long form (with id anchors so
  // the Findings tab can scrollIntoView), all escalations, and the
  // action-plan buckets (this_week / this_month / watch).
  function renderAIDD(dd) {
    const host = document.getElementById('dd-ai-dd');
    if (!host) return;
    if (!dd) { host.innerHTML = '<div class="dd-empty">No AI deep dive yet — run dd_reason_batch_holistic.py.</div>'; return; }

    const ddSlug = dd.id;
    const out = [];

    // 1. Hero — narrative as serif pull-quote
    const narrative = (dd.narrative || '').trim();
    out.push(`
      <div class="ai-dd-hero">
        ${narrative
          ? `<blockquote class="ai-dd-hero-quote">${_esc(narrative)}</blockquote>`
          : `<div class="dd-empty">No diagnostic narrative yet — run dd_reason_batch_holistic.py.</div>`}
      </div>
    `);

    // 2. DO NOW card
    const dn = dd.do_now;
    if (dn && (dn.title || dn.rationale)) {
      const urg = (dn.urgency || '').toLowerCase();
      const urgClass = urg === 'now' || urg === 'today' ? 'crit' : urg === 'this_week' ? 'high' : 'med';
      const mailtoBtn = dn.mailto
        ? `<a class="ai-dd-do-now-btn" href="mailto:${_esc(dn.mailto)}">Email ${_esc(dn.owner || 'owner')}</a>`
        : '';
      out.push(`
        <div class="ai-dd-do-now ${urgClass}">
          <div class="ai-dd-do-now-eyebrow">DO THIS NOW${dn.urgency ? ' · ' + _esc(dn.urgency).replace(/_/g, ' ') : ''}</div>
          ${dn.title ? `<div class="ai-dd-do-now-title">${_esc(dn.title)}</div>` : ''}
          ${dn.rationale ? `<div class="ai-dd-do-now-rationale">${_esc(dn.rationale)}</div>` : ''}
          ${dn.owner ? `<div class="ai-dd-do-now-owner">Owner: <b>${_esc(dn.owner)}</b></div>` : ''}
          ${mailtoBtn}
        </div>
      `);
    }

    // 3. Worst doom block — editorial dossier card
    const wd = dd.worst_doom;
    if (wd && (wd.test_title || wd.test_name || wd.evidence)) {
      const fails = wd.fails != null ? wd.fails : wd.attempts;
      const testLabel = wd.test_title || wd.test_name;
      out.push(`
        <div class="ai-dd-worst-doom">
          <div class="ai-dd-worst-doom-eyebrow">Worst doom loop</div>
          ${testLabel ? `<div class="ai-dd-worst-doom-title">${_esc(testLabel)}</div>` : ''}
          <div class="ai-dd-worst-doom-meta">
            ${wd.subject ? `<span class="ai-dd-tag">${_esc(wd.subject)}</span>` : ''}
            ${fails != null ? `<span class="ai-dd-tag crit">${_esc(fails)} fails</span>` : ''}
            ${wd.latest_pct != null ? `<span class="ai-dd-tag">Latest ${_esc(Math.round(wd.latest_pct))}%</span>` : ''}
            ${wd.diagnosis ? `<span class="ai-dd-tag">${_esc(wd.diagnosis).replace(/_/g, ' ')}</span>` : ''}
          </div>
          ${wd.evidence ? `<div class="ai-dd-evidence"><span class="ai-dd-label">Evidence:</span> ${_esc(wd.evidence)}</div>` : ''}
          ${wd.dri_name ? `<div class="ai-dd-worst-doom-dri">DRI: <b>${_esc(wd.dri_name)}</b>${wd.dri_email ? ` · <a href="mailto:${_esc(wd.dri_email)}">${_esc(wd.dri_email)}</a>` : ''}</div>` : ''}
        </div>
      `);
    }

    // 4. All findings — full editorial dossier cards
    const findings = dd.findings || [];
    if (findings.length) {
      out.push(`<div class="ai-dd-section-title">Findings · full reasoning</div>`);
      out.push(findings.map((f, idx) => {
        const sev = _sevClass(f.severity);
        const actionId = `${ddSlug}:finding:${idx}`;
        const subj = f.subject && f.subject.toLowerCase() !== 'overall' ? f.subject : '';
        const mod = f.module ? f.module.replace(/_/g, ' ') : '';
        const ownerSpec = f.owner_specific ? ` · ${_esc(f.owner_specific)}` : '';
        return `
          <article class="ai-dd-finding ${sev}" id="ai-dd-finding-${_esc(actionId)}">
            <div class="ai-dd-finding-head">
              ${f.severity ? `<span class="ai-dd-sev ${sev}">${_esc(f.severity)}</span>` : ''}
              ${mod ? `<span class="ai-dd-tag">${_esc(mod)}</span>` : ''}
              ${subj ? `<span class="ai-dd-tag">${_esc(subj)}</span>` : ''}
              ${f.priority ? `<span class="ai-dd-tag prio-${_esc(f.priority)}">${_esc(f.priority)} priority</span>` : ''}
            </div>
            <h3 class="ai-dd-finding-title">${_esc(f.title || 'Untitled finding')}</h3>
            ${f.diagnosis ? `<p class="ai-dd-finding-diagnosis">${_esc(f.diagnosis)}</p>` : ''}
            ${f.talking_point ? `<blockquote class="ai-dd-quote">${_esc(f.talking_point)}</blockquote>` : ''}
            ${f.evidence ? `<div class="ai-dd-evidence"><span class="ai-dd-label">Evidence:</span> ${_esc(f.evidence)}</div>` : ''}
            ${f.recommendation ? `<div class="ai-dd-recommendation"><span class="ai-dd-label">Recommendation:</span> ${_esc(f.recommendation)}</div>` : ''}
            <div class="ai-dd-finding-owner">Owner: <b>${_esc(f.owner || '—')}</b>${ownerSpec}</div>
          </article>
        `;
      }).join(''));
    }

    // 5. Escalations
    const escs = dd.escalations || [];
    if (escs.length) {
      out.push(`<div class="ai-dd-section-title">Escalations</div>`);
      out.push(`<ul class="ai-dd-escalations">${
        escs.map(e => `<li>${_esc(typeof e === 'string' ? e : (e.detail || e.kind || ''))}</li>`).join('')
      }</ul>`);
    }

    // 6. Action plan buckets — full prose
    const buckets = dd.action_plan_buckets || {};
    const bucketDefs = [
      { key: 'this_week', label: 'This week' },
      { key: 'this_month', label: 'This month' },
      { key: 'watch', label: 'Watch' },
    ];
    const hasAny = bucketDefs.some(b => (buckets[b.key] || []).length);
    if (hasAny) {
      out.push(`<div class="ai-dd-section-title">Action plan</div>`);
      out.push(`<div class="ai-dd-buckets">`);
      bucketDefs.forEach(b => {
        const items = buckets[b.key] || [];
        if (!items.length) return;
        out.push(`
          <div class="ai-dd-bucket">
            <div class="ai-dd-bucket-label">${_esc(b.label)}</div>
            <ul class="ai-dd-bucket-list">
              ${items.map(it => {
                const text = typeof it === 'string' ? it : (it.title || it.text || JSON.stringify(it));
                return `<li>${_esc(text)}</li>`;
              }).join('')}
            </ul>
          </div>
        `);
      });
      out.push(`</div>`);
    }

    host.innerHTML = out.join('');
  }

  // ── DD: Activity tab — CALENDAR HEATMAP (GitHub-style) + click-to-expand day ──
  function renderActivityTab(dd) {
    const at = dd.activity_timeline || {};
    const summaryEl = document.getElementById('dd-activity-summary');
    const recentEl = document.getElementById('dd-activity-recent');
    const monthlyEl = document.getElementById('dd-activity-monthly');

    if (!at.summary || !at.monthly_rollup) {
      if (summaryEl) summaryEl.innerHTML = '';
      if (recentEl) recentEl.innerHTML = '<div class="dd-empty">No activity timeline yet — daily_activity wasn\'t pulled or this kid has no engagement data.</div>';
      if (monthlyEl) monthlyEl.innerHTML = '';
      return;
    }

    // ── Summary KPI tiles ─────────────────────────────────────────────────
    const s = at.summary;
    if (summaryEl) summaryEl.innerHTML = `
      <div class="stat"><div class="v">${s.days_with_activity ?? '—'}</div><div class="k">Days active</div></div>
      <div class="stat"><div class="v">${Math.round(s.total_minutes || 0)}m</div><div class="k">Total minutes</div></div>
      <div class="stat"><div class="v">${Math.round(s.total_xp || 0)}</div><div class="k">Total XP</div></div>
      <div class="stat"><div class="v">${s.total_questions ?? '—'}</div><div class="k">Questions</div></div>
      <div class="stat"><div class="v">${s.accuracy_pct != null ? s.accuracy_pct + '%' : '—'}</div><div class="k">Accuracy</div></div>
      <div class="stat"><div class="v">${s.total_mastered ?? '—'}</div><div class="k">Units mastered</div></div>
    `;

    // ── Calendar heatmap — 8 months × 7 days, GitHub contribution grid style ─
    // We need data spanning a date range. Build cells for every day from first→last.
    const recent = at.recent || {};      // last 30 days, full per-subject detail
    const monthly = at.monthly_rollup || {};
    const firstDate = s.first_date;
    const lastDate = s.last_date;

    if (!firstDate || !lastDate) {
      if (recentEl) recentEl.innerHTML = '<div class="dd-empty">Date range missing.</div>';
      return;
    }

    const cellEl = recentEl;
    if (!cellEl) return;

    // Build a per-day minutes lookup. Use `daily_totals` for ALL days (full timeline).
    // The `recent` map (last 30 days) has the per-subject detail for click-to-expand.
    const dailyTotals = at.daily_totals || {};
    const dailyMinutes = {};
    Object.entries(dailyTotals).forEach(([date, t]) => {
      dailyMinutes[date] = {
        minutes: t.minutes,
        xp: t.xp,
        questions: t.questions,
        correct: t.correct,
        mastered: t.mastered,
        has_detail: !!recent[date],   // only last 30 days have per-subject detail
      };
    });

    // Generate every date from firstDate to lastDate
    const startDate = new Date(firstDate + 'T12:00:00');
    const endDate = new Date(lastDate + 'T12:00:00');
    const days = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      days.push({
        iso,
        dow: d.getDay(),  // 0=Sun
        month: iso.slice(0, 7),
        date_obj: new Date(d),
        ...dailyMinutes[iso] || { minutes: null, has_detail: false },
      });
    }

    // Compute max for color scale
    const maxMins = Math.max(60, ...days.filter(d => d.minutes != null).map(d => d.minutes));

    // Color scale function — 5 levels (GitHub-style)
    const cellLevel = (mins) => {
      if (mins == null) return 'unknown';
      if (mins === 0) return 'zero';
      const pct = mins / maxMins;
      if (pct < 0.2) return 'l1';
      if (pct < 0.4) return 'l2';
      if (pct < 0.7) return 'l3';
      return 'l4';
    };

    // Group days by month for display (8-month strip or month-by-month)
    const byMonth = {};
    days.forEach(d => {
      if (!byMonth[d.month]) byMonth[d.month] = [];
      byMonth[d.month].push(d);
    });
    const monthKeys = Object.keys(byMonth).sort();

    // Render: each month as a 7-row × N-col mini-calendar
    const monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dowLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    cellEl.innerHTML = `
      <h4 style="font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.7px;color:var(--mute);margin:0 0 6px;">
        Activity calendar · ${days.length} days · click any cell for details
      </h4>
      <div class="dd-cal-legend">
        <span>Less</span>
        <span class="dd-cal-cell-legend zero"></span>
        <span class="dd-cal-cell-legend l1"></span>
        <span class="dd-cal-cell-legend l2"></span>
        <span class="dd-cal-cell-legend l3"></span>
        <span class="dd-cal-cell-legend l4"></span>
        <span>More</span>
      </div>

      <div class="dd-cal-strip">
        ${monthKeys.map(mk => {
          const monthDays = byMonth[mk];
          const [y, m] = mk.split('-');
          const monthLabel = `${monthLabels[parseInt(m, 10) - 1]} '${y.slice(2)}`;

          // Pad: add empty cells for days BEFORE the first day of the month
          // so weeks line up to Sun-Sat columns.
          const firstDay = monthDays[0];
          const pad = firstDay.dow;  // 0..6
          const cells = [];
          for (let i = 0; i < pad; i++) cells.push({ blank: true });
          monthDays.forEach(d => cells.push(d));

          // Total month minutes
          const monthMins = monthDays.reduce((a, d) => a + (d.minutes || 0), 0);

          return `
            <div class="dd-cal-month">
              <div class="dd-cal-month-label">${monthLabel}<span class="dd-cal-month-total">${Math.round(monthMins)}m</span></div>
              <div class="dd-cal-grid">
                ${cells.map(c => {
                  if (c.blank) return '<div class="dd-cal-cell blank"></div>';
                  const level = cellLevel(c.minutes);
                  const tipMins = c.minutes != null ? Math.round(c.minutes) + ' min · ' + Math.round(c.xp || 0) + ' xp' : 'no activity';
                  const day = c.iso.slice(8, 10);
                  const detailMark = c.has_detail ? ' · click for subject/app detail' : (c.minutes ? ' · click for totals' : '');
                  const tooltip = `${c.iso} · ${tipMins}${detailMark}`;
                  return `<div class="dd-cal-cell ${level} clickable" data-date="${_esc(c.iso)}" title="${_esc(tooltip)}"><span class="dd-cal-day-num">${day}</span></div>`;
                }).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <div id="dd-cal-detail" class="dd-cal-detail dd-empty">
        Click a date to see per-subject + per-app breakdown.
      </div>
    `;

    // Wire click handlers — expand a day's detail inline. Recent (last 30) days have
    // per-subject + per-app detail; older days have totals only.
    const detailEl = document.getElementById('dd-cal-detail');
    cellEl.querySelectorAll('.dd-cal-cell[data-date]').forEach(cell => {
      cell.onclick = () => {
        cellEl.querySelectorAll('.dd-cal-cell').forEach(c => c.classList.remove('selected'));
        cell.classList.add('selected');
        const date = cell.dataset.date;
        const day = recent[date];
        const totals = dailyTotals[date];

        // Format date as readable
        const dObj = new Date(date + 'T12:00:00');
        const readable = dObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

        if (!day) {
          // No per-subject detail — show totals only with explanation
          if (!totals) {
            detailEl.innerHTML = `<h4>${_esc(readable)}</h4><div class="muted" style="margin-top:8px;">No activity recorded.</div>`;
            return;
          }
          const acc = totals.questions ? Math.round(100 * totals.correct / totals.questions) : null;
          detailEl.innerHTML = `
            <div class="dd-cal-detail-head">
              <h4>${_esc(readable)}</h4>
              <div class="dd-cal-detail-totals">
                <span><b>${Math.round(totals.minutes)}</b>min</span>
                <span><b>${Math.round(totals.xp)}</b>xp</span>
                <span><b>${totals.questions}</b> q</span>
                <span><b>${totals.correct}</b> ✓</span>
                <span><b>${totals.mastered}</b> mastered</span>
                ${acc != null ? `<span><b>${acc}</b>% accuracy</span>` : ''}
              </div>
            </div>
            <div class="muted" style="margin-top:6px;font-size:11px;">Per-subject + per-app detail is only kept for the last 30 days. Older totals shown above.</div>
          `;
          return;
        }
        const byApp = (at.recent_by_app && at.recent_by_app[date]) || {};
        const subjects = Object.entries(day).sort((a, b) => (b[1].minutes || 0) - (a[1].minutes || 0));
        const totalMins = subjects.reduce((a, [_, m]) => a + (m.minutes || 0), 0);
        const totalXp = subjects.reduce((a, [_, m]) => a + (m.xp || 0), 0);
        const totalQ = subjects.reduce((a, [_, m]) => a + (m.questions || 0), 0);
        const totalC = subjects.reduce((a, [_, m]) => a + (m.correct || 0), 0);
        const totalM = subjects.reduce((a, [_, m]) => a + (m.mastered || 0), 0);
        const acc = totalQ ? Math.round(100 * totalC / totalQ) : null;

        // (readable + dObj already defined above — reuse them)
        detailEl.innerHTML = `
          <div class="dd-cal-detail-head">
            <h4>${_esc(readable)}</h4>
            <div class="dd-cal-detail-totals">
              <span><b>${Math.round(totalMins)}</b>min</span>
              <span><b>${Math.round(totalXp)}</b>xp</span>
              <span><b>${totalQ}</b> q</span>
              <span><b>${totalC}</b> ✓</span>
              <span><b>${totalM}</b> mastered</span>
              ${acc != null ? `<span><b>${acc}</b>% accuracy</span>` : ''}
            </div>
          </div>
          <div class="dd-cal-subj-grid">
            ${subjects.map(([sub, m]) => {
              const apps = byApp[sub] || {};
              // Per-app values are compact arrays [minutes, xp, questions, correct, mastered]
              // OR legacy objects {minutes, xp, ...} — handle both.
              const _appM = (am) => Array.isArray(am)
                ? { minutes: am[0], xp: am[1], questions: am[2], correct: am[3], mastered: am[4] }
                : (am || {});
              const appList = Object.entries(apps)
                .map(([n, raw]) => [n, _appM(raw)])
                .sort((a, b) => (b[1].minutes || 0) - (a[1].minutes || 0));
              const subAcc = m.questions ? Math.round(100 * m.correct / m.questions) : null;
              return `
                <div class="dd-cal-subj">
                  <div class="dd-cal-subj-head">
                    <b>${_esc(sub)}</b>
                    <span class="muted">${Math.round(m.minutes)}m · ${Math.round(m.xp)}xp${subAcc != null ? ' · ' + subAcc + '%' : ''}</span>
                  </div>
                  <div class="dd-cal-subj-stats">
                    <span>${m.questions} q</span> · <span>${m.correct} ✓</span> · <span>${m.mastered} mastered</span>
                  </div>
                  ${appList.length ? `
                    <div class="dd-cal-apps">
                      ${appList.map(([appName, am]) => `
                        <div class="dd-cal-app">
                          <span class="dd-cal-app-name">${_esc(appName)}</span>
                          <span class="dd-cal-app-stats muted">${Math.round(am.minutes)}m · ${Math.round(am.xp)}xp · ${am.questions}q · ${am.correct}✓</span>
                        </div>
                      `).join('')}
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        `;
      };
    });

    // ── Monthly history bars (compact strip below the calendar) ─────────
    if (monthlyEl) {
      const maxMonthMins = Math.max(1, ...monthKeys.map(m => Object.values(monthly[m] || {}).reduce((a, x) => a + (x.minutes || 0), 0)));
      monthlyEl.innerHTML = `
        <h4 style="font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.7px;color:var(--mute);margin:18px 0 6px;">Months at a glance</h4>
        ${monthKeys.map(mk => {
          const subjs = monthly[mk] || {};
          const totalM = Object.values(subjs).reduce((a, x) => a + (x.minutes || 0), 0);
          const totalXp = Object.values(subjs).reduce((a, x) => a + (x.xp || 0), 0);
          const pct = (totalM / maxMonthMins) * 100;
          // Subject breakdown chips
          const topSubjs = Object.entries(subjs)
            .sort((a, b) => (b[1].minutes || 0) - (a[1].minutes || 0))
            .slice(0, 3)
            .map(([sub, m]) => `<span class="dd-day-chip">${_esc(sub)} ${Math.round(m.minutes)}m</span>`)
            .join('');
          return `
            <div class="dd-month-row">
              <div class="dd-month-key">${_esc(mk)}</div>
              <div class="dd-month-bar-wrap"><div class="dd-month-bar" style="width:${pct}%"></div></div>
              <div class="dd-month-total">${Math.round(totalM)}m · ${Math.round(totalXp)}xp</div>
            </div>
          `;
        }).join('')}
      `;
    }

    // ── NEW: Live-vs-cached reconciliation badge (top of tab) ─────────────
    // ── NEW: "What they actually used" lesson log (bottom of tab) ─────────
    _renderReconBadge(dd);
    _renderLessonLog(dd);
  }

  // ── Subject → tint class for platform pill / score band ──────────────
  function _subjectTintClass(subject) {
    const s = String(subject || '').toLowerCase();
    if (s.includes('math') || s.includes('fastmath')) return 'subj-math';
    if (s.includes('reading')) return 'subj-reading';
    if (s.includes('language') || s.includes('vocab') || s.includes('writing')) return 'subj-language';
    if (s.includes('science')) return 'subj-science';
    if (s.includes('social')) return 'subj-social';
    return 'subj-other';
  }

  // ── Score % → band class (>=90 success, <70 danger, else neutral) ─────
  function _scoreBandClass(pct) {
    if (pct == null || isNaN(pct)) return '';
    if (pct >= 90) return 'good';
    if (pct < 70) return 'bad';
    return '';
  }

  // ── Format a YYYY-MM-DD as "Mon 28 Apr" (mono-friendly) ───────────────
  function _fmtShortDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T12:00:00');
    if (isNaN(d.getTime())) return iso;
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const mons = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${days[d.getDay()]} ${String(d.getDate()).padStart(2,'0')} ${mons[d.getMonth()]}`;
  }

  // ── "x min ago / N hours ago / N days ago" for live badge ─────────────
  function _timeAgo(isoLike) {
    if (!isoLike) return '';
    const d = new Date(isoLike);
    if (isNaN(d.getTime())) return '';
    const sec = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
    if (sec < 60) return 'just now';
    const m = Math.round(sec / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    const dys = Math.round(h / 24);
    return `${dys}d ago`;
  }

  // ── DD: render "What they actually used" per-lesson log ───────────────
  function _renderLessonLog(dd) {
    const recentEl = document.getElementById('dd-activity-recent');
    if (!recentEl) return;
    // Strip any prior render so re-renders don't stack.
    const prior = document.getElementById('dd-lesson-log');
    if (prior) prior.remove();

    const log = dd.lesson_log;
    const wrap = document.createElement('div');
    wrap.id = 'dd-lesson-log';
    wrap.className = 'dd-lesson-log';

    const id = dd.identity || {};
    const flagOpts = {
      kid_name: id.name || id.full_name || 'Student',
      kid_slug: dd.id || '',
      section: 'Activity · what they actually used',
      summary: log && log.totals
        ? `${log.totals.n_lessons} lessons · ${Math.round(log.totals.total_xp || 0)} XP · ${log.totals.days_covered} days`
        : '(no lesson_log)',
    };

    if (!log || !log.by_date || !Object.keys(log.by_date).length) {
      wrap.innerHTML = `
        <div class="dd-lesson-head">
          <h4 class="dd-lesson-title">What they actually used <span class="dd-lesson-sub">· last 30 days</span> ${_flagButton(flagOpts)}</h4>
        </div>
        <div class="dd-empty">No per-lesson log yet — compute_lesson_log hasn't populated dd.lesson_log for this kid.</div>
      `;
      recentEl.appendChild(wrap);
      return;
    }

    const totals = log.totals || {};
    const byPlatform = totals.by_platform || {};
    const topPlatforms = Object.entries(byPlatform)
      .sort((a, b) => (b[1] || 0) - (a[1] || 0))
      .slice(0, 5);

    const dates = Object.keys(log.by_date).sort().reverse().slice(0, 14);

    wrap.innerHTML = `
      <div class="dd-lesson-head">
        <h4 class="dd-lesson-title">What they actually used <span class="dd-lesson-sub">· last 30 days</span> ${_flagButton(flagOpts)}</h4>
      </div>
      <div class="dd-lesson-stats">
        <div class="stat"><div class="v">${_esc(totals.n_lessons ?? '—')}</div><div class="k">Lessons</div></div>
        <div class="stat"><div class="v">${Math.round(totals.total_xp || 0)}</div><div class="k">Total XP</div></div>
        <div class="stat"><div class="v">${_esc(totals.days_covered ?? '—')}</div><div class="k">Days active</div></div>
      </div>
      ${topPlatforms.length ? `
        <div class="dd-lesson-platforms">
          ${topPlatforms.map(([name, xp]) => {
            const platformDri = (((_brainEnrich(dd).platform_dri_lookup) || {})[name]) || null;
            // Hover-only badge: surface the DRI without taking grid space.
            const driTip = platformDri && platformDri.dri_name
              ? `DRI · ${platformDri.dri_name}${platformDri.summary ? ' — ' + platformDri.summary : ''}`
              : (platformDri && platformDri.platform_doc
                  ? `Brain doc: ${platformDri.platform_doc}${platformDri.summary ? ' — ' + platformDri.summary : ''}`
                  : '');
            const driBadge = platformDri && platformDri.dri_name
              ? `<span class="dd-brain-dri">DRI · ${_esc(platformDri.dri_name)}</span>`
              : '';
            return `<span class="dd-lesson-platform-pill"${driTip ? ` title="${_attr(driTip)}"` : ''}>${_esc(name)} <b>${Math.round(xp)}</b>${driBadge}</span>`;
          }).join('<span class="dd-lesson-sep">·</span>')}
        </div>
      ` : ''}
      <div class="dd-lesson-days">
        ${dates.map(date => {
          const lessons = log.by_date[date] || [];
          const dayXp = lessons.reduce((a, l) => a + (Number(l.xp) || 0), 0);
          const cap = 8;
          const shown = lessons.slice(0, cap);
          const extra = lessons.length - shown.length;
          return `
            <div class="dd-lesson-day">
              <div class="dd-lesson-day-head">
                <span class="dd-lesson-day-date">${_esc(_fmtShortDate(date))}</span>
                <span class="dd-lesson-day-summary">${Math.round(dayXp)} xp · ${lessons.length} lesson${lessons.length === 1 ? '' : 's'}</span>
              </div>
              <div class="dd-lesson-day-body">
                ${shown.map(l => {
                  const tint = _subjectTintClass(l.subject);
                  const band = _scoreBandClass(l.score_pct);
                  const scorePct = (l.score_pct != null && !isNaN(l.score_pct))
                    ? Math.round(l.score_pct) + '%'
                    : '—';
                  const xp = (l.xp != null) ? Math.round(l.xp) + ' xp' : '— xp';
                  const dur = (l.duration_min != null && !isNaN(l.duration_min))
                    ? Math.round(l.duration_min) + 'm'
                    : '';
                  const correctness = (l.correct != null && l.total != null)
                    ? `${l.correct}/${l.total}`
                    : '';
                  const name = l.lesson_name && String(l.lesson_name).trim()
                    ? l.lesson_name
                    : '(unnamed lesson)';
                  return `
                    <div class="dd-lesson-row">
                      <span class="dd-lesson-platform ${tint}">${_esc(l.platform || '?')}</span>
                      <span class="dd-lesson-name">${_esc(name)}</span>
                      <span class="dd-lesson-score ${band}">${scorePct}${correctness ? ' · ' + correctness : ''}</span>
                      <span class="dd-lesson-xp">${xp}${dur ? ' · ' + dur : ''}</span>
                    </div>
                  `;
                }).join('')}
                ${extra > 0 ? `<div class="dd-lesson-more">+${extra} more lesson${extra === 1 ? '' : 's'} that day</div>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
    recentEl.appendChild(wrap);
  }

  // ── DD: render live-vs-cached reconciliation badge + drilldown modal ──
  function _renderReconBadge(dd) {
    const recentEl = document.getElementById('dd-activity-recent');
    if (!recentEl) return;
    // Strip any prior badge render
    const prior = document.getElementById('dd-recon-wrap');
    if (prior) prior.remove();

    const live = dd.live_activity;
    const wrap = document.createElement('div');
    wrap.id = 'dd-recon-wrap';
    wrap.className = 'dd-recon-wrap';

    if (!live || (!live.pulled_at && !live.reconciliation)) {
      wrap.innerHTML = `<span class="dd-recon-badge dd-recon-empty" title="Live edubridge endpoint not yet pulled for this kid.">⚪ Live data not yet pulled</span>`;
      // Insert at TOP of recent-el (above lesson log + calendar header).
      recentEl.insertBefore(wrap, recentEl.firstChild);
      return;
    }

    const recon = live.reconciliation || {};
    const nDiff = Number(recon.n_days_with_diff) || 0;
    const biggest = recon.biggest_diff || {};
    const biggestDelta = Number(biggest.delta) || 0;
    const isDrift = nDiff >= 5 || biggestDelta >= 50;
    const isStale = nDiff > 0 && !isDrift;
    const isFresh = nDiff === 0;

    let cls = 'dd-recon-fresh';
    let icon = '🟢';
    let label = `Live · pulled ${_esc(_timeAgo(live.pulled_at) || 'recently')}`;
    if (isStale) {
      cls = 'dd-recon-stale';
      icon = '🟠';
      label = `Stale: ${nDiff} day${nDiff === 1 ? '' : 's'} differ from cached`;
    }
    if (isDrift) {
      cls = 'dd-recon-drift';
      icon = '🔴';
      label = `Significant data drift — flag and investigate (${nDiff} days, max Δ${biggestDelta} XP)`;
    }
    if (isFresh) {
      label = `Live · pulled ${_esc(_timeAgo(live.pulled_at) || 'recently')} · ${recon.n_days_checked || 0} days reconciled`;
    }

    const discrepancies = Array.isArray(recon.discrepancies) ? recon.discrepancies : [];
    const top3 = discrepancies.slice(0, 3);
    const tooltip = top3.length
      ? top3.map(d => `${d.date} ${d.subject}: live ${d.live_xp} vs cached ${d.cached_xp} (Δ${d.delta})`).join(' · ')
      : (isFresh ? 'No discrepancies — cached matches live.' : 'Click to inspect discrepancies.');

    wrap.innerHTML = `
      <button type="button"
              class="dd-recon-badge ${cls}"
              id="dd-recon-badge-btn"
              ${discrepancies.length ? '' : 'disabled'}
              title="${_attr(tooltip)}">
        ${icon} ${label}${discrepancies.length ? ' <span class="dd-recon-caret">▾</span>' : ''}
      </button>
      <div id="dd-recon-detail" class="dd-recon-detail" hidden></div>
    `;
    recentEl.insertBefore(wrap, recentEl.firstChild);

    // Wire click → toggle inline drilldown table of discrepancies.
    if (discrepancies.length) {
      const btn = wrap.querySelector('#dd-recon-badge-btn');
      const detail = wrap.querySelector('#dd-recon-detail');
      btn.onclick = () => {
        if (detail.hidden) {
          detail.innerHTML = `
            <div class="dd-recon-detail-head">
              <b>Live vs cached XP — ${discrepancies.length} discrepant day-subject${discrepancies.length === 1 ? '' : 's'}</b>
              <span class="muted">${_esc(recon.n_days_checked || 0)} days checked · pulled ${_esc(_timeAgo(live.pulled_at) || '')}</span>
            </div>
            <table class="dd-recon-table">
              <thead>
                <tr><th>Date</th><th>Subject</th><th>Live XP</th><th>Cached XP</th><th>Δ</th></tr>
              </thead>
              <tbody>
                ${discrepancies.map(d => `
                  <tr>
                    <td>${_esc(d.date)}</td>
                    <td>${_esc(d.subject)}</td>
                    <td class="tnum">${_esc(d.live_xp)}</td>
                    <td class="tnum">${_esc(d.cached_xp)}</td>
                    <td class="tnum"><b>${_esc(d.delta)}</b></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `;
          detail.hidden = false;
        } else {
          detail.hidden = true;
        }
      };
    }
  }

  // ── DD: Tests tab — every test attempted, with cap-risk highlighting ──
  function renderTestsTab(dd) {
    const el = document.getElementById('dd-tests-table');
    if (!el) return;
    const th = dd.test_history || {};
    const tests = th.tests || [];
    const bySubject = th.by_subject || {};
    const doomLoops = th.doom_loops || [];
    const passRate = th.pass_rate_pct;

    if (!tests.length && !doomLoops.length) {
      el.innerHTML = '<div class="dd-empty">No test history available for this kid yet — they may not have any assessment_results in Timeback.</div>';
      return;
    }

    // Subject summary tiles
    const subjSummary = Object.entries(bySubject).map(([sub, st]) => {
      const passed = st.passed_count || 0;
      const total = st.test_count || 0;
      const pct = total ? Math.round((passed / total) * 100) : 0;
      const cls = pct >= 50 ? 'success' : pct >= 25 ? 'warn' : 'danger';
      return `<div class="stat" title="${_esc(sub)}: ${passed} passed of ${total} tests"><div class="v"><span class="${cls}">${pct}%</span></div><div class="k">${_esc(sub)} (${passed}/${total})</div></div>`;
    }).join('');

    // AI classification → small badge (chip) renderer.
    // Source: build_ui_kit_data attaches ai_classification + ai_narrative
    // + ai_reteach_prompt to test rows from reasoning_test/<slug>.json.
    const aiClassBadge = (cls) => {
      if (!cls) return '';
      const map = {
        bad_item:           { label: 'BAD ITEM',  color: 'var(--danger)' },
        bad_student_prep:   { label: 'BAD PREP',  color: 'var(--warn)'   },
        mixed:              { label: 'MIXED',     color: 'var(--accent)' },
        insufficient_data:  { label: 'NEED DATA', color: 'var(--mute)'   },
      };
      const m = map[cls] || { label: String(cls).toUpperCase(), color: 'var(--mute)' };
      return `<span style="display:inline-block;padding:1px 6px;font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:0.5px;border:1px solid ${m.color};color:${m.color};border-radius:3px;margin-left:6px;">${_esc(m.label)}</span>`;
    };
    const aiDiagnosisLink = (testName) => {
      // Anchor target lives in the AI tab's test-synthesis section. We don't
      // hard-link that DOM here — just hand off to a shared handler that
      // switches tab + scrolls.
      const slug = String(testName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      return `<a href="#" onclick="window.__brainScrollToAITest && window.__brainScrollToAITest('${_esc(slug)}'); return false;" style="font-size:10px;margin-left:6px;">View AI diagnosis</a>`;
    };

    // Doom loops banner — show AI classification chip + tooltip with narrative.
    const doomBanner = doomLoops.length ? `
      <h4 style="font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.7px;color:var(--danger);margin:14px 0 6px;">⚠ Doom loops · 3+ fails on same (subject, grade)</h4>
      <table style="margin-bottom:14px;">
        <thead><tr><th>Test</th><th>Subject</th><th class="r">Fails</th><th class="r">Latest %</th><th>First fail</th><th>AI diagnosis</th></tr></thead>
        <tbody>
          ${doomLoops.map(t => {
            const aiTitle = t.ai_narrative ? _esc(t.ai_narrative) : '';
            const aiCell = t.ai_classification
              ? `<span title="${aiTitle}">${aiClassBadge(t.ai_classification)}</span>${aiDiagnosisLink(t.test_title || t.test_name)}`
              : '<span class="muted" style="font-size:10px;">—</span>';
            return `
            <tr class="cap-risk">
              <td><b>${_esc(t.test_title || t.test_name || '?')}</b></td>
              <td>${_esc(t.subject)}</td>
              <td class="r tnum">${_esc(t.fails)}</td>
              <td class="r tnum">${t.latest_pct != null ? Math.round(t.latest_pct) + '%' : '—'}</td>
              <td>${_esc(t.first_fail || '—')}</td>
              <td>${aiCell}</td>
            </tr>
          `;}).join('')}
        </tbody>
      </table>
    ` : '';

    // Full test list (paginated to 100 most recent)
    const limit = 100;
    const shown = tests.slice(0, limit);

    // ── Patterns across tests (cross-test analysis) ──
    const patterns = dd.test_patterns || {};
    const patternsBySubj = patterns.by_subject || {};
    const xSubjPatterns = patterns.cross_subject_patterns || [];
    const sevColor = { critical: 'var(--danger)', warn: 'var(--warn, #d97706)', watch: 'var(--mute)' };
    const trendIcon = { improving: '↑', worsening: '↓', stable: '→' };
    const trendCls = { improving: 'success', worsening: 'danger', stable: '' };

    const renderTopicRow = (t, kind) => {
      const sev = t.severity || (kind === 'strong' ? 'good' : 'watch');
      const dot = kind === 'strong' ? 'var(--success, #16a34a)' : (sevColor[sev] || 'var(--mute)');
      const tIcon = trendIcon[t.trend] || '→';
      const tCls = trendCls[t.trend] || '';
      const accCls = kind === 'strong' ? 'success' : (sev === 'critical' ? 'danger' : 'warn');
      return `
        <tr>
          <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dot};margin-right:6px;vertical-align:middle;"></span><b>${_esc(t.topic)}</b></td>
          <td class="r tnum ${accCls}">${t.accuracy_pct != null ? t.accuracy_pct + '%' : '—'}</td>
          <td class="r tnum muted">${t.n_attempts ?? '—'}</td>
          <td class="r tnum muted">${t.n_questions ?? '—'}</td>
          <td class="${tCls}">${tIcon} ${_esc(t.trend || '')}</td>
          <td class="muted" style="font-size:11px;">${_esc((t.first_seen || '').slice(0,10))} → ${_esc((t.last_seen || '').slice(0,10))}</td>
        </tr>
      `;
    };

    const subjOrder = Object.keys(patternsBySubj).sort();
    const allWeak = subjOrder.flatMap(sub => (patternsBySubj[sub].weak_topics || []).map(t => ({ ...t, _subj: sub })));
    const allStrong = subjOrder.flatMap(sub => (patternsBySubj[sub].strong_topics || []).map(t => ({ ...t, _subj: sub })));
    const allRepeated = subjOrder.flatMap(sub => (patternsBySubj[sub].repeated_failures || []).map(r => ({ ...r, _subj: sub })));

    const weakBlock = allWeak.length ? `
      <h4 style="font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.7px;color:var(--danger);margin:14px 0 6px;">⚠ Weak topics — patterns across tests</h4>
      <table style="margin-bottom:14px;">
        <thead><tr><th>Topic</th><th class="r">Accuracy</th><th class="r">Attempts</th><th class="r">Qs</th><th>Trend</th><th>Range</th></tr></thead>
        <tbody>${allWeak.map(t => renderTopicRow(t, 'weak')).join('')}</tbody>
      </table>
    ` : '';

    const strongBlock = allStrong.length ? `
      <h4 style="font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.7px;color:var(--success, #16a34a);margin:14px 0 6px;">✓ Strong topics</h4>
      <table style="margin-bottom:14px;">
        <thead><tr><th>Topic</th><th class="r">Accuracy</th><th class="r">Attempts</th><th class="r">Qs</th><th>Trend</th><th>Range</th></tr></thead>
        <tbody>${allStrong.map(t => renderTopicRow(t, 'strong')).join('')}</tbody>
      </table>
    ` : '';

    const repeatedBlock = allRepeated.length ? `
      <h4 style="font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.7px;color:var(--danger);margin:14px 0 6px;">↻ Repeated failures · same test attempted ≥3× without mastery</h4>
      <table style="margin-bottom:14px;">
        <thead><tr><th>Test</th><th>Subject</th><th class="r">Attempts</th><th class="r">Best score</th></tr></thead>
        <tbody>
          ${allRepeated.map(r => `
            <tr class="cap-risk">
              <td><b>${_esc(r.test_name)}</b></td>
              <td>${_esc(r._subj)}</td>
              <td class="r tnum">${r.n_attempts}</td>
              <td class="r tnum danger">${r.best_score}%</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : '';

    const xSubjBlock = xSubjPatterns.length ? `
      <h4 style="font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.7px;color:var(--accent);margin:14px 0 6px;">⚡ Cross-subject patterns</h4>
      <div style="margin-bottom:14px;">
        ${xSubjPatterns.map(p => `
          <div class="dd-coach-card" style="border-left:3px solid var(--accent);">
            <div class="dd-coach-body">
              <div><b>${_esc(p.pattern)}</b></div>
              <div class="muted" style="font-size:11px;">${_esc(p.evidence)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    ` : '';

    const patternsSection = (allWeak.length || allStrong.length || allRepeated.length || xSubjPatterns.length) ? `
      <div style="border-top:1px solid var(--border, rgba(0,0,0,0.1));padding-top:12px;margin-top:14px;">
        <h3 style="font-family:'JetBrains Mono',monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:var(--accent);margin:0 0 4px;">Patterns across tests</h3>
        <div class="muted" style="font-size:11px;margin-bottom:8px;">What this kid keeps getting wrong (or right) across multiple tests.</div>
        ${weakBlock}${repeatedBlock}${xSubjBlock}${strongBlock}
      </div>
    ` : '';

    // ── Wrong questions deep-dive (question-level wrongs joined with QTI) ──
    const qPatterns = dd.question_patterns || {};
    const topMissed = qPatterns.top_missed || [];
    const qpBySubject = qPatterns.by_subject || {};

    const renderQpCard = (q) => {
      const miss = q.miss_count || 0;
      const att = q.n_attempts || 0;
      // Severity: red if missed every attempt and ≥3 attempts, amber if 2, grey if 1.
      const sev = miss >= 3 ? 'critical' : miss === 2 ? 'warn' : 'mute';
      const subjLabel = `${(q.subject || '').toUpperCase()}${q.grade ? ' · G' + _esc(q.grade) : ''}`;
      const choices = Array.isArray(q.choices) ? q.choices : [];
      const correct = q.correct_text || '';
      const choicesBlock = choices.length ? `
        <ul class="dd-qpatterns-choices">
          ${choices.map(c => {
            const isCorrect = correct && c.text && c.text === correct;
            return `<li class="${isCorrect ? 'is-correct' : ''}">${_esc(c.text)}</li>`;
          }).join('')}
        </ul>
      ` : '';
      return `
        <div class="dd-qpatterns-card">
          <div class="dd-qpatterns-head">
            <span class="dd-qpatterns-subject">${_esc(subjLabel)}</span>
            <span class="dd-qpatterns-test">${_esc(q.test_name || '—')} · Q${_esc(q.q_num)}</span>
            <span class="dd-qpatterns-miss" data-sev="${sev}">missed ${miss}× of ${att} attempt${att === 1 ? '' : 's'}</span>
          </div>
          ${q.prompt ? `<div class="dd-qpatterns-prompt">${_esc(q.prompt)}</div>` : '<div class="dd-qpatterns-prompt muted"><i>(prompt unavailable in QTI)</i></div>'}
          ${choicesBlock}
          ${correct ? `<div class="dd-qpatterns-correct">✓ <b>Correct:</b> ${_esc(correct)}</div>` : ''}
        </div>
      `;
    };

    const qpSubjSummary = Object.keys(qpBySubject).length
      ? `<div class="dd-qpatterns-summary">${
          Object.entries(qpBySubject)
            .sort((a, b) => b[1] - a[1])
            .map(([sub, n]) => `<span class="dd-qpatterns-subj-pill"><b>${_esc(sub)}</b> · ${n} missed</span>`)
            .join('')
        }</div>`
      : '';

    const qpatternsSection = topMissed.length ? `
      <div style="border-top:1px solid var(--border, rgba(0,0,0,0.1));padding-top:12px;margin-top:14px;">
        <h3 style="font-family:'JetBrains Mono',monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:var(--accent);margin:0 0 4px;">Specific questions missed (top ${topMissed.length})</h3>
        <div class="muted" style="font-size:11px;margin-bottom:8px;">Exact items this kid keeps getting wrong, joined with the QTI prompt + correct answer.</div>
        ${qpSubjSummary}
        <div class="dd-qpatterns-list">${topMissed.map(renderQpCard).join('')}</div>
      </div>
    ` : '';

    // ── "What they picked vs. what was right" — AlphaTest picked-choice data ─
    // Surfaces wrong picks where we know the exact distractor the kid chose,
    // joined with the correct answer + Common Core standard alignment.
    const aPicks = dd.alphatest_picks || {};
    const aPicksByTest = aPicks.by_test_slug || {};
    const wrongPicks = [];
    Object.entries(aPicksByTest).forEach(([testSlug, test]) => {
      if (!test || typeof test !== 'object') return;
      const attempts = Array.isArray(test.attempts) ? test.attempts : [];
      attempts.forEach((att) => {
        if (!att || typeof att !== 'object') return;
        // Adapter slim format: only WRONG picks come through, in `wrong_questions`.
        // Fall back to `questions` for legacy/full payloads.
        const questions = Array.isArray(att.wrong_questions) ? att.wrong_questions
                          : (Array.isArray(att.questions) ? att.questions : []);
        questions.forEach((q) => {
          if (!q || typeof q !== 'object') return;
          // In slim format every q is already a wrong pick, so skip the correct-flag
          // check unless legacy `correct` is present.
          if (q.correct === 1) return;
          if (!q.picked_text || !q.correct_text) return;
          wrongPicks.push({
            test_slug:    testSlug,
            test_name:    test.test_name || '',
            subject:      test.subject || '',
            grade:        test.grade || '',
            q_num:        q.q_num,
            picked_text:  q.picked_text,
            correct_text: q.correct_text,
            prompt:       q.prompt || '',
            alignment:    q.alignment || null,
            completed_on: att.completed_on || '',
          });
        });
      });
    });

    // Repeat-miss prioritization: if same (test_slug, q_num) is wrong on
    // 2+ attempts, those float to the top — they're the stickiest gaps.
    const repeatKey = (p) => `${p.test_slug}::${p.q_num}`;
    const repeatCounts = {};
    wrongPicks.forEach((p) => {
      const k = repeatKey(p);
      repeatCounts[k] = (repeatCounts[k] || 0) + 1;
    });
    const seenKeys = new Set();
    const dedupedPicks = [];
    wrongPicks
      .slice()
      .sort((a, b) => (repeatCounts[repeatKey(b)] - repeatCounts[repeatKey(a)]))
      .forEach((p) => {
        const k = repeatKey(p);
        if (seenKeys.has(k)) return;
        seenKeys.add(k);
        dedupedPicks.push({ ...p, repeat_count: repeatCounts[k] });
      });
    const topPicks = dedupedPicks.slice(0, 10);

    const renderPickCard = (p) => {
      const subjLabel = `${(p.subject || '').toUpperCase()}${p.grade ? ' · ' + _esc(p.grade) : ''}`;
      const testCode  = `${subjLabel}${p.q_num != null ? ' · Q' + _esc(p.q_num) : ''}`;
      const stds = (p.alignment && Array.isArray(p.alignment.standards)) ? p.alignment.standards : [];
      const stdChip = stds.length
        ? `<span class="dd-pick-std" title="CCSS standard">${_esc(stds[0])}</span>`
        : '';
      const repeatBadge = p.repeat_count > 1
        ? `<span class="dd-pick-repeat" title="Wrong on ${p.repeat_count} attempts">×${p.repeat_count}</span>`
        : '';
      return `
        <div class="dd-pick-card" data-correct="0">
          <div class="dd-pick-head">
            <span class="dd-pick-test">${_esc(testCode)}</span>
            <span class="dd-pick-test-name">${_esc(p.test_name || '—')}</span>
            ${stdChip}
            ${repeatBadge}
          </div>
          ${p.prompt ? `<div class="dd-pick-prompt">${_esc(p.prompt)}</div>` : ''}
          <div class="dd-pick-row dd-pick-wrong">✗ <b>They picked:</b> "${_esc(p.picked_text)}"</div>
          <div class="dd-pick-row dd-pick-right">✓ <b>Correct answer:</b> "${_esc(p.correct_text)}"</div>
        </div>
      `;
    };

    const picksSection = topPicks.length ? `
      <div style="border-top:1px solid var(--border, rgba(0,0,0,0.1));padding-top:12px;margin-top:14px;">
        <h3 style="font-family:'JetBrains Mono',monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:var(--accent);margin:0 0 4px;">What they picked vs. what was right (top ${topPicks.length})</h3>
        <div class="muted" style="font-size:11px;margin-bottom:8px;">Wrong picks with the exact distractor the kid chose, the correct answer, and the Common Core standard.</div>
        <div class="dd-pick-list">${topPicks.map(renderPickCard).join('')}</div>
      </div>
    ` : '';

    el.innerHTML = `
      <div class="dd-coaching-summary" style="margin-bottom:14px;">
        <div class="stat"><div class="v">${th.test_count ?? '—'}</div><div class="k">Total tests</div></div>
        <div class="stat"><div class="v">${th.passed_count ?? '—'}</div><div class="k">Passed (≥${th.mastery_threshold ?? 89.5}%)</div></div>
        <div class="stat"><div class="v ${passRate != null && passRate < 30 ? 'danger' : passRate != null && passRate < 60 ? 'warn' : ''}">${passRate != null ? passRate.toFixed(1) + '%' : '—'}</div><div class="k">Pass rate</div></div>
      </div>

      ${subjSummary ? `
        <h4 style="font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.7px;color:var(--mute);margin:0 0 6px;">By subject — pass rate</h4>
        <div class="dd-coaching-summary" style="margin-bottom:14px;">${subjSummary}</div>
      ` : ''}

      ${doomBanner}

      ${_renderBrainBadTestsCallout(dd)}

      ${patternsSection}

      ${qpatternsSection}

      ${picksSection}

      <h4 style="font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.7px;color:var(--mute);margin:14px 0 6px;">Recent tests (${shown.length} of ${tests.length})</h4>
      <table>
        <thead><tr><th>Date</th><th>Test</th><th>Subject</th><th>Grade</th><th>Type</th><th class="r">Score</th><th class="r">Passed</th></tr></thead>
        <tbody>
          ${shown.map(t => {
            const sc = t.score;
            const scCls = sc != null ? (sc >= (th.mastery_threshold || 89.5) ? 'success' : sc < 50 ? 'danger' : 'warn') : '';
            const passedSym = t.passed ? '✓' : '✗';
            const passedCls = t.passed ? 'success' : 'danger';
            const aiTitle = t.ai_narrative ? _esc(t.ai_narrative) : '';
            const aiBadge = t.ai_classification
              ? `<span title="${aiTitle}">${aiClassBadge(t.ai_classification)}</span>`
              : '';
            return `
              <tr>
                <td class="muted">${_esc((t.date || t.score_ts || '').slice(0, 10))}</td>
                <td><b>${_esc(t.test_name || '—')}</b>${aiBadge}</td>
                <td>${_esc(t.subject || '—')}</td>
                <td>${_esc(t.grade || '—')}</td>
                <td class="muted">${_esc(t.lesson_type || '—')}</td>
                <td class="r tnum ${scCls}">${sc != null ? Math.round(sc * 10) / 10 + '%' : '—'}</td>
                <td class="r tnum ${passedCls}">${passedSym}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      ${tests.length > limit ? `<div class="muted mt-8" style="font-size:11px;">Showing ${limit} of ${tests.length} tests. Pagination coming.</div>` : ''}
    `;
  }

  // ── DD: Coaching tab — per-session timeline + insights ────────────────
  function renderCoachingTab(dd) {
    const ch = dd.coaching_history || {};
    const summaryEl = document.getElementById('dd-coaching-summary');
    const listEl = document.getElementById('dd-coaching-list');
    const subEl = document.getElementById('dd-coaching-sub');

    if (!ch.event_count) {
      if (summaryEl) summaryEl.innerHTML = '';
      if (listEl) listEl.innerHTML = '<div class="dd-empty">No coaching sessions logged for this kid yet. Schedule first session?</div>';
      return;
    }

    const byType = ch.by_type || {};
    const bySubj = ch.by_subject || {};
    const byCoach = ch.by_coach || {};
    const topCoach = Object.entries(byCoach).sort((a,b) => b[1]-a[1])[0];
    const topSubj = Object.entries(bySubj).sort((a,b) => b[1]-a[1])[0];

    if (subEl) subEl.textContent = `${ch.event_count} sessions · ${ch.first_session} → ${ch.last_session} · ${Object.keys(byCoach).length} coaches involved`;

    if (summaryEl) summaryEl.innerHTML = `
      <div class="stat"><div class="v">${ch.event_count}</div><div class="k">Sessions</div></div>
      <div class="stat"><div class="v">${byType['Post-Test Coaching'] || byType['PTC'] || 0}</div><div class="k">PTCs</div></div>
      <div class="stat"><div class="v">${topSubj ? topSubj[0] : '—'}</div><div class="k">Top subject (${topSubj ? topSubj[1] : 0})</div></div>
      <div class="stat"><div class="v">${topCoach ? (topCoach[0].split(' ')[0]) : '—'}</div><div class="k">Top coach (${topCoach ? topCoach[1] : 0})</div></div>
      <div class="stat"><div class="v ${ch.has_ptc ? '' : 'danger'}">${ch.has_ptc ? '✓' : '✗'}</div><div class="k">Any PTC?</div></div>
    `;

    // Map outcome_quality → side-stripe color (visual scan signal).
    const outcomeStripe = {
      good:       'var(--success, #2ea043)',
      mixed:      'var(--warn, #d29922)',
      concerning: 'var(--danger, #cf222e)',
    };

    if (listEl) listEl.innerHTML = (ch.events || []).slice(0, 30).map(e => {
      const masteredClass = e.mastered === 'Yes' ? 'good' : e.mastered === 'No' ? 'danger' : '';
      const blockerHTML = e.blocker ? `<div class="dd-coach-row"><span style="color:var(--danger);font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:uppercase;">⚑ ${_esc(e.blocker)}</span> <span class="muted">${_esc(e.blocker_reason || '')}</span></div>` : '';
      const recordingLink = e.recording_link ? `<a href="${_esc(e.recording_link)}" target="_blank" rel="noopener">▶ Recording</a>` : '';
      const dsLink = e.ds_link ? `<a href="${_esc(e.ds_link)}" target="_blank" rel="noopener">DS link</a>` : '';

      // AI synthesis — italic quote + pattern chip + colored side-stripe.
      const stripeColor = outcomeStripe[e.outcome_quality] || 'transparent';
      const stripeStyle = e.outcome_quality
        ? `border-left:3px solid ${stripeColor};padding-left:8px;`
        : '';
      const aiSummaryHTML = e.ai_summary
        ? `<div class="dd-coach-row" style="font-style:italic;color:var(--text);font-size:12px;line-height:1.4;margin-top:4px;">“${_esc(e.ai_summary)}”</div>`
        : '';
      const patternChip = e.pattern
        ? `<span style="display:inline-block;padding:1px 6px;font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:0.5px;border:1px solid var(--mute);color:var(--mute);border-radius:3px;">${_esc(e.pattern)}</span>`
        : '';
      const followupHTML = e.recommended_followup
        ? `<div class="dd-coach-row" style="font-size:11px;color:var(--mute);"><span style="font-family:'JetBrains Mono',monospace;font-size:9px;text-transform:uppercase;letter-spacing:0.7px;">Next:</span> ${_esc(e.recommended_followup)}</div>`
        : '';

      return `
        <div class="dd-coach-card" style="${stripeStyle}">
          <div class="dd-coach-date">${_esc(e.date || '—')}</div>
          <div class="dd-coach-body">
            <div class="dd-coach-row">
              ${e.subject ? `<span class="dd-coach-subject">${_esc(e.subject)}</span>` : ''}
              <span class="dd-coach-coach">${_esc(e.coach || '—')}</span>
              ${e.app ? `<span class="dd-coach-app">via ${_esc(e.app)}</span>` : ''}
              ${e.type && e.type !== 'Academic Coaching' ? `<span style="color:var(--accent);font-family:'JetBrains Mono',monospace;font-size:10px;">[${_esc(e.type)}]</span>` : ''}
              ${patternChip}
            </div>
            ${e.session_objective ? `<div class="dd-coach-objective">"${_esc(e.session_objective)}"</div>` : ''}
            ${aiSummaryHTML}
            ${e.skill_lesson ? `<div class="muted" style="font-size:11px;">Skill: ${_esc(e.skill_lesson)}</div>` : ''}
            ${e.mastered ? `<div class="dd-coach-row"><span class="muted">Mastered:</span> <span class="${masteredClass}">${_esc(e.mastered)}</span></div>` : ''}
            ${blockerHTML}
            ${followupHTML}
            ${(recordingLink || dsLink) ? `<div class="dd-coach-row" style="gap:14px;">${recordingLink} ${dsLink}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  // ── DD: MAP tab — per-subject RIT vs 2X target ────────────────────────
  function renderMapTab(dd) {
    const el = document.getElementById('dd-map-grid');
    if (!el) return;
    const map = dd.map_targets || {};
    const subjects = Object.keys(map);

    if (!subjects.length) {
      el.innerHTML = '<div class="dd-empty">No MAP data for this kid yet. Either they haven\'t taken MAP, or their legacy_id isn\'t in the MAP_Winter_Deep_Dives_Guides sheet.</div>';
      return;
    }

    el.innerHTML = subjects.map(sub => {
      const m = map[sub] || {};
      const grewClass = m.grew_2x === 'Yes' ? 'dd-map-grew-yes' : m.grew_2x === 'No' ? 'dd-map-grew-no' : '';
      return `
        <div class="dd-map-card">
          <h4>${_esc(sub)}</h4>
          ${m.winter_rit != null ? `<div class="dd-map-row"><span class="k">Winter RIT</span><span class="v">${_esc(m.winter_rit)}</span></div>` : ''}
          ${m.predicted_growth_bucket ? `<div class="dd-map-row"><span class="k">Predicted bucket</span><span class="v">${_esc(m.predicted_growth_bucket)}</span></div>` : ''}
          ${m.lowest_growth_x != null ? `<div class="dd-map-row"><span class="k">Lowest growth ×</span><span class="v">${typeof m.lowest_growth_x === 'number' ? m.lowest_growth_x.toFixed(2) : _esc(m.lowest_growth_x)}</span></div>` : ''}
          ${m.grew_2x ? `<div class="dd-map-row"><span class="k">Grew 2X?</span><span class="v ${grewClass}">${_esc(m.grew_2x)}</span></div>` : ''}
          ${m.grade_to_master_2x != null ? `<div class="dd-map-row"><span class="k">Grade for 2X</span><span class="v">${_esc(m.grade_to_master_2x)}</span></div>` : ''}
          ${m.daily_xp_2x_target != null ? `<div class="dd-map-row"><span class="k">XP/day for 2X</span><span class="v">${_esc(m.daily_xp_2x_target)}</span></div>` : ''}
          ${m.xp_per_school_day_ytd != null ? `<div class="dd-map-row"><span class="k">XP/day actual</span><span class="v">${_esc(m.xp_per_school_day_ytd)}</span></div>` : ''}
          ${m.minutes_per_school_day_ytd != null ? `<div class="dd-map-row"><span class="k">Minutes/day</span><span class="v">${_esc(m.minutes_per_school_day_ytd)}</span></div>` : ''}
          ${m.retook_test ? `<div class="dd-map-row"><span class="k">Retook?</span><span class="v">${_esc(m.retook_test)}</span></div>` : ''}
          ${m.highest_mastered_grade != null ? `<div class="dd-map-row"><span class="k">Highest mastered</span><span class="v">G${_esc(m.highest_mastered_grade)}</span></div>` : ''}
          ${m.xp_remaining != null ? `<div class="dd-map-row"><span class="k">XP remaining</span><span class="v">${_esc(m.xp_remaining)}</span></div>` : ''}
        </div>
      `;
    }).join('');
  }

  // ── DD: tab switching ────────────────────────────────────────────────
  function setupDDTabs() {
    const tabs = document.querySelectorAll('.dd-tab[data-dd-tab]');
    const panels = document.querySelectorAll('.dd-tab-panel[data-dd-panel]');
    if (!tabs.length) return;
    tabs.forEach(t => {
      // Clear existing handler by cloning + replacing
      t.onclick = (e) => {
        const target = e.currentTarget.dataset.ddTab;
        tabs.forEach(x => x.classList.toggle('active', x.dataset.ddTab === target));
        panels.forEach(p => p.classList.toggle('active', p.dataset.ddPanel === target));
      };
    });
  }

  // ── DD: top action bar (Copy DRI handoff, Generate DD Report) ────────
  function setupDDActionBar(dd) {
    const copyBtn = document.getElementById('dd-copy-handoff-btn');
    const reportBtn = document.getElementById('dd-report-btn');

    if (copyBtn) copyBtn.onclick = () => {
      // Use the first subject_breakdown that has a dri_handoff string
      const sub = (dd.subject_breakdown || []).find(s => s.dri_handoff);
      if (sub && sub.dri_handoff) {
        navigator.clipboard.writeText(sub.dri_handoff).then(() => {
          copyBtn.textContent = '✓ Copied';
          setTimeout(() => copyBtn.textContent = '⎘ Copy DRI handoff', 1500);
        });
      } else {
        copyBtn.textContent = 'No handoff available';
        setTimeout(() => copyBtn.textContent = '⎘ Copy DRI handoff', 1500);
      }
    };

    if (reportBtn) reportBtn.onclick = () => generateDDReport(dd);

    const syncBtn = document.getElementById('dd-sync-btn');
    if (syncBtn) syncBtn.onclick = () => syncActionMutations(dd);
  }

  // ── Phase 3: Sync action mutations (mailto-based for now; future: API) ─
  function syncActionMutations(dd) {
    const slug = dd.id;
    // Collect all this kid's action mutations from localStorage
    const mutations = [];
    const prefix = `dd-action:${slug}:`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        const actionId = k.slice('dd-action:'.length);
        const status = localStorage.getItem(k);
        if (status && status !== 'open') {
          mutations.push({ action_id: actionId, status, updated_at: new Date().toISOString() });
        }
      }
    }

    // Also collect guide notes
    const notes = localStorage.getItem(`guide-notes:${slug}`) || '';

    if (mutations.length === 0 && !notes) {
      alert('No action mutations or notes to sync for this kid yet. Mark some actions Done/Wrong/Snooze first.');
      return;
    }

    const payload = {
      schema_version: 1,
      synced_at: new Date().toISOString(),
      synced_by: navigator.userAgent.split(/[()]/)[1]?.split(';')[0]?.trim() || 'unknown-device',
      student_slug: slug,
      student_name: (dd.identity || {}).name,
      mutations,
      guide_notes: notes,
    };

    const subject = `Brain dashboard mutations · ${(dd.identity || {}).name || slug}`;
    const bodyText = `Paste this JSON into actions/${slug}.json on Tripti's machine, then re-run build_ui_kit_data.py.\n\n${JSON.stringify(payload, null, 2)}`;
    window.location.href = `mailto:tripti.khetan@trilogy.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
  }

  // ── Phase 3: Generate DD Report (printable HTML in new window) ─────────
  function generateDDReport(dd) {
    const id = dd.identity || {};
    const stats = dd.stats || {};
    const ct = dd.contact || {};
    const findings = dd.findings || [];
    const actions = dd.actions || [];
    const ch = dd.coaching_history || {};
    const at = dd.activity_timeline || {};
    const map = dd.map_targets || {};
    const guardians = (ct.guardians || []).filter(g => g && (g.name || g.email));

    const reportHTML = `<!doctype html>
<html><head>
<meta charset="utf-8">
<title>DD Report — ${_esc(id.name || 'Student')}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
  body { font-family: -apple-system, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 24px; color: #0f2437; line-height: 1.5; }
  h1 { font-family: 'Fraunces', serif; font-size: 28px; margin: 0 0 4px; }
  h2 { font-family: 'Fraunces', serif; font-size: 18px; margin: 20px 0 8px; padding-top: 14px; border-top: 1px solid #e0dbd1; }
  h3 { font-size: 13px; margin: 12px 0 4px; color: #137a7f; text-transform: uppercase; letter-spacing: 0.7px; font-family: 'JetBrains Mono', monospace; }
  .meta { color: #7a8594; font-family: 'JetBrains Mono', monospace; font-size: 11px; margin: 4px 0 16px; }
  .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 8px 0 16px; }
  .kpi { padding: 8px 10px; background: #fbf9f4; border: 1px solid #e0dbd1; border-radius: 4px; }
  .kpi .v { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 600; }
  .kpi .k { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.6px; color: #7a8594; }
  .finding { padding: 8px 12px; border-left: 3px solid #137a7f; background: #fbf9f4; margin: 6px 0; }
  .finding.crit { border-left-color: #b91c1c; }
  .finding-title { font-weight: 500; font-size: 14px; }
  .finding-evidence { font-size: 11px; color: #3a4a5d; margin-top: 4px; font-style: italic; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; margin: 8px 0; }
  th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid #e0dbd1; }
  th { background: #f4f1ea; font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
  .footer { margin-top: 40px; padding-top: 14px; border-top: 1px solid #e0dbd1; font-size: 10.5px; color: #7a8594; font-family: 'JetBrains Mono', monospace; }
  @media print { body { margin: 20px auto; } h2 { page-break-after: avoid; } .finding { page-break-inside: avoid; } }
</style>
</head><body>
  <h1>${_esc(id.name || 'Student')}</h1>
  <div class="meta">
    ${_esc(id.campus || '?')} · Grade ${_esc(id.grade) || '—'} · Tier ${_esc(id.tier || '—')}${id.coach ? ' · Coach ' + _esc(id.coach) : ''}<br>
    ${ct.email ? `Email: ${_esc(ct.email)} · ` : ''}${ct.phone ? `Phone: ${_esc(ct.phone)} · ` : ''}Generated ${new Date().toLocaleString()}
  </div>

  <h2>TL;DR</h2>
  <p>${_esc(dd.narrative || 'No AI-synthesized narrative yet.')}</p>

  <h2>Key metrics</h2>
  <div class="kpi-row">
    <div class="kpi"><div class="v">${stats.overall_pass_rate_pct ?? '—'}%</div><div class="k">Mastery</div></div>
    <div class="kpi"><div class="v">${stats.doom_loop_count ?? 0}</div><div class="k">Doom loops</div></div>
    <div class="kpi"><div class="v">${stats.mastery_velocity_4wk != null ? (stats.mastery_velocity_4wk > 0 ? '+' : '') + stats.mastery_velocity_4wk : '—'}</div><div class="k">Velocity 4wk</div></div>
    <div class="kpi"><div class="v">${stats.weekly_xp_avg != null ? Math.round(stats.weekly_xp_avg) : '—'}</div><div class="k">Weekly XP</div></div>
  </div>

  ${findings.length ? `
    <h2>Top findings</h2>
    ${findings.slice(0, 5).map(f => `
      <div class="finding ${f.severity === 'critical' ? 'crit' : ''}">
        <div class="finding-title">${_esc(f.title || '')}</div>
        ${f.diagnosis ? `<div>${_esc(f.diagnosis)}</div>` : ''}
        ${f.recommendation ? `<div style="margin-top:4px;font-size:12px;"><b>Action:</b> ${_esc(f.recommendation)} <i>(${_esc(f.owner_specific || f.owner || 'guide')})</i></div>` : ''}
        ${f.evidence ? `<div class="finding-evidence">${_esc(f.evidence)}</div>` : ''}
      </div>
    `).join('')}
  ` : ''}

  ${(map && Object.keys(map).length) ? `
    <h2>MAP / 2X targets</h2>
    <table>
      <thead><tr><th>Subject</th><th>Winter RIT</th><th>Predicted</th><th>Grew 2X?</th><th>XP/day actual</th><th>XP/day target</th></tr></thead>
      <tbody>
        ${Object.entries(map).map(([sub, m]) => `
          <tr>
            <td><b>${_esc(sub)}</b></td>
            <td>${_esc(m.winter_rit ?? '—')}</td>
            <td>${_esc(m.predicted_growth_bucket ?? '—')}</td>
            <td>${_esc(m.grew_2x ?? '—')}</td>
            <td>${_esc(m.xp_per_school_day_ytd ?? '—')}</td>
            <td>${_esc(m.daily_xp_2x_target ?? '—')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : ''}

  ${ch.event_count ? `
    <h2>Coaching history</h2>
    <p style="font-size:11.5px;color:#3a4a5d;">${ch.event_count} sessions · ${_esc(ch.first_session)} → ${_esc(ch.last_session)} · ${Object.keys(ch.by_coach || {}).length} coaches</p>
    <table>
      <thead><tr><th>Date</th><th>Subject</th><th>Coach</th><th>Mastered?</th></tr></thead>
      <tbody>
        ${(ch.events || []).slice(0, 10).map(e => `
          <tr>
            <td>${_esc(e.date || '—')}</td>
            <td>${_esc(e.subject || '—')}</td>
            <td>${_esc(e.coach || '—')}</td>
            <td>${_esc(e.mastered || '—')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : ''}

  ${guardians.length ? `
    <h2>Guardians</h2>
    <table>
      <thead><tr><th>Name</th><th>Role</th><th>Email</th></tr></thead>
      <tbody>
        ${guardians.map(g => `
          <tr><td><b>${_esc(g.name || '—')}</b></td><td>${_esc(g.role || '—')}</td><td>${_esc(g.email || '—')}</td></tr>
        `).join('')}
      </tbody>
    </table>
  ` : ''}

  <div class="footer">
    Generated by Alpha Schools Brain · ${new Date().toISOString()} · Use Cmd+P to print or save as PDF.<br>
    Live dashboard: https://triptikhetan-max.github.io/btx-dashboard/
  </div>
  <scr` + `ipt>setTimeout(() => window.print(), 500);</scr` + `ipt>
</body></html>`;

    const w = window.open('', '_blank', 'width=900,height=1100');
    if (w) {
      w.document.open();
      w.document.write(reportHTML);
      w.document.close();
    } else {
      alert('Pop-up blocked — please allow pop-ups to generate the report.');
    }
  }

  // ---------- TESTING ----------
  function renderTesting() {
    const t = DATA.tests;
    $('#testing-hero').innerHTML = `
      <div class="big-stat"><div class="v tnum">${t.library.length}</div><div class="k">Assessments</div></div>
      <div class="big-stat"><div class="v tnum">${t.library.reduce((a, x) => a + x.attempts, 0).toLocaleString()}</div><div class="k">Attempts (wk)</div></div>
      <div class="big-stat"><div class="v tnum danger">${t.library.reduce((a, x) => a + x.flagged_items, 0)}</div><div class="k">Flagged items</div></div>
    `;
    $('#testing-library tbody').innerHTML = t.library.map(x => `
      <tr>
        <td><b>${x.id}</b> <span class="muted">${x.name}</span></td>
        <td>${x.subject}</td>
        <td class="r tnum">${x.items}</td>
        <td class="r tnum">${x.attempts}</td>
        <td class="r tnum">${x.avg_score}% ${mbar(x.avg_score)}</td>
        <td>${x.flagged_items ? `<span class="pill doom">${x.flagged_items}</span>` : '<span class="muted">0</span>'}</td>
      </tr>
    `).join('');

    const calendar = t.calendar || [];
    $('#testing-calendar').innerHTML = calendar.length === 0
      ? '<div class="dd-empty">No tests scheduled this cycle.</div>'
      : calendar.map(c => `
          <div class="priority ${c.status === 'in_progress' ? 'med' : c.status === 'completed' ? 'low' : 'high'}">
            <div class="u">${c.date}<br><span style="color:var(--mute);font-size:9px;">${c.campus}</span></div>
            <div><div class="a">${c.test}</div><div class="r">${c.students} students · ${c.status.replace('_', ' ')}</div></div>
            <div class="act">${c.status === 'scheduled' ? 'Prep' : c.status === 'in_progress' ? 'Monitor' : 'Review'}</div>
          </div>
        `).join('');

    const ia = t.item_analysis_U3 || {};
    const itemRows = ia.items || [];
    // item scatter: difficulty × discrimination
    Charts.scatter($('#testing-items'), {
      data: itemRows.map(i => ({
        x: Number(i.difficulty) || 0,
        y: i.discrimination == null ? 0 : Number(i.discrimination) * 100,
        group: i.flag === 'bad-item' ? 'STUCK' : i.flag === 'low-disc' ? 'AT_RISK' : 'ACTIVE',
        label: i.q,
      })),
      xLabel: 'Difficulty (% correct)', yLabel: 'Discrimination × 100', height: 240,
      quadrantLines: true, xMin: 0, xMax: 100, yMin: 0, yMax: 60,
    });

    Charts.histogram($('#testing-hist'), { data: ia.score_histogram || [], height: 180 });
    Charts.groupedBar($('#testing-pvt'), {
      data: (ia.practice_vs_test || []).map(p => ({ label: p.campus, before: p.practice, after: p.test })),
      height: 180,
    });
    Charts.bar($('#testing-retake'), {
      data: (ia.retake_lift || []).map(r => ({ label: r.attempt, value: r.mastery })),
      height: 160, valueSuffix: '%',
    });

    $('#testing-items-table tbody').innerHTML = itemRows.map(i => `
      <tr>
        <td><b>${_esc(i.q || '—')}</b></td>
        <td class="r tnum">${pct(i.difficulty)}</td>
        <td class="r tnum">${i.discrimination == null ? '—' : Number(i.discrimination).toFixed(2)}</td>
        <td class="r tnum">${i.avg_time_s == null ? '—' : `${i.avg_time_s}s`}</td>
        <td>${i.flag ? `<span class="pill ${i.flag === 'bad-item' ? 'doom' : 'warn'}">${i.flag}</span>` : '<span class="muted">—</span>'}</td>
      </tr>
    `).join('');
  }

  // ---------- COACHING ----------
  function renderCoaching() {
    const c = DATA.coaches || {};
    const ws = c.weekly_summary || {};
    const sessionRows = Array.isArray(c.sessions) ? c.sessions : [];
    const sessionsTotal = ws.sessions_total ?? c.sessions_total ?? (Array.isArray(c.sessions) ? sessionRows.length : (c.sessions || 0));
    const recentWeeks = (ws.weeks || []);
    const recentSessions = (ws.sessions || []);
    const recentTotal = recentSessions.length ? recentSessions[recentSessions.length - 1] : 0;
    const outcomePill = (v) => {
      const raw = (v || '').toLowerCase();
      const cls = raw === 'yes' ? 'ceiling' : raw === 'partial' ? 'warn' : raw === 'no' ? 'doom' : '';
      return `<span class="pill ${cls}">${_esc(v || '—')}</span>`;
    };
    const deltaClass = (v) => v == null ? 'muted' : (v > 0 ? 'success' : v < 0 ? 'danger' : 'muted');

    $('#coaching-hero') && ($('#coaching-hero').innerHTML = `
      <div class="big-stat"><div class="v tnum">${(c.roster || []).length}</div><div class="k">Coaches</div></div>
      <div class="big-stat"><div class="v tnum">${sessionsTotal.toLocaleString()}</div><div class="k">Sessions total</div></div>
      <div class="big-stat"><div class="v tnum">${recentTotal}</div><div class="k">Last week</div></div>
      <div class="big-stat"><div class="v tnum">${fmt(c.sessions_all_total || sessionRows.length, 0)}</div><div class="k">Events kept</div></div>
    `);

    $('#coaching-roster tbody') && ($('#coaching-roster tbody').innerHTML = (c.roster || []).map(r => `
      <tr>
        <td><b>${_esc(r.name)}</b></td>
        <td><span class="campus-chip"><span class="dot accent"></span>${_esc(r.campus || '—')}</span></td>
        <td class="r tnum">${fmt(r.sessions_total, 0)}</td>
        <td>${_esc(r.top_subject || '—')}</td>
        <td class="r tnum ${r.mastery_rate_pct == null ? 'muted' : (r.mastery_rate_pct >= 70 ? 'success' : r.mastery_rate_pct >= 40 ? 'warn' : 'danger')}">${r.mastery_rate_pct != null ? r.mastery_rate_pct + '%' : '—'}</td>
      </tr>
    `).join(''));

    if ($('#coaching-heatmap')) {
      const hm = c.heatmap || {};
      const allDates = hm.dates || [];
      const dates = allDates.slice(-28);
      const startIdx = Math.max(0, allDates.length - dates.length);
      const coaches = hm.coaches || [];
      const cells = hm.cells || [];
      const visibleCells = cells.map(row => (row || []).slice(startIdx));
      const maxCell = Math.max(1, ...visibleCells.flat().map(n => Number(n) || 0));
      $('#coaching-heatmap').innerHTML = dates.length && coaches.length ? `
        <div class="coach-heatmap" style="grid-template-columns:130px repeat(${dates.length}, minmax(16px, 1fr));">
          <div class="hd">Coach</div>
          ${dates.map((d, i) => `<div class="hd" title="${_attr(d)}">${i % 7 === 0 ? _esc(d.slice(5)) : ''}</div>`).join('')}
          ${coaches.slice(0, 12).map((coach, rIdx) => `
            <div class="lbl">${_esc(coach)}</div>
            ${dates.map((d, cIdx) => {
              const n = Number(visibleCells[rIdx]?.[cIdx] || 0);
              const mix = n ? Math.min(88, 12 + Math.round((n / maxCell) * 70)) : 0;
              return `<div class="cell" title="${_attr(coach)} · ${_attr(d)} · ${n} sessions" style="${n ? `background:color-mix(in srgb, var(--accent) ${mix}%, var(--panel));` : ''}">${n || ''}</div>`;
            }).join('')}
          `).join('')}
        </div>
      ` : '<div class="muted" style="padding:20px;text-align:center;">No dated coaching events available for the heatmap.</div>';
    }

    if ($('#coaching-impact')) {
      const impact = c.impact || [];
      $('#coaching-impact').innerHTML = impact.length ? `
        <table>
          <thead><tr><th>Coach</th><th class="r">Sessions</th><th class="r">Lift</th><th>Top subject</th></tr></thead>
          <tbody>
            ${impact.slice(0, 12).map(r => `
              <tr>
                <td><b>${_esc(r.coach_name || '—')}</b><div class="muted">${fmt(r.n_sessions_with_impact_data, 0)} outcome-tagged</div></td>
                <td class="r tnum">${fmt(r.n_sessions, 0)}</td>
                <td class="r tnum ${deltaClass(r.avg_mastery_delta_7d)}">${r.avg_mastery_delta_7d == null ? '—' : `${r.avg_mastery_delta_7d > 0 ? '+' : ''}${r.avg_mastery_delta_7d}`}</td>
                <td>${_esc(r.top_subject || '—')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<div class="muted" style="padding:20px;text-align:center;">No outcome-tagged impact rows yet.</div>';
    }

    $('#coaching-sessions tbody') && ($('#coaching-sessions tbody').innerHTML = sessionRows.length ? sessionRows.slice(0, 60).map(s => `
      <tr class="${s.student_slug ? 'clickable' : ''}" data-student-id="${_attr(s.student_slug || '')}">
        <td class="tnum">${_esc(s.date || '—')}</td>
        <td><b>${_esc(s.coach || '—')}</b></td>
        <td>${_esc(s.student_name || '—')}</td>
        <td>${_esc(s.campus || '—')}</td>
        <td><b>${_esc(s.subject || '—')}</b><div class="muted">${_esc(s.type || s.skill || '')}</div></td>
        <td>${_esc(s.notes || s.objective || '—')}</td>
        <td>${outcomePill(s.mastery_outcome)}</td>
      </tr>
    `).join('') : '<tr><td colspan="7" class="muted" style="text-align:center;padding:16px;">No per-session timeline available in this data build.</td></tr>');
    $$('#coaching-sessions tbody [data-student-id]').forEach(row => row.addEventListener('click', () => {
      if (!row.dataset.studentId) return;
      DD_SLUG = row.dataset.studentId;
      go('student-dd');
    }));

    if ($('#coaching-interventions')) {
      const interventions = [...(c.interventions || [])].sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
      $('#coaching-interventions').innerHTML = interventions.length ? `
        <div class="intervention-grid">
          ${interventions.map(i => `
            <div class="intervention-card">
              <div class="flex sb ac"><b>${_esc(i.name)}</b><span class="pill">${fmt(i.usage_count, 0)} uses</span></div>
              <div class="muted mt-6">${_esc(i.description || '')}</div>
              <div class="stat-line mt-10"><span>Top coach</span><b>${_esc(i.top_coach || '—')}</b></div>
              <div class="stat-line"><span>Last used</span><b>${_esc(i.last_used || '—')}</b></div>
            </div>
          `).join('')}
        </div>
      ` : '<div class="muted">No intervention patterns were classified in the current coaching events.</div>';
    }
  }

  // ==== TRIAGE ==== (Agent E territory)
  // The Triage view is a per-DRI workflow: walk every flagged item across the
  // DRI's scoped students, mark each as Verified / Fixed / Needs action / Not
  // reviewed, add a one-line note, then export a markdown report for handoff.
  //
  // Storage: localStorage key `triage:<kid_slug>:<item_id>` → JSON
  //   { status: 'verified'|'fixed'|'needs_action'|'not_reviewed', notes: '', ts }
  //
  // Item id scheme: <kid_slug>:<category>:<sub_id>
  //   categories: doomloop, policy, coaching_gap, engagement, pick, subject_flag

  const _TRIAGE_STATUSES = [
    { id: 'verified',     emoji: '🟢', label: 'Verified correct' },
    { id: 'fixed',        emoji: '✅', label: 'Fixed' },
    { id: 'needs_action', emoji: '🟡', label: 'Needs more action' },
    { id: 'not_reviewed', emoji: '⚪', label: 'Not reviewed' }
  ];
  const _TRIAGE_CATEGORY_LABELS = {
    doomloop: 'Doom Loop',
    policy: 'Policy Violation',
    coaching_gap: 'Coaching Gap',
    engagement: 'Engagement',
    pick: 'Wrong Pick',
    subject_flag: 'Subject Flag'
  };
  let _triageItemsCache = null;
  let _triageFilters = { status: 'open', kid: '', category: '' };

  function _triageStorageKey(kidSlug, itemId) {
    return `triage:${kidSlug}:${itemId}`;
  }
  function _triageLoadStatus(kidSlug, itemId) {
    try {
      const raw = localStorage.getItem(_triageStorageKey(kidSlug, itemId));
      if (!raw) return { status: 'not_reviewed', notes: '', ts: null };
      const parsed = JSON.parse(raw);
      return {
        status: parsed.status || 'not_reviewed',
        notes: parsed.notes || '',
        ts: parsed.ts || null
      };
    } catch (_) {
      return { status: 'not_reviewed', notes: '', ts: null };
    }
  }
  function _triageSaveStatus(kidSlug, itemId, patch) {
    const cur = _triageLoadStatus(kidSlug, itemId);
    const next = { ...cur, ...patch, ts: new Date().toISOString() };
    try {
      localStorage.setItem(_triageStorageKey(kidSlug, itemId), JSON.stringify(next));
    } catch (_) { /* quota */ }
    return next;
  }

  // Default DRI scope fallback: BTX kids in WL/LL/L1.
  // Returns { campuses:[], levels:[] } — empty arrays mean "no constraint".
  function _triageCurrentScope() {
    if (typeof window !== 'undefined' && typeof window.currentDriScope === 'function') {
      try {
        const s = window.currentDriScope();
        if (s && (s.campuses || s.levels)) {
          return {
            campuses: s.campuses || [],
            levels: s.levels || []
          };
        }
      } catch (_) {}
    }
    // Default for v1: Claudio's scope (BTX WL/LL/L1)
    return { campuses: ['BTX'], levels: ['WL', 'LL', 'L1'] };
  }

  function _triageInScope(student, scope) {
    if (!student) return false;
    if (scope.campuses && scope.campuses.length && !scope.campuses.includes(student.campus)) return false;
    if (scope.levels && scope.levels.length && !scope.levels.includes(student.level)) return false;
    return true;
  }

  // Build the flat items list — pure function over DATA + scope.
  // Each item: { id, kid_slug, kid_name, kid_grade, kid_level, kid_campus,
  //              category, sub_id, title, evidence, link_hash }
  function _triageBuildItems() {
    if (!DATA || !DATA.students) return [];
    const scope = _triageCurrentScope();
    const dds = DATA.student_dds || {};
    const items = [];
    DATA.students.forEach(student => {
      if (!_triageInScope(student, scope)) return;
      const kidSlug = student.id;
      const kidName = student.name;
      const kidGrade = student.grade || '';
      const kidLevel = student.level || '';
      const kidCampus = student.campus || '';
      const dd = dds[kidSlug] || {};
      const linkHash = `#/student/${kidSlug}`;
      const baseKid = { kid_slug: kidSlug, kid_name: kidName, kid_grade: kidGrade, kid_level: kidLevel, kid_campus: kidCampus, link_hash: linkHash };

      // 1) Doom loops — group attempts by test_name; flag groups with >=3 attempts and no pass.
      const tests = ((dd.test_history || {}).tests) || [];
      const byName = {};
      tests.forEach(t => {
        const k = t.test_name || '?';
        (byName[k] = byName[k] || []).push(t);
      });
      Object.keys(byName).forEach(name => {
        const group = byName[name];
        const passed = group.some(g => g.passed);
        if (group.length >= 3 && !passed) {
          const last = group[group.length - 1];
          const ai = last.ai_classification ? ` · AI: ${last.ai_classification}` : '';
          const subId = name.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
          items.push({
            ...baseKid,
            category: 'doomloop',
            sub_id: subId,
            id: `${kidSlug}:doomloop:${subId}`,
            title: `${last.subject || ''} ${name} — ${group.length} attempts, all failing${ai}`.trim(),
            evidence: `Latest score ${last.score ?? '?'}% on ${last.date || '?'}\n${last.ai_narrative || ''}`.trim()
          });
        }
      });

      // Also pre-computed doom_loops if present in DD.
      const dlPre = ((dd.test_history || {}).doom_loops) || [];
      dlPre.forEach((dl, i) => {
        const name = dl.test_name || dl.name || `doomloop_${i}`;
        const subId = (name + '_pre').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
        // Skip if already added from raw tests list
        const existingId = `${kidSlug}:doomloop:${name.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`;
        if (items.some(it => it.id === existingId)) return;
        items.push({
          ...baseKid,
          category: 'doomloop',
          sub_id: subId,
          id: `${kidSlug}:doomloop:${subId}`,
          title: `${dl.subject || ''} ${name} — ${dl.n_attempts || dl.attempts || '?'} attempts, not passed`.trim(),
          evidence: dl.narrative || dl.summary || ''
        });
      });

      // 2) Policy violations
      const pvs = ((dd.brain_enrichment || {}).policy_violations) || [];
      pvs.forEach((pv, i) => {
        const subId = (pv.policy || pv.policy_title || `policy_${i}`).replace(/[^a-z0-9]+/gi, '_').toLowerCase();
        items.push({
          ...baseKid,
          category: 'policy',
          sub_id: subId,
          id: `${kidSlug}:policy:${subId}`,
          title: pv.policy_title || pv.policy || 'Policy violation',
          evidence: [
            pv.detail || pv.description || '',
            pv.policy_dri ? `DRI: ${pv.policy_dri}` : ''
          ].filter(Boolean).join('\n')
        });
      });

      // 3) Coaching gaps — post-test only (per spec)
      const cn = dd.coaching_need || {};
      if (cn.post_test) {
        items.push({
          ...baseKid,
          category: 'coaching_gap',
          sub_id: 'post_test',
          id: `${kidSlug}:coaching_gap:post_test`,
          title: 'Post-test coaching gap',
          evidence: (cn.reasons && cn.reasons.length) ? cn.reasons.join('; ') : 'Flagged for post-test coaching follow-up.'
        });
      }

      // 4) Engagement diagnoses — overall label in {disengaged, struggling, going_through_motions}
      const overall = ((dd.engagement_diagnosis || {}).overall) || {};
      const badLabels = ['disengaged', 'struggling_with_content', 'going_through_motions'];
      if (overall.label && badLabels.includes(overall.label)) {
        items.push({
          ...baseKid,
          category: 'engagement',
          sub_id: overall.label,
          id: `${kidSlug}:engagement:${overall.label}`,
          title: `Engagement: ${overall.label.replace(/_/g, ' ')}`,
          evidence: overall.rationale || ''
        });
      }

      // 5) Subject flags
      const fs = student.flagged_subjects || [];
      fs.forEach(sf => {
        const subj = sf.subject || 'Subject';
        const subId = subj.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
        items.push({
          ...baseKid,
          category: 'subject_flag',
          sub_id: subId,
          id: `${kidSlug}:subject_flag:${subId}`,
          title: `${subj} flagged`,
          evidence: (sf.flags || []).join(', ') || (sf.default_status || '')
        });
      });

      // 6) Top wrong picks — top 3 by attempts count from alphatest_picks.by_test_slug
      const bts = ((dd.alphatest_picks || {}).by_test_slug) || {};
      const picks = Object.keys(bts).map(slug => {
        const entry = bts[slug];
        const attempts = (entry.attempts || []);
        const wrongCount = attempts.reduce((acc, a) => acc + ((a.wrong_questions || []).length), 0);
        return { slug, entry, attempts: attempts.length, wrongCount };
      }).sort((a, b) => b.attempts - a.attempts || b.wrongCount - a.wrongCount).slice(0, 3);
      picks.forEach(p => {
        const e = p.entry || {};
        const sample = ((e.attempts || [])[0] || {}).wrong_questions || [];
        const sampleTxt = sample.slice(0, 2).map(w => `Q${w.q_num}: picked "${(w.picked_text || '').slice(0, 60)}…" vs correct "${(w.correct_text || '').slice(0, 60)}…"`).join('\n');
        items.push({
          ...baseKid,
          category: 'pick',
          sub_id: p.slug,
          id: `${kidSlug}:pick:${p.slug}`,
          title: `${e.subject || ''} ${e.test_name || p.slug} — ${p.wrongCount} wrong across ${p.attempts} attempt${p.attempts === 1 ? '' : 's'}`.trim(),
          evidence: sampleTxt
        });
      });
    });
    return items;
  }

  function _triageFilteredItems(allItems) {
    const f = _triageFilters;
    return allItems.filter(it => {
      if (f.kid && it.kid_slug !== f.kid) return false;
      if (f.category && it.category !== f.category) return false;
      const st = _triageLoadStatus(it.kid_slug, it.id).status;
      if (f.status === 'open') {
        // default: not_reviewed + needs_action
        if (st !== 'not_reviewed' && st !== 'needs_action') return false;
      } else if (f.status) {
        if (st !== f.status) return false;
      }
      return true;
    });
  }

  function _triageStats(allItems) {
    const out = { total: allItems.length, verified: 0, fixed: 0, needs_action: 0, not_reviewed: 0 };
    allItems.forEach(it => {
      const st = _triageLoadStatus(it.kid_slug, it.id).status;
      if (out[st] !== undefined) out[st] += 1;
    });
    out.triaged = out.verified + out.fixed + out.needs_action;
    out.pct = out.total ? Math.round((out.triaged / out.total) * 100) : 0;
    return out;
  }

  function renderTriage() {
    const view = $('#view-triage');
    if (!view) return;
    _triageItemsCache = _triageBuildItems();
    const all = _triageItemsCache;
    const stats = _triageStats(all);

    // Sidebar count
    const sideCount = $('#sidebar-triage-count');
    if (sideCount) sideCount.textContent = stats.total;

    // Meta
    const scope = _triageCurrentScope();
    const metaEl = $('#triage-meta');
    if (metaEl) {
      const scopeStr = (scope.campuses && scope.campuses.length ? scope.campuses.join(', ') : 'All campuses')
        + ' · ' + (scope.levels && scope.levels.length ? scope.levels.join(', ') : 'All levels');
      metaEl.textContent = `${scopeStr} · ${stats.total} items across ${new Set(all.map(i => i.kid_slug)).size} kids`;
    }

    // Stats strip
    const strip = $('#triage-stats-strip');
    if (strip) {
      strip.innerHTML = `
        <div class="triage-stat"><div class="v">${stats.total}</div><div class="k">Total items</div></div>
        <div class="triage-stat verified"><div class="v">${stats.verified}</div><div class="k">🟢 Verified</div></div>
        <div class="triage-stat fixed"><div class="v">${stats.fixed}</div><div class="k">✅ Fixed</div></div>
        <div class="triage-stat needs"><div class="v">${stats.needs_action}</div><div class="k">🟡 Needs action</div></div>
        <div class="triage-stat notreviewed"><div class="v">${stats.not_reviewed}</div><div class="k">⚪ Not reviewed</div></div>
      `;
    }
    const bar = $('#triage-progress-bar > span');
    if (bar) bar.style.width = stats.pct + '%';

    // Kid filter dropdown
    const kidSel = $('#triage-filter-kid');
    if (kidSel) {
      const kids = [...new Map(all.map(i => [i.kid_slug, i])).values()]
        .sort((a, b) => (a.kid_name || '').localeCompare(b.kid_name || ''));
      const cur = _triageFilters.kid || '';
      kidSel.innerHTML = `<option value="">All (${kids.length})</option>` +
        kids.map(k => `<option value="${_attr(k.kid_slug)}" ${k.kid_slug === cur ? 'selected' : ''}>${_esc(k.kid_name)}${k.kid_level ? ' · ' + _esc(k.kid_level) : ''}</option>`).join('');
    }
    const catSel = $('#triage-filter-category');
    if (catSel) catSel.value = _triageFilters.category || '';
    const stSel = $('#triage-filter-status');
    if (stSel) stSel.value = _triageFilters.status || 'open';

    // Items list (filtered)
    const filtered = _triageFilteredItems(all);
    const cntEl = $('#triage-result-count');
    if (cntEl) cntEl.textContent = `${filtered.length} of ${all.length} shown`;

    const listEl = $('#triage-list');
    if (listEl) {
      if (!filtered.length) {
        listEl.innerHTML = '<div class="triage-empty">No items match the current filters. Try changing the status filter to "All".</div>';
      } else {
        listEl.innerHTML = filtered.map(_triageRenderCard).join('');
      }
    }
  }

  function _triageRenderCard(item) {
    const st = _triageLoadStatus(item.kid_slug, item.id);
    const catLabel = _TRIAGE_CATEGORY_LABELS[item.category] || item.category;
    const buttons = _TRIAGE_STATUSES.map(s => `
      <button class="triage-status-btn ${s.id} ${st.status === s.id ? 'active' : ''}"
              data-triage-status data-triage-id="${_attr(item.id)}" data-triage-kid="${_attr(item.kid_slug)}"
              data-triage-target="${s.id}">
        ${s.emoji} ${s.label}
      </button>
    `).join('');
    const meta = [item.kid_grade, item.kid_level, item.kid_campus].filter(Boolean).join(' · ');
    return `
      <div class="triage-card status-${_attr(st.status)}" data-triage-card="${_attr(item.id)}">
        <div class="triage-card-head">
          <span class="kid"><a href="${_attr(item.link_hash)}">${_esc(item.kid_name)}</a></span>
          <span class="meta">${_esc(meta)}</span>
          <span class="triage-cat-badge cat-${_attr(item.category)}">${_esc(catLabel)}</span>
        </div>
        <div class="triage-card-desc">${_esc(item.title)}</div>
        ${item.evidence ? `<div class="triage-card-evidence">${_esc(item.evidence)}</div>` : ''}
        <div class="triage-status-buttons">${buttons}</div>
        <textarea class="triage-notes-input" placeholder="Add a one-line note (optional)…"
                  data-triage-notes data-triage-id="${_attr(item.id)}" data-triage-kid="${_attr(item.kid_slug)}"
                  rows="1">${_esc(st.notes)}</textarea>
      </div>
    `;
  }

  function _triageBuildReport() {
    const all = _triageItemsCache || _triageBuildItems();
    const groups = { verified: [], fixed: [], needs_action: [] };
    all.forEach(it => {
      const st = _triageLoadStatus(it.kid_slug, it.id);
      if (st.status === 'not_reviewed') return;
      groups[st.status] = groups[st.status] || [];
      groups[st.status].push({ item: it, status: st });
    });
    const scope = _triageCurrentScope();
    const scopeStr = (scope.campuses && scope.campuses.length ? scope.campuses.join(', ') : 'All campuses')
      + ' · ' + (scope.levels && scope.levels.length ? scope.levels.join(', ') : 'All levels');
    const lines = [];
    lines.push(`# Triage report — ${scopeStr}`);
    lines.push(`_Generated ${new Date().toISOString()}_`);
    lines.push('');
    const sectionFor = (key, title, emoji) => {
      const arr = groups[key] || [];
      lines.push(`## ${emoji} ${title} (${arr.length})`);
      lines.push('');
      if (!arr.length) {
        lines.push('_(none)_');
        lines.push('');
        return;
      }
      arr.forEach(({ item, status }) => {
        const cat = _TRIAGE_CATEGORY_LABELS[item.category] || item.category;
        lines.push(`### ${item.kid_name}${item.kid_level ? ' · ' + item.kid_level : ''} — ${cat}`);
        lines.push(`- **Item:** ${item.title}`);
        if (item.evidence) {
          const ev = String(item.evidence).split('\n').map(l => '  > ' + l).join('\n');
          lines.push(`- **Evidence:**`);
          lines.push(ev);
        }
        if (status.notes) lines.push(`- **Note:** ${status.notes}`);
        if (status.ts) lines.push(`- _Reviewed ${status.ts}_`);
        lines.push('');
      });
    };
    sectionFor('verified',     'What was correct',  '🟢');
    sectionFor('fixed',        "What's fixed",      '✅');
    sectionFor('needs_action', 'What still needs work', '🟡');
    return {
      markdown: lines.join('\n'),
      counts: {
        verified: (groups.verified || []).length,
        fixed: (groups.fixed || []).length,
        needs_action: (groups.needs_action || []).length
      }
    };
  }

  function _triageOpenReportModal() {
    const modal = $('#triage-report-modal');
    if (!modal) return;
    const { markdown, counts } = _triageBuildReport();
    const ta = $('#triage-report-text');
    if (ta) ta.value = markdown;
    const sub = $('#triage-report-modal-sub');
    if (sub) sub.textContent = `🟢 ${counts.verified} verified · ✅ ${counts.fixed} fixed · 🟡 ${counts.needs_action} needs action`;
    modal.hidden = false;
  }

  function _triageWireEvents() {
    if (window.__triage_wired) return;
    window.__triage_wired = true;

    // Filter bar
    document.addEventListener('change', (e) => {
      const t = e.target;
      if (t.id === 'triage-filter-kid') { _triageFilters.kid = t.value; updateURLHash('triage'); renderTriage(); }
      else if (t.id === 'triage-filter-category') { _triageFilters.category = t.value; updateURLHash('triage'); renderTriage(); }
      else if (t.id === 'triage-filter-status') { _triageFilters.status = t.value; updateURLHash('triage'); renderTriage(); }
    });

    // Status buttons + notes — delegated
    document.addEventListener('click', (e) => {
      const stBtn = e.target.closest('[data-triage-status]');
      if (stBtn) {
        const id = stBtn.dataset.triageId;
        const kid = stBtn.dataset.triageKid;
        const target = stBtn.dataset.triageTarget;
        _triageSaveStatus(kid, id, { status: target });
        renderTriage();
        return;
      }
      if (e.target && e.target.id === 'triage-report-btn') {
        _triageOpenReportModal();
        return;
      }
      if (e.target && e.target.id === 'triage-report-close') {
        const m = $('#triage-report-modal'); if (m) m.hidden = true;
        return;
      }
      if (e.target && e.target.id === 'triage-report-copy') {
        const ta = $('#triage-report-text');
        if (ta) {
          ta.select();
          try { document.execCommand('copy'); } catch (_) {}
          if (navigator.clipboard) navigator.clipboard.writeText(ta.value).catch(() => {});
          e.target.textContent = 'Copied ✓';
          setTimeout(() => { e.target.textContent = '⎘ Copy markdown'; }, 1500);
        }
        return;
      }
      if (e.target && e.target.id === 'triage-report-email') {
        const { markdown, counts } = _triageBuildReport();
        const subject = `[Brain Dashboard] Triage report — ${counts.verified} verified / ${counts.fixed} fixed / ${counts.needs_action} needs action`;
        const href = `mailto:tripti.khetan@trilogy.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(markdown)}`;
        window.location.href = href;
        return;
      }
    });

    // Notes — debounced save on input
    let _notesTimer = null;
    document.addEventListener('input', (e) => {
      const ta = e.target.closest('[data-triage-notes]');
      if (!ta) return;
      const id = ta.dataset.triageId;
      const kid = ta.dataset.triageKid;
      const val = ta.value;
      clearTimeout(_notesTimer);
      _notesTimer = setTimeout(() => {
        _triageSaveStatus(kid, id, { notes: val });
      }, 300);
    });
  }
  // ==== /TRIAGE ====

  function renderSystemic() {
    const issues = DATA.systemic || [];
    const cntEl = $('#systemic-count');
    if (cntEl) cntEl.textContent = issues.length;
    const sideCount = $('#sidebar-systemic-count');
    if (sideCount) sideCount.textContent = issues.length;
    const body = $('#systemic-body');
    if (!body) return;
    if (!issues.length) {
      body.innerHTML = '<div class="muted" style="padding:20px;text-align:center;">No systemic issues flagged.</div>';
      return;
    }
    body.innerHTML = `<table>
      <thead><tr><th>Issue</th><th>Type</th><th class="r">Students</th><th>Campuses</th><th>Status</th></tr></thead>
      <tbody>${issues.map(s => `<tr>
        <td><b>${_esc(s.title)}</b><div class="muted" style="font-size:11px;">${_esc(s.detail || '')}</div></td>
        <td><span class="pill">${_esc(s.kind || '')}</span></td>
        <td class="r tnum danger">${s.affects || 0}</td>
        <td class="muted">${_esc((s.campuses || []).join(', '))}</td>
        <td><span class="pill ${s.status === 'open' ? 'doom' : ''}">${s.status || 'open'}</span></td>
      </tr>`).join('')}</tbody>
    </table>`;
  }

  function renderAll() {
    const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[render]', name, e); } };
    safe('district', renderDistrict);
    safe('campus', renderCampus);
    safe('compare', renderCompare);
    safe('subject', renderSubject);
    safe('lesson', renderLesson);
    safe('student', renderStudent);
    if (DATA.students) safe('studentsDir', renderStudentsDir);
    if (DATA.student_dds && Object.keys(DATA.student_dds).length) safe('studentDD', renderStudentDD);
    if (DATA.tests) safe('testing', renderTesting);
    if (DATA.coaches) safe('coaching', renderCoaching);
    if (DATA.systemic) safe('systemic', renderSystemic);
    if (DATA.students) safe('triage', renderTriage);
  }

  function renderSidebarCampuses() {
    if (!DATA || !DATA.campuses) return;
    const sideEl = document.getElementById('sidebar-campuses');
    if (sideEl) {
      sideEl.innerHTML = DATA.campuses.map(c => `
        <div class="side-item" data-view="campus" data-campus="${c.id}">
          ${c.name} <span class="tag-count">${c.students}</span>
        </div>
      `).join('');
    }
    const cmdEl = document.getElementById('cmd-campuses');
    if (cmdEl) {
      cmdEl.innerHTML = DATA.campuses.map(c => `
        <div class="cmd-item" data-view="campus" data-campus="${c.id}">${c.name} · ${c.students} students<span class="hint">${(c.short || c.id).toUpperCase()}</span></div>
      `).join('');
    }
    // DRI scoping (Agent D): re-apply the per-DRI sidebar visibility filter
    // every time we rebuild campus rows so the hidden state survives reseats.
    if (typeof applyDRIToSidebar === 'function') applyDRIToSidebar();
  }

  async function boot() {
    // The inliner now bootstraps DATA via gzip+base64 + DecompressionStream
    // (window.__DATA_BOOT_PROMISE). Await it before rendering. Falls back to
    // window.DATA (legacy) or fetch('data.json') for dev/non-inlined deploys.
    if (window.__DATA_BOOT_PROMISE) {
      try { await window.__DATA_BOOT_PROMISE; } catch (e) { console.error('[boot] DATA decompress failed', e); }
    }
    if (window.DATA) {
      DATA = window.DATA;
    } else {
      // Vercel deploy path — fetch from authenticated API route. The
      // patched bottom-of-file IIFE may not have set window.DATA yet
      // (race when document.readyState is already 'complete'). Fall back
      // to the same auth-gated endpoint here.
      const res = await fetch('/api/dashboard-data', { credentials: 'same-origin' });
      DATA = await res.json();
      window.DATA = DATA;
    }
    // ==== DRI SCOPING boot hook ====
    // Resolve viewer mode from URL ?as= (preferred) → localStorage → 'tripti'.
    // Sync per-DRI level filter sets BEFORE renderAll so filters honor scope.
    _initDriModeFromEnv();
    {
      const _scope0 = currentDriScope();
      if (typeof _campusActiveLevels !== 'undefined' && _campusActiveLevels) {
        _campusActiveLevels.clear();
        _scope0.levels.forEach(l => _campusActiveLevels.add(l));
      }
      if (typeof _monActiveLevels !== 'undefined' && _monActiveLevels) {
        _monActiveLevels.clear();
        _scope0.levels.forEach(l => _monActiveLevels.add(l));
      }
    }
    if (!CURRENT_CAMPUS && DATA.campuses && DATA.campuses[0]) {
      // Prefer an in-scope campus when one exists.
      const inScope = DATA.campuses.find(isCampusInScope);
      CURRENT_CAMPUS = (inScope || DATA.campuses[0]).id;
    }
    const saved = localStorage.getItem('btx-theme') || 'cool';
    setTheme(saved);
    setupNav();
    setupCmd();
    setupCampusSwitcher();
    setupDriModeUI();
    setupFeedbackModal();
    renderSidebarCampuses();
    renderDriModePill();
    applyDRIToSidebar();
    _triageWireEvents();
    renderAll();
    // Phase 4: honor URL hash on first load (shareable links)
    if (location.hash && location.hash.startsWith('#/')) {
      applyURLHash();
    } else {
      go('district');
    }
    // React to back/forward + manual hash edits
    window.addEventListener('hashchange', applyURLHash);

    // Phase 4: keyboard navigation
    document.addEventListener('keydown', (e) => {
      // Don't intercept when typing in textarea/input
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === '/') {
        e.preventDefault();
        document.getElementById('sidebar-search')?.focus();
      } else if (k === 'd') {
        // On DD with focus on action buttons, mark current as Done
        const focused = document.activeElement;
        if (focused?.classList?.contains('dd-action-btn')) return;
      } else if (k === 'g') {
        e.preventDefault();
        go('district');
      } else if (k === 's' && document.activeElement?.tagName !== 'BUTTON') {
        e.preventDefault();
        go('students');
      } else if (k === 'escape') {
        document.getElementById('sidebar-search')?.blur();
      } else if (k === '?') {
        alert('Keyboard shortcuts:\n  /     Focus search\n  G     Go to District\n  S     Go to Students roster\n  ⌘K    Open command palette\n  Esc   Close search');
      }
    });

    // Sidebar search → filter student roster, jump to single match
    const ss = document.getElementById('sidebar-search');
    if (ss) {
      ss.addEventListener('input', e => {
        const q = e.target.value.trim().toLowerCase();
        if (!q) { go('district'); return; }
        DD_SLUG = null;
        const matches = Object.values(DATA.student_dds || {}).filter(d =>
          (d.identity?.name || '').toLowerCase().includes(q)
        );
        if (matches.length === 1) { DD_SLUG = matches[0].id; go('student-dd'); }
        else { /* future: show match list */ go('students'); }
      });
    }

    // Delegated copy-handoff button
    document.body.addEventListener('click', e => {
      const b = e.target.closest('.copy-handoff');
      if (!b) return;
      const text = (window.__handoffs || {})[b.dataset.handoffKey];
      if (text) navigator.clipboard.writeText(text);
      b.textContent = 'Copied ✓';
      setTimeout(() => b.textContent = '⎘ Copy DRI handoff', 1500);
    });
  }

  // staticrypt decrypts AFTER DOMContentLoaded fires — listener would never run.
  // Fall back to immediate boot if document already parsed.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

/* ================================================================
 * alpha-academic-ui bootstrap shim
 * ----------------------------------------------------------------
 * Injected by scripts/sync-dashboard-assets.sh. Replaces the inline
 * base64-gzip data loader with an authenticated fetch from
 * /api/dashboard-data. window.DRI_MODE is already set by the
 * Next.js host page before this file loads.
 * ================================================================ */
(function () {
  if (typeof window === 'undefined') return;
  window.__BOOT_FETCH_DATA = async function () {
    const r = await fetch('/api/dashboard-data', { credentials: 'same-origin' });
    if (!r.ok) {
      throw new Error('Failed to load dashboard data: HTTP ' + r.status);
    }
    return await r.json();
  };
  // Override the legacy decompression promise so the existing boot()
  // sequence picks up our fetched payload as window.DATA.
  window.__DATA_BOOT_PROMISE = (async function () {
    try {
      const data = await window.__BOOT_FETCH_DATA();
      if (data && data.status === 'data_pending') {
        // Show a friendly message instead of trying to render empty state.
        const root = document.getElementById('dashboard-root') || document.body;
        const note = document.createElement('div');
        note.style.cssText = 'padding:48px;font-family:system-ui;max-width:640px;margin:48px auto;border:1px solid #e5e7eb;border-radius:8px;background:#fff;';
        note.innerHTML =
          '<h1 style="font-size:22px;margin:0 0 12px;">Data is still being prepared</h1>' +
          '<p style="color:#374151;line-height:1.5;">' +
          (data.message || 'The next nightly snapshot will populate this view.') +
          '</p>';
        root.prepend(note);
        // Provide an empty-but-valid payload so render.js can still mount.
        window.DATA = { campuses: [], students: [], tests: { library: [] } };
        return;
      }
      window.DATA = data;
    } catch (e) {
      console.error('[boot] dashboard-data fetch failed', e);
      window.DATA = { campuses: [], students: [], tests: { library: [] } };
    }
  })();
})();
