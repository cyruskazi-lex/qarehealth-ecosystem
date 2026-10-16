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
    return '' +
      '<header class="qbar">' +
        '<a href="../../index.html" class="wordmark" title="All Qäre apps">Qäre<span class="dot">·</span>Health</a>' +
        '<span class="app-name">' + esc(opts.appName || '') + '</span>' +
        '<span class="live"><span class="d"></span>one exchange, live</span>' +
        '<span class="spacer"></span>' +
        (opts.personaName ? (
          '<span class="persona"><span class="ava">' + esc(initials) + '</span>' +
          '<span><span class="pn">' + esc(opts.personaName) + '</span><br><span class="pr">' + esc(opts.personaRole || '') + '</span></span></span>'
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

  global.QareUI = {
    init: function (app) { selfApp = app; },
    esc: esc, money: money, timeOf: timeOf,
    statusChip: statusChip, topbar: topbar, impactPanel: impactPanel,
    toast: toast, watchToasts: watchToasts
  };
})(typeof window !== 'undefined' ? window : this);
