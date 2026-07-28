# macOS Native-Display Capture

Load this conditional Atlas only for a `native-desktop` film that stages browser windows on macOS. It records observations from a real display-scoped film and later capture attempts, then turns the repeated failure modes into fail-closed guidance for future production. It does not prescribe a recorder wrapper, durable machine values, or universal Chrome/macOS behavior.

The portable authority remains [Native Display Capture](../native-display-capture.md). If this recipe conflicts with that contract, the portable contract wins and the platform recipe must be revalidated.

## 1. Tested envelope, not compatibility claim

The evidence that shaped this recipe was collected under the following July 2026 envelope:

| Surface | Tested envelope |
|---|---|
| Operating system | macOS 26.5.2, build 25F84 |
| Browser | Google Chrome 150.0.7871.186 |
| Recorder | the OS-shipped native display recorder bound to the tested macOS build |
| Permission profile | Screen Recording and Accessibility access already granted to the capture harness |
| Display topology | two connected displays, each evaluated independently |
| Evidence class | full-display `native-desktop` capture of browser-owned physical windows |

These values describe one proven envelope. They are not defaults. At the start of each production session, discover and record the current operating-system version/build, browser name/version/bundle identity, recorder and selection surface, permission/TCC profile, display count/bounds/scale, and Spaces state. Never copy a PID, coordinate, display identifier, application path, window index, or prior receipt value into a new take as routing authority.

## 2. Admission sequence

Use this order:

1. create a fresh immutable attempt and bind its source head, controller/tool hashes, and intended evidence claim;
2. discover the current platform, browser-application, Spaces, and display topology;
3. census pre-existing browser applications and windows globally without reading browser content;
4. write and verify the isolation/state receipt and arm cleanup before changing browser-application or window state;
5. isolate conflicting pre-existing windows reversibly;
6. launch the film browser command and wait for the app-owned semantic-ready receipt;
7. bind the resulting physical film window by fresh native-ID set difference and evaluate every physical predicate;
8. revalidate the selected recorder source and frame zero;
9. arm the recorder, obtain recorder readiness, and only then mint/release the single-use go receipt;
10. after the choreography, prove every non-pre-existing film window absent before restoring the pre-existing desktop state.

Any failed or ambiguous step invalidates the attempt. Do not start or continue the recorder to gather evidence for a predicate that should have gated recorder-go.

## 3. Spaces continuity is observed, not assumed

An application assignment such as **All Desktops** is a premise, not proof. Discover the current assignment through a supported macOS observation surface, then test the behavior the take actually depends on:

- use a film-only window, never an operator window, for the continuity probe;
- bind it to its fresh native window ID;
- observe that exact ID in the intended display/source before and after the relevant Space transition;
- require it to remain visible, unminimized, and inside the admitted display;
- refresh the clean-stage fingerprint after the probe.

If the capture does not rely on a Space transition, still prove that the intended window and recorder share the active capture Space immediately before recorder-go. If macOS exposes no reliable assignment or continuity observation in the current topology, fail closed or choose another evidence class. A remembered Dock setting, preferences value, prior successful take, or black-free preview is not sufficient by itself.

## 4. Privacy-safe browser-window census

Treat every pre-existing browser application/window as opaque, including different profiles or signed-in identities. Record only the minimum physical control fields:

- browser application/bundle identity and every observed application-owner PID;
- a stable native/CoreGraphics window ID for the lifetime of each window;
- bounds, layer, visibility/minimized state, and display intersection;
- the fresh observation timestamp and receipt hash.

Do **not** read titles, URLs, documents, tabs, page text, profile/account labels, messages, or other browser content—not even to hash, compare, count, match, or debug it. Do not persist localized Accessibility labels when structural roles or native IDs suffice.

Map each controllable Accessibility window to its native window ID at runtime. Geometry is evidence about placement, not identity: two windows can have identical bounds. A native ID is short-lived selection authority for this attempt only; never reuse it after the window disappears or the browser restarts.

Take 17 observed one existing and one new launch-bound owner; admission with more existing owners is derived, not tested. Freeze the global owner/window set before launch; continue only when its post-ready difference proves one new launch-bound pair. Never guess from process order, title, profile, or geometry.

## 5. Receipt-before-mutation isolation

Before mutating the browser application or any of its windows, write an immutable isolation receipt containing:

- the intended film browser command/application identity and every observed owner PID with its prior visible state;
- the complete pre-existing `(application owner, native window ID)` set;
- each pre-existing window's minimized state, bounds, and display intersections;
- the exact subset that conflicts with the selected display;
- the selected display's fresh topology fingerprint;
- the discovery/controller hashes and timestamp.

Verify that the receipt is durably readable and hashed, and arm cleanup, before the first mutation. Then minimize only the conflicting pre-existing IDs. Do not close an operator window, move it as a substitute for minimizing it, or infer its identity from window order.

Every exit path—success, refusal, error, interruption, or timeout—must:

1. remove all proven non-pre-existing film windows;
2. restore every recorded pre-existing ID to its prior minimized state and geometry;
3. restore every recorded application's prior visible/hidden state;
4. re-census and compare every field by exact owner/window pair;
5. emit a bounded restoration receipt.

Restoration succeeds only when all recorded windows and application states match. If an owner/window pair is missing, an unexpected pair remains, or a state cannot be restored, the take is invalid and the receipt says `RESTORATION_FAILED`; never silently downgrade to best effort.

## 6. Admit displays independently

Discover each connected display at take time. For every candidate display, independently record:

- current bounds and scale;
- all intersecting visible low-layer windows;
- a fresh clean still/fingerprint;
- the recorder's source/preview correspondence;
- the privacy disposition and timestamp.

A second display is not an automatic fallback. It becomes eligible only after passing the same clean-stage, overlap, preview, and privacy predicates as the first. Do not infer ordinal, identifier, bounds, scale, or cleanliness from a prior take. If no display independently passes, stop and restage.

## 7. Keep command and physical identity grains separate

macOS may route a newly launched browser command into an already-running application owner or create another owner. Keep these evidence grains distinct:

| Grain | What it proves |
|---|---|
| launch/wrapper lineage | which command the app-owned runner invoked |
| browser command process | executable/argument provenance and bounded lifetime |
| macOS application owner | which application process owns observable native windows |
| native window ID | which exact physical window is admitted, controlled, and later removed |
| semantic runtime ID | which application/runtime participant reached the scripted state |

Never require or assume that the browser command PID equals the application-owner/WindowServer PID. Instead:

1. freeze the global pre-existing owner/window set;
2. launch exactly one film browser command during a quiet, bounded window-creation interval and retain its process ancestry;
3. wait for the app-owned semantic-ready receipt;
4. re-census every browser application owner globally;
5. require one new owner/window pair whose owner is bound to the launch provenance;
6. bind its native window ID to the physical predicates below.

Refuse zero or multiple new pairs, or one with unresolved owner provenance. A new or changed owner is safe only when launch-bound. The global set difference—not a title, URL, profile, window index, or geometry guess—proves the film window non-pre-existing.

## 8. Semantic-ready → physical predicates → recorder-go

Semantic readiness is necessary but not physical proof. After semantic ready and before recorder-go, require the exact new native window ID to be:

- owned by the launch-provenance-bound macOS application owner;
- visible, unminimized, and on a recordable layer;
- fully inside exactly one independently admitted display;
- at the expected discovered bounds for this attempt;
- the sole admitted low-layer film window intersecting the retained display;
- absent from the frozen pre-existing native-ID set.

Also require a fresh post-ready display fingerprint to show the film window and materially differ from clean frame zero, while all pre-existing target-display windows remain isolated. Revalidate the recorder's selected-source preview against that same display.

Only after every semantic, native-window, display, preview, and privacy predicate passes may the controller arm the recorder. Recorder readiness plus the exact receipt hashes permits one single-use go release to the waiting choreography. Reusing a prior frame-zero acceptance or go receipt is forbidden.

The portable [frame-zero and immutable-attempt contract](../native-display-capture.md#4-recorder-revalidation-and-frame-zero) still owns admission semantics; this section adds only the macOS physical seam.

## 9. Exact non-pre-existing teardown before restore

When the app-owned runner reports completion, do not restore operator windows yet. First:

1. wait for the admitted film native ID to disappear;
2. census the complete current browser owner/window set;
3. require it to equal the frozen global pre-existing set exactly;
4. if a non-pre-existing pair remains, target cleanup only by that proven owner and stable native ID;
5. verify the complete set again.

Never close by title, URL, window index, frontmost status, or geometry. Never target an ID that appears in the pre-existing receipt. If any non-pre-existing ID cannot be removed or any pre-existing ID disappeared, stop with a teardown failure receipt. Restore the pre-existing desktop only after the equality predicate passes, then run the verify-all restoration in §5.

Recorder stop is not terminal proof of window teardown, and a successful close dispatch is not proof of disappearance.

## 10. Reuse the generic media contract

This Atlas does not redefine:

- [target fingerprint, frame-zero, and immutable attempts](../native-display-capture.md#3-short-lived-target-fingerprint);
- [semantic and physical receipt binding](../native-display-capture.md#5-semantic-and-physical-receipts);
- [whole retained-media review](../native-display-capture.md#8-whole-retained-media-review);
- [retention and provenance disposition](../native-display-capture.md#9-retention-and-provenance-disposition);
- the [video project record](../../assets/video-project-record-template.md).

Bind the macOS isolation, physical-window, go, teardown, and restoration receipts into those existing attempt and QA rows. A clean still, contact sheet, OCR pass, or metadata probe remains only a review aid; none promotes media that was not watched from start to finish.

## 11. Revalidation and retirement

Revalidate the full recipe after any:

- macOS version/build or Spaces behavior change;
- browser version, bundle identity, process model, or window-lifecycle change;
- recorder or ScreenCaptureKit behavior/selection change;
- Screen Recording, Accessibility, or TCC/profile change;
- display count, arrangement, scale, or topology change;
- native-ID or Accessibility-to-CoreGraphics mapping change;
- first contradictory take or restoration mismatch.

The first contradiction invalidates the affected predicate; preserve the failed receipt, restage, and update this Atlas only after a replacement is reproduced.

Re-audit the skill at the third macOS film, one year after the first validated use, or after two local bypasses/workarounds—whichever comes first. Retire or compress this Atlas when the supported recorder/application boundary can natively select an exact window, isolate it without browser-content inspection, and verify teardown/restoration with equivalent receipts. A future executable controller or cross-platform abstraction requires its own architectural authority; it must not accrete here as prose.
