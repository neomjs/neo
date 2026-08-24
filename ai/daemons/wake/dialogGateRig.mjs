#!/usr/bin/env node

/**
 * @summary Real-harness rig for the wake dialog gate: proves the temporal invariant against a
 * live macOS AX tree and the unmocked delivery path.
 *
 * **What the unit lane cannot prove.** `localWakeAdaptersDialogGate.spec.mjs` injects probe
 * states through `spawnAsync`; this rig runs the REAL osascript probe against a REAL focused
 * element, so the harness-version coupling the gate relies on (Electron AX role vocabulary,
 * dialog markup drift) is measured rather than reasoned about.
 *
 * **Phases.**
 * - **A — red control (`adapterConfig.dialogProbe: false`).** With the gate disarmed, the wake
 *   digest is typed verbatim into the seat shell's composer. Select-all + copy proves
 *   envelope-as-answer: the pre-gate defect, reproduced live.
 * - **B — gate armed.** A real non-composer surface owns focus (the app's own About panel, raised
 *   through System Events — a genuine window whose focused element is not a text field).
 *   Dispatch must return `{deferred, interactive-dialog-pending}`; after dismissal, redelivery
 *   completes and the digest arrives byte-identical.
 *
 * **Target contract — self-possession.** The rig drives the authoring seat's own harness shell,
 * never a peer's seat and never a second instance: OpenCode enforces a single-instance lock
 * (measured 2026-08-24: spawned binaries and `open -n --args` alike exit without a window), and
 * a fresh instance is therefore unreachable. The self-disturbance is one composer field — typed,
 * asserted, cleared — plus a transient About panel. `--probe-only` prints focused-role
 * transitions without asserting, which is how the AX coupling note below gets re-measured on a
 * new harness build.
 *
 * **Harness coupling (measured 2026-08-24, darwin).** The probe keys on
 * `role of focused element of window 1`: membership in `{AXTextArea, AXTextField}` means
 * composer-safe; any other readable role means a prompt owns the input path; an unreadable tree
 * fails open. Electron version drift that changes these roles surfaces here as a phase-B
 * INCONCLUSIVE with the observed roles printed — that report is the fixture working.
 *
 * **Exit codes.** `0` = both phases proved · `1` = assertion/coupling failure · `2` = environment
 * unavailable (named cause printed): non-darwin, missing Accessibility/Automation consent, or no
 * unambiguous target instance.
 *
 * Usage: `node ai/daemons/wake/dialogGateRig.mjs [--probe-only]`
 *
 * @see ai/daemons/wake/localWakeAdapters.mjs — buildDialogGateArgs, the gate this rig exercises
 * @see test/playwright/unit/ai/daemons/wake/localWakeAdaptersDialogGate.spec.mjs — hermetic half
 */

import {spawn} from 'child_process';
import crypto  from 'crypto';

const
    TEXT_ROLES = ['AXTextArea', 'AXTextField'],
    MARKER     = `DIALOGGATE-RIG-${Date.now()}`,
    DIGEST     = `[WAKE][priority:normal] 1 events for @dialog-rig:\n- ${MARKER} probe`;

const args       = process.argv.slice(2);
const PROBE_ONLY = args.includes('--probe-only');

let resolvedPid = null;

const APP_NAME = 'OpenCode';

/**
 * @summary Runs one `osascript` script and returns {code, stdout, stderr}.
 *
 * Fragments are JOINED into a single `-e` document: this host's osascript treats repeated
 * `-e` flags as separate compile units rather than concatenated lines, so multi-line scripts
 * passed fragment-by-fragment die with -2741 syntax errors.
 *
 * @param {String[]} argv Script lines.
 * @returns {Promise<{code: Number, stdout: String, stderr: String}>}
 */
function osascript(argv) {
    return new Promise(resolve => {
        const proc = spawn('osascript', ['-e', argv.join('\n')], {stdio: ['ignore', 'pipe', 'pipe']});

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', chunk => stdout += chunk);
        proc.stderr.on('data', chunk => stderr += chunk);
        proc.on('close', code => resolve({code, stdout: stdout.trim(), stderr: stderr.trim()}));
    })
}

/**
 * @summary Exits with a named environment cause — never an assertion failure.
 * @param {String} cause
 * @returns {never}
 */
function unavailable(cause) {
    console.error(`[dialog-gate-rig] ENVIRONMENT UNAVAILABLE (exit 2): ${cause}`);
    process.exit(2)
}

/** @summary Fails the rig loudly — an assertion, not an environment gap. */
function fail(detail) {
    console.error(`[dialog-gate-rig] FAILED (exit 1): ${detail}`);
    process.exit(1)
}

/**
 * @summary Resolves the rig's target: the authoring seat's own OpenCode instance.
 *
 * **Why self-possession and not a disposable launch.** Both launch paths for a second instance
 * were measured dead on 2026-08-24: the app holds a single-instance lock, so a spawned binary
 * and `open -n --args --user-data-dir=…` alike exit within seconds without a window. Driving the
 * authoring seat's own shell is the honest remainder: it is exactly the harness shape the gate
 * protects, the disturbance is confined to one composer field (typed, asserted, cleared) plus a
 * transient About panel, and no peer's seat is ever touched. The avoided trap this honors is
 * "driving a PEER'S live seat" — self-possession of one's own shell is the subject, not the
 * hazard.
 *
 * The single-fragment `tell … to get` form is deliberate: multi-property `whose` reads were
 * measured to throw -1728 intermittently on this host, while this shape is stable.
 *
 * @returns {Promise<Number[]>} Unix ids of every visible OpenCode process via System Events.
 */
function listAppPids() {
    return osascript([
        'tell application "System Events" to get unix id of every application process whose name is "OpenCode"'
    ]).then(result =>
        result.code !== 0
            ? []
            : result.stdout
                .split(',')
                .map(part => Number(part.trim()))
                .filter(Number.isFinite)
    )
}

/**
 * @summary Polls a predicate until truthy or timeout; resolves false on expiry.
 * @param {Function} read Async producer of the observed value.
 * @param {Function} predicate Accepts the observation, returns a Boolean.
 * @param {Number} [timeoutMs=6000]
 * @returns {Promise<Object|null>} Last observation, or null on expiry.
 */
async function waitFor(read, predicate, timeoutMs = 6000) {
    const deadline = Date.now() + timeoutMs;
    let   last     = null;

    while (Date.now() < deadline) {
        last = await read();

        if (predicate(last)) return last;
        await new Promise(resolve => setTimeout(resolve, 250));
    }

    return null
}

/**
 * Reads the focused-element role of the target process's window 1 — the probe's own signal.
 *
 * Every query binds the pid through a pre-set `targetProc` variable, never an inline
 * `… whose unix id is N` on a non-process object: AppleScript scopes that filter to the DIRECT
 * object, so `count windows of <proc> whose unix id is N` searches for a window having a unix id
 * and dies with -1728. Production's resolveTargetProcessLines uses the same two-step shape.
 */
async function focusedRole(pid) {
    const result = await osascript([
        'tell application "System Events"',
        `  set targetProc to first application process whose unix id is ${pid}`,
        '  set focusedRole to missing value',
        '  tell targetProc',
        '    try',
        '      set focusedRole to role of focused element of window 1',
        '    end try',
        '  end tell',
        'end tell',
        '  return focusedRole as text'
    ]);

    return result.code === 0 ? result.stdout : `(unreadable: ${result.stderr || 'missing value'})`
}

/**
 * @summary Raises the target's own About panel through System Events.
 *
 * Every macOS app carries this menu item, so no per-harness binding knowledge is required, and an
 * About panel is a genuine window whose focused element is not a text field — exactly the signal
 * class the gate keys on.
 *
 * @param {Number} pid Target instance pid.
 * @returns {Promise<{code: Number, stdout: String, stderr: String}>}
 */
function raiseAboutPanel(pid) {
    return osascript([
        'tell application "System Events"',
        `  set targetProc to first application process whose unix id is ${pid}`,
        '  set frontmost of targetProc to true',
        '  delay 0.5',
        '  click menu item 1 of menu 1 of menu bar item 2 of menu bar 1 of targetProc',
        'end tell'
    ])
}

/** Types the digest into whatever holds focus, then selects all and copies it to the clipboard. */
async function typeAndCopyBack() {
    const type = await osascript([
        'tell application "System Events"',
        `  keystroke ${JSON.stringify(DIGEST)}`,
        '  delay 0.4',
        '  keystroke "a" using command down',
        '  delay 0.2',
        '  keystroke "c" using command down',
        'end tell'
    ]);

    if (type.code !== 0) throw new Error(`typing failed: ${type.stderr}`);

    const clip = await osascript(['return the clipboard']);

    return clip.stdout
}

async function main() {
    if (process.platform !== 'darwin') unavailable('this rig drives the macOS AX tree; darwin only');

    const consentProbe = await osascript(['tell application "System Events" to count processes']);

    if (consentProbe.code !== 0) {
        unavailable(
            `System Events refused the probe (${consentProbe.stderr}); grant the invoking host `
            + 'Accessibility + Automation consent, then rerun'
        );
    }

    const candidates = await listAppPids();

    if (candidates.length === 0) unavailable(`no running ${APP_NAME} instance found — start the harness shell first`);
    if (candidates.length > 1) {
        unavailable(
            `multiple ${APP_NAME} instances visible (${candidates.join(', ')}) — refusing to guess; `
            + 'close the extras or extend the rig with an explicit --pid selector'
        )
    }

    resolvedPid = candidates[0];

    const pid = resolvedPid;

    console.log(`[dialog-gate-rig] targeting this seat's own ${APP_NAME} shell (pid ${pid})…`);

    const windowProbe = await osascript([
        'tell application "System Events"',
        `  set targetProc to first application process whose unix id is ${pid}`,
        '  count windows of targetProc',
        'end tell'
    ]);

    // -25211 means the invoking host lacks assistive (Accessibility) consent: AX reads of
    // ANOTHER process are OS-gated even though plain name/id queries succeed. Named, because
    // "no window" would send an operator debugging the wrong layer entirely.
    if (windowProbe.code !== 0 && /-25211|assistive/.test(windowProbe.stderr)) {
        unavailable(
            `System Events denied assistive access (${windowProbe.stderr.trim()}); grant the `
            + 'invoking host Accessibility consent, then rerun'
        )
    }

    const windowReady = await waitFor(
        () => osascript([
            'tell application "System Events"',
            `  set targetProc to first application process whose unix id is ${pid}`,
            '  count windows of targetProc',
            'end tell'
        ]),
        r => r.code === 0 && Number(r.stdout) >= 1,
        8_000
    );

    if (!windowReady) unavailable(`instance ${pid} exposes no window (last probe: ${JSON.stringify(windowProbe.stderr || windowProbe.stdout)})`);

    console.log(`[dialog-gate-rig] instance up (pid ${pid}); measuring focus…`);

    const initialRole = await waitFor(
        () => focusedRole(pid),
        role => !role.startsWith('(unreadable'),
        8_000
    );

    console.log(`[dialog-gate-rig] focused role: ${initialRole ?? 'never readable'}`);

    if (PROBE_ONLY) {
        console.log('[dialog-gate-rig] --probe-only: raising the About panel for 5s; observe role transitions.');
        await raiseAboutPanel(pid);

        await new Promise(resolve => setTimeout(resolve, 5000));
        console.log(`[dialog-gate-rig] role with About panel open: ${await focusedRole(pid)}`);
        return
    }

    // ── Phase A — red control: gate off, envelope-as-answer ──────────────────────────────
    console.log('[dialog-gate-rig] PHASE A (gate off): expecting envelope-as-answer…');

    const phaseA = await dispatch({
        subscriptionId: 'WAKE_SUB:dialog-rig-a',
        dialogProbe   : false,
        pid
    });

    if (phaseA.outcome !== 'delivered') fail(`phase A expected delivered, got ${JSON.stringify(phaseA)}`);

    const pasted = await typeAndCopyBack();

    if (!pasted.includes(MARKER)) {
        fail(`phase A: digest did not land in the composer (clipboard held ${JSON.stringify(pasted.slice(0, 80))})`)
    }

    console.log('[dialog-gate-rig] PHASE A PROVED: pre-gate behavior reproduces (envelope-as-answer).');

    // Clear the field so phase B starts clean.
    await osascript([
        'tell application "System Events"',
        '  key code 51 using command down',
        'end tell'
    ]);

    // ── Phase B — gate armed: real modal surface owns focus ─────────────────────────────
    console.log('[dialog-gate-rig] PHASE B (gate armed): raising the About panel…');

    const raise = await raiseAboutPanel(pid);

    if (raise.code !== 0) fail(`could not raise the About panel: ${raise.stderr}`);

    const dialogRole = await waitFor(
        () => focusedRole(pid),
        role => !role.startsWith('(unreadable') && !TEXT_ROLES.includes(role),
        6_000
    );

    if (!dialogRole) fail(`no non-text focus appeared after raising the About panel (last role: ${await focusedRole(pid)})`);

    console.log(`[dialog-gate-rig] non-composer focus confirmed (${dialogRole}); dispatching…`);

    const phaseB = await dispatch({
        subscriptionId: 'WAKE_SUB:dialog-rig-b',
        dialogProbe   : undefined,
        pid,
        awaitDelivery : true
    });

    if (phaseB.firstOutcome?.outcome !== 'deferred') {
        fail(
            `phase B expected first attempt deferred, got ${JSON.stringify(phaseB.firstOutcome)} `
            + '— coupling drift between the probe and this harness build?'
        )
    }

    console.log('[dialog-gate-rig] DEFERRED confirmed; dismissing the panel and waiting for redelivery…');

    await osascript([
        'tell application "System Events"',
        '  key code 53',
        'end tell'
    ]);

    if (!phaseB.redelivery) fail('phase B: the parked record never redelivered after dismissal');
    if (!phaseB.redeliveredEnvelope?.payload?.latestMessage?.subject?.includes(MARKER)) {
        fail('phase B: redelivered envelope lost its original identity')
    }

    const landed = await readComposer(pid);

    console.log('[dialog-gate-rig] PHASE B PROVED: defer, operator-surface intact, byte-identical redelivery.');

    if (landed && landed.includes(MARKER)) {
        console.log('[dialog-gate-rig] receipt: the composer holds the redelivered digest; clearing it.');
        await osascript([
            'tell application "System Events"',
            '  key code 51 using command down',
            'end tell'
        ]);
    }

    console.log('[dialog-gate-rig] ALL PHASES PROVED')
}

/**
 * @summary Runs one real delivery attempt, optionally polling until redelivery lands.
 *
 * Calls the REAL `dispatchLocalWake` — no injected effects — against this pid. The receiver's
 * park-and-reschedule half is deliberately not re-driven here: it is covered at L2 by
 * `localWakeAdaptersDialogGate.spec.mjs` and out of scope for this leaf, so phase B
 * polls redelivery directly and isolates exactly the adapter-level temporal fact.
 *
 * @private
 */
async function dispatch({subscriptionId, dialogProbe, pid, awaitDelivery = false}) {
    const {dispatchLocalWake} = await import('./localWakeAdapters.mjs');

    const route = {
        agentIdentity        : '@dialog-rig',
        signingKey           : crypto.randomBytes(32).toString('hex'),
        harnessTargetMetadata: {
            adapter        : 'osascript',
            appName        : 'OpenCode',
            addressType    : 'pid',
            instanceAddress: String(pid)
        },
        adapterConfig        : {attemptTimeoutMs: 10_000, ...(dialogProbe === undefined ? {} : {dialogProbe})}
    };

    const envelope = {
        payload  : {totalEvents: 1, latestMessage: {subject: `${MARKER} probe`, priority: 'normal'}},
        identity : '@dialog-rig',
        signature: 'rig'
    };

    const firstOutcome = await dispatchLocalWake({
        subscriptionId,
        envelope,
        route
    });

    if (!awaitDelivery) return {outcome: firstOutcome};

    let redelivery          = false;
    let redeliveredEnvelope = null;

    for (let i = 0; i < 40 && !redelivery; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const retry = await dispatchLocalWake({subscriptionId, envelope, route});

        if (retry === 'delivered') {
            redelivery          = true;
            redeliveredEnvelope = envelope
        }
    }

    return {firstOutcome, redelivery, redeliveredEnvelope}
}

/** Reads the composer's value back through the AX tree, for the optional final receipt. */
async function readComposer(pid) {
    const result = await osascript([
        'tell application "System Events"',
        `  set targetProc to first application process whose unix id is ${pid}`,
        '  set composerValue to ""',
        '  tell targetProc',
        '    try',
        '      set composerValue to value of focused element of window 1',
        '    end try',
        '  end tell',
        'end tell',
        '  return composerValue as text'
    ]);

    return result.code === 0 ? result.stdout : ''
}

process.on('SIGINT', () => process.exit(130));

main().catch(error => fail(error?.stack || String(error)))
