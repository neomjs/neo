/**
 * @summary The surface-cue vocabulary Workstation's playback controller executes — data only,
 * importable by the screenplays and their unit specs without touching the Neo namespace.
 *
 * A cue rides a `pause` step of a `neo.tour.script.v1` screenplay; the runner never interprets
 * it, the hosting `TourController` does. Keeping the list here lets a screenplay's unit spec
 * prove every cue it names is one the controller handles, so a renamed cue cannot ship as a
 * silent `false` receipt.
 * @type {ReadonlyArray<String>}
 */
export const WORKSTATION_CUE_TYPES = Object.freeze([
    // in-window surface cues (the dense tour's vocabulary, plus the film's rail round trip and
    // its splitter resize: a real pointer drag through the Mouse sensor's own arming)
    'overflow', 'scroll', 'canvas-update', 'cross-zone-showcase', 'theme', 'rail', 'resize',
    // the viewer gate: playback waits for a click, which is the user activation a window birth needs
    'gate',
    // real-pointer window gestures over the NativeGestureDriver's executors
    'tear-out', 'convert-while-dragging', 'stack-return',
    // perspectives and Group-cursor history through the workspace's own seams
    'perspective-capture', 'perspective-restore', 'undo', 'redo'
]);
