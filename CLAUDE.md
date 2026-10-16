# CLAUDE.md: Qäre Health ecosystem build

Read this in full every session before anything else.

## What this repo is

Qäre Health: twelve connected healthcare apps on one shared exchange, the health
member of the Lexington impact ecosystem alongside Helios (energy), Stratum
(mining) and Mati (agriculture). The ecosystem's shared idea: an institution
measures itself against a framework, the result is verified, and verified
outcomes publish to the Global Impact Commons (GIC) where they connect to
capital. Qäre applies that to health. The GIC is a separate property; Qäre
connects to it, it does not rebuild it.

Qäre is its own brand, not a copy of a sibling. It borrows the design concepts,
not the colours.

## The two things the demo must prove

1. **Interconnection.** The twelve apps share one exchange. A prescription
   written in Pulse becomes a dispensing task in Cura, a demand signal in Nexus,
   and a record update in Nova, live, across separate browser tabs. This is the
   point of the demo. It is built in `assets/exchange.js`.
2. **Verified impact to capital.** Every institution collects health-impact data
   against the EESG Health Impact framework and, with consent, publishes a
   verified, traceable record to the GIC to request capital. Nothing unverified
   or untraceable is ever published.

## The twelve products

Care and clinical: Nova (patient), Pulse (clinician), Cura (pharmacist), Bridge (CHW).
Facilities and industry: Apex (hospital), Prism (labs), Nexus (pharma ops), Relay (supply / 3PL).
System and oversight: Zenith (ministry), Core (HIE operator), Shield (payer), Lumen (research).

Live now: Pulse, Cura, Nova, Nexus. The rest reuse the shell and the exchange.

## The spine (never renamed)

- **Qäre HIE** is the exchange. In this static build it is `assets/exchange.js`:
  an in-memory event log synced across tabs by BroadcastChannel and localStorage.
- **Telos** is the Cognitive Contextual Model. **IRIS** is the only public agent;
  **Florence** is internal and never shown. Each sibling has its own agent
  (Helios Apollo, Mati Ceres), so IRIS is Qäre's.
- **EESG Health Impact** is the framework: four pillars (Economic, Environment,
  Social, Governance) over health fronts (access, care quality and safety,
  outcomes, affordability, supply integrity and pharmacovigilance). Grammar is
  pillar then front then measure then unit then rule then tier.
- **Verification status**: Unmeasured, Claimed, Inconsistent, Verified. Never
  upgraded by assertion, only by a matching record.
- **Global Impact Commons (GIC)** is where verified, anonymised outcomes publish
  and capital connects. It is a separate property; link to it, do not duplicate it.

## Build pattern

- Static. One page per app under `products/<key>/index.html`, loading the shared
  `assets/tokens.css`, `assets/qare.css`, `assets/exchange.js`, `assets/app.js`.
  No backend, no build step. Runs from GitHub Pages or any static host. The user
  is not running a Linux engine; nothing may require one.
- Cross-tab sync needs a served origin, not file://. Say so when it matters.
- Every app boots to an action inbox (land on what needs you), states its
  provenance line, and reads and writes the shared exchange.
- **Demo data, every product**: at least three institutions by size (SMALL,
  MEDIUM, LARGE) and their key personas. The seed lives in `assets/exchange.js`.

## Qäre identity (its own, not a sibling's)

Tokens live in `assets/tokens.css`, the one place hex values exist.
- Warm paper `#FBFAF7`. Accent is iris indigo-violet `#4B3BA6` / `#6A5AE0`, the
  single bold hue. Not Helios brass, not GIC dark green.
- Verification is visible colour: verified green, claimed amber, unmeasured grey,
  inconsistent red. Verified green echoes the GIC so the connection reads.
- Nunito carries the wordmark and headings (its roundness matches the logo).
  IBM Plex Sans for UI, IBM Plex Mono for IDs, codes and numerals.
- Cards 16px radius, soft shadow, pills round, 8-point grid. Carbon data-ink
  discipline for charts, no 3D, no donuts.

## Hard rules

- No em dashes anywhere.
- No new hues and no hex literals outside `assets/tokens.css`.
- IRIS advises; a licensed human makes every clinical decision.
- Only anonymised, verified aggregates reach the GIC. Consent is double-key and
  revocable. Neutrality and privacy cannot bend.
- Do not invent entities when a canonical one exists. The patient is Amara
  Okonkwo; the large pharma is Nexagen (Arjun Mehta COO, Fatima Al-Rashid CFO,
  Dr. Kwame Asante Regulatory). New demo orgs are named plainly and seeded once.

## Definition of done, every product

Boots to its persona, reads and writes the shared exchange so its events show in
the other apps live, carries the impact and GIC action, is warm-paper and
keyboard-walkable, has SMALL / MEDIUM / LARGE demo data, and is committed.

## Attribution

Commits are authored by the owner. Append the Claude co-author trailer.
