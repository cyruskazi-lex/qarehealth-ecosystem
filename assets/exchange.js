/*
 * Qäre HIE — the shared exchange that makes the twelve apps one system.
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

  /* ---------- The seeded world: patient, orgs by size, personas ---------- */

  var PATIENT = {
    id: 'PT-AMARA', name: 'Amara Okonkwo', age: 52, sex: 'F',
    location: 'Dhaka', mrn: 'QH-PT-100482',
    conditions: ['Type 2 diabetes', 'Hypertension'],
    allergies: ['Penicillin']
  };

  // sizeClass drives the demo requirement: every product shows small, mid, large.
  var ORGS = [
    {
      id: 'ORG-CLINIC', name: 'Bhorosha Primary Care', sector: 'clinic',
      sizeClass: 'SMALL', product: 'pulse', region: 'Dhaka',
      personas: [{ id: 'U-IMRAN', name: 'Dr. Imran Chowdhury', role: 'General physician' }]
    },
    {
      id: 'ORG-PHARMACY', name: 'Shetu Community Pharmacy', sector: 'pharmacy',
      sizeClass: 'SMALL', product: 'cura', region: 'Dhaka',
      personas: [{ id: 'U-NUSRAT', name: 'Nusrat Jahan', role: 'Pharmacist' }]
    },
    {
      id: 'ORG-HOSPITAL', name: 'Shapla District Hospital', sector: 'hospital',
      sizeClass: 'MEDIUM', product: 'apex', region: 'Gazipur',
      personas: [{ id: 'U-SHAHANA', name: 'Shahana Akter', role: 'Hospital administrator' }]
    },
    {
      id: 'ORG-LAB', name: 'Probaho Diagnostics', sector: 'lab',
      sizeClass: 'MEDIUM', product: 'prism', region: 'Dhaka',
      personas: [{ id: 'U-KAMAL', name: 'Dr. Kamal Uddin', role: 'Lab director' }]
    },
    {
      id: 'ORG-NEXAGEN', name: 'Nexagen Pharmaceuticals', sector: 'pharma',
      sizeClass: 'LARGE', product: 'nexus', region: 'Tongi, Dhaka',
      personas: [
        { id: 'U-ARJUN', name: 'Arjun Mehta', role: 'Chief Operating Officer' },
        { id: 'U-FATIMA', name: 'Fatima Al-Rashid', role: 'Chief Financial Officer' },
        { id: 'U-KWAME', name: 'Dr. Kwame Asante', role: 'Head of Regulatory Affairs' }
      ]
    }
  ];

  // Products Nexagen makes, used across the prescribing and dispensing flow.
  var FORMULARY = [
    { code: 'CARDINEX-10', name: 'CardiNex-10', maker: 'ORG-NEXAGEN', form: 'CV oral solid', unitPrice: 42, coldChain: false },
    { code: 'ONCONEX-100', name: 'OncoNex-100', maker: 'ORG-NEXAGEN', form: 'Oncology injectable', unitPrice: 1180, coldChain: true },
    { code: 'METFORMIN-500', name: 'Metformin 500', maker: 'Generic', form: 'Oral solid', unitPrice: 3, coldChain: false }
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
  // Fallback for environments without BroadcastChannel: the storage event.
  try {
    global.addEventListener('storage', function (e) {
      if (e.key === LOG_KEY) { cache = load(); notify(null); }
    });
  } catch (e) {}

  function load() {
    try { var raw = global.localStorage.getItem(LOG_KEY); return raw ? JSON.parse(raw) : []; }
    catch (e) { return []; }
  }
  function save() {
    try { global.localStorage.setItem(LOG_KEY, JSON.stringify(cache)); } catch (e) {}
  }
  function notify(ev) { listeners.forEach(function (fn) { try { fn(ev, cache); } catch (e) {} }); }

  function ingest(ev) {
    if (!ev || !ev.id) return;
    if (cache.some(function (x) { return x.id === ev.id; })) return; // dedupe
    cache.push(ev);
    cache.sort(function (a, b) { return a.ts - b.ts; });
    save();
    notify(ev);
  }

  /* ---------- Public API ---------- */

  var Exchange = {
    PATIENT: PATIENT,
    ORGS: ORGS,
    FORMULARY: FORMULARY,
    FRAMEWORK: FRAMEWORK,
    VSTATUS: VSTATUS,
    GIC_URL: GIC_URL,

    org: function (id) { return ORGS.filter(function (o) { return o.id === id; })[0] || null; },
    orgByProduct: function (p) { return ORGS.filter(function (o) { return o.product === p; })[0] || null; },
    drug: function (code) { return FORMULARY.filter(function (d) { return d.code === code; })[0] || null; },

    events: function () { return cache.slice(); },
    eventsOfType: function (type) { return cache.filter(function (e) { return e.type === type; }); },

    // Append an event: persist locally, broadcast to other tabs, notify this tab.
    append: function (type, payload, actor) {
      var ev = {
        id: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8),
        ts: Date.now(),
        type: type,
        actor: actor || null,
        payload: payload || {}
      };
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
      cache = [];
      save();
      if (channel) { try { channel.postMessage({ kind: 'reset' }); } catch (e) {} }
      notify(null);
    },

    // ---- Selectors the apps read from ----
    prescriptions: function () { return cache.filter(function (e) { return e.type === 'RX_WRITTEN'; }).map(function (e) { return e.payload; }); },
    dispenses: function () { return cache.filter(function (e) { return e.type === 'RX_DISPENSED'; }).map(function (e) { return e.payload; }); },
    isDispensed: function (rxId) { return cache.some(function (e) { return e.type === 'RX_DISPENSED' && e.payload.rxId === rxId; }); },
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
