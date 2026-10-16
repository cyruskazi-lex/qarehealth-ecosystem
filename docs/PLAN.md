# Qäre Health build plan

Goal: a demo where every product has a prototype, each with a specific persona
and pathway, showing login and security, data ownership and privacy, the EESG
Health Impact framework, and the Health Impact Analysis reporting, with the
tokenisation layer that connects verified impact to institutional capital.

Design and architecture are settled against the Helios and Stratum references:
Meridian design system, static single page per product, in-memory seed, IRIS as
the agent, the Lexington framework to GIC to capital spine. See `CLAUDE.md`.

## Phase 0 — Foundation (this commit)

- Landing page, warm-paper Meridian, the twelve-node spine, the impact thesis.
- Design tokens, canon, product registry, impact and tokenisation model.
- Status: done in this commit.

## Phase 1 — Shared shell and the cross-cutting surfaces

Build once, reuse in every product. These are the demo's stars.

1. **Login and personas.** Persona cards as the credential, no password theatre,
   honest disabled SSO, jurisdiction chip, org label. One component, per-product
   persona sets from the registry.
2. **Consent and data ownership.** The double-key consent center: grant and
   revoke, the append-only ledger view, what IRIS can and cannot see.
3. **Health Impact Analysis.** The reporting surface: live score against the
   EESG Health Impact framework, the Verified Health Outcome Statement with
   signature and provenance.
4. **Impact tokenisation and the Commons.** The token, its anonymisation
   boundary, and the capital that subscribes.
5. **IRIS panel.** The grounded agent that describes, predicts, prescribes, and
   names the specialist behind each answer.

## Phase 2 — The golden thread (first three products)

One patient's journey, end to end, to prove the exchange is real:

- **Nova** (patient): own the record, grant consent, see the privacy boundary.
- **Pulse** (clinician): open the consented record, act on an IRIS flag,
  prescribe in under thirty seconds, write back.
- **Cura** (pharmacist): dispense, scan and reconcile the serialised pack.

This thread carries login, ownership, privacy, and the write-to-exchange loop.

## Phase 3 — The capital thread (impact and the enterprise buyer)

- **Nexus** (pharma ops): the command home, a cold-chain breach and a demand
  spike, the sustainability and health-impact surface. The live deal audience.
- **Zenith** (ministry): the de-identified national picture and the national
  impact score. The public-interest and regulator story.
- **Lumen** (research): consented anonymised cohorts drawn from the Commons.

This thread carries the EESG Health Impact framework, the Health Impact Analysis,
and tokenisation to capital.

## Phase 4 — The rest of the estate

- **Apex** (hospital), **Prism** (labs), **Relay** (supply / 3PL),
  **Shield** (payer), **Bridge** (CHW), **Core** (HIE operator console).
- Each reuses the shell and the cross-cutting surfaces; each needs only its own
  action inbox, one or two signature screens, and its seed.

## Phase 5 — Run of show

- A single entry that boots any product with any persona for a live walkthrough.
- A scripted path per audience: patient and clinician for care, pharma and
  ministry for the capital story.

## Open decisions for the owner

1. **EESG expansion.** Confirm the exact health metric set and what the leading
   extra E stands for, from the Lexington framework.
2. **Wordmark.** Supply the locked Qäre PNG; the landing uses a styled placeholder.
3. **Brand hex.** Meridian brass is in place; confirm it is Qäre's accent or
   supply a health-specific one.
4. **First product to take high-fidelity.** Default is the golden thread
   (Nova, Pulse, Cura); say so if the pharma or ministry story goes first.
5. **Hosting.** GitHub Pages is the zero-effort default for the static demo.
