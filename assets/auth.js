/*
 * Qäre Auth and session gate. Shared by every app.
 *
 * Renders a sign-in screen and a secure-loading splash before an app boots, so
 * every Qäre product opens the way an enterprise health system expects: an
 * authenticated, role-scoped, compliance-stated entry. This is a demo gate, not
 * real identity; it never transmits anything. SSO is simulated. The demo
 * credential is shown on the screen on purpose, the way a sales demo does.
 *
 * Usage: QareAuth.boot({ app:'Nexus', product:'nexus', sector:'pharma',
 *   roles:[{id,label,persona}], onReady:function(session){...} })
 *
 * No em dashes.
 */
(function (global) {
  'use strict';
  var SKEY = 'qare-session-v1';
  var DEMO = { email: 'demo@qarehealth.com', pw: 'Newyork2021!' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function logo() { return (global.__QARE_LOGO__) ? global.__QARE_LOGO__ : '../../assets/brand/qare-wordmark.png'; }
  function load() { try { return JSON.parse(global.sessionStorage.getItem(SKEY)); } catch (e) { return null; } }
  function save(s) { try { global.sessionStorage.setItem(SKEY, JSON.stringify(s)); } catch (e) {} }

  function screen(html) { var d = document.getElementById('qare-auth'); if (!d) { d = document.createElement('div'); d.id = 'qare-auth'; document.body.appendChild(d); } d.innerHTML = html; return d; }
  function clearScreen() { var d = document.getElementById('qare-auth'); if (d && d.parentNode) d.parentNode.removeChild(d); }

  function boot(cfg) {
    var product = cfg.product || 'app', app = cfg.app || 'Qäre', sector = cfg.sector || 'provider';
    var roles = cfg.roles && cfg.roles.length ? cfg.roles : [{ id: 'admin', label: 'Administrator' }];
    var existing = load();
    if (existing && existing.product === product) { cfg.onReady(existing); return; }

    var chosenRole = roles[0];

    function loginView(err) {
      screen(
        '<div class="auth-wrap"><div class="auth-card">' +
          '<div class="auth-brand"><img src="' + logo() + '" alt="Qäre" class="auth-logo"> Health</div>' +
          '<div class="auth-app">' + esc(app) + '</div>' +
          '<div class="auth-sub">Sign in to the ' + esc(app) + ' operating system</div>' +
          (err ? '<div class="auth-err">' + esc(err) + '</div>' : '') +
          '<form id="auth-form" novalidate>' +
            '<label class="auth-l">Work email</label><input id="auth-email" class="auth-in" type="email" autocomplete="username" value="' + DEMO.email + '" />' +
            '<label class="auth-l">Password</label><input id="auth-pw" class="auth-in" type="password" autocomplete="current-password" value="" placeholder="Enter your password" />' +
            '<label class="auth-l">Role</label><div class="auth-roles">' + roles.map(function (r, i) { return '<button type="button" class="auth-role' + (i === 0 ? ' on' : '') + '" data-role="' + esc(r.id) + '">' + esc(r.label) + '</button>'; }).join('') + '</div>' +
            '<button type="submit" class="auth-primary">Sign in</button>' +
          '</form>' +
          '<div class="auth-or"><span>or continue with single sign-on</span></div>' +
          '<div class="auth-sso">' +
            '<button class="auth-ssobtn" data-sso="Microsoft Entra ID">Microsoft Entra ID</button>' +
            '<button class="auth-ssobtn" data-sso="Google Workspace">Google Workspace</button>' +
            '<button class="auth-ssobtn" data-sso="SAML SSO">SAML / Okta</button>' +
          '</div>' +
          '<div class="auth-demo">Demo access: <b>' + DEMO.email + '</b> / <b>' + DEMO.pw + '</b></div>' +
          '<div class="auth-trust"><span class="shield"></span>Encrypted, MFA, audit-logged. HIPAA and ' + (sector === 'pharma' ? '21 CFR Part 11' : 'ISO 27001') + ' compliant.</div>' +
        '</div></div>'
      );
      var f = document.getElementById('auth-form');
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = document.getElementById('auth-email').value.trim();
        var pw = document.getElementById('auth-pw').value;
        if (pw === DEMO.pw || (email === DEMO.email && pw.length > 0)) { go('password', email); }
        else if (!pw) { loginView('Enter your password. Demo password is ' + DEMO.pw + '.'); }
        else { loginView('Those credentials were not recognised. Use the demo access shown below.'); }
      });
      Array.prototype.forEach.call(document.querySelectorAll('.auth-role'), function (b) {
        b.addEventListener('click', function () {
          Array.prototype.forEach.call(document.querySelectorAll('.auth-role'), function (x) { x.classList.remove('on'); });
          b.classList.add('on'); chosenRole = roles.filter(function (r) { return r.id === b.getAttribute('data-role'); })[0] || roles[0];
        });
      });
      Array.prototype.forEach.call(document.querySelectorAll('.auth-ssobtn'), function (b) {
        b.addEventListener('click', function () { go(b.getAttribute('data-sso'), DEMO.email); });
      });
    }

    function go(method, email) {
      var steps = [
        'Verifying identity and MFA',
        'Establishing TLS 1.3 session',
        'Applying role-based access (' + chosenRole.label + ')',
        'Loading ' + (sector === 'pharma' ? '21 CFR Part 11' : 'HIPAA') + '-compliant workspace'
      ];
      var d = screen(
        '<div class="auth-wrap"><div class="splash">' +
          '<div class="auth-brand big"><img src="' + logo() + '" alt="Qäre" class="auth-logo"> Health</div>' +
          '<div class="splash-app">' + esc(app) + '</div>' +
          '<div class="splash-steps" id="splash-steps">' + steps.map(function (s, i) { return '<div class="splash-step" data-i="' + i + '"><span class="sdot"></span>' + esc(s) + '</div>'; }).join('') + '</div>' +
          '<div class="splash-bar"><div class="splash-fill" id="splash-fill"></div></div>' +
          '<div class="splash-sign">' + (method === 'password' ? 'Signed in' : method + ' SSO') + ' &middot; ' + esc(email) + '</div>' +
        '</div></div>'
      );
      var reduce = false; try { reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
      var i = 0; var fill = document.getElementById('splash-fill');
      function next() {
        var el = d.querySelector('.splash-step[data-i="' + i + '"]');
        if (el) el.classList.add('on');
        i++; if (fill) fill.style.width = Math.min(100, i / steps.length * 100) + '%';
        if (i <= steps.length) { setTimeout(next, reduce ? 10 : 360); }
        else {
          var session = { product: product, app: app, email: email, method: method, role: chosenRole.id, roleLabel: chosenRole.label, persona: chosenRole.persona || null, at: Date.now() };
          save(session);
          setTimeout(function () { clearScreen(); cfg.onReady(session); }, reduce ? 10 : 260);
        }
      }
      next();
    }

    loginView(null);
  }

  global.QareAuth = {
    boot: boot,
    session: load,
    role: function () { var s = load(); return s ? s.role : null; },
    roleLabel: function () { var s = load(); return s ? s.roleLabel : null; },
    signOut: function () { try { global.sessionStorage.removeItem(SKEY); } catch (e) {} global.location && global.location.reload(); }
  };
})(typeof window !== 'undefined' ? window : this);
