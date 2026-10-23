/*
 * Qäre care layer: the doctor act on the shared exchange.
 *
 * Loaded after exchange.js and spine.js. It adds X.care: visits with a confirmed
 * identity, lab orders routed to a lab, prescriptions routed to the patient's own
 * pharmacy, a granular supply signal for the medicine maker, referrals that the
 * receiving hospital accepts or declines, and a conceptual payments ledger.
 *
 * Everything is derived from events on the log. Nothing is stored anywhere else.
 * The supply signal never carries the patient's identity. Clinical context
 * (indication, age band, sex) travels only when the patient has opted in.
 *
 * No em dashes.
 */
(function (global) {
  'use strict';
  var X = global.QareExchange;
  if (!X || !X.registry) return;

  function uid(p) { return p + '-' + Date.now().toString(36).toUpperCase().slice(-5) + Math.random().toString(36).slice(2, 5).toUpperCase(); }
  function clone(o) { var r = {}; for (var k in o) r[k] = o[k]; return r; }
  function actor(app, persona) { return { app: app, persona: persona || null }; }
  function orgName(id) { var o = X.org(id); return o ? o.name : id; }

  var CURRENCY = { BD: 'BDT', IN: 'INR', KE: 'KES', US: 'USD' };
  var INDICATION = {
    'CARDINEX-10': ['Hypertension', 'I10'],
    'ONCONEX-100': ['Oncology, specialist care', 'C80'],
    'METFORMIN-500': ['Type 2 diabetes', 'E11']
  };

  var care = {
    RECEIVING: ['ORG-HOSPITAL-LRG'],
    INDICATION: INDICATION,
    currency: function () { return CURRENCY[X.pack().id] || ''; }
  };

  /* ---------- pharmacy chosen by the patient ---------- */

  care.nominatedPharmacy = function (patientId) {
    var last = null;
    X.eventsOfType('PHARMACY_NOMINATED').forEach(function (e) { if (e.payload.patientId === patientId) last = e.payload; });
    if (last) return { orgId: last.orgId, name: orgName(last.orgId), source: 'patient' };
    return { orgId: 'ORG-PHARMACY', name: orgName('ORG-PHARMACY'), source: 'default' };
  };
  care.nominate = function (patientId, orgId, by, confirmedWithPatient) {
    return X.append('PHARMACY_NOMINATED', { patientId: patientId, orgId: orgId, by: by || 'patient', confirmedWithPatient: !!confirmedWithPatient }, actor('pulse'));
  };

  /* ---------- visits ---------- */

  care.visits = function () {
    var map = {}, order = [];
    X.events().forEach(function (e) {
      var p = e.payload || {};
      if (e.type === 'VISIT_STARTED') { map[p.visitId] = Object.assign(clone(p), { status: 'open', startedAt: e.ts }); order.push(p.visitId); }
      if (e.type === 'VISIT_CLOSED' && map[p.visitId]) { map[p.visitId].status = 'closed'; map[p.visitId].closedAt = e.ts; map[p.visitId].closeNote = p.note || ''; }
    });
    return order.map(function (id) { return map[id]; });
  };
  care.visit = function (id) { return care.visits().filter(function (v) { return v.visitId === id; })[0] || null; };
  care.activeVisit = function (clinicId) {
    var open = care.visits().filter(function (v) { return v.status === 'open' && (!clinicId || v.clinicId === clinicId); });
    return open.length ? open[open.length - 1] : null;
  };

  // Identity must be confirmed by a recorded method. A virtual visit cannot use an in-person check.
  care.startVisit = function (o) {
    var ok = { 'in-person ID check': 'in-person', 'patient code': 'any', 'community health worker': 'any', 'new registration': 'in-person' };
    if (!o.identity || !ok[o.identity.method]) return { ok: false, reason: 'Confirm who the patient is before the visit starts.' };
    if (o.mode === 'virtual' && ok[o.identity.method] === 'in-person') return { ok: false, reason: 'A virtual visit needs the patient code or a community health worker. An in-person ID check cannot happen on a call.' };
    var d = X.access({ patientId: o.patientId, flow: 'treatment', recipient: o.clinicId, purpose: 'visit' }, actor('pulse', o.personaId));
    if (!d.allow) return { ok: false, reason: d.reason, decision: d };
    var visitId = uid('V');
    var ev = X.append('VISIT_STARTED', {
      visitId: visitId, clinicId: o.clinicId, clinicName: orgName(o.clinicId), mode: o.mode, patientId: o.patientId, patientName: o.patientName,
      recordId: o.recordId || null, reason: o.reason || '', identity: o.identity, clinician: o.clinician, makerContextOptIn: !!o.makerOptIn
    }, actor('pulse', o.personaId));
    if (o.makerOptIn) X.consent.grant({ patientId: o.patientId, flow: 'secondary', recipient: 'maker', scope: ['supply-safety'], by: 'patient, recorded at visit ' + visitId }, actor('pulse', o.personaId));
    return { ok: true, visitId: visitId, decision: d, event: ev };
  };
  care.closeVisit = function (visitId, note) { return X.append('VISIT_CLOSED', { visitId: visitId, note: note || '' }, actor('pulse')); };

  /* ---------- labs ---------- */

  care.orderLab = function (o) {
    var v = care.visit(o.visitId); if (!v) return null;
    var t = X.labTest(o.test); if (!t) return null;
    X.access({ patientId: v.patientId, flow: 'treatment', recipient: o.labOrgId, purpose: 'lab order' }, actor('pulse'));
    return X.append('LAB_ORDERED', {
      orderId: uid('ORD'), simDay: o.simDay || 0, visitId: v.visitId, patientId: v.patientId, patientName: v.patientName, test: t.code, testName: t.name,
      urgency: o.urgency || 'Routine', clinicId: v.clinicId, clinicName: v.clinicName, labOrgId: o.labOrgId, labName: orgName(o.labOrgId), orderedBy: v.clinician
    }, actor('pulse'));
  };
  care.labOrders = function (filter) {
    var results = {};
    X.eventsOfType('LAB_RESULT').forEach(function (e) { if (e.payload.orderId) results[e.payload.orderId] = e.payload; });
    return X.eventsOfType('LAB_ORDERED').map(function (e) {
      var p = clone(e.payload); p.ts = e.ts; p.result = results[p.orderId] || null; p.status = p.result ? 'resulted' : 'ordered'; return p;
    }).filter(function (p) { return !filter || ((!filter.visitId || p.visitId === filter.visitId) && (!filter.labOrgId || p.labOrgId === filter.labOrgId) && (!filter.patientId || p.patientId === filter.patientId)); });
  };
  // The analyzer is simulated. Amara's HbA1c is fixed so the story is repeatable.
  care.simulatedValue = function (order, simDay) {
    // Amara's story: HbA1c 8.1 at baseline, improving with treatment and follow-up.
    if (order.patientId === 'PT-AMARA') {
      if (order.test === 'HBA1C') return simDay >= 90 ? 7.2 : simDay >= 30 ? 7.7 : 8.1;
      return order.test === 'CREAT' ? 1.0 : 180;
    }
    var n = parseInt(X.hash53(order.orderId + order.test), 16) % 100;
    if (order.test === 'HBA1C') return Math.round((5.2 + n / 25) * 10) / 10;
    if (order.test === 'CREAT') return Math.round((0.6 + n / 80) * 10) / 10;
    return 150 + n;
  };
  care.releaseLab = function (order, labOrgId, personaId) {
    var t = X.labTest(order.test), val = care.simulatedValue(order, order.simDay || 0);
    return X.append('LAB_RESULT', {
      orderId: order.orderId, simDay: order.simDay || 0, visitId: order.visitId, test: t.code, testName: t.name, value: val, unit: t.unit, flag: val > t.flagAbove,
      patientId: order.patientId, patientName: order.patientName, labOrgId: labOrgId, simulated: true
    }, actor('prism', personaId));
  };

  /* ---------- prescriptions ---------- */

  care.prescribe = function (o) {
    var v = care.visit(o.visitId); if (!v) return null;
    var d = X.drug(o.drug); if (!d) return null;
    var pharmacyId = o.pharmacyId || care.nominatedPharmacy(v.patientId).orgId;
    X.access({ patientId: v.patientId, flow: 'treatment', recipient: pharmacyId, purpose: 'prescription' }, actor('pulse'));
    var clinic = X.org(v.clinicId);
    return X.append('RX_WRITTEN', {
      rxId: uid('RX'), by: 'pulse', visitId: v.visitId, patientId: v.patientId, patientName: v.patientName, drug: d.code, drugName: d.name,
      qty: o.qty, sig: o.sig || '', maker: d.maker, orgId: v.clinicId, region: clinic ? clinic.region : '', prescriber: v.clinician,
      pharmacyId: pharmacyId, pharmacyName: orgName(pharmacyId), indication: o.indication || (INDICATION[d.code] || [''])[0]
    }, actor('pulse'));
  };

  /* ---------- dispensing and the granular supply signal ---------- */

  function ageBand(patientId) {
    if (patientId === 'PT-AMARA') return '50 to 59';
    return 'not recorded';
  }

  // Operational fields always travel: the maker needs them to supply. Clinical
  // context travels only on the patient's opt-in. The patient's identity never does.
  care.buildSignal = function (rx, disp, pharmacyId) {
    var d = X.drug(rx.drug), ph = X.org(pharmacyId), clinic = X.org(rx.orgId);
    var gate = X.access({ patientId: rx.patientId, flow: 'secondary', recipient: 'maker', purpose: 'supply and safety signal' }, actor('cura'));
    var sig = {
      signalId: uid('SIG'), rxId: rx.rxId, drug: rx.drug, drugName: rx.drugName, maker: rx.maker, qty: rx.qty,
      packSerial: disp.packSerial, batch: disp.batch, unitPrice: d ? d.unitPrice : null, amount: d ? d.unitPrice * rx.qty : null, currency: care.currency(),
      pharmacyId: pharmacyId, pharmacyName: ph ? ph.name : pharmacyId, region: ph ? ph.region : rx.region,
      prescriberOrgId: rx.orgId, prescriberOrgName: clinic ? clinic.name : rx.orgId, prescriberRole: 'Physician',
      patientKey: X.hash53('maker-salt|' + rx.patientId), contextBasis: gate.allow ? 'patient opt-in' : 'withheld, no patient opt-in'
    };
    if (gate.allow) { var ind = INDICATION[rx.drug] || [rx.indication || '', '']; sig.indication = rx.indication || ind[0]; sig.indicationCode = ind[1]; sig.ageBand = ageBand(rx.patientId); sig.sex = rx.patientId === 'PT-AMARA' ? 'F' : 'not recorded'; }
    return sig;
  };

  care.dispense = function (o) {
    var rx = X.prescriptions().filter(function (r) { return r.rxId === o.rxId; })[0]; if (!rx) return null;
    var pharmacyId = o.pharmacyId;
    var serial = 'PK-' + rx.drug.slice(0, 4) + '-' + Date.now().toString().slice(-5);
    var batch = 'B-' + rx.drug.slice(0, 4) + '-' + (parseInt(X.hash53(rx.drug + '|' + new Date().toISOString().slice(0, 10)), 16) % 9000 + 1000);
    var disp = { rxId: rx.rxId, visitId: rx.visitId || null, patientId: rx.patientId, drug: rx.drug, drugName: rx.drugName, qty: rx.qty, packSerial: serial, batch: batch, byOrgId: pharmacyId, maker: rx.maker, region: rx.region, patientName: rx.patientName };
    var a = actor('cura', o.personaId);
    X.append('RX_DISPENSED', disp, a);
    var sig = care.buildSignal(rx, disp, pharmacyId);
    X.append('SUPPLY_SIGNAL', sig, a);
    X.append('DEMAND_SIGNAL', { rxId: rx.rxId, drug: rx.drug, drugName: rx.drugName, qty: rx.qty, region: sig.region, maker: rx.maker }, a);
    return { dispense: disp, signal: sig };
  };
  care.supplySignals = function (maker) { return X.eventsOfType('SUPPLY_SIGNAL').map(function (e) { var p = clone(e.payload); p.ts = e.ts; return p; }).filter(function (p) { return !maker || p.maker === maker; }); };

  /* ---------- referrals, accept or decline, hospital notice ---------- */

  care.refer = function (o) {
    var v = care.visit(o.visitId); if (!v) return null;
    var d = X.access({ patientId: v.patientId, flow: 'treatment', recipient: o.toOrgId, purpose: 'referral' }, actor('pulse'));
    if (!d.allow) return { ok: false, reason: d.reason };
    var results = X.labResults().filter(function (r) { return r.patientId === v.patientId; }).map(function (r) { return r.testName + ' ' + r.value + ' ' + r.unit + (r.flag ? ' (out of range)' : ''); });
    var meds = X.prescriptions().filter(function (r) { return r.patientId === v.patientId; }).map(function (r) { return r.drugName + ' x' + r.qty; });
    var ev = X.append('CLINIC_REFERRAL', {
      referralId: uid('REF'), visitId: v.visitId, patientId: v.patientId, patientName: v.patientName, fromOrgId: v.clinicId, fromOrgName: v.clinicName,
      toOrgId: o.toOrgId, toOrgName: orgName(o.toOrgId), reason: o.reason, urgency: o.urgency || 'Routine', referrer: v.clinician,
      shared: { results: results, medicines: meds }
    }, actor('pulse'));
    return { ok: true, event: ev, referralId: ev.payload.referralId };
  };
  care.referrals = function (filter) {
    var resp = {}, adm = {}, notice = {}, dis = {}, dec = {};
    X.eventsOfType('PATIENT_DECISION').forEach(function (e) { dec[e.payload.referralId] = Object.assign(clone(e.payload), { ts: e.ts }); });
    X.eventsOfType('DISCHARGE_COMPLETED').forEach(function (e) { dis[e.payload.referralId] = Object.assign(clone(e.payload), { ts: e.ts }); });
    X.eventsOfType('REFERRAL_RESPONSE').forEach(function (e) { resp[e.payload.referralId] = Object.assign(clone(e.payload), { ts: e.ts }); });
    X.eventsOfType('HOSPITAL_NOTICE').forEach(function (e) { notice[e.payload.referralId] = Object.assign(clone(e.payload), { ts: e.ts }); });
    X.eventsOfType('ADMISSION').forEach(function (e) { if (e.payload.referralId) adm[e.payload.referralId] = Object.assign(clone(e.payload), { ts: e.ts }); });
    return X.eventsOfType('CLINIC_REFERRAL').map(function (e) {
      var p = clone(e.payload); p.ts = e.ts; p.response = resp[p.referralId] || null; p.notice = notice[p.referralId] || null; p.admission = adm[p.referralId] || null; p.discharge = dis[p.referralId] || null; p.patientDecision = dec[p.referralId] || null;
      p.status = p.discharge ? 'discharged' : p.admission ? 'admitted' : (p.patientDecision && p.patientDecision.decision === 'declined') ? 'patient-declined' : p.response ? p.response.decision : 'sent'; return p;
    }).filter(function (p) { return !filter || ((!filter.visitId || p.visitId === filter.visitId) && (!filter.toOrgId || p.toOrgId === filter.toOrgId) && (!filter.patientId || p.patientId === filter.patientId)); });
  };
  care.respondReferral = function (o) {
    var r = care.referrals().filter(function (x) { return x.referralId === o.referralId; })[0]; if (!r) return null;
    if (o.decision === 'declined' && !o.reason) return { ok: false, reason: 'A decline needs a reason, so the referring doctor can act on it.' };
    var a = actor('apex', o.personaId);
    X.append('REFERRAL_RESPONSE', { referralId: r.referralId, decision: o.decision, reason: o.reason || '', alternativeOrgId: o.alternativeOrgId || null, alternativeName: o.alternativeOrgId ? orgName(o.alternativeOrgId) : null, unit: o.unit || null, by: o.by }, a);
    if (o.decision === 'accepted') {
      X.append('HOSPITAL_NOTICE', {
        referralId: r.referralId, patientId: r.patientId, patientName: r.patientName, toOrgId: r.toOrgId, toOrgName: r.toOrgName, unit: o.unit || 'General medicine',
        expectedBy: 'Within ' + (r.urgency === 'Urgent' ? '4 hours' : r.urgency === 'STAT' ? '1 hour' : '24 hours'),
        instructions: ['Bring the medicines you take now', 'Bring any test results you have', 'Come with a family member if you can'], audience: ['patient', 'referrer']
      }, a);
    }
    return { ok: true };
  };
  care.admit = function (referralId, orgId, personaId) {
    var r = care.referrals().filter(function (x) { return x.referralId === referralId; })[0]; if (!r || r.status !== 'accepted') return null;
    return X.append('ADMISSION', { household: 'HH-' + r.patientId, patientId: r.patientId, patientName: r.patientName, orgId: orgId, referralId: referralId, unit: r.response.unit }, actor('apex', personaId));
  };


  /* ---------- the patient's own choices (dignity of risk) ---------- */

  // A patient may decline a referral. The reason is optional: it is their decision,
  // not a form to justify. The clinician sees it as an informed choice, not a failure.
  care.decideReferral = function (o) {
    var r = care.referrals({ patientId: o.patientId }).filter(function (x) { return x.referralId === o.referralId; })[0];
    if (!r) return { ok: false, reason: 'No such referral on your record.' };
    if (r.status !== 'sent' && r.status !== 'accepted') return { ok: false, reason: 'This referral can no longer be declined here.' };
    var ev = X.append('PATIENT_DECISION', { referralId: r.referralId, patientId: r.patientId, patientName: r.patientName, decision: 'declined', note: o.note || '', informed: true, toOrgName: r.toOrgName, fromOrgId: r.fromOrgId, visitId: r.visitId }, actor('nova', r.patientId));
    return { ok: true, event: ev };
  };
  care.reconsiderReferral = function (o) {
    var r = care.referrals({ patientId: o.patientId }).filter(function (x) { return x.referralId === o.referralId; })[0];
    if (!r || r.status !== 'patient-declined') return { ok: false };
    var ev = X.append('PATIENT_DECISION', { referralId: r.referralId, patientId: r.patientId, patientName: r.patientName, decision: 'reconsidered', note: '', informed: true, toOrgName: r.toOrgName, fromOrgId: r.fromOrgId, visitId: r.visitId }, actor('nova', r.patientId));
    return { ok: true, event: ev };
  };

  // Medicine-maker context (indication, age band, sex) is a separate opt-in from care.
  care.makerContext = function (patientId) { var st = X.consent.state(patientId)['secondary|maker']; return !!(st && st.active); };
  care.setMakerContext = function (patientId, on) {
    return on ? X.consent.grant({ patientId: patientId, flow: 'secondary', recipient: 'maker', scope: ['supply-safety'], by: 'patient, in Nova' }, actor('nova', patientId))
              : X.consent.revoke({ patientId: patientId, flow: 'secondary', recipient: 'maker', by: 'patient, in Nova' }, actor('nova', patientId));
  };

  care.pharmacies = function () { return X.ORGS.filter(function (o) { return o.sector === 'pharmacy'; }); };

  // Everything on the record that belongs to this patient, as FHIR, for the patient to keep.
  care.patientBundle = function (patientId) {
    var entries = [];
    var rec = X.registry && X.registry.record ? X.registry.record(patientId) : null;
    if (rec && rec.mrn && X.fhir.patient) entries.push({ fullUrl: 'urn:uuid:patient-' + patientId, resource: X.fhir.patient(rec) });
    else if (X.PATIENT && X.PATIENT.id === patientId) entries.push({ fullUrl: 'urn:uuid:patient-' + patientId, resource: { resourceType: 'Patient', id: patientId, identifier: [{ system: 'https://qare.health/mrn', value: X.PATIENT.mrn }], name: [{ text: X.PATIENT.name }], gender: X.PATIENT.sex === 'M' ? 'male' : 'female' } });
    X.events().forEach(function (e) {
      if (!e.payload || e.payload.patientId !== patientId) return;
      var r = X.fhir.resource(e); if (r) entries.push({ fullUrl: 'urn:uuid:' + e.id, resource: r });
    });
    return { resourceType: 'Bundle', type: 'collection', timestamp: new Date().toISOString(), total: entries.length, entry: entries };
  };
  care.recordExport = function (patientId, n) { return X.append('RECORD_EXPORTED', { patientId: patientId, resources: n, format: 'FHIR R4 Bundle' }, actor('nova', patientId)); };


  /* ---------- public health: two flows, never mixed ---------- */
  // Notifiable conditions (the pack's list) are reported with identity as a legal duty,
  // minimum necessary, no opt-out, and the patient is told. Everything else that feeds
  // surveillance is an anonymous count with no patient identifier at all.

  care.SYNDROMES = ['Hypertension', 'Type 2 diabetes', 'Respiratory infection', 'Diarrhoeal disease'];
  care.PH_RECIPIENT = 'ORG-MOH-LRG';
  care.notifiableList = function () { return (X.pack().notifiable || []).map(function (n) { return { condition: n[0], timeliness: n[1] }; }); };
  care.isNotifiable = function (condition) { return care.notifiableList().filter(function (n) { return n.condition === condition; })[0] || null; };
  function isoWeek(ts) { var d = new Date(ts); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); var y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return d.getUTCFullYear() + '-W' + String(Math.ceil(((d - y0) / 86400000 + 1) / 7)).padStart(2, '0'); }

  care.diagnose = function (o) {
    var v = care.visit(o.visitId); if (!v) return { ok: false, reason: 'Open a visit first.' };
    if (!o.condition) return { ok: false, reason: 'Choose a condition.' };
    var nt = care.isNotifiable(o.condition), clinic = X.org(v.clinicId), a = actor('pulse', o.personaId);
    X.append('DIAGNOSIS_RECORDED', { visitId: v.visitId, patientId: v.patientId, patientName: v.patientName, condition: o.condition, notifiable: !!nt, clinician: v.clinician, orgId: v.clinicId }, a);
    if (nt) {
      var d = X.access({ patientId: v.patientId, flow: 'mandated', recipient: care.PH_RECIPIENT, purpose: 'notifiable disease report' }, a);
      var ev = X.append('NOTIFIABLE_CASE', {
        caseId: uid('CASE'), condition: o.condition, timeliness: nt.timeliness, patientId: v.patientId, patientName: v.patientName, ageBand: ageBand(v.patientId),
        sex: v.patientId === 'PT-AMARA' ? 'F' : 'not recorded', location: v.patientId === 'PT-AMARA' ? X.PATIENT.location : (clinic ? clinic.region : ''),
        reporterOrgId: v.clinicId, reporterName: v.clinicName, clinician: v.clinician, basis: d.basis, pack: X.pack().id,
        minimumNecessary: ['name', 'age band', 'sex', 'location', 'condition', 'reporting clinic']
      }, a);
      return { ok: true, kind: 'notifiable', caseId: ev.payload.caseId, timeliness: nt.timeliness };
    }
    X.append('SURVEILLANCE_OBSERVATION', { condition: o.condition, region: clinic ? clinic.region : '', ageBand: ageBand(v.patientId), week: isoWeek(Date.now()) }, a);
    return { ok: true, kind: 'surveillance' };
  };
  care.notifiableCases = function () { return X.eventsOfType('NOTIFIABLE_CASE').map(function (e) { var p = clone(e.payload); p.ts = e.ts; return p; }); };
  // Aggregate counts. A cell below the pack's minimum is suppressed, so a small count cannot point at a person.
  care.surveillance = function () {
    var min = X.pack().minCohort || 5, m = {}, order = [];
    function bump(cond, region) { if (!m[cond]) { m[cond] = { condition: cond, count: 0, regions: {}, notifiable: !!care.isNotifiable(cond) }; order.push(cond); } m[cond].count++; if (region) m[cond].regions[region] = true; }
    X.eventsOfType('SURVEILLANCE_OBSERVATION').forEach(function (e) { bump(e.payload.condition, e.payload.region); });
    X.eventsOfType('NOTIFIABLE_CASE').forEach(function (e) { bump(e.payload.condition, e.payload.location); });
    return { min: min, rows: order.map(function (c) { var r = m[c]; return { condition: c, notifiable: r.notifiable, count: r.count, districts: Object.keys(r.regions).length, suppressed: r.count < min }; }) };
  };


  /* ---------- outcome records for the Commons: the patient's key and the institution's key ---------- */
  // A record built from the event chain joins a published cohort only if it is documented
  // (all five tests pass) AND the patient's research consent is active now. Withdrawal drops it from the next build.
  care.OUTCOME_LABEL = { HBA1C: 'HbA1c', 'BP-SYS': 'Systolic BP' };
  care.liveOutcomes = function (orgId) {
    var pts = {}, out = { records: [], withheld: 0, pending: 0, notMet: 0 };
    X.eventsOfType('OBSERVATION_RECORDED').forEach(function (e) { pts[e.payload.patientId] = true; });
    Object.keys(pts).forEach(function (pid) {
      var consent = !!(X.consent.state(pid)['secondary|research'] || {}).active;
      Object.keys(care.MEASURES).forEach(function (code) {
        var r = care.outcomeRecord(pid, code);
        if (!r.interventions.some(function (i) { return i.orgId === orgId; })) return;
        if (r.status === 'pending') { out.pending++; return; }
        if (r.status !== 'documented') { if (r.status === 'not met') out.notMet++; return; }
        if (!consent) { out.withheld++; return; }
        var M = care.MEASURES[code], ev = r.interventions[0];
        out.records.push({ id: 'LIVE-' + X.hash53('outcome|' + pid + '|' + code).slice(-6).toUpperCase(), subject: 'P-' + X.hash53('subject-salt|' + pid).slice(-5), measure: care.OUTCOME_LABEL[code], unit: M.unit, better: M.better, mcid: M.mcid, win: M.win,
          baseline: r.baseline.value, follow: r.followUp.value, reported: null, intervention: ev.text, linked: true, independent: true, source: r.followUp.sourceName, day0: M.win + 3, live: true });
      });
    });
    return out;
  };

  /* ---------- payments (conceptual: no money moves) ---------- */

  care.TARIFF = { consult: { SMALL: 300, MEDIUM: 500, LARGE: 900 }, lab: { HBA1C: 450, 'BP-PANEL': 600, CREAT: 300 }, copay: { consult: 0.3, lab: 0.2, rx: 0.2 } };
  care.payments = function (visitId) {
    var v = care.visit(visitId); if (!v) return null;
    var T = care.TARIFF, clinic = X.org(v.clinicId), lines = [];
    function add(item, payee, amount, share, source) { var pat = Math.round(amount * share); lines.push({ item: item, payee: payee, amount: amount, patient: pat, payer: amount - pat, source: source }); }
    add('Consultation (' + v.mode + ')', v.clinicName, T.consult[clinic ? clinic.sizeClass : 'SMALL'], T.copay.consult, 'VISIT_STARTED');
    care.labOrders({ visitId: visitId }).forEach(function (o) { add(o.testName, o.labName, T.lab[o.test] || 400, T.copay.lab, 'LAB_ORDERED'); });
    X.prescriptions().filter(function (r) { return r.visitId === visitId; }).forEach(function (r) {
      var d = X.drug(r.drug), disp = X.dispenses().filter(function (x) { return x.rxId === r.rxId; })[0];
      add(r.drugName + ' x' + r.qty + (disp ? '' : ' (not yet dispensed)'), r.pharmacyName, d.unitPrice * r.qty, T.copay.rx, 'RX_WRITTEN');
    });
    var tot = lines.reduce(function (a, l) { return { amount: a.amount + l.amount, patient: a.patient + l.patient, payer: a.payer + l.payer }; }, { amount: 0, patient: 0, payer: 0 });
    return { visitId: visitId, currency: care.currency(), lines: lines, total: tot };
  };


  /* ---------- observations, discharge, post-acute loop, outcome record ---------- */

  care.MEASURES = {
    'HBA1C': { label: 'HbA1c', unit: '%', better: 'down', mcid: 0.5, win: 90 },
    'BP-SYS': { label: 'Systolic blood pressure', unit: 'mmHg', better: 'down', mcid: 10, win: 30 }
  };

  // simDay is a simulated clock: days since the index visit. It lets the demo show a
  // 90 day follow-up without waiting 90 days. Every use is labelled simulated in the UI.
  care.observe = function (o) {
    var M = care.MEASURES[o.code]; if (!M) return null;
    return X.append('OBSERVATION_RECORDED', {
      obsId: uid('OBS'), patientId: o.patientId, code: o.code, label: M.label, value: +o.value, unit: M.unit, simDay: o.simDay || 0,
      sourceOrgId: o.sourceOrgId, sourceName: orgName(o.sourceOrgId), visitId: o.visitId || null, note: o.note || ''
    }, actor(o.app || 'pulse'));
  };
  care.observations = function (patientId, code) {
    var list = [];
    X.eventsOfType('OBSERVATION_RECORDED').forEach(function (e) { var p = e.payload; if (p.patientId === patientId && p.code === code) list.push({ code: p.code, value: p.value, unit: p.unit, simDay: p.simDay || 0, sourceOrgId: p.sourceOrgId, sourceName: p.sourceName, ts: e.ts, via: 'observation' }); });
    X.eventsOfType('LAB_RESULT').forEach(function (e) { var p = e.payload; if (p.patientId === patientId && p.test === code) list.push({ code: code, value: p.value, unit: p.unit, simDay: p.simDay || 0, sourceOrgId: p.labOrgId, sourceName: orgName(p.labOrgId), ts: e.ts, via: 'lab' }); });
    return list.sort(function (a, b) { return a.simDay - b.simDay || a.ts - b.ts; });
  };

  care.discharge = function (o) {
    var r = care.referrals().filter(function (x) { return x.referralId === o.referralId; })[0];
    if (!r || r.status !== 'admitted') return { ok: false, reason: 'Only an admitted patient can be discharged.' };
    if (X.eventsOfType('DISCHARGE_COMPLETED').some(function (e) { return e.payload.referralId === o.referralId; })) return { ok: false, reason: 'Already discharged.' };
    var d = X.access({ patientId: r.patientId, flow: 'treatment', recipient: o.toOrgId, purpose: 'post-acute referral' }, actor('apex', o.personaId));
    if (!d.allow) return { ok: false, reason: d.reason };
    var dischargeId = uid('DC'), plan = { interventions: o.interventions || [], measures: o.measures || ['BP-SYS'], windowDays: 90, notes: o.notes || '' };
    if (o.baselineBp) care.observe({ patientId: r.patientId, code: 'BP-SYS', value: o.baselineBp, simDay: 0, sourceOrgId: o.orgId, app: 'apex', note: 'at discharge' });
    X.append('DISCHARGE_COMPLETED', { dischargeId: dischargeId, referralId: o.referralId, patientId: r.patientId, patientName: r.patientName, orgId: o.orgId, orgName: orgName(o.orgId), toOrgId: o.toOrgId, toOrgName: orgName(o.toOrgId), plan: plan, by: o.by }, actor('apex', o.personaId));
    X.append('POSTACUTE_REFERRAL', { postAcuteId: uid('PA'), dischargeId: dischargeId, fromOrgId: o.orgId, fromOrgName: orgName(o.orgId), toOrgId: o.toOrgId, toOrgName: orgName(o.toOrgId), patientId: r.patientId, patientName: r.patientName, plan: plan }, actor('apex', o.personaId));
    return { ok: true, dischargeId: dischargeId };
  };
  care.postAcute = function (filter) {
    var fu = {}, closed = {};
    X.eventsOfType('FOLLOWUP_RECORDED').forEach(function (e) { (fu[e.payload.postAcuteId] = fu[e.payload.postAcuteId] || []).push(Object.assign(clone(e.payload), { ts: e.ts })); });
    X.eventsOfType('POSTACUTE_CLOSED').forEach(function (e) { closed[e.payload.postAcuteId] = true; });
    return X.eventsOfType('POSTACUTE_REFERRAL').map(function (e) {
      var p = clone(e.payload); p.ts = e.ts; p.followups = fu[p.postAcuteId] || []; p.status = closed[p.postAcuteId] ? 'closed' : 'open'; return p;
    }).filter(function (p) { return !filter || ((!filter.toOrgId || p.toOrgId === filter.toOrgId) && (!filter.patientId || p.patientId === filter.patientId)); });
  };
  care.recordFollowup = function (o) {
    var pa = care.postAcute().filter(function (x) { return x.postAcuteId === o.postAcuteId; })[0]; if (!pa || pa.status === 'closed') return null;
    var a = actor('bridge', o.personaId);
    var ev = X.append('FOLLOWUP_RECORDED', { postAcuteId: pa.postAcuteId, patientId: pa.patientId, patientName: pa.patientName, simDay: o.simDay, bpSys: o.bpSys, bpDia: o.bpDia, adherence: o.adherence || '', orgId: o.orgId, orgName: orgName(o.orgId), by: o.by }, a);
    care.observe({ patientId: pa.patientId, code: 'BP-SYS', value: o.bpSys, simDay: o.simDay, sourceOrgId: o.orgId, app: 'bridge', note: 'home follow-up' });
    return ev;
  };
  care.closePostAcute = function (postAcuteId, by) { return X.append('POSTACUTE_CLOSED', { postAcuteId: postAcuteId, by: by }, actor('bridge')); };

  // Updates a clinic should see about patients it has seen, minus the ones it acknowledged.
  care.updatesFor = function (clinicId) {
    var mine = {}; care.visits().forEach(function (v) { if (v.clinicId === clinicId) mine[v.patientId] = true; });
    var acked = {}; X.eventsOfType('UPDATE_ACKNOWLEDGED').forEach(function (e) { if (e.payload.clinicId === clinicId) acked[e.payload.key] = true; });
    var out = [];
    X.eventsOfType('DISCHARGE_COMPLETED').forEach(function (e) { var p = e.payload; if (mine[p.patientId]) out.push({ key: e.id, ts: e.ts, patientId: p.patientId, patientName: p.patientName, kind: 'discharge', from: p.orgName, text: 'Discharged from ' + p.orgName + ' to ' + p.toOrgName + '. Plan: ' + (p.plan.interventions.join(', ') || 'follow-up') + '.' }); });
    X.eventsOfType('FOLLOWUP_RECORDED').forEach(function (e) { var p = e.payload; if (mine[p.patientId]) out.push({ key: e.id, ts: e.ts, patientId: p.patientId, patientName: p.patientName, kind: 'followup', from: p.orgName, text: 'Home follow-up, simulated day ' + p.simDay + ': BP ' + p.bpSys + '/' + p.bpDia + (p.adherence ? ', ' + p.adherence : '') + '.' }); });
    return out.filter(function (u) { return !acked[u.key]; }).sort(function (a, b) { return b.ts - a.ts; });
  };
  care.acknowledge = function (key, clinicId) { return X.append('UPDATE_ACKNOWLEDGED', { key: key, clinicId: clinicId }, actor('pulse')); };

  care.interventions = function (patientId, code) {
    var out = [], ind = code === 'HBA1C' ? 'Type 2 diabetes' : 'Hypertension';
    X.eventsOfType('RX_WRITTEN').forEach(function (e) { var p = e.payload; if (p.patientId === patientId && (p.indication === ind || (INDICATION[p.drug] || [])[0] === ind)) out.push({ kind: 'prescription', text: p.drugName + ' prescribed by ' + p.prescriber, orgId: p.orgId, ts: e.ts, eventId: e.id }); });
    X.eventsOfType('DISCHARGE_COMPLETED').forEach(function (e) { var p = e.payload; if (p.patientId === patientId && p.plan.measures.indexOf(code) >= 0) out.push({ kind: 'post-acute plan', text: p.plan.interventions.join(', ') + ' (' + p.toOrgName + ')', orgId: p.orgId, ts: e.ts, eventId: e.id }); });
    return out;
  };
  // The five parts of an outcome. Staying out of hospital is not one of them.
  care.outcomeRecord = function (patientId, code) {
    var M = care.MEASURES[code], obs = care.observations(patientId, code);
    var baseline = obs.filter(function (o) { return o.simDay <= 0; })[0] || null;
    var iv = care.interventions(patientId, code);
    var claimant = iv.length ? iv[0].orgId : null;
    var later = baseline ? obs.filter(function (o) { return o.simDay > 0; }) : [];
    var follow = later.filter(function (o) { return o.simDay >= M.win; }).slice(-1)[0] || null;
    var latest = later.slice(-1)[0] || null;
    var change = baseline && follow ? Math.round((M.better === 'down' ? baseline.value - follow.value : follow.value - baseline.value) * 10) / 10 : null;
    var checks = [
      { k: 'Baseline measured', ok: !!baseline, note: baseline ? baseline.value + ' ' + M.unit + ' at ' + baseline.sourceName : 'none yet' },
      { k: 'Linked to an intervention', ok: iv.length > 0, note: iv.length ? iv.map(function (i) { return i.text; }).join('; ') : 'no intervention on the exchange' },
      { k: 'Follow-up after the ' + M.win + ' day window', ok: !!follow, note: follow ? follow.value + ' ' + M.unit + ' on simulated day ' + follow.simDay : latest ? 'latest is day ' + latest.simDay + ', window not yet passed' : 'none yet' },
      { k: 'Independent record', ok: !!follow && follow.sourceOrgId !== claimant && (!baseline || follow.sourceOrgId !== baseline.sourceOrgId || follow.via === 'lab'), note: follow ? 'measured by ' + follow.sourceName + (follow.sourceOrgId === claimant ? ', the same organisation that made the claim' : '') : 'waiting for a follow-up' },
      { k: 'Change at or above the clinical threshold (' + M.mcid + ' ' + M.unit + ')', ok: change !== null && change >= M.mcid, note: change === null ? 'not yet measurable' : (change >= 0 ? 'improved by ' : 'changed by ') + change + ' ' + M.unit }
    ];
    var all = checks.every(function (c) { return c.ok; });
    return { patientId: patientId, code: code, measure: M, baseline: baseline, followUp: follow, change: change, interventions: iv, checks: checks, status: !baseline ? 'unmeasured' : !follow ? 'pending' : all ? 'documented' : 'not met' };
  };

  /* ---------- delegation and second opinion: the patient decides ---------- */

  care.DELEGATES = [{ id: 'DLG-CHIDI', name: 'Chidi Okonkwo', rel: 'Spouse' }, { id: 'DLG-ADA', name: 'Ada Okonkwo', rel: 'Daughter' }];
  care.SECOND_OPINION_ORGS = ['ORG-CLINIC-MID'];
  care.delegate = function (patientId, delegateId, scope, days) {
    return X.consent.grant({ patientId: patientId, flow: 'delegated', recipient: delegateId, scope: scope, expires: Date.now() + days * 86400000, by: 'patient' }, actor('nova'));
  };
  care.undelegate = function (patientId, delegateId) { return X.consent.revoke({ patientId: patientId, flow: 'delegated', recipient: delegateId, by: 'patient' }, actor('nova')); };
  care.delegations = function (patientId) {
    var st = X.consent.state(patientId);
    return Object.keys(st).map(function (k) { return st[k]; }).filter(function (g) { return g.flow === 'delegated'; });
  };
  care.shareOpinion = function (o) {
    var sid = uid('SO');
    X.consent.grant({ patientId: o.patientId, flow: 'delegated', recipient: o.toOrgId, scope: ['second-opinion'].concat(o.items), expires: Date.now() + o.days * 86400000, by: 'patient' }, actor('nova'));
    return X.append('SECOND_OPINION_SHARED', { shareId: sid, patientId: o.patientId, patientName: o.patientName, toOrgId: o.toOrgId, toOrgName: orgName(o.toOrgId), items: o.items, days: o.days, question: o.question || '' }, actor('nova'));
  };
  care.stopOpinion = function (patientId, toOrgId) { return X.consent.revoke({ patientId: patientId, flow: 'delegated', recipient: toOrgId, by: 'patient' }, actor('nova')); };
  care.opinionShares = function (filter) {
    return X.eventsOfType('SECOND_OPINION_SHARED').map(function (e) { return Object.assign(clone(e.payload), { ts: e.ts }); }).filter(function (p) { return !filter || ((!filter.patientId || p.patientId === filter.patientId) && (!filter.toOrgId || p.toOrgId === filter.toOrgId)); });
  };
  // What the receiving clinic may read right now. Each item is checked against the patient's grant and logged.
  care.opinionView = function (share, readerOrgId, log) {
    var out = { allowed: [], denied: [] };
    share.items.forEach(function (it) {
      var req = { patientId: share.patientId, flow: 'delegated', recipient: readerOrgId, scope: it, purpose: 'second opinion' };
      var d = log ? X.access(req, actor('pulse')) : X.evaluate(req);
      (d.allow ? out.allowed : out.denied).push({ item: it, reason: d.reason });
    });
    return out;
  };

  X.care = care;
})(typeof window !== 'undefined' ? window : this);
