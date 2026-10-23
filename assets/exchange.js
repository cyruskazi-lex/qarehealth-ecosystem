/*
 * Qäre HIE: the shared exchange that makes the twelve apps one system.
 *
 * Every app loads this file. It holds the seeded world and an append-only event
 * log, persisted to localStorage and synced across browser tabs over a
 * BroadcastChannel (with a storage-event fallback). When one app appends an
 * event, every open tab hears it and re-renders. That is the interconnection:
 * a prescription written in Pulse becomes a dispensing task in Cura, a demand
 * signal in Nexus, and a record update in Nova, live.
 *
 * Nothing here is a backend. It runs in the browser from any static host.
 * Cross-tab sync needs a real origin (GitHub Pages or any static server), not
 * a file:// path, because browsers isolate file:// tabs.
 *
 * No em dashes.
 */
(function (global) {
  'use strict';

  var LOG_KEY = 'qare-hie-log-v1';
  var CHANNEL = 'qare-hie-v1';

  /* ---------- The seeded world ---------- */

  var PATIENT = {
    id: 'PT-AMARA', name: 'Amara Okonkwo', age: 52, sex: 'F',
    location: 'Dhaka', mrn: 'QH-PT-100482',
    conditions: ['Type 2 diabetes', 'Hypertension'],
    allergies: ['Penicillin']
  };

  // Every product has SMALL, MEDIUM and LARGE institutions with key personas,
  // so each app can show the demo across organisation sizes. The IDs the four
  // first-built apps depend on (ORG-CLINIC, ORG-PHARMACY, ORG-HOSPITAL, ORG-LAB,
  // ORG-NEXAGEN) are preserved. New demo orgs are named plainly and seeded once.
  var ORGS = [
    // Pulse (clinician)
    { id: 'ORG-CLINIC', name: 'Bhorosha Primary Care', sector: 'clinic', sizeClass: 'SMALL', product: 'pulse', region: 'Dhaka',
      personas: [{ id: 'U-IMRAN', name: 'Dr. Imran Chowdhury', role: 'General physician' }] },
    { id: 'ORG-CLINIC-MID', name: 'Shetu Medical Centre', sector: 'clinic', sizeClass: 'MEDIUM', product: 'pulse', region: 'Gazipur',
      personas: [{ id: 'U-AYESHA', name: 'Dr. Ayesha Siddiqua', role: 'Physician lead' }] },
    { id: 'ORG-CLINIC-LRG', name: 'Metro Polyclinic Network', sector: 'clinic', sizeClass: 'LARGE', product: 'pulse', region: 'Dhaka metro',
      personas: [{ id: 'U-RAHIM', name: 'Dr. Rahim Khan', role: 'Chief medical officer' }] },

    // Cura (pharmacist)
    { id: 'ORG-PHARMACY', name: 'Shetu Community Pharmacy', sector: 'pharmacy', sizeClass: 'SMALL', product: 'cura', region: 'Dhaka',
      personas: [{ id: 'U-NUSRAT', name: 'Nusrat Jahan', role: 'Pharmacist' }] },
    { id: 'ORG-PHARMACY-MID', name: 'Lazz Pharma Group', sector: 'pharmacy', sizeClass: 'MEDIUM', product: 'cura', region: 'Dhaka',
      personas: [{ id: 'U-TANVIR', name: 'Tanvir Ahmed', role: 'Superintendent pharmacist' }] },
    { id: 'ORG-PHARMACY-LRG', name: 'National Pharmacy Network', sector: 'pharmacy', sizeClass: 'LARGE', product: 'cura', region: 'Nationwide',
      personas: [{ id: 'U-FARZANA', name: 'Farzana Haque', role: 'Head of pharmacy ops' }] },

    // Bridge (community health worker)
    { id: 'ORG-CHW-SML', name: 'Union Health Outreach', sector: 'chw', sizeClass: 'SMALL', product: 'bridge', region: 'Sylhet',
      personas: [{ id: 'U-FATIMA', name: 'Fatima Begum', role: 'Community health worker' }] },
    { id: 'ORG-CHW-MID', name: 'Sylhet CHW Program', sector: 'chw', sizeClass: 'MEDIUM', product: 'bridge', region: 'Sylhet division',
      personas: [{ id: 'U-RUByA', name: 'Rubya Khatun', role: 'Field coordinator' }] },
    { id: 'ORG-CHW-LRG', name: 'National CHW Corps', sector: 'chw', sizeClass: 'LARGE', product: 'bridge', region: 'Nationwide',
      personas: [{ id: 'U-MONIR', name: 'Monir Hossain', role: 'Program director' }] },

    // Apex (hospital)
    { id: 'ORG-HOSPITAL-SML', name: 'Upazila Health Complex', sector: 'hospital', sizeClass: 'SMALL', product: 'apex', region: 'Narsingdi',
      personas: [{ id: 'U-SELIM', name: 'Dr. Selim Reza', role: 'Resident medical officer' }] },
    { id: 'ORG-HOSPITAL', name: 'Shapla District Hospital', sector: 'hospital', sizeClass: 'MEDIUM', product: 'apex', region: 'Gazipur',
      personas: [{ id: 'U-SHAHANA', name: 'Shahana Akter', role: 'Hospital administrator' }] },
    { id: 'ORG-HOSPITAL-LRG', name: 'Dhaka Tertiary Hospital', sector: 'hospital', sizeClass: 'LARGE', product: 'apex', region: 'Dhaka',
      personas: [{ id: 'U-NAImA', name: 'Dr. Naima Islam', role: 'Director of operations' }] },

    // Prism (labs)
    { id: 'ORG-LAB-SML', name: 'Union Diagnostic Point', sector: 'lab', sizeClass: 'SMALL', product: 'prism', region: 'Narsingdi',
      personas: [{ id: 'U-SOHEL', name: 'Sohel Rana', role: 'Lab technologist' }] },
    { id: 'ORG-LAB', name: 'Probaho Diagnostics', sector: 'lab', sizeClass: 'MEDIUM', product: 'prism', region: 'Dhaka',
      personas: [{ id: 'U-KAMAL', name: 'Dr. Kamal Uddin', role: 'Lab director' }] },
    { id: 'ORG-LAB-LRG', name: 'National Reference Lab', sector: 'lab', sizeClass: 'LARGE', product: 'prism', region: 'Dhaka',
      personas: [{ id: 'U-TAHMINA', name: 'Dr. Tahmina Rahman', role: 'Chief pathologist' }] },

    // Nexus (pharma ops)
    { id: 'ORG-PHARMA-SML', name: 'Shifa Generics', sector: 'pharma', sizeClass: 'SMALL', product: 'nexus', region: 'Dhaka',
      personas: [{ id: 'U-ANWAR', name: 'Anwar Hossain', role: 'Operations manager' }] },
    { id: 'ORG-PHARMA-MID', name: 'Bengal Pharmaceuticals', sector: 'pharma', sizeClass: 'MEDIUM', product: 'nexus', region: 'Chattogram',
      personas: [{ id: 'U-SADIA', name: 'Sadia Noor', role: 'Head of operations' }] },
    { id: 'ORG-NEXAGEN', name: 'Nexagen Pharmaceuticals', sector: 'pharma', sizeClass: 'LARGE', product: 'nexus', region: 'Tongi, Dhaka',
      personas: [
        { id: 'U-ARJUN', name: 'Arjun Mehta', role: 'Chief Operating Officer' },
        { id: 'U-FATIMA-R', name: 'Fatima Al-Rashid', role: 'Chief Financial Officer' },
        { id: 'U-KWAME', name: 'Dr. Kwame Asante', role: 'Head of Regulatory Affairs' }
      ] },

    // Relay (supply / 3PL)
    { id: 'ORG-RELAY-SML', name: 'City Cold Courier', sector: 'logistics', sizeClass: 'SMALL', product: 'relay', region: 'Dhaka',
      personas: [{ id: 'U-JABER', name: 'Jaber Ali', role: 'Dispatch lead' }] },
    { id: 'ORG-RELAY-MID', name: 'TransCold Logistics', sector: 'logistics', sizeClass: 'MEDIUM', product: 'relay', region: 'Dhaka to Chattogram',
      personas: [{ id: 'U-RINA', name: 'Rina Das', role: 'Cold chain manager' }] },
    { id: 'ORG-RELAY-LRG', name: 'National Cold Chain', sector: 'logistics', sizeClass: 'LARGE', product: 'relay', region: 'Nationwide',
      personas: [{ id: 'U-HASAN', name: 'Hasan Mahmud', role: 'Head of distribution' }] },

    // Zenith (ministry)
    { id: 'ORG-MOH-SML', name: 'District Health Office, Gazipur', sector: 'ministry', sizeClass: 'SMALL', product: 'zenith', region: 'Gazipur',
      personas: [{ id: 'U-CIVIL', name: 'Dr. Habib Ullah', role: 'Civil surgeon' }] },
    { id: 'ORG-MOH-MID', name: 'Dhaka Division Health', sector: 'ministry', sizeClass: 'MEDIUM', product: 'zenith', region: 'Dhaka division',
      personas: [{ id: 'U-DIVDIR', name: 'Dr. Shamima Nasreen', role: 'Divisional director' }] },
    { id: 'ORG-MOH-LRG', name: 'Directorate General of Health Services', sector: 'ministry', sizeClass: 'LARGE', product: 'zenith', region: 'National',
      personas: [{ id: 'U-DG', name: 'Prof. Aminul Haque', role: 'Director General' }] },

    // Core (HIE operator)
    { id: 'ORG-CORE-SML', name: 'Pilot Exchange Node', sector: 'hie', sizeClass: 'SMALL', product: 'core', region: 'Gazipur pilot',
      personas: [{ id: 'U-OPS1', name: 'Nabila Karim', role: 'Implementation engineer' }] },
    { id: 'ORG-CORE-MID', name: 'Regional Health Exchange', sector: 'hie', sizeClass: 'MEDIUM', product: 'core', region: 'Dhaka division',
      personas: [{ id: 'U-OPS2', name: 'Shakib Rahman', role: 'Platform operator' }] },
    { id: 'ORG-CORE-LRG', name: 'National Qäre HIE', sector: 'hie', sizeClass: 'LARGE', product: 'core', region: 'National',
      personas: [{ id: 'U-OPS3', name: 'Priya Saha', role: 'Head of exchange operations' }] },

    // Shield (payer)
    { id: 'ORG-SHIELD-SML', name: 'Shomiti Community Scheme', sector: 'payer', sizeClass: 'SMALL', product: 'shield', region: 'Sylhet',
      personas: [{ id: 'U-CLAIM1', name: 'Mizanur Rahman', role: 'Claims officer' }] },
    { id: 'ORG-SHIELD-MID', name: 'Surokkha Insurance', sector: 'payer', sizeClass: 'MEDIUM', product: 'shield', region: 'Dhaka',
      personas: [{ id: 'U-CLAIM2', name: 'Nadia Chowdhury', role: 'Head of claims' }] },
    { id: 'ORG-SHIELD-LRG', name: 'National Health Financing', sector: 'payer', sizeClass: 'LARGE', product: 'shield', region: 'National',
      personas: [{ id: 'U-CLAIM3', name: 'Dr. Kamrul Hasan', role: 'Scheme director' }] },

    // Lumen (research)
    { id: 'ORG-LUMEN-SML', name: 'Dhaka Field Study Unit', sector: 'research', sizeClass: 'SMALL', product: 'lumen', region: 'Dhaka',
      personas: [{ id: 'U-PI1', name: 'Dr. Sharmin Akhtar', role: 'Principal investigator' }] },
    { id: 'ORG-LUMEN-MID', name: 'Bengal Health Institute', sector: 'research', sizeClass: 'MEDIUM', product: 'lumen', region: 'Dhaka',
      personas: [{ id: 'U-PI2', name: 'Dr. Imtiaz Alam', role: 'Research lead' }] },
    { id: 'ORG-LUMEN-LRG', name: 'South Asia Health Consortium', sector: 'research', sizeClass: 'LARGE', product: 'lumen', region: 'Regional',
      personas: [{ id: 'U-PI3', name: 'Dr. Lila Fernando', role: 'Consortium director' }] }
  ];

  // Products Nexagen makes, used across the prescribing and dispensing flow.
  var FORMULARY = [
    { code: 'CARDINEX-10', name: 'CardiNex-10', maker: 'ORG-NEXAGEN', form: 'CV oral solid', unitPrice: 42, coldChain: false },
    { code: 'ONCONEX-100', name: 'OncoNex-100', maker: 'ORG-NEXAGEN', form: 'Oncology injectable', unitPrice: 1180, coldChain: true },
    { code: 'METFORMIN-500', name: 'Metformin 500', maker: 'Generic', form: 'Oral solid', unitPrice: 3, coldChain: false }
  ];

  // Lab test catalogue for Prism.
  var LAB_TESTS = [
    { code: 'HBA1C', name: 'HbA1c', unit: '%', ref: '< 7.0', flagAbove: 7.0 },
    { code: 'BP-PANEL', name: 'Lipid panel', unit: 'mg/dL', ref: '< 200', flagAbove: 200 },
    { code: 'CREAT', name: 'Serum creatinine', unit: 'mg/dL', ref: '0.6 to 1.3', flagAbove: 1.3 }
  ];

  // The EESG health framework (pillar -> front), shared grammar with the siblings.
  var FRAMEWORK = {
    pillars: ['Economic', 'Environment', 'Social', 'Governance'],
    fronts: [
      { key: 'access', name: 'Access and coverage', pillar: 'Social' },
      { key: 'quality', name: 'Care quality and safety', pillar: 'Social' },
      { key: 'outcomes', name: 'Health outcomes', pillar: 'Social' },
      { key: 'affordability', name: 'Affordability and financial protection', pillar: 'Economic' },
      { key: 'integrity', name: 'Supply integrity and pharmacovigilance', pillar: 'Governance' }
    ]
  };

  var VSTATUS = ['Unmeasured', 'Claimed', 'Inconsistent', 'Verified'];
  var SIZE_ORDER = { SMALL: 0, MEDIUM: 1, LARGE: 2 };
  var GIC_URL = 'https://claude.ai/artifact/2qLBV7z36uALqjeJPXxNG9';

  /* ---------- Event log, persistence, cross-tab sync ---------- */

  var cache = load();
  var listeners = [];
  var channel = null;
  try { channel = ('BroadcastChannel' in global) ? new BroadcastChannel(CHANNEL) : null; } catch (e) { channel = null; }
  if (channel) {
    channel.onmessage = function (m) {
      if (m && m.data && m.data.kind === 'event') { ingest(m.data.event); }
      if (m && m.data && m.data.kind === 'reset') { cache = []; save(); notify(null); }
    };
  }
  try {
    global.addEventListener('storage', function (e) {
      if (e.key === LOG_KEY) { cache = load(); notify(null); }
    });
  } catch (e) {}

  function load() {
    try { var raw = global.localStorage.getItem(LOG_KEY); return raw ? JSON.parse(raw) : []; }
    catch (e) { return []; }
  }
  function save() { try { global.localStorage.setItem(LOG_KEY, JSON.stringify(cache)); } catch (e) {} }
  function notify(ev) { listeners.forEach(function (fn) { try { fn(ev, cache); } catch (e) {} }); }

  function ingest(ev) {
    if (!ev || !ev.id) return;
    if (cache.some(function (x) { return x.id === ev.id; })) return;
    cache.push(ev);
    cache.sort(function (a, b) { return a.ts - b.ts; });
    save();
    notify(ev);
  }


  // Non-cryptographic 53-bit hash (cyrb53). Enough to make tampering detectable
  // in the demo; production would use SHA-256.
  function h53(str, seed) {
    var h1 = 0xdeadbeef ^ (seed || 0), h2 = 0x41c6ce57 ^ (seed || 0);
    for (var i = 0, ch; i < str.length; i++) { ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return ('0000000000000' + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)).slice(-14);
  }
  function eventHash(prevHash, ev) { return h53(prevHash + '|' + ev.id + '|' + ev.ts + '|' + ev.type + '|' + JSON.stringify(ev.actor) + '|' + JSON.stringify(ev.payload)); }

  /* ---------- Public API ---------- */

  var Exchange = {
    PATIENT: PATIENT, ORGS: ORGS, FORMULARY: FORMULARY, LAB_TESTS: LAB_TESTS,
    FRAMEWORK: FRAMEWORK, VSTATUS: VSTATUS, GIC_URL: GIC_URL,

    org: function (id) { return ORGS.filter(function (o) { return o.id === id; })[0] || null; },
    orgByProduct: function (p) { return ORGS.filter(function (o) { return o.product === p; })[0] || null; },
    orgsFor: function (p) {
      return ORGS.filter(function (o) { return o.product === p; })
        .sort(function (a, b) { return SIZE_ORDER[a.sizeClass] - SIZE_ORDER[b.sizeClass]; });
    },
    drug: function (code) { return FORMULARY.filter(function (d) { return d.code === code; })[0] || null; },
    labTest: function (code) { return LAB_TESTS.filter(function (t) { return t.code === code; })[0] || null; },

    hash53: h53,

    // Tamper check. Each event carries the hash of its predecessor, so a changed
    // payload or a removed event is detectable. Events from before hashing was
    // added are counted as legacy and skipped. Pass a list to test a copy.
    verify: function (list) {
      list = list || cache;
      var byId = {}, checked = 0, legacy = 0, broken = null;
      list.forEach(function (e) { byId[e.id] = e; });
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (!e.hash) { legacy++; continue; }
        var prevHash = '';
        if (e.prev) { if (!byId[e.prev]) { broken = { id: e.id, type: e.type, reason: 'predecessor missing, an event was removed' }; break; } prevHash = byId[e.prev].hash || ''; }
        if (eventHash(prevHash, e) !== e.hash) { broken = { id: e.id, type: e.type, reason: 'content changed after it was written' }; break; }
        checked++;
      }
      return { ok: !broken, checked: checked, legacy: legacy, broken: broken };
    },

    events: function () { return cache.slice(); },
    eventsOfType: function (type) { return cache.filter(function (e) { return e.type === type; }); },

    append: function (type, payload, actor) {
      var ev = {
        id: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8),
        ts: Date.now(), type: type, actor: actor || null, payload: payload || {}
      };
      var last = cache.length ? cache[cache.length - 1] : null;
      ev.prev = last ? last.id : null;
      ev.hash = eventHash(last && last.hash ? last.hash : '', ev);
      cache.push(ev);
      save();
      if (channel) { try { channel.postMessage({ kind: 'event', event: ev }); } catch (e) {} }
      notify(ev);
      return ev;
    },

    subscribe: function (fn) {
      listeners.push(fn);
      return function () { listeners = listeners.filter(function (x) { return x !== fn; }); };
    },

    reset: function () {
      cache = []; save();
      if (channel) { try { channel.postMessage({ kind: 'reset' }); } catch (e) {} }
      notify(null);
    },

    // ---- Selectors ----
    prescriptions: function () { return cache.filter(function (e) { return e.type === 'RX_WRITTEN'; }).map(function (e) { return e.payload; }); },
    dispenses: function () { return cache.filter(function (e) { return e.type === 'RX_DISPENSED'; }).map(function (e) { return e.payload; }); },
    isDispensed: function (rxId) { return cache.some(function (e) { return e.type === 'RX_DISPENSED' && e.payload.rxId === rxId; }); },
    labResults: function () { return cache.filter(function (e) { return e.type === 'LAB_RESULT'; }).map(function (e) { return e.payload; }); },
    referrals: function () { return cache.filter(function (e) { return e.type === 'REFERRAL'; }).map(function (e) { return e.payload; }); },
    admissions: function () { return cache.filter(function (e) { return e.type === 'ADMISSION'; }).map(function (e) { return e.payload; }); },
    coldChainAlerts: function () { return cache.filter(function (e) { return e.type === 'COLD_CHAIN_ALERT'; }).map(function (e) { return e.payload; }); },
    claims: function () { return cache.filter(function (e) { return e.type === 'CLAIM_ADJUDICATED'; }).map(function (e) { return e.payload; }); },
    isClaimed: function (rxId) { return cache.some(function (e) { return e.type === 'CLAIM_ADJUDICATED' && e.payload.rxId === rxId; }); },
    consentGranted: function (toProduct) {
      var state = {};
      cache.forEach(function (e) {
        if (e.type === 'CONSENT_GRANTED') state[e.payload.to] = true;
        if (e.type === 'CONSENT_REVOKED') state[e.payload.to] = false;
      });
      return toProduct ? !!state[toProduct] : state;
    },
    gicPublications: function () { return cache.filter(function (e) { return e.type === 'GIC_PUBLISHED'; }).map(function (e) { return e.payload; }); }
  };

  global.QareExchange = Exchange;
})(typeof window !== 'undefined' ? window : this);
