# Video Create Workflow

This workflow turns a film brief into a hash-bound delivery without letting the story outrun the evidence. It is an orchestration protocol, not a media toolkit. Current provider, application, capture, editing, and publishing mechanics stay with their owning surfaces.

Start by copying `../assets/video-project-record-template.md`. That record is the production authority for the film. Append receipts and decisions; do not maintain a second handwritten production log.

## 1. The ownership boundary

`/video-create` owns:

- ordered phase gates;
- stable story, claim, beat, attempt, and asset references;
- evidence-class admission;
- immutable media-attempt lineage;
- invalidation and resume decisions;
- QA and final artifact promotion;
- delivery and retention receipts;
- public/private provenance separation.

It consumes, without duplicating:

- `/neo-identity-update` and ADR 0018 for identity-bearing claims and framing;
- `/neural-link` for semantic live-application inspection or interaction;
- `/whitebox-e2e` and `/unit-test` for app-owned runnable/test evidence;
- `/imagegen` for generated still-image mechanics;
- `/blog-post` for hero/campaign eligibility, narrative policy, and publication-profile decisions;
- the participating app's own runnable choreography contract;
- current provider and platform documentation at the time of use.

Do not add a provider adapter, compositor starter, capture executable, typed canonical schema, external-editor timeline authority, or generalized scene runner while following this workflow. Two stable consumers plus a graduated Decision Record are the minimum reopening evidence for an executable abstraction.

## 2. Evidence classes do not promote by prose

Declare the minimum evidence class for every visual claim before scripting:

| Evidence class | Can establish | Cannot establish by itself |
|---|---|---|
| `page` | One browser page's rendered and semantic state | A second page, popup, browser chrome, or native OS-window topology |
| `popup/multi-page` | Relationships among separately observed browser pages/popups | Native placement, physical window identity, or OS-level behavior |
| `native-desktop` | Visible native-window/desktop behavior when paired with semantic receipts | Hidden application truth that was never inspected |

A higher-class recording does not remove the semantic-state requirement. A lower-class take cannot be relabeled after capture. Narrow the claim or recapture at the admitted class.

For popup/multi-page or native-desktop evidence, read `native-display-capture.md` before staging or recording.

## 3. Phase gates

Every phase ends with an append-only receipt in the project record. If a gate fails, stop there; do not infer downstream success.

### Phase 0 — Brief and authority

Record:

- audience, intended action, delivery profile, duration range, accessibility target, and success condition;
- the story/identity authority and freshness timestamp;
- the operator decision owner;
- explicit authority for spend, data egress, and publication;
- an owner-private, gitignored production root plus a permissions receipt for raw media;
- retention and disclosure requirements;
- secrets only as credential-store/environment references, never values.

If spend, egress, consent, rights, or publication authority is missing, the corresponding external action remains blocked. Planning and local reversible work may continue independently.

### Phase 1 — Claim ledger and story contract

Give every public claim a stable ID. For each claim, record:

- exact wording or bounded proposition;
- primary source and freshness;
- required evidence class;
- planned beat IDs;
- status: `PROPOSED`, `VERIFIED`, `NARROWED`, or `DROPPED`;
- the falsifier that could still invalidate it.

Identity-bearing language consumes the current facts/framing/actions authority. A source's prestige is not a receipt; run the tool or inspect the artifact that could falsify the claim.

Build the story and beat map from verified or explicitly provisional claims. Do not start from available footage and reverse-invent the thesis.

Every narrated claim must map to a verified receipt or be narrowed/cut before acceptance.

### Phase 2 — Transcript, beat map, and timing

Bind transcript paragraphs to stable beat and claim IDs. Each beat names:

- narration or silence;
- intended semantic application state;
- visual evidence class;
- app-owned runnable/cue reference, if any;
- overlay/caption intent;
- timing floor and transition allowance.

Timing is project-configurable. Calibrate against actual narration and two representative runs: one conversational/talking pace and one deliberately institutional/respectful pace. The completed Build Week film is historical calibration, not a global duration or pacing default.

Changing a claim, transcript, or beat ID triggers the invalidation rules in §5; do not patch timings silently.

### Phase 3 — Voice and audio authority

Before any external voice operation:

1. Check current primary provider documentation for product surface, model/voice availability, input limits, output format, disclosures, and terms relevant to the intended use.
2. Record consent, rights, and persona state. Never imply a named person's voice or assent without authority. Bearer assent, operator approval, and `NOT_YET_OBSERVED` are different states; one cannot stand in for another.
3. Compare multiple viable auditions, or record why only one/no candidate is available. For a named peer persona, anonymize the comparison and include a generic/no-persona option before asking the bearer. Evaluate intelligibility, pacing, pronunciation, emotional fit, and disclosure needs.
4. Record provider product, model/voice, instructions hash, transcript hash, pronunciation guidance hash, request/receipt reference, generation timestamp, cost/egress authority, parent asset, and output hash.
5. Keep every generated or recorded attempt immutable. Accept one attempt by appending a promotion receipt; never overwrite a prior attempt.
6. Disclose generated narration in the film and delivery metadata wherever the current authority requires it.

Selective regeneration creates new attempts only for affected segments, retains every parent hash, and invalidates descendant renders explicitly.

No provider, model, voice, or instruction string becomes a global default. A generic narrator, operator narration, captions-only delivery, or no-film disposition remains valid when authority or quality is insufficient. If a named persona's bearer cannot audition, record that state and fall back; operator approval must not be represented as bearer assent.

### Phase 4 — Exact-head application stage

For application footage, bind the stage to:

- repository and exact commit/head;
- application route and build/runtime profile;
- seed/data fixture and reset method;
- viewport/window topology;
- app-owned runnable method/export and any script schema version;
- requested, supported, and effective runner mode;
- current Neural Link server authority, OpenAPI/tool projection, and active harness projection identity when Neural Link supplies evidence;
- smoke receipt proving the runnable contract still reaches the intended state.

When Neural Link supplies evidence, name semantic needs rather than remembered operation names. Discover the raw live `tools/list`, verify runtime freshness plus server/OpenAPI digest and harness/client/adapter identity/version/schema projection, resolve each need to the current operation, smoke the exact transport/schema, and record the result. An operation name alone is not a current capability receipt.

`neo.tour.script.v1` and `TourRunner` are eligible only when the participating app exposes a real runnable contract and current tests/receipts establish it. At the same source head and semantic baseline, admit an applicable capture only when its normalized cue log matches the paired spec/profile receipt with pacing timestamps excluded. Out-of-contract native choreography carries its own cue-linked receipt. The film record must not fork the schema, coerce transport payloads, or turn app choreography into a universal film scene engine.

If the app has no stable runner, use a project-local/app-owned adapter or manual choreography with explicit steps. The absence of general machinery is not permission to invent it in the skill.

Do not add a production product control solely to make filming easier. Dedicated demo hosts or app-owned test/choreography surfaces own film-specific driving.

A page reload, application restart, bridge reconnect, or harness/client reprojection invalidates every live-session receipt. Reconnect and repeat semantic/capability preflight before capture resumes.

### Phase 5 — Capture

Before each take:

- reset to the bound exact-head stage;
- verify semantic start state;
- verify that in-frame application data, names, avatars, paths, logs, and notifications are public-safe for the intended visibility; sample-data hosts are the default, and live-data capture requires explicit data-scope clearance;
- confirm the admitted evidence class;
- confirm the capture target and privacy/rights boundary;
- allocate a new immutable attempt ID and path;
- record audio/cursor/chrome/notification choices.

After each retained take:

- hash the artifact;
- record source/head, stage receipt, time range, and parent inputs;
- review the full retained visual and audio streams plus container/metadata identity;
- append `ACCEPTED`, `QUARANTINED`, or `PURGED` disposition.

Contact sheets, OCR, silence scans, waveform probes, and sampled frames can guide review. They never certify the unseen remainder.

### Phase 6 — Composition and derived render data

Keep derived render data in the project record or in an external editor file referenced by exact hash; it is not an independent story authority. Record:

- ordered source asset IDs and hashes;
- trims, timing offsets, overlays, captions, disclosure cards, transitions, and audio mix decisions;
- renderer/editor identity and version;
- output settings and parent lineage;
- render attempt ID and hash.

Rendered outputs are immutable attempts. Corrections create a successor render with explicit parents and a reason; they do not replace the prior file in place.

Generated still, cover, and poster candidates are immutable attempts too. `/imagegen` retains generation mechanics; the film record retains source/prompt/instruction hashes, parents, output hash, and disposition.

Cropping, masking, or omitting a derivative does not sanitize a retained unsafe raw parent. The raw asset keeps its own review and retention disposition.

### Phase 7 — QA

Run all applicable dimensions against the full candidate:

| Dimension | Required question |
|---|---|
| Technical | Does the entire file decode, and do duration, dimensions, frame rate, codecs, channels, loudness, and clipping match the delivery profile? |
| Visual | Is every retained frame free of unintended UI, private data, stale state, unreadable text, crop defects, and continuity errors? |
| Audio | Is speech intelligible to a cold listener and synchronized, with correct pronunciation, clean transitions, and no unintended audio? |
| Claims | Does every spoken, shown, captioned, and metadata claim map to a verified claim ID and sufficient evidence class? |
| Rights/privacy | Are voices, images, names, data, notifications, and background material authorized for the intended visibility? |
| Accessibility | Are captions/transcript complete, synchronized, readable, and meaning-preserving; are essential visual facts also available non-visually? |
| Platform | Does the exact candidate meet the current upload, thumbnail/poster, caption, disclosure, metadata, and visibility requirements? |

Automated probes are assistants, not whole-media certification. Record who/what completed the whole retained-media review and the exact candidate hash reviewed.

The first film produced with this skill must audit every asset state transition and verify append-only lineage plus hash-bound publication.

Target binding, hashes, cue-log equality, stream/metadata probes, and timing arithmetic are mechanical checks. Evidence sufficiency, whole-media privacy/audio review, bearer assent, visual meaning, and final aesthetics remain human/peer judgment gates.

### Phase 8 — Delivery

Publication is an external action and requires explicit operator authority even when upload credentials exist.

Freeze a delivery bundle:

- accepted video hash;
- captions/transcript hash;
- poster/thumbnail hash;
- title/description/disclosure metadata hash;
- visibility/audience;
- current platform profile and limits check;
- publication owner and approval receipt.

After publication, record the platform identity, canonical link, publication timestamp, and read-back proof that the visible artifact/metadata match the frozen bundle. A successful upload response alone is not completion. Publication remains blocked when the target cannot yield a stable asset identity plus a verified link receipt.

For blog/campaign integration, hand the accepted bundle and shared claim/evidence IDs to `/blog-post`. `/blog-post` retains the decision whether the profile requires, permits, or refuses companion video; neither medium becomes the other's content SSOT.

### Phase 9 — Archive, quarantine, and purge

Every attempt ends in one of these record dispositions:

- `ACCEPTED` — retained and eligible as a parent/public artifact;
- `QUARANTINED` — safe to retain privately but rejected or awaiting a named decision;
- `PURGED` — deleted because retention is unsafe, unauthorized, or unnecessary.

Unsafe or rights-uncleared media is purge-only. Keep only a private sanitized receipt containing the attempt ID, time, reason category, sanitized scope hash, authorizer, and deletion verification—never the sensitive content or a revealing description.

Archive the accepted bundle, project record, source hashes, QA receipts, and public identity together. Apply the declared retention policy to non-accepted attempts.

Public provenance may expose bounded source/artifact hashes, provider/model/voice identity, disclosure, and public platform ID. Request IDs, consent artifacts, account/project references, raw errors, absolute paths, credential references, and purge detail remain in the private authority location.

## 4. Promotion rules

An asset can be promoted only when:

1. its parent lineage and hash are recorded;
2. its evidence class and authority match the claims it carries;
3. all required QA dimensions pass on that exact hash;
4. rights/privacy/disclosure decisions are explicit;
5. any external action has current operator authority.

Promotion is an appended decision, not a rename that erases history. If an accepted artifact later fails, append a revocation/supersession receipt and create a successor attempt.

## 5. Invalidation and resume

Resume from the earliest invalidated gate, not from the latest available file.

| Change observed | Invalidate at minimum |
|---|---|
| Story authority or claim wording/source changes | Claim verification, affected beats, narration, capture, render, QA, delivery |
| Transcript/pronunciation changes | Voice attempts, timing, affected renders, audio/claim QA, delivery |
| Source head, fixture, route, runnable contract, tool projection, or topology changes | Stage smoke, affected capture, renders, QA, delivery |
| Page/app/bridge restart, reload, reconnect, or harness reprojection | All live-session semantic/capability receipts, affected capture, renders, QA, delivery |
| Voice/provider/model terms or capability drift | Provider check, voice authority, affected audio/render, disclosure/platform QA |
| Capture target/evidence class changes | Capture admission, retained-media review, affected renders, claim QA |
| Edit decision, overlay, captions, metadata, or renderer changes | New render, affected QA, delivery binding |
| Platform profile/visibility/link changes | Platform check, operator publication authority as applicable, delivery read-back |
| Rights/privacy decision changes | All affected assets; quarantine or purge immediately where required |

Append an invalidation entry naming the trigger, affected IDs, last-good receipt, and chosen resume point. `NOT_YET_OBSERVED` stays explicit; absence is not a pass.

## 6. Completion and decay

The workflow completes only when the project record binds the public or archived disposition to exact hashes and receipts. A canceled/no-film decision is complete when its authority and retained/purged asset disposition are recorded.

Re-audit this skill at the third completed film or first merge anniversary, whichever comes first. Re-audit earlier after two bypasses of the same gate or material provider/platform drift. At re-audit:

- promote a stable two-consumer contract only through the Decision Record gate;
- compress unused template sections into guidance;
- retire rules that no longer prevent observed failure;
- keep volatile provider/platform mechanics outside this substrate.
