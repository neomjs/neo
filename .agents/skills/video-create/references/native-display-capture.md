# Native Display Capture

Load this reference only when the film needs `popup/multi-page` or `native-desktop` evidence. It hardens target selection, privacy, whole-media review, and topology receipts without prescribing a recorder or operating system.

## 1. Admission

State the claim first. Then choose the least powerful evidence class that can prove it:

- use `page` capture for one page's rendered state;
- use `popup/multi-page` when separately observed browser pages are material;
- use `native-desktop` only when OS-window existence, placement, focus, movement, reattachment, or other physical behavior is itself part of the claim.

If the required class cannot be safely staged and verified, narrow the claim. Never use narration to promote page evidence into native proof.

## 2. Dedicated stage

Prepare a dedicated capture stage before opening the recorder:

- close unrelated applications/windows or move them outside the admitted capture region;
- disable or account for notifications, overlays, password managers, clipboard panels, recent-item surfaces, and personal chrome;
- use public-safe sample fixtures and accounts by default; live-data capture requires explicit data-scope clearance;
- inspect the application itself for private names, avatars, paths, logs, tokens, conversations, and historical data that would remain in-frame;
- verify microphone/system-audio sources and exclude unintended audio;
- set deterministic display scale, resolution, theme, locale, cursor, and window geometry where the claim depends on them;
- record the exact source head, app route, semantic start state, and topology receipt.

For full-display recording, prefer an isolated non-main display dedicated to the take. If the current platform cannot prove an exact-window or isolated-display target, fail closed or narrow the claim.

Do not put secrets, credential values, private paths, private conversation content, or sensitive incident detail into the project record. Record only safe references and decision receipts.

## 3. Short-lived target fingerprint

Create a fresh observational fingerprint for the intended target immediately before selection. It may include:

- application/process identity as exposed by the recorder;
- visible title, bounds, display, and expected nearby windows;
- current semantic/runtime `windowId` and capability projection when available;
- a topology snapshot and timestamp;
- a safe screenshot or digest of the clean frame.

The fingerprint is not durable routing authority. ADR 0029 §2.8.5 keeps semantic names, URLs, titles, timing, and runtime IDs from becoming physical-handle authority. Treat the fingerprint only as a short-lived selection/revalidation receipt.

## 4. Recorder revalidation and frame zero

After selecting the capture source and immediately before recording:

1. compare the recorder's selected-source preview with the fresh fingerprint;
2. confirm window/display bounds and audio sources;
3. confirm the app's semantic start state through its owning inspection surface;
4. ensure no unrelated window overlaps or can enter the retained region;
5. start a new immutable attempt.

At frame zero, verify that the retained stream actually shows the intended target, crop, scale, pointer/chrome policy, and clean stage. A correct selector label with a wrong preview fails closed.

When the capture API or operating system requires user selection/permission, that user action is part of admission. Do not bypass it or infer a target from stale state.

## 5. Semantic and physical receipts

Native footage and application truth are complementary:

- the recorder proves what was visibly retained;
- `/neural-link` or the app's current semantic surface proves worker/application state;
- app-owned runner/spec receipts prove the choreography contract;
- `get_window_topology` or its current successor proves connected runtime topology.

Bind each receipt to the exact take ID, source head, timestamp range, and evidence claim. If the Neural Link server/OpenAPI/harness projection changed, rerun capability discovery and the smoke proof before capture.

For a claim about physical close, ADR 0029 §2.8.5 is explicit: a native `close()` return is provisional. The receipt becomes terminal only after the connected runtime `windowId` disappears from topology. For focus/position or other physical effects, record the corresponding before/after observation and semantic state; never treat dispatch success as effect proof.

Independently opened, cross-origin, stale, or uncorrelated windows can remain observable, but physical control fails closed.

## 6. Platform recipe boundary

Portable evidence semantics are mandatory; recorder commands and selectors are not. Use a platform-specific recipe only when the current film can establish:

- the recorder and platform/version in use;
- the exact target-selection surface;
- a fresh target fingerprint and immediate preview revalidation;
- a safe stop/purge path;
- a falsifiable receipt from that platform.

The completed Build Week film is evidence for one macOS display-scoped workflow, not a universal operating-system recipe. Add another platform recipe only after a real film on that platform produces a reproducible receipt.

When a `native-desktop` film stages browser windows on macOS, read the [macOS native-display capture recipe](platforms/macos-native-display-capture.md) before staging; it is a conditional Atlas, not a portable invariant.

## 7. During capture

- Keep the stage bounded to the admitted region and sources.
- Do not replace or overwrite a prior attempt.
- If an unrelated notification/window/audio source enters the stream, stop the take and mark it for purge review.
- If semantic state diverges from the script, stop or mark the exact divergence; do not edit around an unrecorded state failure.
- If a window reconnects/reloads or its target fingerprint changes, invalidate the current target admission and reacquire it.

## 8. Whole retained-media review

Review the exact retained candidate from start to finish before it can become a render parent. The review covers:

- every visual frame at a scale that makes text and transient overlays inspectable;
- every audio stream, including silence and transitions;
- all selected tracks/streams and container metadata;
- the first and final frames;
- crop, pointer, window bounds, notifications, titles, private data, and continuity;
- correlation with semantic and topology receipts.

Sampling aids—contact sheets, OCR, scene detection, waveform/silence scans, metadata probes—help locate risk. They cannot certify material that was not watched/listened to.

Record reviewer identity, timestamp, exact hash, streams reviewed, and disposition.

Cropping or masking a derivative does not sanitize a retained raw recording. Review and disposition the raw parent independently.

## 9. Retention and provenance disposition

- `ACCEPTED`: full review passed and the take may become a render parent.
- `QUARANTINED`: safe to retain privately while rejected or awaiting a named decision.
- `PURGED`: remove the media when privacy, rights, target identity, or retention safety is uncertain.

Unsafe or rights-uncleared native media is purge-only. Keep a private sanitized deletion receipt with attempt ID, broad reason category, authorizer, and verification; do not preserve a revealing thumbnail, transcript, or description as evidence of deletion.

If an accepted take is later found unsafe, revoke it in the project record, invalidate every descendant render/delivery, and purge or quarantine those descendants according to the same rule.

Public receipts may contain bounded source/artifact hashes, evidence class, disclosure, and public platform identity. Keep request IDs, consent records, account/project references, raw errors, absolute paths, credential references, and purge detail private.
