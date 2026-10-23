/*
 * Qäre spine: jurisdiction packs, consent and access policy, the client registry
 * (identity matching), and FHIR-shaped views of the exchange. Loaded after
 * exchange.js; it extends QareExchange and keeps no state of its own. Everything
 * is derived from the event log, so every tab agrees.
 *
 * The logic here is real and runs in the browser. External rails (SMS, national
 * ID systems, a ledger) are simulated and labelled as such in the UI.
 *
 * Jurisdiction packs encode Qäre's default policy per country. They are a rules
 * summary, not legal advice, and need local counsel before any real use.
 *
 * No em dashes.
 */
(function (global) {
  'use strict';
  var X = global.QareExchange;
  if (!X) return;
  var h53 = X.hash53;
  var PACK_KEY = 'qare-pack-v1';

  /* ================= A. Jurisdiction packs ================= */

  var FLOWS = [
    { key: 'treatment', label: 'Treatment and care coordination' },
    { key: 'payment', label: 'Payment and claims' },
    { key: 'mandated', label: 'Mandated public-health reporting' },
    { key: 'secondary', label: 'Secondary use (industry signals, GIC aggregates)' },
    { key: 'research', label: 'Research' }
  ];

  function flowSet(treat, pay) {
    return {
      treatment: { consent: treat, restrict: true, revocable: 'restriction only, prospective', basis: 'Provision of care' },
      payment: { consent: pay, restrict: true, revocable: 'restriction only, prospective', basis: 'Payment and claims' },
      mandated: { consent: 'none, legal obligation', restrict: false, revocable: 'no', basis: 'Legal obligation', identified: true },
      secondary: { consent: 'opt-in', restrict: true, revocable: 'yes, prospective', basis: 'Patient opt-in' },
      research: { consent: 'separate opt-in plus ethics review', restrict: true, revocable: 'yes, prospective', basis: 'Patient opt-in and ethics approval' }
    };
  }

  var PACKS = {
    BD: { id: 'BD', country: 'Bangladesh', lead: true, language: 'Bangla',
      law: 'Comprehensive data-protection law status to be confirmed by counsel. This pack applies a consent-first baseline.',
      flows: flowSet('recorded notice', 'recorded notice'),
      crossBorder: 'Keep in country by default. Transfer only with patient consent and safeguards.', minCohort: 5,
      notifiable: [['Cholera', 'real-time'], ['Dengue', 'daily'], ['Tuberculosis', 'weekly'], ['Malaria', 'weekly']] },
    IN: { id: 'IN', country: 'India', lead: false, language: 'Hindi and regional',
      law: 'Digital Personal Data Protection Act 2023 and the ABDM health-data framework. Counsel to confirm which provisions apply.',
      flows: flowSet('recorded notice', 'recorded notice'),
      crossBorder: 'Keep in country by default. Transfer only to permitted destinations with safeguards.', minCohort: 5,
      notifiable: [['Cholera', 'real-time'], ['Dengue', 'daily'], ['Tuberculosis', 'weekly'], ['Malaria', 'weekly']] },
    KE: { id: 'KE', country: 'Kenya', lead: false, language: 'English and Kiswahili',
      law: 'Data Protection Act 2019 and the Health Act. Counsel to confirm which provisions apply.',
      flows: flowSet('recorded notice', 'recorded notice'),
      crossBorder: 'Keep in country by default. Transfer only with safeguards and, for health data, consent.', minCohort: 5,
      notifiable: [['Cholera', 'real-time'], ['Measles', 'daily'], ['Tuberculosis', 'weekly'], ['Malaria', 'weekly']] },
    US: { id: 'US', country: 'United States', lead: false, language: 'English',
      law: 'HIPAA and state law. Treatment, payment and operations need no consent; 42 CFR Part 2 records need their own consent.',
      flows: flowSet('none required', 'none required'),
      crossBorder: 'Permitted with safeguards and a business associate agreement.', minCohort: 11,
      notifiable: [['Measles', 'real-time'], ['Tuberculosis', 'weekly'], ['Salmonellosis', 'weekly'], ['Hepatitis A', 'weekly']] }
  };
  Object.keys(PACKS).forEach(function (k) { PACKS[k].status = 'Draft policy, a rules summary and not legal advice. Local counsel validates before real use.'; });

  function activePackId() {
    var ev = X.eventsOfType('PACK_SELECTED'), id = ev.length ? ev[ev.length - 1].payload.pack : null;
    if (!id) { try { id = global.localStorage.getItem(PACK_KEY); } catch (e) { id = null; } }
    return PACKS[id] ? id : 'BD';
  }
  function pack() { return PACKS[activePackId()]; }
  function selectPack(id, actor) {
    if (!PACKS[id]) return null;
    try { global.localStorage.setItem(PACK_KEY, id); } catch (e) {}
    return X.append('PACK_SELECTED', { pack: id }, actor || { app: 'core' });
  }

  /* ================= B. Consent and access policy ================= */

  function flowOf(p) { return p.flow || (p.to === 'research' ? 'secondary' : 'treatment'); }

  // The consent state for one patient, derived from the log. The last event for a
  // flow and recipient wins. Older Nova events (to: 'pulse' | 'research') map in.
  function consentState(patientId) {
    var st = {};
    X.events().forEach(function (e) {
      if (e.type !== 'CONSENT_GRANTED' && e.type !== 'CONSENT_REVOKED') return;
      var p = e.payload || {};
      if (patientId && p.patientId && p.patientId !== patientId) return;
      var flow = flowOf(p), rec = p.recipient || p.to || '*';
      st[flow + '|' + rec] = { flow: flow, recipient: rec, active: e.type === 'CONSENT_GRANTED', ts: e.ts, expires: p.expires || null, scope: p.scope || null, by: p.by || 'patient', ref: e.id };
    });
    return st;
  }

  function evaluate(req) {
    req = req || {};
    var pk = pack(), flow = req.flow, rule = pk.flows[flow], at = req.at || Date.now();
    function out(allow, basis, reason, extra) {
      var r = { allow: allow, basis: basis, reason: reason, flow: flow, recipient: req.recipient || null, pack: pk.id };
      if (extra) for (var k in extra) r[k] = extra[k];
      return r;
    }
    if (flow === 'delegated') {
      var dg = consentState(req.patientId)['delegated|' + req.recipient];
      if (!dg || !dg.active) return out(false, 'Delegation', 'No active delegation for this person');
      if (dg.expires && dg.expires < at) return out(false, 'Delegation', 'Delegation has expired');
      if (req.scope && dg.scope && dg.scope.indexOf(req.scope) < 0) return out(false, 'Delegation', 'Outside the scope the patient allowed (' + dg.scope.join(', ') + ')');
      return out(true, 'Delegated by the patient', 'Active delegation within scope', { expires: dg.expires });
    }
    if (!rule) return out(false, '', 'Unknown flow');
    if (flow === 'mandated') return out(true, rule.basis, 'No opt-out. Identified report to public health under the pack\'s list.', { audit: true });
    var st = consentState(req.patientId), g = st[flow + '|' + req.recipient] || st[flow + '|*'];
    if (flow === 'treatment' || flow === 'payment') {
      if (g && !g.active) {
        if (req.emergency) return out(true, 'Emergency access (break-glass)', 'Patient restriction overridden for an emergency. Logged and reviewed.', { audit: true, breakGlass: true });
        return out(false, rule.basis, 'Patient has restricted this recipient');
      }
      return out(true, rule.basis, 'Lawful basis: ' + rule.basis.toLowerCase() + '. Consent capture: ' + rule.consent + '.');
    }
    // secondary use and research need an active, unexpired opt-in
    if (!g || !g.active) return out(false, rule.basis, 'No active opt-in from the patient');
    if (g.expires && g.expires < at) return out(false, rule.basis, 'Opt-in has expired');
    return out(true, rule.basis, 'Active opt-in', { since: g.ts });
  }

  // Evaluate and write the decision to the audit trail.
  function access(req, actor) {
    var d = evaluate(req);
    X.append('ACCESS_LOGGED', { patientId: req.patientId || null, flow: req.flow, recipient: req.recipient || null, allow: d.allow, basis: d.basis, reason: d.reason, pack: d.pack, breakGlass: !!d.breakGlass, purpose: req.purpose || null }, actor || { app: 'core' });
    return d;
  }

  var consent = {
    state: consentState,
    grant: function (o, actor) { return X.append('CONSENT_GRANTED', { patientId: o.patientId, flow: o.flow, recipient: o.recipient, to: o.recipient, scope: o.scope || null, expires: o.expires || null, by: o.by || 'patient' }, actor || { app: 'nova' }); },
    // Withdrawal applies from now on. It cannot recall aggregates already published,
    // so the result says how many anonymised publications followed the grant.
    revoke: function (o, actor) {
      var st = consentState(o.patientId)[o.flow + '|' + o.recipient];
      var after = st && st.active ? X.eventsOfType('GIC_PUBLISHED').filter(function (e) { return e.ts > st.ts; }).length : 0;
      var ev = X.append('CONSENT_REVOKED', { patientId: o.patientId, flow: o.flow, recipient: o.recipient, to: o.recipient, by: o.by || 'patient' }, actor || { app: 'nova' });
      return { event: ev, alreadyPublished: after };
    },
    audit: function (patientId) { return X.eventsOfType('ACCESS_LOGGED').filter(function (e) { return !patientId || e.payload.patientId === patientId; }); }
  };

  /* ================= C. Client registry (identity matching) ================= */

  var VENUE = { A: 'ORG-HOSPITAL-LRG', B: 'ORG-CLINIC', C: 'ORG-CLINIC-MID', D: 'ORG-PHARMACY', E: 'ORG-PHARMACY-MID', F: 'ORG-LAB', G: 'ORG-CLINIC-LRG', H: 'ORG-HOSPITAL' };

  function R(id, org, name, sex, dob, prec, father, phone, village, hh, truth, extra) {
    var r = { id: id, org: VENUE[org] || org, name: name, sex: sex, dob: dob, dobPrec: prec, father: father, phone: phone, village: village, household: hh, truth: truth, mrn: 'QH-' + id };
    if (extra) for (var k in extra) r[k] = extra[k];
    return r;
  }

  // Hand-authored cases first (the ones the demo talks about), then generated filler
  // so name frequencies look like a real population.
  var SEED = [
    R('R-001', 'A', 'Amara Okonkwo', 'F', '1974-03-12', 'full', 'Emeka Okonkwo', '01711000482', 'Dhaka', 'HH-0482', 'T-AMARA', { patientId: 'PT-AMARA', mrn: 'QH-PT-100482' }),
    R('R-002', 'B', 'Amara Okonkwo', 'F', '1974-03-12', 'full', 'Emeka Okonkwo', '01711000482', 'Dhaka', 'HH-0482', 'T-AMARA', { patientId: 'PT-AMARA' }),
    R('R-003', 'D', 'A. Okonkwo', 'F', '1974', 'year', '', '01711000482', 'Dhaka', '', 'T-AMARA', { patientId: 'PT-AMARA' }),

    R('R-004', 'A', 'Rahim Uddin', 'M', '1955-07-02', 'full', 'Abdul Karim', '01811000611', 'Gazipur', 'HH-0611', 'T-RAHIM', { patientId: 'PT-RAHIM', mrn: 'QH-PT-100611' }),
    R('R-005', 'C', 'Md. Rahim Uddin', 'M', '1955-07-02', 'full', 'Abdul Karim', '01811000611', 'Gazipur', 'HH-0611', 'T-RAHIM', { patientId: 'PT-RAHIM' }),
    R('R-006', 'E', 'Mohammad Rahim Uddin', 'M', '1955', 'year', '', '01811000611', 'Gazipur', '', 'T-RAHIM', { patientId: 'PT-RAHIM' }),
    R('R-007', 'C', 'Md. Kamal Uddin', 'M', '1958-02-11', 'full', 'Abdul Karim', '01811000611', 'Gazipur', 'HH-0611', 'T-KAMAL'),

    R('R-008', 'B', 'Mohammed Rahman', 'M', '1988-01-01', 'default', 'Abdul Hamid', '01912000111', 'Dhaka', '', 'T-MR1'),
    R('R-009', 'F', 'Mohammad Rahman', 'M', '1988', 'year', 'Abdul Hamid', '', 'Dhaka', '', 'T-MR1'),
    R('R-010', 'A', 'Muhammad Rahman', 'M', '1991-05-20', 'full', 'Abdus Salam', '01712000222', 'Dhaka', 'HH-2201', 'T-MR2'),
    R('R-011', 'G', 'Md. Rahman Hossain', 'M', '1979-11-03', 'full', 'Abul Hossain', '01613000333', 'Narsingdi', '', 'T-MR3'),
    R('R-012', 'B', 'Mohammed Hossain', 'M', '1984-06-15', 'full', 'Abdur Razzak', '01714000444', 'Chattogram', '', 'T-MH1'),
    R('R-013', 'C', 'Mohammed Islam', 'M', '1996-09-30', 'full', 'Nurul Islam', '01815000555', 'Gazipur', '', 'T-MI1'),

    R('R-014', 'B', 'Nasrin Akter', 'F', '1990-04-09', 'full', 'Nurul Haque', '01916000666', 'Dhaka', 'HH-3302', 'T-NA1'),
    R('R-015', 'H', 'Nasrin Akhter', 'F', '1990', 'year', 'Nurul Haque', '', 'Dhaka', '', 'T-NA1'),
    R('R-016', 'G', 'Nasrin Akter', 'F', '1992-08-21', 'full', 'Mostafa Kamal', '01717000777', 'Sylhet', '', 'T-NA2')
  ];

  var GIVEN_M = ['Md. Karim', 'Mohammed Sohel', 'Muhammad Tanvir', 'Mohammad Jamal', 'Md. Faruk', 'Mohammed Nasir', 'Muhammad Hasan', 'Md. Mamun', 'Mohammed Shakil', 'Mohammad Rafiq', 'Md. Masud', 'Mohammed Arif', 'Muhammad Monir', 'Md. Russel', 'Mohammed Shafiq', 'Mohammad Babul', 'Md. Jubayer', 'Mohammed Sumon'];
  var GIVEN_F = ['Rokeya Begum', 'Ayesha Siddiqua', 'Laila Khatun', 'Shireen Sultana', 'Parveen Akter', 'Jesmin Nahar', 'Momena Khatun', 'Rahima Begum', 'Sabina Yasmin', 'Nargis Parveen', 'Shabnam Mia', 'Afroza Begum', 'Sharmin Akter', 'Nadia Islam', 'Rina Das', 'Dilruba Banu'];
  var SUR = ['Ahmed', 'Khan', 'Hossain', 'Islam', 'Chowdhury', 'Sarkar', 'Haque', 'Alam', 'Siddiqui', 'Bhuiyan', 'Molla', 'Sheikh', 'Talukder', 'Mia', 'Das'];
  var FATH = ['Abdul Karim', 'Abdul Latif', 'Abdus Sattar', 'Abul Kashem', 'Abdur Rahman', 'Nurul Amin', 'Mostafa Kamal', 'Abdul Majid', 'Delwar Hossain', 'Shamsul Haque'];
  var VILL = ['Dhaka', 'Gazipur', 'Sylhet', 'Chattogram', 'Narsingdi', 'Dhaka', 'Dhaka', 'Gazipur'];
  var ORGS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  (function fill() {
    var n = 0;
    for (var i = 0; i < 36; i++) {
      var male = i % 3 !== 2, given = male ? GIVEN_M[i % GIVEN_M.length] : GIVEN_F[i % GIVEN_F.length];
      var name = given + ' ' + SUR[(i * 7 + 3) % SUR.length];
      var yr = 1950 + (i * 11 + 4) % 58, mo = 1 + (i * 5) % 12, da = 1 + (i * 13) % 27;
      var dob = yr + '-' + (mo < 10 ? '0' : '') + mo + '-' + (da < 10 ? '0' : '') + da;
      var father = FATH[(i * 3 + 1) % FATH.length], phone = '017' + ('00000000' + (2000000 + i * 7919)).slice(-8), village = VILL[i % VILL.length];
      var truth = 'T-F' + i, id = 'R-' + (100 + n++);
      SEED.push(R(id, ORGS[i % ORGS.length], name, male ? 'M' : 'F', dob, 'full', father, phone, village, i % 4 === 0 ? 'HH-' + (4000 + i) : '', truth));
      if (i % 9 === 4) {   // a real duplicate at another venue: variant spelling, year-only date of birth
        var alt = name.replace('Mohammed', 'Md.').replace('Muhammad', 'Mohammad').replace('Rokeya', 'Rokeya').replace('Akter', 'Akhter');
        SEED.push(R('R-' + (100 + n++), ORGS[(i + 3) % ORGS.length], alt, male ? 'M' : 'F', yr + '', 'year', father, '', village, '', truth));
      }
    }
  })();

  var BASE_LINKS = [['R-001', 'R-002'], ['R-004', 'R-005']];
  var byId = {};
  SEED.forEach(function (r) { byId[r.id] = r; });

  /* ---- normalisation and phonetic keys ---- */
  var OPTIONAL = { muhammad: 1, mosammat: 1 };
  function normToken(t) {
    t = t.toLowerCase().replace(/[^a-z]/g, '');
    if (/^(md|mohd|mohammed|mohammad|muhammad|muhammed|mohamed|mahomed)$/.test(t)) return 'muhammad';
    if (/^(mst|mosammat|mosammad|musammat)$/.test(t)) return 'mosammat';
    if (t === 'akhter' || t === 'akhtar') return 'akter';
    if (t === 'begom') return 'begum';
    return t;
  }
  // Consonant skeleton: survives vowel and spelling variation (Rahman, Rehman, Rahaman).
  function skeleton(t) {
    t = t.replace(/ph/g, 'f').replace(/kh/g, 'k').replace(/sh/g, 's').replace(/ch/g, 'c').replace(/z/g, 'j').replace(/q/g, 'k').replace(/v/g, 'b').replace(/w/g, 'u');
    var out = t.charAt(0);
    for (var i = 1; i < t.length; i++) { var c = t.charAt(i); if ('aeiouyh'.indexOf(c) >= 0) continue; if (c !== out.charAt(out.length - 1)) out += c; }
    return out;
  }
  function tokens(name) {
    return String(name || '').split(/[\s.,]+/).map(normToken).filter(function (t) { return t.length > 1; });
  }

  /* ---- population statistics for frequency weighting ---- */
  var stats = null;
  function buildStats() {
    var N = SEED.length, nameF = {}, fathF = {}, phoneF = {}, villF = {}, yearF = {};
    function bump(o, k) { o[k] = (o[k] || 0) + 1; }
    SEED.forEach(function (r) {
      var seen = {};
      tokens(r.name).forEach(function (t) { if (!seen[t]) { bump(nameF, t); seen[t] = 1; } });
      var sf = {};
      tokens(r.father).forEach(function (t) { if (!sf[t]) { bump(fathF, t); sf[t] = 1; } });
      if (r.phone) bump(phoneF, r.phone);
      if (r.village) bump(villF, r.village);
      var y = String(r.dob).slice(0, 4); if (y) bump(yearF, y);
    });
    return { N: N, nameF: nameF, fathF: fathF, phoneF: phoneF, villF: villF, yearF: yearF };
  }
  function S() { return stats || (stats = buildStats()); }
  function u(table, key, smooth) { var s = S(); return Math.max(0.004, ((table[key] || 0) + (smooth || 0.5)) / (s.N + 1)); }
  function agreeBits(m, uu) { return Math.log(m / uu) / Math.LN2; }
  function disagreeBits(m, uu) { return Math.log((1 - m) / (1 - uu)) / Math.LN2; }

  /* ---- field comparators; each returns {bits, note} or null when a side is missing ---- */
  function cmpTokens(a, b, table, label, m) {
    var ta = tokens(a), tb = tokens(b);
    if (!ta.length || !tb.length) return null;
    var bits = 0, notes = [], sb = tb.map(skeleton);
    ta.forEach(function (t) {
      var uu = u(table, t), exact = tb.indexOf(t) >= 0;
      var partial = !exact && sb.indexOf(skeleton(t)) >= 0;
      if (exact) { var w = agreeBits(m, uu); bits += w; notes.push(t + ' +' + w.toFixed(1)); }
      else if (partial) { var w2 = agreeBits(m * 0.8, uu); bits += w2; notes.push(t + ' (spelling) +' + w2.toFixed(1)); }
      else if (!OPTIONAL[t]) { var w3 = disagreeBits(m, uu); bits += w3; notes.push(t + ' missing ' + w3.toFixed(1)); }
    });
    return { bits: bits, note: notes.join(', ') };
  }
  function dobParts(r) {
    var d = String(r.dob || ''), prec = r.dobPrec || (d.length === 4 ? 'year' : 'full');
    if (prec === 'full' && /-01-01$/.test(d)) prec = 'default';
    return { y: parseInt(d.slice(0, 4), 10), m: parseInt(d.slice(5, 7), 10), d: parseInt(d.slice(8, 10), 10), prec: prec };
  }
  function cmpDob(a, b) {
    if (!a.dob || !b.dob) return null;
    var x = dobParts(a), y = dobParts(b);
    if (x.prec === 'full' && y.prec === 'full') {
      if (x.y === y.y && x.m === y.m && x.d === y.d) return { bits: Math.min(10, agreeBits(0.93, 1 / 18000)), note: 'full date matches, +10.0' };
      if (x.y === y.y && x.m === y.d && x.d === y.m) return { bits: 4, note: 'day and month swapped, +4.0', soft: true };
      return { bits: -5, note: 'dates differ -5.0', conflict: Math.abs(x.y - y.y) > 1 };
    }
    // either side is a year-only or defaulted date: only the year is evidence
    if (x.y === y.y) { var w = agreeBits(0.9, u(S().yearF, String(x.y))); return { bits: w, note: 'year matches (low-precision date) +' + w.toFixed(1) }; }
    if (Math.abs(x.y - y.y) <= 1) return { bits: 0, note: 'years within one' };
    return { bits: -3.3, note: 'years differ -3.3' };
  }
  function cmpSex(a, b) { if (!a.sex || !b.sex) return null; return a.sex === b.sex ? { bits: agreeBits(0.99, 0.5), note: 'same sex +1.0' } : { bits: -6.6, note: 'sex differs -6.6', conflict: true }; }
  function cmpPhone(a, b) {
    if (!a.phone || !b.phone) return null;
    var uu = Math.max(0.02, u(S().phoneF, a.phone));
    return a.phone === b.phone ? { bits: agreeBits(0.7, uu), note: 'same phone (phones are shared) +' + agreeBits(0.7, uu).toFixed(1) } : { bits: disagreeBits(0.7, uu), note: 'different phone ' + disagreeBits(0.7, uu).toFixed(1) };
  }
  function cmpVillage(a, b) {
    if (!a.village || !b.village) return null;
    var uu = u(S().villF, a.village);
    return a.village === b.village ? { bits: agreeBits(0.8, uu), note: 'same place +' + agreeBits(0.8, uu).toFixed(1) } : { bits: disagreeBits(0.8, uu), note: 'different place ' + disagreeBits(0.8, uu).toFixed(1) };
  }
  function cmpNid(a, b) {
    if (!a.nid || !b.nid) return null;
    return a.nid === b.nid ? { bits: 14, note: 'national ID matches (patient consented) +14.0' } : { bits: -6, note: 'national IDs differ -6.0', conflict: true };
  }

  var FIELDS = [
    ['name', 'Name', function (a, b) { return cmpTokens(a.name, b.name, S().nameF, 'name', 0.92); }],
    ['father', "Father's name", function (a, b) { return cmpTokens(a.father, b.father, S().fathF, 'father', 0.9); }],
    ['dob', 'Date of birth', cmpDob],
    ['sex', 'Sex', cmpSex],
    ['phone', 'Phone', cmpPhone],
    ['village', 'Place', cmpVillage],
    ['nid', 'National ID', cmpNid]
  ];

  function scorePair(a, b) {
    var bits = 0, parts = [], conflict = false;
    FIELDS.forEach(function (f) {
      var r = f[2](a, b);
      if (!r) { parts.push({ field: f[0], label: f[1], bits: 0, note: 'not compared (missing on one side)', skipped: true }); return; }
      bits += r.bits; if (r.conflict) conflict = true;
      parts.push({ field: f[0], label: f[1], bits: r.bits, note: r.note });
    });
    var logPrior = -Math.log(S().N) / Math.LN2;
    var p = 1 / (1 + Math.pow(2, -(bits + logPrior)));
    return { bits: bits, p: p, parts: parts, conflict: conflict };
  }

  var AUTO_P = 0.99, REVIEW_P = 0.2, MARGIN = 6;
  function band(sc) { return sc.p >= AUTO_P && !sc.conflict ? 'auto' : sc.p >= REVIEW_P ? 'review' : 'none'; }

  /* ---- link graph, derived from events: link, never merge ---- */
  function linkKey(a, b) { return a < b ? a + '~' + b : b + '~' + a; }
  function linkState() {
    var links = {}, rejected = {}, order = [];
    BASE_LINKS.forEach(function (l) { links[linkKey(l[0], l[1])] = { a: l[0], b: l[1], method: 'seed', ts: 0 }; });
    X.events().forEach(function (e) {
      var p = e.payload || {};
      if (e.type === 'IDENTITY_LINKED') { links[linkKey(p.a, p.b)] = { a: p.a, b: p.b, method: p.method, score: p.score, pr: p.p, ts: e.ts, by: p.by, aRec: p.aRec || null }; delete rejected[linkKey(p.a, p.b)]; }
      if (e.type === 'IDENTITY_UNLINKED') { delete links[linkKey(p.a, p.b)]; rejected[linkKey(p.a, p.b)] = true; }
      if (e.type === 'IDENTITY_REJECTED') { rejected[linkKey(p.a, p.b)] = true; }
    });
    return { links: links, rejected: rejected };
  }
  function recordOf(id) {
    if (byId[id]) return byId[id];
    var ev = X.eventsOfType('IDENTITY_LINKED').filter(function (e) { return e.payload.a === id && e.payload.aRec; })[0];
    return ev ? ev.payload.aRec : null;
  }
  function clusters() {
    var st = linkState(), parent = {};
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    SEED.forEach(function (r) { parent[r.id] = r.id; });
    Object.keys(st.links).forEach(function (k) { var l = st.links[k]; if (!(l.a in parent)) parent[l.a] = l.a; if (!(l.b in parent)) parent[l.b] = l.b; });
    Object.keys(st.links).forEach(function (k) { var l = st.links[k]; parent[find(l.a)] = find(l.b); });
    var groups = {};
    Object.keys(parent).forEach(function (id) { var r = find(id); (groups[r] = groups[r] || []).push(id); });
    return Object.keys(groups).map(function (r) { var ids = groups[r].sort(); return { id: 'QP-' + ids[0].replace('R-', ''), records: ids }; });
  }
  function clusterOf(recId) { return clusters().filter(function (c) { return c.records.indexOf(recId) >= 0; })[0] || { id: 'QP-' + recId, records: [recId] }; }

  function match(query) {
    var q = {}; for (var k in query) q[k] = query[k];
    if (q.dob && String(q.dob).length === 4) q.dobPrec = 'year';
    var all = SEED.map(function (r) { var sc = scorePair(q, r); return { rec: r, bits: sc.bits, p: sc.p, parts: sc.parts, conflict: sc.conflict, band: band(sc) }; })
      .filter(function (c) { return c.p >= 0.02; }).sort(function (a, b) { return b.bits - a.bits; });
    // group candidates that are the same person already, so a duplicate is not a rival
    var best = all[0], rival = null;
    if (best) {
      for (var i = 1; i < all.length; i++) {
        var c = all[i], same = clusterOf(best.rec.id).records.indexOf(c.rec.id) >= 0 || scorePair(best.rec, c.rec).p >= 0.9;
        if (!same) { rival = c; break; }
      }
    }
    var decision = 'none', note = 'No plausible match. Register as a new person.';
    if (best && best.band === 'auto' && (!rival || best.bits - rival.bits >= MARGIN)) { decision = 'auto'; note = 'High confidence and a clear margin over the next candidate. Patient confirms by one-time code.'; }
    else if (best && best.p >= REVIEW_P) {
      if (rival && best.bits - rival.bits < MARGIN && rival.p >= REVIEW_P) { decision = 'ambiguous'; note = 'Two or more different people fit. Ask for father\'s name or date of birth before linking anyone.'; }
      else { decision = 'review'; note = 'Plausible but not certain. A human decides, or the patient confirms.'; }
    }
    return { query: q, candidates: all.slice(0, 5), decision: decision, note: note, rival: rival ? rival.rec.id : null };
  }

  /* ---- patient as resolver: one-time code (SMS is simulated) ---- */
  function otpFor(recId, slot) { return ('000000' + (parseInt(h53('otp|' + recId + '|' + slot), 16) % 1000000)).slice(-6); }
  function slotNow() { return Math.floor(Date.now() / 300000); }
  function maskPhone(p) { return p ? p.slice(0, 3) + '••••' + p.slice(-3) : null; }


  function pairQueue(which) {
    var st = linkState(), cl = clusters(), clOf = {}, rejectedPairs = {};
    cl.forEach(function (c) { c.records.forEach(function (id) { clOf[id] = c.id; }); });
    function cpKey(x, y) { return clOf[x] < clOf[y] ? clOf[x] + '|' + clOf[y] : clOf[y] + '|' + clOf[x]; }
    Object.keys(st.rejected).forEach(function (k) { var ab = k.split('~'); if (clOf[ab[0]] && clOf[ab[1]]) rejectedPairs[cpKey(ab[0], ab[1])] = true; });
    var best = {};
    for (var i = 0; i < SEED.length; i++) for (var j = i + 1; j < SEED.length; j++) {
      var a = SEED[i], b = SEED[j];
      if (clOf[a.id] === clOf[b.id] || rejectedPairs[cpKey(a.id, b.id)]) continue;
      var sc = scorePair(a, b);
      if (band(sc) === 'none') continue;
      var ck = cpKey(a.id, b.id);
      if (!best[ck] || sc.p > best[ck].p) best[ck] = { a: a.id, b: b.id, bits: sc.bits, p: sc.p, band: band(sc), parts: sc.parts, conflict: sc.conflict };
    }
    return Object.keys(best).map(function (k) { return best[k]; }).filter(function (x) { return x.band === which; }).sort(function (x, y) { return y.p - x.p; });
  }

  var registry = {
    records: function () { return SEED.slice(); },
    record: recordOf,
    stats: function () { var s = S(); return { N: s.N }; },
    scorePair: scorePair,
    match: match,
    band: band,
    thresholds: { auto: AUTO_P, review: REVIEW_P, marginBits: MARGIN },
    clusters: clusters,
    clusterOf: clusterOf,
    clusterFor: function (patientId) { var r = SEED.filter(function (x) { return x.patientId === patientId; })[0]; return r ? clusterOf(r.id) : null; },
    links: function () { var st = linkState(); return Object.keys(st.links).map(function (k) { return st.links[k]; }); },
    // Delivered by SMS in production. Here the code is shown in the UI, labelled simulated.
    challenge: function (recId) {
      var r = recordOf(recId); if (!r) return null;
      if (!r.phone) return { channel: 'chw', note: 'No phone on file. A community health worker confirms in person.' };
      return { channel: 'sms', to: maskPhone(r.phone), simulatedCode: otpFor(recId, slotNow()) };
    },
    verifyCode: function (recId, code) { return String(code) === otpFor(recId, slotNow()) || String(code) === otpFor(recId, slotNow() - 1); },
    link: function (a, b, method, scoreInfo, by, aRec) {
      return X.append('IDENTITY_LINKED', { a: a, b: b, method: method, score: scoreInfo ? Math.round(scoreInfo.bits * 10) / 10 : null, p: scoreInfo ? Math.round(scoreInfo.p * 1000) / 1000 : null, by: by || null, aRec: aRec || null }, { app: 'core' });
    },
    reject: function (a, b, by) { return X.append('IDENTITY_REJECTED', { a: a, b: b, by: by || null }, { app: 'core' }); },
    unlink: function (a, b, by) { return X.append('IDENTITY_UNLINKED', { a: a, b: b, by: by || null }, { app: 'core' }); },
    // Pairs nobody has decided yet, collapsed to the best pair between two people.
    // Review: a human decides. Auto: confident enough to link without one, still reversible.
    reviewQueue: function () { return pairQueue('review'); },
    autoQueue: function () { return pairQueue('auto'); },
    applyAuto: function (by) {
      var n = 0;
      pairQueue('auto').forEach(function (x) { registry.link(x.a, x.b, 'auto', x, by || 'registry'); n++; });
      return n;
    },
    // Measured against the demo's ground truth, which is known only for seeded people.
    metrics: function () {
      var cl = clusters(), falseMerges = 0, links = 0, bymethod = {};
      cl.forEach(function (c) {
        for (var i = 0; i < c.records.length; i++) for (var j = i + 1; j < c.records.length; j++) {
          var a = recordOf(c.records[i]), b = recordOf(c.records[j]);
          if (a && b && a.truth && b.truth && a.truth !== b.truth) falseMerges++;
        }
      });
      Object.keys(linkState().links).forEach(function (k) { var l = linkState().links[k]; links++; bymethod[l.method] = (bymethod[l.method] || 0) + 1; });
      var truthGroups = {};
      SEED.forEach(function (r) { var c = clusterOf(r.id).id; (truthGroups[r.truth] = truthGroups[r.truth] || {})[c] = 1; });
      var split = Object.keys(truthGroups).filter(function (t) { return Object.keys(truthGroups[t]).length > 1; }).length;
      var pending = registry.reviewQueue().length, autoPending = registry.autoQueue().length;
      return { sourceRecords: SEED.length, persons: cl.length, links: links, byMethod: bymethod, falseMerges: falseMerges, duplicatePeople: split, pendingReview: pending, autoPending: autoPending };
    },
    // What leaves an organisation for cross-organisation matching: salted hashes, never raw names.
    hashedKeys: function (rec, salt) {
      salt = salt || 'qare';
      var t = tokens(rec.name).map(skeleton).sort().join('');
      var keys = [h53(salt + '|n|' + t)];
      if (rec.dob) keys.push(h53(salt + '|ny|' + t + '|' + String(rec.dob).slice(0, 4)));
      if (rec.father) keys.push(h53(salt + '|nf|' + t + '|' + tokens(rec.father).map(skeleton).sort().join('')));
      return keys;
    },
    scenarios: [
      { key: 'common', label: 'Common name, little information', truth: null, q: { name: 'Mohammed Rahman', sex: 'M', village: 'Dhaka' } },
      { key: 'common2', label: 'Same name, add father and year', truth: 'T-MR1', q: { name: 'Mohammed Rahman', sex: 'M', village: 'Dhaka', father: 'Abdul Hamid', dob: '1988' } },
      { key: 'sibling', label: 'Brother in the same household', truth: 'T-KAMAL', q: { name: 'Md. Kamal Uddin', sex: 'M', village: 'Gazipur', phone: '01811000611', father: 'Abdul Karim' } },
      { key: 'amara', label: 'Returning patient', truth: 'T-AMARA', q: { name: 'Amara Okonkwo', sex: 'F', dob: '1974-03-12', phone: '01711000482' } },
      { key: 'initial', label: 'Initial only, pharmacy counter', truth: 'T-AMARA', q: { name: 'A. Okonkwo', sex: 'F', village: 'Dhaka' } }
    ]
  };

  /* ================= D. FHIR-shaped views of the exchange ================= */

  var LOINC = { HBA1C: ['4548-4', 'Hemoglobin A1c/Hemoglobin.total in Blood'], CREAT: ['2160-0', 'Creatinine [Mass/volume] in Serum or Plasma'], 'BP-PANEL': ['57698-3', 'Lipid panel with direct LDL - Serum or Plasma'] };
  function iso(ts) { return new Date(ts).toISOString(); }
  function ref(type, id, display) { var r = { reference: type + '/' + id }; if (display) r.display = display; return r; }
  var ACT = 'http://terminology.hl7.org/CodeSystem/v3-ActCode';

  function resource(ev) {
    var p = ev.payload || {}, id = ev.id;
    switch (ev.type) {
      case 'LAB_RESULT': {
        var lo = LOINC[p.test] || LOINC[String(p.testName || '').toUpperCase()] || null;
        return { resourceType: 'Observation', id: id, status: 'final', category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }],
          code: { coding: lo ? [{ system: 'http://loinc.org', code: lo[0], display: lo[1] }] : [{ system: 'https://qare.health/CodeSystem/lab', code: p.test || 'unknown' }], text: p.testName },
          subject: ref('Patient', p.patientId, p.patientName), effectiveDateTime: iso(ev.ts), valueQuantity: { value: p.value, unit: p.unit },
          interpretation: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation', code: p.flag ? 'H' : 'N' }] }], performer: [ref('Organization', p.labOrgId)] };
      }
      case 'RX_WRITTEN':
        return { resourceType: 'MedicationRequest', id: p.rxId || id, status: 'active', intent: 'order', authoredOn: iso(ev.ts),
          medicationCodeableConcept: { coding: [{ system: 'https://qare.health/CodeSystem/formulary', code: p.drug, display: p.drugName }] },
          subject: ref('Patient', p.patientId, p.patientName), requester: { display: p.prescriber || null }, dispenseRequest: { quantity: { value: p.qty } } };
      case 'RX_DISPENSED':
        return { resourceType: 'MedicationDispense', id: id, status: 'completed', whenHandedOver: iso(ev.ts),
          medicationCodeableConcept: { coding: [{ system: 'https://qare.health/CodeSystem/formulary', code: p.drug, display: p.drugName }] },
          quantity: { value: p.qty }, authorizingPrescription: [ref('MedicationRequest', p.rxId)], performer: [{ actor: ref('Organization', p.byOrgId) }], subject: { display: p.patientName } };
      case 'REFERRAL':
        return { resourceType: 'ServiceRequest', id: id, status: 'active', intent: 'order', authoredOn: iso(ev.ts), subject: { display: p.patientName },
          reasonCode: [{ text: p.reason }], requester: p.byOrgId ? ref('Organization', p.byOrgId) : { display: 'referring service' } };
      case 'ADMISSION':
        return { resourceType: 'Encounter', id: id, status: 'in-progress', class: { system: ACT, code: 'IMP', display: 'inpatient encounter' }, subject: { display: p.patientName }, period: { start: iso(ev.ts) }, serviceProvider: p.orgId ? ref('Organization', p.orgId) : undefined };
      case 'DISCHARGE':
        return { resourceType: 'Encounter', id: id, status: 'finished', class: { system: ACT, code: 'IMP', display: 'inpatient encounter' }, subject: { display: p.patient }, period: { end: iso(ev.ts) }, hospitalization: { dischargeDisposition: { text: 'Home health, 30-day window opened' } } };
      case 'CONSENT_GRANTED':
      case 'CONSENT_REVOKED': {
        var flow = flowOf(p);
        return { resourceType: 'Consent', id: id, status: ev.type === 'CONSENT_GRANTED' ? 'active' : 'inactive', dateTime: iso(ev.ts),
          scope: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/consentscope', code: 'patient-privacy' }] },
          category: [{ coding: [{ system: 'http://loinc.org', code: '59284-0', display: 'Consent Document' }] }], patient: ref('Patient', p.patientId || 'unknown'),
          provision: { type: ev.type === 'CONSENT_GRANTED' ? 'permit' : 'deny', actor: [{ role: { text: 'recipient' }, reference: { display: p.recipient || p.to } }],
            purpose: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ActReason', code: flow === 'research' || flow === 'secondary' ? 'HRESCH' : 'TREAT' }] } };
      }
      case 'ACCESS_LOGGED':
        return { resourceType: 'AuditEvent', id: id, type: { system: 'http://terminology.hl7.org/CodeSystem/audit-event-type', code: 'rest', display: 'RESTful Operation' }, action: 'R', recorded: iso(ev.ts),
          outcome: p.allow ? '0' : '4', outcomeDesc: p.reason, agent: [{ who: { display: ev.actor && ev.actor.app ? ev.actor.app : 'system' }, requestor: true }],
          source: { observer: { display: 'Qäre HIE' } }, entity: p.patientId ? [{ what: ref('Patient', p.patientId) }] : [],
          purposeOfEvent: [{ text: p.flow + ' (' + p.basis + ')' }] };
      default: return null;
    }
  }
  function patientResource(rec) {
    var r = { resourceType: 'Patient', id: rec.id, identifier: [{ system: 'https://qare.health/mrn', value: rec.mrn }], name: [{ text: rec.name }], gender: rec.sex === 'M' ? 'male' : 'female', address: [{ text: rec.village }] };
    if (rec.dobPrec === 'full' && !/-01-01$/.test(rec.dob)) r.birthDate = rec.dob; else if (rec.dob) r.birthDate = String(rec.dob).slice(0, 4);
    if (rec.phone) r.telecom = [{ system: 'phone', value: rec.phone }];
    if (rec.nid) r.identifier.push({ system: 'https://qare.health/nid', value: rec.nid });
    return r;
  }
  var fhir = {
    resource: resource,
    patient: patientResource,
    supported: ['LAB_RESULT', 'RX_WRITTEN', 'RX_DISPENSED', 'REFERRAL', 'ADMISSION', 'DISCHARGE', 'CONSENT_GRANTED', 'CONSENT_REVOKED', 'ACCESS_LOGGED'],
    bundle: function () {
      var entries = [];
      X.events().forEach(function (e) { var r = resource(e); if (r) entries.push({ fullUrl: 'urn:uuid:' + e.id, resource: r }); });
      return { resourceType: 'Bundle', type: 'collection', timestamp: iso(Date.now()), total: entries.length, entry: entries };
    }
  };

  /* ================= export ================= */
  X.FLOWS = FLOWS;
  X.PACKS = PACKS;
  X.pack = pack;
  X.selectPack = selectPack;
  X.evaluate = evaluate;
  X.access = access;
  X.consent = consent;
  X.registry = registry;
  X.fhir = fhir;
})(typeof window !== 'undefined' ? window : this);
