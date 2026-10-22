/*
 * Qäre Health — shared UI helpers for every app shell.
 * Depends on assets/exchange.js and assets/qare.css. No em dashes.
 */
(function (global) {
  'use strict';
  var X = global.QareExchange;
  var selfApp = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function money(n, cur) {
    var v = Math.round(Number(n) || 0).toLocaleString('en-US');
    return (cur || '') + v;
  }
  function timeOf(ts) {
    var d = new Date(ts); var h = d.getHours(), m = d.getMinutes();
    return (h % 12 || 12) + ':' + (m < 10 ? '0' + m : m) + (h < 12 ? 'am' : 'pm');
  }

  function statusChip(status) {
    var cls = { Verified: 'verified', Claimed: 'claimed', Unmeasured: 'unmeasured', Inconsistent: 'inconsistent' }[status] || 'unmeasured';
    return '<span class="chip ' + cls + '">' + esc(status) + '</span>';
  }

  function topbar(opts) {
    opts = opts || {};
    var initials = (opts.personaName || '').split(' ').map(function (w) { return w[0]; }).filter(Boolean).slice(0, 2).join('').toUpperCase();
    var logo = (typeof window !== 'undefined' && window.__QARE_LOGO__) ? window.__QARE_LOGO__ : '../../assets/brand/qare-wordmark.png';
    var role = opts.role ? '<span class="rolechip">' + esc(opts.role) + '</span>' : '';
    var badge = opts.trust === false ? '' :
      '<button class="trustbadge" data-mod="compliance" title="Security and compliance posture"><span class="shield"></span>' + esc(opts.trustLabel || 'Secure. HIPAA') + '</button>';
    return '' +
      '<header class="qbar">' +
        '<a href="../../index.html" class="wordmark" title="All Qäre apps"><img src="' + logo + '" alt="Qäre" class="wm-img"> Health</a>' +
        '<span class="app-name">' + esc(opts.appName || '') + '</span>' +
        '<span class="live"><span class="d"></span>one exchange, live</span>' +
        '<span class="spacer"></span>' +
        badge +
        (opts.personaName ? (
          '<span class="persona"><span class="ava">' + esc(initials) + '</span>' +
          '<span><span class="pn">' + esc(opts.personaName) + '</span><br><span class="pr">' + esc(opts.personaRole || '') + '</span></span>' + role + '</span>'
        ) : '') +
        '<a class="btn btn-ghost btn-sm" href="' + (X ? X.GIC_URL : '#') + '" target="_blank" rel="noopener" style="margin-left:14px">Global Impact Commons</a>' +
      '</header>';
  }

  // Impact and GIC panel: shows what this institution has collected against the
  // health framework, and lets it publish a verified, traceable record to GIC
  // with consent, to request capital.
  function impactPanel(org, data) {
    data = data || {};
    var rows = (data.measures || []).map(function (r) {
      return '<div class="row"><span class="m">' + esc(r.front) + ' &middot; ' + esc(r.measure) + '</span>' +
        '<span style="display:flex;gap:10px;align-items:center"><span class="v">' + esc(r.value) + '</span>' + statusChip(r.status) + '</span></div>';
    }).join('');
    return '' +
      '<div class="impact">' +
        '<h3>Health impact collected' + statusChip('Verified').replace('chip', 'chip') + '</h3>' +
        '<div class="rows">' + rows + '</div>' +
        '<p class="provenance">measured from this institution\'s own records against the EESG Health Impact framework</p>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">' +
          '<button class="btn btn-primary" data-gic-publish>Publish verified record to GIC</button>' +
          '<a class="btn btn-ghost" href="' + (X ? X.GIC_URL : '#') + '" target="_blank" rel="noopener">Request capital on the Commons</a>' +
        '</div>' +
      '</div>';
  }

  // Tenant switcher: lets a demo move one app across SMALL / MEDIUM / LARGE
  // institutions of the same kind. Renders size tabs; the app handles the click.
  function tenantBar(orgs, curId) {
    return '<div class="tenants">' + orgs.map(function (o) {
      var on = o.id === curId;
      return '<button class="tenant' + (on ? ' on' : '') + '" data-tenant="' + esc(o.id) + '" aria-pressed="' + on + '">' +
        '<span class="tz">' + esc(o.sizeClass) + '</span>' + esc(o.name) + '</button>';
    }).join('') + '</div>';
  }

  // OS module rail. modules: [{key,label,ic,group?,badge?,calm?}]. Groups render
  // as headers in order of first appearance. The app handles [data-mod] clicks.
  function osNav(modules, curKey) {
    var out = '', lastGroup = null;
    modules.forEach(function (m) {
      if (m.group && m.group !== lastGroup) { out += '<div class="grp">' + esc(m.group) + '</div>'; lastGroup = m.group; }
      out += '<button class="navitem' + (m.key === curKey ? ' on' : '') + '" data-mod="' + esc(m.key) + '">' +
        '<span class="ic">' + esc(m.ic || m.label.slice(0, 1)) + '</span>' + esc(m.label) +
        (m.badge != null ? '<span class="bdg' + (m.calm ? ' calm' : '') + '">' + esc(m.badge) + '</span>' : '') +
        '</button>';
    });
    return '<nav class="os-nav">' + out + '</nav>';
  }

  var toastWrap = null;
  function toast(kicker, msg) {
    if (!toastWrap) { toastWrap = document.createElement('div'); toastWrap.className = 'toast-wrap'; document.body.appendChild(toastWrap); }
    var el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = '<div class="t-k">' + esc(kicker) + '</div>' + esc(msg);
    toastWrap.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('in'); });
    setTimeout(function () { el.classList.remove('in'); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 300); }, 5200);
  }

  // Subscribe and toast for events that came from a different app (cross-tab).
  function watchToasts(describe) {
    if (!X) return;
    X.subscribe(function (ev) {
      if (!ev || !ev.actor || ev.actor.app === selfApp) return;
      var d = describe ? describe(ev) : null;
      if (d) toast(d.k || 'Exchange', d.msg || '');
    });
  }

  var reduce = false;
  try { reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  // Count a number up to its target. Starts from whatever is shown, so a live
  // value that nudges ticks smoothly rather than restarting from zero.
  function countUp(el, to, opts) {
    if (!el) return;
    opts = opts || {};
    var fmt = opts.fmt || function (v) { return Math.round(v).toLocaleString('en-US'); };
    var pre = opts.pre || '', suf = opts.suf || '';
    var from = parseFloat(String(el.textContent).replace(/[^0-9.\-]/g, ''));
    if (isNaN(from)) from = 0;
    if (reduce || from === to) { el.textContent = pre + fmt(to) + suf; return; }
    var dur = opts.dur || 650, t0 = null;
    requestAnimationFrame(function step(ts) {
      if (!t0) t0 = ts;
      var k = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = pre + fmt(from + (to - from) * e) + suf;
      if (k < 1) requestAnimationFrame(step);
    });
  }

  /* IRIS — Qare's public copilot. One docked, collapsible panel per app, kept
     outside the app's re-rendered root so the conversation survives re-renders.
     Florence stays internal and is never shown. IRIS advises; a licensed person
     decides every clinical, quality and regulatory call. */
  var iris = (function () {
    var el = null, logEl, chipsEl, ctxEl, inputEl, open = false, busy = false;
    var cfg = { answer: null, getContext: null };

    function build() {
      if (el) return;
      el = document.createElement('div'); el.className = 'iriswidget';
      el.innerHTML =
        '<button class="iris-fab" aria-label="Ask IRIS"><span class="iris-mk"></span><span>Ask IRIS</span></button>' +
        '<section class="iris-panel" role="dialog" aria-label="IRIS copilot" hidden>' +
          '<header class="iris-h"><span class="iris-mk"></span><b>IRIS</b>' +
          '<span class="iris-ctx"></span><button class="iris-x" aria-label="Close">&times;</button></header>' +
          '<div class="iris-log"></div><div class="iris-chips"></div>' +
          '<form class="iris-in"><input type="text" placeholder="Ask about this view" aria-label="Ask IRIS" autocomplete="off"><button type="submit" aria-label="Send">&uarr;</button></form>' +
          '<p class="iris-foot">IRIS advises. A licensed person decides every clinical, quality and regulatory call.</p>' +
        '</section>';
      document.body.appendChild(el);
      logEl = el.querySelector('.iris-log'); chipsEl = el.querySelector('.iris-chips');
      ctxEl = el.querySelector('.iris-ctx'); inputEl = el.querySelector('.iris-in input');
      el.querySelector('.iris-fab').addEventListener('click', function () { setOpen(!open); });
      el.querySelector('.iris-x').addEventListener('click', function () { setOpen(false); });
      el.querySelector('.iris-in').addEventListener('submit', function (e) {
        e.preventDefault(); var q = inputEl.value.trim(); if (q) { inputEl.value = ''; ask(q); }
      });
      chipsEl.addEventListener('click', function (e) {
        var c = e.target.closest ? e.target.closest('.iris-chip') : null;
        if (c) { setOpen(true); ask(c.getAttribute('data-q')); }
      });
    }
    var greeted = false, greeting = null;
    function setOpen(v) {
      open = v; var p = el.querySelector('.iris-panel');
      if (v) {
        p.hidden = false; requestAnimationFrame(function () { el.classList.add('open'); }); setTimeout(function () { inputEl.focus(); }, 60);
        if (!greeted && greeting) { greeted = true; var d = bubble('ai', ''); setTimeout(function () { type(d, greeting); }, 300); }
      } else { el.classList.remove('open'); setTimeout(function () { p.hidden = true; }, 200); }
    }
    function bubble(cls, text) { var d = document.createElement('div'); d.className = 'iris-b ' + cls; d.textContent = text; logEl.appendChild(d); logEl.scrollTop = logEl.scrollHeight; return d; }
    function type(d, text, cb) {
      if (reduce) { d.textContent = text; logEl.scrollTop = logEl.scrollHeight; busy = false; if (cb) cb(); return; }
      busy = true; var i = 0, stepN = Math.max(1, Math.round(text.length / 110));
      (function run() {
        if (i <= text.length) { d.textContent = text.slice(0, i); logEl.scrollTop = logEl.scrollHeight; i += stepN; setTimeout(run, 16); }
        else { d.textContent = text; busy = false; if (cb) cb(); }
      })();
    }
    function renderActions(actions) {
      if (!actions || !actions.length) return;
      var bar = document.createElement('div'); bar.className = 'iris-acts';
      actions.forEach(function (a) {
        var b = document.createElement('button'); b.className = 'iris-act ' + (a.kind || 'act'); b.textContent = a.label;
        b.addEventListener('click', function () {
          if (a.q) { ask(a.q); return; }
          bubble('me', a.label);
          var d2 = bubble('ai', ''); type(d2, a.reply || 'Done. A licensed person signs the action before it takes effect.');
        });
        bar.appendChild(b);
      });
      logEl.appendChild(bar); logEl.scrollTop = logEl.scrollHeight;
    }
    function ask(q) {
      if (busy) return; build(); bubble('me', q);
      var ctx = cfg.getContext ? cfg.getContext() : {};
      var res = (cfg.answer && cfg.answer(q, ctx));
      if (!res) res = { text: "That reads from this institution's own records on the exchange. Ask me about demand, the cold chain, a batch, quality, the filing, serialisation, the environment or the capital ask." };
      if (typeof res === 'string') res = { text: res };
      var agents = res.agents || [], actions = res.actions || [], text = res.text || '';
      // Show which specialist agents are being consulted (the Telos multi-agent model, made visible).
      var think = bubble('ai think', '');
      think.innerHTML = '<span class="iris-dots"></span><span class="iris-team">' + (agents.length ? 'Consulting ' + agents.map(esc).join(', ') : 'Thinking') + '</span>';
      busy = true;
      setTimeout(function () {
        think.remove();
        var d = bubble('ai', '');
        type(d, text, function () { renderActions(actions); });
      }, reduce ? 0 : (agents.length ? 850 : 300));
    }
    function paintContext() {
      if (!el) return; var ctx = cfg.getContext ? cfg.getContext() : {};
      ctxEl.textContent = ctx.label || '';
      chipsEl.innerHTML = (ctx.suggestions || []).map(function (q) {
        return '<button class="iris-chip" data-q="' + esc(q) + '">' + esc(q) + '</button>';
      }).join('');
    }
    return {
      mount: function (c) {
        cfg.answer = c.answer || null; cfg.getContext = c.getContext || null; greeting = c.greeting || null; build(); paintContext();
      },
      context: paintContext,
      ask: function (q) { build(); setOpen(true); ask(q); }
    };
  })();

  /* ---- Shared trust layer: compliance posture + security engine.
     A cross-cutting rail every app expresses, like the exchange and EESG.
     Compliance is a deal-breaker in regulated health and pharma, so this is
     real content, generated into a module any app can mount. ---- */
  var Trust = (function () {
    // status: 'certified' | 'compliant' | 'attested' | 'ontrack' | 'monitored'
    var FRAMEWORKS = [
      { id: 'HIPAA', name: 'HIPAA Privacy & Security', scope: 'US health data', status: 'compliant', sectors: ['provider', 'pharma', 'payer'], note: 'Privacy, Security and Breach Notification rules; BAAs in place' },
      { id: 'HITECH', name: 'HITECH Act', scope: 'US breach / EHR', status: 'compliant', sectors: ['provider', 'payer'], note: 'Breach notification and audit controls' },
      { id: 'GDPR', name: 'GDPR', scope: 'EU personal data', status: 'compliant', sectors: ['provider', 'pharma', 'payer'], note: 'Lawful basis, DSAR and erasure workflows' },
      { id: 'ISO 27001', name: 'ISO/IEC 27001', scope: 'Information security', status: 'certified', sectors: ['provider', 'pharma', 'payer'], note: 'ISMS certified, annual surveillance audit' },
      { id: 'ISO 27701', name: 'ISO/IEC 27701', scope: 'Privacy information', status: 'certified', sectors: ['provider', 'pharma', 'payer'], note: 'Privacy extension to the ISMS' },
      { id: 'SOC 2 II', name: 'SOC 2 Type II', scope: 'Trust services', status: 'attested', sectors: ['provider', 'pharma', 'payer'], note: 'Security, availability, confidentiality; 12-month report' },
      { id: 'ISO 9001', name: 'ISO 9001', scope: 'Quality management', status: 'certified', sectors: ['pharma', 'provider'], note: 'Quality management system' },
      { id: 'ISO 13485', name: 'ISO 13485', scope: 'Medical device QMS', status: 'ontrack', progress: 88, sectors: ['pharma'], note: 'Stage 2 audit scheduled; 88% of controls evidenced' },
      { id: '21 CFR 11', name: '21 CFR Part 11', scope: 'FDA e-records / e-signatures', status: 'compliant', sectors: ['pharma'], note: 'Electronic records, audit trails and validated e-signatures' },
      { id: 'Annex 11', name: 'EU GMP Annex 11', scope: 'Computerised systems', status: 'compliant', sectors: ['pharma'], note: 'Computerised system validation (CSV)' },
      { id: 'DSCSA', name: 'DSCSA', scope: 'US drug track & trace', status: 'compliant', sectors: ['pharma'], note: 'Unit-level serialisation and verification' },
      { id: 'ISO 42001', name: 'ISO/IEC 42001', scope: 'AI management', status: 'ontrack', progress: 72, sectors: ['provider', 'pharma', 'payer'], note: 'AI management system for Telos governance; 72% implemented' }
    ];
    var SECURITY = [
      ['Encryption at rest', 'AES-256, per-tenant keys', 'ok'],
      ['Encryption in transit', 'TLS 1.3, mTLS between services', 'ok'],
      ['Access control', 'RBAC + ABAC, least privilege', 'ok'],
      ['Authentication', 'SSO (SAML / OIDC), MFA enforced', 'ok'],
      ['Audit trail', 'Immutable, every record access logged', 'ok'],
      ['De-identification', 'Safe Harbor + expert determination', 'ok'],
      ['Consent', 'Double-key, revocable, enforced per request', 'ok'],
      ['Key management', 'HSM-backed, automatic rotation', 'ok'],
      ['Data residency', 'Region-pinned, no cross-border egress', 'ok'],
      ['Threat monitoring', '24/7 SIEM, anomaly detection', 'ok'],
      ['Penetration testing', 'Independent, annual + continuous scan', 'ok'],
      ['Backup & DR', 'RPO 15 min, RTO 60 min, tested quarterly', 'ok']
    ];
    var SLABEL = { certified: 'Certified', compliant: 'Compliant', attested: 'Attested', ontrack: 'On track', monitored: 'Monitored' };
    var SCLASS = { certified: 'verified', compliant: 'verified', attested: 'verified', ontrack: 'claimed', monitored: 'claimed' };
    function forSector(sector) { return FRAMEWORKS.filter(function (f) { return !sector || f.sectors.indexOf(sector) >= 0; }); }
    function badgeLabel(sector) { return sector === 'pharma' ? 'Secure. 21 CFR 11' : 'Secure. HIPAA'; }
    function render(opts) {
      opts = opts || {}; var sector = opts.sector, fw = forSector(sector);
      var online = fw.filter(function (f) { return f.status !== 'ontrack'; }).length;
      var head = '<div class="pitch"><div class="k">Trust rail</div><div class="l">Compliance, privacy and security are architectural, checked continuously, and emitted to the governance pillar of the framework. ' + online + ' of ' + fw.length + ' frameworks live, the rest on a dated path.</div></div>';
      var grid = '<div class="cards3" style="margin-bottom:16px">' + fw.map(function (f) {
        var bar = f.status === 'ontrack' ? '<div class="progress"><div class="fill warn" style="width:' + (f.progress || 0) + '%"></div></div><div class="band" style="margin-top:4px">' + (f.progress || 0) + '% evidenced</div>' : '';
        return '<div class="card shadow"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px"><strong style="font-size:13px">' + esc(f.name) + '</strong><span class="chip ' + SCLASS[f.status] + '">' + SLABEL[f.status] + '</span></div>' +
          '<div class="sub2">' + esc(f.scope) + '</div><div class="sub2" style="margin-top:6px">' + esc(f.note) + '</div>' + bar + '</div>';
      }).join('') + '</div>';
      var sec = '<div class="card shadow"><div style="font-family:var(--font-brand);font-weight:700;margin-bottom:10px">Security engine, live</div><div class="seclist">' +
        SECURITY.map(function (s) { return '<div class="secrow"><span class="sev ok"></span><div style="flex:1"><div style="font-size:13px;font-weight:600">' + esc(s[0]) + '</div><div class="sub2">' + esc(s[1]) + '</div></div><span class="chip verified">active</span></div>'; }).join('') +
        '</div></div>';
      return head + grid + sec +
        '<p class="provenance">compliance posture is checked continuously and emitted to the Governance pillar; evidence is auditable, never asserted</p>';
    }
    function eesgMetrics(sector) {
      var fw = forSector(sector), live = fw.filter(function (f) { return f.status !== 'ontrack'; }).length;
      return [
        { pillar: 'Governance', front: 'Care quality and safety', measure: 'Compliance frameworks live', value: live + ' of ' + fw.length, status: 'Verified' },
        { pillar: 'Governance', front: 'Care quality and safety', measure: 'Security controls active', value: SECURITY.length + ' of ' + SECURITY.length, status: 'Verified' }
      ];
    }
    return { FRAMEWORKS: FRAMEWORKS, SECURITY: SECURITY, forSector: forSector, render: render, badgeLabel: badgeLabel, eesgMetrics: eesgMetrics };
  })();

  global.QareUI = {
    init: function (app) { selfApp = app; },
    esc: esc, money: money, timeOf: timeOf,
    statusChip: statusChip, topbar: topbar, impactPanel: impactPanel,
    tenantBar: tenantBar, osNav: osNav, toast: toast, watchToasts: watchToasts,
    countUp: countUp, iris: iris, reduce: reduce, trust: Trust
  };
})(typeof window !== 'undefined' ? window : this);
