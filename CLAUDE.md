# CLAUDE.md: Qäre Health ecosystem build

Read this in full every session before anything else.

## What this repo is

The Qäre Health build: a sovereign health information exchange for emerging
markets, delivered as twelve persona-facing products on one shared spine. It
is the health instrument in the iQuantile / Lexington ecosystem, a sibling to
Helios (energy) and Stratum (mining), and it reads as one of them, not as a
separate brand. Positioning and the full taxonomy live in
`docs/product-registry.json`. The plan lives in `docs/PLAN.md`. The impact and
tokenisation model lives in `docs/impact-tokenization.md`.

## The spine (never renamed)

- **Qäre HIE** is the exchange (FHIR / HL7). It is infrastructure, not a product.
- **Telos** is the Cognitive Contextual Model: provenance, hash-chaining, business logic.
- **EESG Health Impact** is the Lexington framework the entities are measured against.
- **Global Impact Commons (GIC)** is where signed, anonymised outcomes publish.
- **Tokenised health impact** is the capital layer. It is the reason the ecosystem scales.
- **IRIS** is the only public-facing agent. **Florence** is the internal master and never appears externally. **Donna** is the iQuantile platform master.

## The twelve products

Care and clinical: Nova (patient), Pulse (clinician), Cura (pharmacist), Bridge (CHW).
Facilities and industry: Apex (hospital), Prism (labs), Nexus (pharma ops), Relay (supply / 3PL).
System and oversight: Zenith (ministry), Core (HIE operator), Shield (payer), Lumen (research).

## Build pattern

- Static single page per product. React or hand-written HTML bundled to one
  deployable file. No backend, no network calls, no browser-storage APIs.
  In-memory seed only, so every demo runs from GitHub Pages or any static host.
  The user is not running a Linux engine; nothing may require one.
- Every product boots from a login that offers persona cards as the credential.
  No password theatre. A disabled SSO affordance answers IT honestly.
- Every surface is an action inbox first: you land on what needs you, not a
  dashboard. Situation cards carry one primary action each.
- Every surface states what it touches (the provenance line). Surfaces that only
  read say so; only the posting path mutates state.

## Meridian design canon (shared with Helios and Stratum)

Tokens live in `assets/tokens.css`, the one place hex values exist.
- Chrome `#1A1512`, chrome field `#302A26`. Brass accent `#D4870A` for primary
  series, selection and focus. Red `#BD252E` for alarm and critical only.
- Page `#FDFDFC` warm paper, never dark. Card `#FFFFFF`, hairline `#EDEBE7`,
  field border `#E8E5DD`, surface-alt `#F7F5F0`. Categorical ramp `#D4870A`,
  `#28221E`, `#A87654`, `#6C787E`, `#CEBEA2`.
- IBM Plex Sans for UI. DM Serif Display for the one display heading per page.
  IBM Plex Mono for codes, IDs and numerals. Comfortaa for the iQuantile wordmark
  only. The Qäre wordmark is a locked element (PNG once supplied); the current
  styled text is a placeholder.
- Cards 18px radius, soft shadow and hairline. Controls fully round. 8-point grid.
- Data viz follows Carbon data-ink discipline. Brass for a single measure, the
  ramp for multi-series. No 3D, no donuts, no gauges.

## Hard rules

- No em dashes anywhere, in UI strings, comments or docs.
- No new hues and no hex literals outside `assets/tokens.css`.
- IRIS advises; a licensed human makes every clinical decision.
- Only anonymised, verified aggregates reach the Commons. Neutrality and privacy
  cannot bend.
- Named specialists under IRIS, never numbered agents.
- Seed data is reconciled and frozen once its tests pass.

## Definition of done, every product

The persona login works, the pathway in `docs/product-registry.json` runs end to
end, the cross-cutting surfaces (consent, health-impact analysis, IRIS) are
reachable, the page is warm-paper and keyboard-walkable, and it is committed.

## Attribution

Commits are authored by the owner. Append the Claude co-author trailer.
