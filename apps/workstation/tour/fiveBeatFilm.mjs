/**
 * @summary Workstation's flagship-film screenplay v2 — the `neo.tour.script.v1` narrative
 * authority for the 90–150s recorded journey, with narration captions as the spoken-text draft.
 *
 * Authority chain, stated so no consumer confuses the layers:
 * - `test/playwright/e2e/workstation/WorkstationFiveBeatNL.spec.mjs` is the WITNESS authority —
 *   a take that cannot pass the spec is not a take.
 * - THIS file is the NARRATIVE authority: show-order, pacing budget, and the narration draft
 *   each beat speaks over the witnessed gesture.
 * - The recorded transcript derives from the captured cut, never the reverse: these captions
 *   are the working screenplay, and the final voice track re-times to the footage.
 *
 * Pacing: `targetSeconds` per scene is a budget, not a stopwatch — captured gestures own their
 * real duration and the cut re-paces around them. The non-conditional scenes sum to exactly 90s —
 * the envelope's `minSeconds` floor with ZERO slack, so a future core-scene budget cut must either
 * trade seconds between scenes or move the floor. The conditional scene lifts the total to 106s,
 * and captured gesture durations plus the edit-layer cut-in re-pace upward from there, inside the
 * 90–150s envelope.
 *
 * Claim discipline (revalidated against the current witnesses at authoring time):
 * - same-instance continuity   → `getPaneIdentity` equality asserts (scenes 3, 6, 8)
 * - mid-gesture window birth   → `proof.born` before pointer-up (scene 3)
 * - exactly-one-claim          → `claimCount: 1` + single rendered preview (scene 5)
 * - atomic return + self-close → `phaseOrder` `documents-adopted → … → topology-exited` (scene 6)
 * - living-content continuity  → monotonic `feedSequence`, never reset (scenes 1, 8)
 * - preview determinism        → two-take beat-log equality + painted-dwell rect witnesses (scene 2)
 * Narration makes NO cross-platform, default-selection, or portability claims, and carries no
 * competitive comparisons — captions inherit the spec's macOS-headed claim boundary.
 *
 * Format decision (recorded): the v2 baseline is a SINGLE NARRATOR — the journey is one
 * continuous gesture story, and the engine-truth layer (worker receipts) rides as on-screen
 * caption overlays rather than a second voice. The dialogue variant (narrator = what you see,
 * engine voice = what the worker knows) stays the named alternative; operator ears decide at
 * the voice audition, and flipping requires only re-mapping `narration` lines to speakers.
 *
 * The N-window density beat (Fleet cockpit, three windows, live mailbox migration) is an
 * EDIT-LAYER cut-in sourced from its own witness spec — it is not part of this tour's runtime
 * and deliberately absent from the scene list below.
 */

/**
 * The flagship-film screenplay. Scene ids are stable anchors for the cut, the caption
 * renderer, and the take QA checklist; `conditional` scenes activate only when their wiring
 * ships and are skipped by consumers until then.
 * @type {Object}
 */
export const fiveBeatFilmScript = Object.freeze({
    schema: 'neo.tour.script.v1',
    id    : 'workstation-flagship-film-v2',
    title : 'The content never stops living',

    envelope: {maxSeconds: 150, minSeconds: 90},

    scenes: [{
        id           : 'film-cold-open',
        title        : 'The room is alive',
        targetSeconds: 12,
        narration    : 'This is a living workspace. Twenty panes — a hundred-thousand-row grid, streaming feeds, live telemetry. Watch the split: the room answers, and nothing stops moving.',
        beats        : ['dense opening topology', 'resizeSplit through the real boundary', 'feed heartbeat visibly advancing']
    }, {
        id           : 'film-showcase',
        title        : 'Every target answers the pointer',
        targetSeconds: 14,
        narration    : 'Drag one tab. Every target answers — an edge preview here, a merge preview there. Release commits exactly what you saw. Escape cancels, and the document is untouched.',
        beats        : ['cross-zone drag with two dwells', 'edge-bottom preview hugs its zone', 'tab-into preview fills its target', 'commit equals the active preview']
    }, {
        id           : 'film-tear-out',
        title        : 'A window is born mid-gesture',
        targetSeconds: 14,
        narration    : 'Now drag past the window’s edge. A real window is born — mid-gesture, while the pointer is still down. The pane inside it is the same live instance. The grid never reloaded. The feed never paused.',
        beats        : ['boundary exit births the vessel before pointer-up', 'pane identity preserved across the window boundary', 'living content uninterrupted']
    }, {
        id           : 'film-morph',
        title        : 'Change your mind — nothing happened',
        targetSeconds: 10,
        narration    : 'Changed your mind? Come back. The window retires itself before you release. Zero mutation — the workspace never even blinked.',
        beats        : ['re-entry while dragging retires the vessel', 'document byte-identical by guard']
    }, {
        id           : 'film-second-window',
        title        : 'The second window learns to dock',
        targetSeconds: 16,
        narration    : 'A second pane converts to a window while you drag it — and docks into the first. Dock zones glow inside a real OS window. Two windows overlap; exactly one claims the pointer. One application. One shared heap.',
        beats        : ['convert-while-dragging', 'dock zones render inside the target popup', 'overlap arbitration: exactly one claim', 'A+B compose in the vessel']
    }, {
        id           : 'film-reintegration',
        title        : 'The stack comes home as one',
        targetSeconds: 14,
        narration    : 'Drag the merged stack home — as one. The commit is atomic. And the emptied window closes itself — after the document lands, never before.',
        beats        : ['whole-stack grip', 'stored-home acquisition', 'atomic transferNode commit', 'vessel self-close strictly after adoption']
    }, {
        id           : 'film-perspectives-undo',
        title        : 'Arrangements are data; operations are transactions',
        targetSeconds: 16,
        conditional  : 'activates when the workstation perspective + transaction wiring lands',
        narration    : 'Save this arrangement as a perspective. Tear the room apart — one click restores it, same instances, same living content. And every dock operation is a transaction: undo walks it back. Redo replays it.',
        beats        : ['capture perspective', 'disruptive rearrangement', 'restore: topology returns, instances persist', 'undo/redo round-trip on a dock mutation']
    }, {
        id           : 'film-signature',
        title        : 'It never left',
        targetSeconds: 10,
        narration    : 'Same instances, end to end. Heartbeats monotonic through every transition. The content never stopped living — because it never left.',
        beats        : ['final topology readout', 'identity equality end-to-end', 'monotonic heartbeat close']
    }]
});
