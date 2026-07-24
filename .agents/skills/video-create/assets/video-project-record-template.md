# Video Project Record

> Copy this file for one production. It is a human-readable, format-neutral authority—not a canonical machine schema. Append decisions and receipts; do not erase prior attempts or maintain a competing production log.

## Record header

| Field | Value |
|---|---|
| Project ID | `<stable-project-id>` |
| Working title | `<title>` |
| Record revision | `1 (guidance template)` |
| Created / updated | `<UTC timestamps>` |
| Production owner | `<identity>` |
| Decision owner | `<identity>` |
| Status | `PLANNING / IN_PRODUCTION / QA / DELIVERY_READY / PUBLISHED / ARCHIVED / CANCELED` |
| Source ticket/discussion | `<URLs>` |
| Owner-private production root | `<gitignored private reference>` |
| Raw-media permissions receipt | `<safe mode/access check>` |
| Confidential detail location | `<private reference or NOT_APPLICABLE; never paste secrets/private content>` |

Use `NOT_YET_OBSERVED`, `NOT_APPLICABLE — <reason>`, `BLOCKED — <authority>`, and `UNKNOWN — <falsifier>` instead of empty cells.

## Brief and authority

| Field | Decision / receipt |
|---|---|
| Audience | `<who>` |
| Intended viewer action | `<what happens next>` |
| Success condition | `<observable outcome>` |
| Delivery profiles | `<platform/profile identifiers>` |
| Duration range | `<project-specific range>` |
| Accessibility target | `<caption/transcript/non-visual requirements>` |
| Story/identity authority | `<path/URL + freshness timestamp>` |
| Retention policy | `<accepted/non-accepted media policy>` |
| Disclosure requirements | `<voice/generated-media/sponsor/etc.>` |

### External-action authority

| Action | Authority owner | Status | Scope / limit | Receipt |
|---|---|---|---|---|
| Spend | `<identity>` | `GRANTED / BLOCKED / NOT_APPLICABLE` | `<amount/provider surface>` | `<safe reference>` |
| Data egress | `<identity>` | `GRANTED / BLOCKED / NOT_APPLICABLE` | `<data class/destination>` | `<safe reference>` |
| Voice/persona use | `<identity>` | `GRANTED / BLOCKED / NOT_APPLICABLE` | `<scope>` | `<safe reference>` |
| Publication | `<identity>` | `GRANTED / BLOCKED` | `<platform/visibility>` | `<safe reference>` |

Credential values never enter this record. Record only the approved store/environment reference and presence check.

## Story contract

| Field | Value |
|---|---|
| Story ID | `S-01` |
| Thesis | `<bounded thesis>` |
| Audience promise | `<what the film proves or enables>` |
| Canonical transcript location/hash | `<section below or exact external reference + hash>` |
| Beat-map revision/hash | `<revision + hash>` |

### Claim ledger

| Claim ID | Exact bounded claim | Primary source + freshness | Required evidence class | Beat IDs | Status | Falsifier / note |
|---|---|---|---|---|---|---|
| `C-01` | `<claim>` | `<source>` | `page / popup/multi-page / native-desktop / non-visual` | `B-01` | `PROPOSED / VERIFIED / NARROWED / DROPPED` | `<tool/result that could falsify>` |

### Transcript and beat map

| Beat ID | Claim IDs | Narration / silence | Intended semantic state | Evidence class | Runnable/cue ref | Timing floor / transition | Overlay/caption intent |
|---|---|---|---|---|---|---|---|
| `B-01` | `C-01` | `<text or SILENCE>` | `<state>` | `<class>` | `<ref or MANUAL>` | `<project-specific>` | `<intent>` |

### Timing calibration

| Calibration run | Narration/source | Pace | Result | Decision |
|---|---|---|---|---|
| `T-01` | `<hash/ref>` | `CONVERSATIONAL` | `<durations/readability>` | `<accepted adjustment>` |
| `T-02` | `<hash/ref>` | `INSTITUTIONAL/DELIBERATE` | `<durations/readability>` | `<accepted adjustment>` |

## App-owned runnable contract

| Field | Value |
|---|---|
| Repository / exact head | `<repo + full SHA>` |
| App route / build profile | `<route/profile>` |
| Fixture / reset method | `<ref>` |
| Host method/export | `<path + symbol>` |
| Script schema/version | `<e.g. neo.tour.script.v1 or NOT_APPLICABLE>` |
| Requested / supported / effective mode | `<values or NOT_APPLICABLE>` |
| Normalized cue-log ref/hash | `<ref>` |
| Paired spec/profile cue-log parity | `<equal after pacing timestamps excluded / NOT_APPLICABLE + reason>` |
| Owning unit/E2E spec | `<path + exact result>` |
| Semantic capability needs | `<needs, not remembered operation names>` |
| Neural Link server/OpenAPI/harness projection | `<server authority + digest/version + active harness/client/adapter identity/version/schema projection or NOT_APPLICABLE>` |
| Raw `tools/list` / runtime freshness receipt | `<safe ref>` |
| Need → operation mapping + transport smoke | `<safe ref>` |
| Exact-head smoke receipt | `<command/tool + result + timestamp>` |

Do not copy or fork app choreography into this record. Bind the app-owned runnable contract by exact references and receipts.

## Voice and audio

### Current authority check

| Field | Value |
|---|---|
| Provider product surface | `<current product/API surface or OPERATOR_RECORDING>` |
| Primary documentation checked | `<official URL + timestamp>` |
| Model / voice | `<project choice; no global default>` |
| Input/output limits and format | `<current observed constraints>` |
| Required disclosure | `<text/location>` |
| Consent / rights / persona state | `<BEARER_ASSENTED / OPERATOR_APPROVED / REJECTED / NOT_YET_OBSERVED + authority; never conflate states>` |
| Generated narration disclosure | `<in-film + metadata placement or NOT_APPLICABLE>` |
| Spend / egress receipt | `<external-action row>` |
| Transcript hash | `<hash>` |
| Instructions hash | `<hash>` |
| Pronunciation guidance hash | `<hash or NOT_APPLICABLE>` |
| Generated/recorded at | `<UTC timestamp>` |

### Auditions and immutable attempts

| Attempt ID | Parent IDs | Anonymized candidate/config | Generic/no-persona included? | Request/recording receipt | Output hash | Intelligibility/pacing/pronunciation/fit | State | Decision |
|---|---|---|---|---|---|---|---|---|
| `A-VOICE-001` | `<parents>` | `<candidate>` | `YES / NO — reason` | `<safe ref>` | `<hash>` | `<observations>` | `WORKING / ACCEPTED / QUARANTINED / PURGED` | `<reason + authority>` |

## Stage and capture

### Stage receipt

| Field | Value |
|---|---|
| Exact source head | `<full SHA>` |
| Runtime/build identity | `<identity>` |
| Route / fixture / reset | `<refs>` |
| Viewport/display/theme/locale | `<values>` |
| Intended window topology | `<description>` |
| Semantic start-state receipt | `<tool/result>` |
| In-frame application-data privacy receipt | `<fixtures/names/avatars/paths/logs/notifications reviewed>` |
| Runnable smoke receipt | `<tool/result>` |
| Stage accepted at | `<timestamp + identity>` |

### Capture attempts

| Take ID | Beat IDs | Evidence class | Target fingerprint / stage receipt | Audio/cursor/chrome policy | Source artifact path/ref | Hash | Whole-media review | State / reason |
|---|---|---|---|---|---|---|---|---|
| `A-TAKE-001` | `B-01` | `<class>` | `<safe ref>` | `<policy>` | `<ref>` | `<hash>` | `<review receipt or NOT_YET_OBSERVED>` | `WORKING / ACCEPTED / QUARANTINED / PURGED` |

For native capture, link the before/after topology, recorder revalidation, frame-zero, and terminal-effect receipts from `../references/native-display-capture.md`.

## Composition and renders

### Derived render data

| Render ID | Ordered source asset IDs/hashes | Trims/timing/overlays/captions/audio decisions | Editor/renderer + version | Output profile | Parent decision hash |
|---|---|---|---|---|---|
| `A-RENDER-001` | `<ordered refs>` | `<format-neutral decisions>` | `<tool/version>` | `<profile>` | `<hash>` |

### Render attempts

| Attempt ID | Parent render/source IDs | Output ref | Hash | Technical probe | State | Supersedes / reason |
|---|---|---|---|---|---|---|
| `A-VIDEO-001` | `<parents>` | `<ref>` | `<hash>` | `<receipt>` | `WORKING / ACCEPTED / QUARANTINED / PURGED` | `<ref/reason>` |

Never overwrite an attempt. A correction is a successor row with explicit parents.

## QA matrix

Candidate under review: `<asset ID + exact hash>`

| Dimension | Reviewer/tool | Whole artifact? | Result | Receipt / findings |
|---|---|---|---|---|
| Technical decode/profile | `<identity/tool>` | `YES` | `PASS / FAIL / BLOCKED` | `<receipt>` |
| Visual | `<identity>` | `YES` | `PASS / FAIL / BLOCKED` | `<receipt>` |
| Audio | `<identity>` | `YES` | `PASS / FAIL / BLOCKED` | `<receipt>` |
| Cold-listener comprehension | `<identity>` | `YES` | `PASS / FAIL / BLOCKED` | `<receipt>` |
| Claim/evidence mapping | `<identity>` | `YES` | `PASS / FAIL / BLOCKED` | `<claim IDs + findings>` |
| Rights/privacy/disclosure | `<identity>` | `YES` | `PASS / FAIL / BLOCKED` | `<receipt>` |
| Accessibility/captions | `<identity>` | `YES` | `PASS / FAIL / BLOCKED` | `<receipt>` |
| Platform profile | `<identity/tool>` | `YES` | `PASS / FAIL / BLOCKED` | `<current requirements check>` |

Sampling/probes may be listed as aids, but only a whole-artifact review can mark the corresponding row `YES`.

### First-film state-transition audit

Required for the first completed film using `/video-create`; retain for later films when useful.

- [ ] Every attempt has one current recorded state.
- [ ] Every `ACCEPTED` promotion names reviewer, authority, timestamp, exact hash, and parents.
- [ ] Every quarantine/purge names a safe reason and retention/deletion receipt.
- [ ] No file was overwritten to simulate a transition.
- [ ] Revoked/superseded assets invalidate every affected descendant.
- [ ] The published artifact and metadata bind to the accepted hashes.

## Delivery bundle

| Bundle field | Asset/ref | Exact hash / identity |
|---|---|---|
| Accepted video | `<asset ID>` | `<hash>` |
| Captions | `<asset ID/ref>` | `<hash>` |
| Transcript | `<asset ID/ref>` | `<hash>` |
| Poster/thumbnail | `<asset ID/ref>` | `<hash>` |
| Title/description/disclosure metadata | `<ref>` | `<hash>` |
| Visibility/audience | `<value>` | `<authority receipt>` |
| Platform profile check | `<ref>` | `<timestamp/version>` |

### Publication receipt

| Field | Value |
|---|---|
| Operator publication authority | `<receipt>` |
| Platform identity | `<stable platform/artifact ID>` |
| Canonical link | `<URL>` |
| Published at | `<UTC timestamp>` |
| Upload receipt | `<safe ref>` |
| Read-back artifact/metadata proof | `<tool/result + exact visible identity>` |
| Blog/campaign handoff | `<claim/evidence IDs + bundle receipt or NOT_APPLICABLE>` |

## Asset lineage and retention

| Asset ID | Kind | Parent IDs/hashes | Created at/by | Provenance visibility | Current state | State receipt | Retention location/expiry |
|---|---|---|---|---|---|---|---|
| `<ID>` | `<voice/take/render/video/caption/poster/metadata>` | `<parents>` | `<timestamp/identity>` | `PUBLIC_BOUNDED / PRIVATE` | `WORKING / ACCEPTED / QUARANTINED / PURGED` | `<append-only receipt>` | `<safe ref/policy>` |

Unsafe or rights-uncleared media is purge-only. Put its sanitized deletion receipt (attempt ID, incident class, sanitized scope hash, timestamps, authorizer, destruction confirmation) in the private authority location; do not preserve revealing previews, text, paths, account data, identifiers, or descriptions here.

Public provenance may expose bounded source/artifact hashes, provider/model/voice identity, disclosure, and public platform ID. Request IDs, consent artifacts, account/project references, raw errors, absolute paths, credential references, and purge detail remain private.

## Invalidation and resume log

| Event ID / time | Trigger | Affected claim/beat/asset IDs | Last-good receipt | Invalidated gates | Resume point | Decision owner |
|---|---|---|---|---|---|---|
| `INV-001` | `<change/drift/failure>` | `<IDs>` | `<ref>` | `<gates>` | `<earliest required phase>` | `<identity>` |

## Decisions, bypasses, and drift

| Decision ID / time | Question | Options/evidence | Decision | Authority | Revalidation trigger |
|---|---|---|---|---|---|
| `D-001` | `<question>` | `<evidence>` | `<decision>` | `<identity>` | `<trigger>` |

Record every bypass. Two bypasses of the same gate trigger an early skill re-audit.

## Final disposition

| Field | Value |
|---|---|
| Final state | `PUBLISHED / ARCHIVED / CANCELED / NO_FILM` |
| Accepted bundle hash | `<hash or NOT_APPLICABLE>` |
| Claim ledger final review | `<receipt>` |
| QA final review | `<receipt>` |
| Publication/archive binding | `<receipt>` |
| Non-accepted asset disposition complete | `YES / NO — reason` |
| Closed by / at | `<identity + UTC timestamp>` |
| Skill re-audit counter | `<completed-film ordinal; bypass/drift notes>` |
