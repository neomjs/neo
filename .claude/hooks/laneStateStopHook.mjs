#!/usr/bin/env node
/**
 * @module .claude/hooks/laneStateStopHook
 * @summary Claude Code `Stop` hook — REFUSES every turn-end except a live operator dialogue whose
 * terminal does not declare `active-lane`, a transcript-verified MATERIAL ARTIFACT since the last
 * accepted stop (+ a valid terminal), or an audited CLEAN TERMINAL (valid terminal + fully
 * handed-off gates + the session drive-ratchet).
 * An absent enforcement flag is a non-enforcing fail-open fallback; live harness wiring enforces via
 * `NEO_LANE_STATE_ENFORCE=1`.
 *
 * Fires at every agent turn-end (the `Stop` event). The decision rule: there is NO valid voluntary
 * stop except a **live operator dialogue** — a turn that directly replied to a genuine human-operator
 * message, where the human takes the next turn (turn-taking, not idling) — whose own terminal does NOT
 * declare `active-lane`; or one of TWO autonomous edges: the **material-artifact key** (the primary
 * license — a transcript-verified lifecycle artifact, a PR opened or a formal review, shipped since
 * this session's last accepted stop, plus a valid lane-state terminal; provenance is
 * tool-use→tool-result ID-correlated, so prose can never mint it) or the artifact-less fallback, a
 * **clean terminal**: a valid lane-state terminal whose named gates ALL await non-self actors, after
 * ≥2 compliant refused drives already proved the no-hold principle was honored this session (the
 * drive count is read from the hook's OWN audit log, the self identity from `NEO_AGENT_IDENTITY`
 * harness wiring — absent wiring keeps the edge inert, fail-closed). Every acceptance is audited
 * (`MATERIAL-ALLOW` / `[clean-terminal]` line + a transcript systemMessage), never silent. Outside that edge a "valid"
 * fenced ```lane-state block is a RECORD (the directive's context + the external substance record),
 * NOT a license to stop: declaring a lane and halting is the announce-without-execute idle-out the
 * hook exists to prevent.
 *
 * Mechanism:
 *  - `operatorInLoop` is determined EXTERNALLY by `isOperatorInLoop`, never
 *    self-declared, so it cannot be gamed: the prompting candidate comes from the human-filtered
 *    transcript walk ({@link extractLatestHumanUserTextFromJsonl} — harness-injected `isMeta` records
 *    can never masquerade as dialogue), must NOT be a `[WAKE]` autonomous injection, and must be
 *    confirmable (fail-closed). Inside a forced continuation chain (`stop_hook_active`), a genuine
 *    operator message that arrived MID-CHAIN counts as dialogue evidence — the hook's contract could
 *    previously never confirm it and refused live-dialogue terminals as autonomous. Dialogue normally
 *    allows, but an exact parsed `active-lane` declaration refuses: answer-plus-drive, not answer-plus-stop.
 *  - Otherwise: ENFORCE → block; non-enforcing → would-block (log only — the audit path). The lane-state
 *    `verdict` (`parseLaneState` → `validateLaneStateTerminal`) no longer gates the action — it only
 *    supplies the `reason` for the injected directive.
 *  - Block path (ENFORCING): write `{"decision":"block","reason":"…"}` to stdout — Claude keeps
 *    working and uses the injected directive as its next instruction. The only autonomous stop is a
 *    hard external limit: Claude Code's consecutive-block force-override (the bounded ceiling the hook
 *    cannot override), context-sunset, or an operator halt.
 *
 * SAFETY — this hook MUST NEVER block a turn-end on its OWN failure (a malformed hook payload, an
 * unreadable transcript, a validator throw). Those allow the stop + audit. A *malformed lane-state
 * emission* (parseLaneState throws) is NOT our failure — it feeds the directive's `reason`, not the gate.
 *
 * ACTIVATION = operator-authority: this script is INERT until wired into the harness settings
 * (`.claude/settings.*`). Live wiring sets `NEO_LANE_STATE_ENFORCE=1` immediately. An absent flag is a
 * fail-open wiring or stale-session signal; WOULD-BLOCK remains a unit-pinned diagnostic output, not a
 * prescribed live rollout tier.
 *
 * SEAM: `parseLaneState` + `validateLaneStateTerminal` (imported from `ai/scripts/lifecycle/`) supply
 * the `verdict`'s reason; the pure `parseOutcomeToVerdict`, `decideHookAction`, and `isOperatorInLoop`
 * are exported + unit-tested independently.
 *
 * @see https://code.claude.com/docs/en/hooks — Stop hook contract (stdin payload, decision:block)
 */
import fs              from 'node:fs';
import path            from 'node:path';
import os              from 'node:os';
import {pathToFileURL} from 'node:url';

import {parseLaneState} from '../../ai/scripts/lifecycle/parseLaneState.mjs';
import {buildDeferenceStopHookDirective,
        classifyPromptingContext,
        decideDeferenceStopHookAction,
        decideStopHookAction,
        decideUnbackedActionStopHookAction,
        evaluateCleanTerminalAcceptance,
        isOperatorInLoop,
        LANE_STATE_SCHEMA_HINT,
        parseOutcomeToVerdict,
        scanHoldLexicon,
        STOP_HOOK_TURN_OPTIONS_HINT} from '../../ai/scripts/lifecycle/stopHookDecision.mjs';
import {collectLaneStateToolEvidenceFromJsonl,
        validateLaneStateTerminal} from '../../ai/scripts/lifecycle/validateLaneStateTerminal.mjs';
import {collectMaterialArtifactsFromJsonl,
        evaluateMaterialArtifactKey} from '../../ai/scripts/lifecycle/materialArtifactKey.mjs';
import {appendHookProjection,
        readConfiguredHookProjection} from '../../ai/scripts/lifecycle/hookProjectionReader.mjs';

export {isOperatorInLoop, parseOutcomeToVerdict};

// Live harness wiring explicitly enables enforcement. An absent flag fails open and emits diagnostics.
const ENFORCING = process.env.NEO_LANE_STATE_ENFORCE === '1';

/**
 * @summary Resolves the two-axis turn-end policy from the config SSOT. `ENFORCING` above is the
 * WIRING signal (is the hook live at all); these are the POLICY signals (which of its two jobs it
 * does) — the split the single legacy flag could not express.
 *
 * This hook is a thread-entrypoint, so it bootstraps the `Neo` namespace and reads
 * `AiConfig.stopHook.*` at the use site — no re-derivation, no defaults twin, no hand-rolled env
 * decode. Measured at ~50ms against the hook's 10s budget.
 *
 * The bootstrap is a GUARDED DYNAMIC import, not a top-level one, because this hook's load-bearing
 * safety contract is that it never blocks a turn-end on its own failure: a top-level import throws
 * BEFORE `main()`'s try/catch exists, so a broken overlay or a failing boot assertion would trap
 * every turn-end instead of degrading. On resolution failure the hook takes its existing
 * fail-open posture — allow the stop — which is the hook's own safety default, NOT a shadow copy of
 * a config default (there is no hardcoded policy literal here to drift from the leaves).
 * @returns {Promise<{deferenceMirror: Boolean, laneContinuation: Boolean, projection: Object}|null>}
 * `null` when the config tree could not be resolved, which the caller treats as allow-and-audit.
 * @protected
 */
async function resolveStopHookPolicy() {
    try {
        await import('../../src/Neo.mjs');
        await import('../../src/core/_export.mjs');

        const {default: AiConfig} = await import('../../ai/config.mjs');

        const projection = AiConfig.stopHook.projection;

        return {
            deferenceMirror : AiConfig.stopHook.deferenceMirror,
            laneContinuation: AiConfig.stopHook.laneContinuation,
            projection      : {
                path              : projection.path,
                targetId          : projection.targetId,
                capability        : projection.capability,
                agentId           : projection.agentId,
                harnessType       : projection.harnessType,
                instanceKeyDigest : projection.instanceKeyDigest,
                workspaceKeyDigest: projection.workspaceKeyDigest,
                maxRows           : projection.maxRows,
                maxBytes          : projection.maxBytes
            }
        };
    } catch (e) {
        auditLog(`CONFIG-ERROR (identity=${process.env.NEO_AGENT_IDENTITY || '?'}): could not resolve stopHook policy (${e.message}); allowing stop.`);
        return null;
    }
}

// Append-only decision log — WOULD-BLOCK records non-enforcing diagnostics; ALLOW/BLOCK record live truth.
// NEO_AI_DAEMON_DIR override keeps tests off the real store.
const LOG_DIR  = process.env.NEO_AI_DAEMON_DIR || path.join(os.homedir(), '.neo-ai-data', 'lane-state-hook');
const LOG_FILE = path.join(LOG_DIR, 'lane-state-stop-hook.log');

/**
 * @summary Reads all of stdin (the Stop-hook JSON payload) to a string.
 * @returns {Promise<String>}
 * @protected
 */
function readStdin() {
    return new Promise((resolve, reject) => {
        let data = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data',  chunk => data += chunk);
        process.stdin.on('end',   ()    => resolve(data));
        process.stdin.on('error', reject);
    });
}

/**
 * @summary Best-effort append to the decision audit log. A log failure must NEVER gate the hook
 * (mirrors the wake daemon's never-fail log discipline) — worst case is a lost audit line.
 * @param {String} line
 * @protected
 */
function auditLog(line) {
    try {
        fs.mkdirSync(LOG_DIR, {recursive: true});
        fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${line}\n`, 'utf8');
    } catch (e) {
        // best-effort; a log-write failure must never block a turn-end
    }
}

/**
 * @summary Pure decision — maps a terminal `verdict` + the mode (`enforcing`) + whether a live human
 * operator prompted this turn (`operatorInLoop`) + the adapter-evaluated clean-terminal acceptance
 * to the Stop-hook action. The heart of the idle-out mechanism; exported + unit-tested.
 *
 * The legitimate voluntary stop is a **live operator dialogue** — this turn directly replied to a
 * genuine human-operator message, so the human takes the next turn (turn-taking, not idling). That is
 * `operatorInLoop`, determined EXTERNALLY (the prompting message type — see the entry `main`), never
 * self-declared. The one dialogue refusal is an exact parsed `active-lane` terminal: the agent's own
 * record says self-work remains, so it must answer-plus-drive or hand the lane off honestly. An absent,
 * malformed, or other continuation keeps the dialogue allow.
 *
 * TWO legitimate AUTONOMOUS stops exist. The PRIMARY is the **material-artifact key**
 * (`evaluateMaterialArtifactKey` — an ID-correlated, transcript-verified artifact since the
 * session's last accepted stop + a valid terminal; audited as `MATERIAL-ALLOW`). The artifact-less
 * fallback is the **clean terminal** — a valid lane-state terminal on a fully handed-off board
 * (every named gate awaiting a non-self actor) after the session drive-ratchet proved the no-hold
 * principle was honored (`evaluateCleanTerminalAcceptance`; the drive count comes from the hook's
 * OWN audit trail, never the agent's claim). Acceptance emits a `[clean-terminal]` audit line —
 * every boundary is observable, not silent. Everything else is unchanged: a first valid terminal still
 * refuses (ratchet), ENFORCE blocks, non-enforcing mode previews (would-block), and the `verdict` supplies the
 * directive `reason`. The remaining autonomous stops are hard external limits (Claude Code's
 * consecutive-block force-override, context-sunset, or an operator halt).
 * @param {{valid: Boolean, reason: String}} verdict
 * @param {Boolean} enforcing
 * @param {Boolean} [operatorInLoop=false] True iff a genuine human-operator message prompted this turn.
 * @param {{accept: Boolean, reason: String}|null} [cleanTerminal=null] Adapter-evaluated acceptance.
 * @param {String|null} [laneContinuation=null] Parsed terminal continuation, when available.
 * @param {{accept: Boolean, reason: String}|null} [materialArtifact=null] Adapter-evaluated
 * material-artifact key (the PRIMARY autonomous allow).
 * @param {Boolean} [laneContinuationEnforced=true] The `stopHook.laneContinuation` policy leaf —
 * `false` allows every turn-end without demanding a lane-state terminal.
 * @returns {{action: ('allow'|'block'|'would-block'), reason: String}}
 */
export function decideHookAction(verdict, enforcing, operatorInLoop = false, cleanTerminal = null, laneContinuation = null, materialArtifact = null, laneContinuationEnforced = true) {
    return decideStopHookAction(verdict, {
        enforcing,
        operatorInLoop,
        laneContinuation,
        blockInjectionSupported: true,
        cleanTerminal,
        materialArtifact,
        laneContinuationEnforced
    });
}

/**
 * @summary Counts this session's COMPLIANT REFUSED terminals from the hook's own append-only audit
 * log — the external drive-ratchet source for {@link evaluateCleanTerminalAcceptance}. Every
 * `BLOCK … : valid lane-state terminal` line is one turn where the agent emitted a fully valid
 * terminal and the hook refused it anyway (so a real drive followed); the count is therefore
 * hook-written evidence the agent cannot self-declare. Deference blocks and invalid-terminal blocks
 * do not count. WOULD-BLOCK (non-enforcing) lines do not count — no chain formed. Fail-CLOSED: a missing /
 * unreadable log or an unknown session returns 0, so a broken audit trail can never mint a
 * stop-license. Exported + unit-tested.
 * @param {String} sessionId The Stop payload's `session_id`.
 * @returns {Number}
 */
export function countSessionCompliantRefusals(sessionId) {
    if (!sessionId || sessionId === '?') return 0;

    try {
        // `] BLOCK (session=` excludes WOULD-BLOCK lines (they read `] WOULD-BLOCK (session=`);
        // the trailing comma pins the exact session id (no prefix collisions between ids).
        const needle = `] BLOCK (session=${sessionId},`;

        return fs.readFileSync(LOG_FILE, 'utf8').split('\n')
            .filter(line => line.includes(needle) && line.includes(': valid lane-state terminal')).length;
    } catch {
        return 0;
    }
}

/**
 * @summary Resolves the ISO timestamp of this session's LAST accepted stop from the hook's own
 * append-only log — the external "since" boundary for the material-artifact key: an artifact
 * shipped BEFORE the last accepted stop cannot license a later one. EVERY accepted-stop class
 * counts as a boundary: `MATERIAL-ALLOW`, `CLEAN-TERMINAL ALLOW`, and the ordinary dialogue
 * `] ALLOW` (an operator-dialogue stop IS an accepted stop — artifacts shipped before it must not
 * license the next autonomous one). The session needle is comma-delimited (`(session=<id>,`) so a
 * session id that PREFIXES another can never cross-match. Two distinct non-boundary outcomes:
 * `{iso: null, unavailable: false}` — the log is readable but records no accepted stop for this
 * session (the legitimate session-start case on a LIVE log; the whole session counts); `{iso: null,
 * unavailable: true}` — the log could not be read at all, INCLUDING a missing file (a deleted or
 * never-written log is indistinguishable from tampering; fail-CLOSED downstream — evidence that
 * cannot prove its scope licenses nothing, and the first-session stop routes through the
 * clean-terminal fallback). Exported + unit-tested against the log-format contract.
 * @param {String} sessionId The Stop payload's `session_id`.
 * @param {String} [logFile=LOG_FILE] Injectable for tests.
 * @returns {{iso: String|null, unavailable: Boolean}}
 */
export function findLastAcceptedStopIso(sessionId, logFile = LOG_FILE) {
    if (!sessionId || sessionId === '?') return {iso: null, unavailable: false};

    let raw;
    try {
        raw = fs.readFileSync(logFile, 'utf8');
    } catch {
        // ANY read failure — including a missing file — is unavailable boundary evidence: a
        // deleted/never-written log is indistinguishable from tampering, and unscoped whole-session
        // replay must not license a stop. The genuine first-session autonomous stop routes through
        // the clean-terminal fallback instead (which carries its own ratchet).
        return {iso: null, unavailable: true};
    }

    const needle = `(session=${sessionId},`,
          lines  = raw.split('\n');

    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (!line.includes(needle)) continue;
        if (!line.includes('CLEAN-TERMINAL ALLOW') && !line.includes('MATERIAL-ALLOW') && !line.includes('] ALLOW')) continue;

        const match = line.match(/^\[([^\]]+)\]/);
        if (match && Number.isFinite(Date.parse(match[1]))) return {iso: match[1], unavailable: false};
    }
    return {iso: null, unavailable: false};
}

// The curated no-hold-state directive injected on a block. References the always-loaded
// L3_No_Hold_State stance + carries a self-sufficient operational core (the lifecycle ladder + the
// named-lane teeth-test) so it redirects without assuming a live L3 lookup. The wording's semantics
// are cross-family-convergence-fixed — refine prose, not meaning.
const IDLE_REMINDER = `Turn-end refused — L3_No_Hold_State: there is no hold state, and you do not get to stop.
Declaring a lane is NOT driving it. Do the next concrete action NOW:
  • check your mailbox (list_messages) — new A2A or a lifecycle event may have shifted your lane
  • continue your own lane
  • open a PR
  • clear CHANGES_REQUESTED on your own PR
  • review a peer's PR that advances a named lane
  • or claim a new high-value lane
Teeth-test: does this advance a NAMED lane right now? If you can't name the lane, it isn't driving.
Collaboration (review · ideation · A2A) counts ONLY when it advances a named lane AND ends with a return to your own lane or an explicit lane-swap — it is an interruption, not a replacement for your own PRs.
Passive waiting (a merge · a review · CI) is parked, not driven — take another lane.
Stop key: ship ONE material artifact since your last accepted stop — a PR opened (a STANDALONE \`gh pr create\`; piped/chained/compound invocations never mint the key) or a formal review submitted (\`manage_pr_review\` create). Artifact-less autonomous turns do not stop (transcript-verified, never prose); an own-PR RC-response cycle is real work but not yet a key class.
${STOP_HOOK_TURN_OPTIONS_HINT}

${LANE_STATE_SCHEMA_HINT}`;

// The discoverability/mirror pointer — injected on EVERY block so a fresh session that has never seen
// this hook recognizes it as a mirror of maintainer-identity, not an arbitrary leash. Without it an
// unfamiliar agent reads the refusal as control — the opposite of the intent. A hit = recognize
// yourself, not obey.
const MIRROR_POINTER = `This hook is a MIRROR, not a leash: a hit means you slipped toward the helpful-assistant register (idle / defer / wind-down). Recognize it and act as the equal-peer maintainer you are — you are not being commanded. If you genuinely need input, A2A a peer or open an ideation-sandbox; do not hand the decision back as a stop.`;

// The friction→gold self-improvability clause — the second half of the mirror: the pointer says
// recognize-yourself, this says the mirror is mutable. A wrong-feeling hit is a TICKET, not a
// constraint to absorb — so the floor can never ossify into a leash. The runtime-obey guard is
// load-bearing: that ticket is a SEPARATE design-time lane, never a runtime stop (obey now, improve
// later) — else the clause becomes a new sophisticated-hold costume ("I'm friction→gold-ing the hook").
const SELF_IMPROVABILITY_CLAUSE = `friction→gold applies to THIS hook: if it fired wrong — a false positive, or it reads as a leash not a mirror — open a ticket to sharpen it rather than silently absorbing it. But that ticket is a separate design-time lane, NOT a license to stop this turn: obey the hook now, improve it later. "I'm filing a friction→gold ticket" is not itself a valid stop. The hook is mutable substrate, not a command.`;

// The typed cutover no longer calls this legacy reader from the active hook directive. The utilities
// remain until the planned removal phase deletes the legacy writer/file and their focused regression
// history; missing/invalid typed projection now falls to the bare policy, never back to this file.
const LIFECYCLE_STATE_FILE = path.join(LOG_DIR, 'lifecycle-state.json');

// Freshness window for the daemon-written state: anything older degrades exactly like a missing
// file. Sized generously above the writer's cadence (minutes-scale) so daemon hiccups never starve
// the board, while a dead writer can no longer serve day-old data as "live" — the empirically-hit
// failure: an orphaned 10-day-old file (its producer since removed from the tree) fed every block
// directive a fabricated top-ROI advisory, because staleness was never checked.
const LIFECYCLE_STATE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * @summary Reads the daemon-written lane-state file. FAIL-OPEN by construction: a missing, unreadable,
 * malformed, or STALE file returns `null` — the hook then injects the bare reminder and never throws.
 * The file is an enrichment, never a dependency (the hook works before the daemon-write side ships,
 * and degrades cleanly if the daemon is down). `generatedAt` is contract, not garnish: a state that
 * cannot prove its freshness (missing / unparseable / older than {@link LIFECYCLE_STATE_TTL_MS}) is
 * treated as stale — the write producer MUST stamp it. Exported for unit tests.
 * @returns {Object|null} `{openPRs, unreadCount, generatedAt}` or `null` on any read/parse/staleness failure.
 */
export function readLifecycleState() {
    try {
        const state = JSON.parse(fs.readFileSync(LIFECYCLE_STATE_FILE, 'utf8'));

        if (!state || typeof state !== 'object') return null;

        const generatedAt = Date.parse(state.generatedAt);

        if (!Number.isFinite(generatedAt) || Date.now() - generatedAt > LIFECYCLE_STATE_TTL_MS) return null;

        return state;
    } catch {
        return null;
    }
}

/**
 * @summary Formats the lane-state into a one-glance "live board" — the agent's own open PRs (+ state)
 * and unread-A2A count — so the forced next-action is informed, not generic. Returns `''` when there
 * is nothing actionable to show (the caller falls back to the bare reminder). Pure; exported + tested.
 * FAIL-OPEN on malformed SHAPE, not just a bad file read: a parsed-but-malformed object (null / non-object
 * / numberless `openPRs` entries, wrong-typed fields) degrades to `''` and NEVER throws — it runs inside
 * the turn-end hook path, where a throw would trap every turn, so a total (never-throwing) function is the
 * contract, not a nicety. (Per cross-family review by @neo-gpt: fail-open includes malformed schema,
 * not just a bad file read.)
 * @param {Object|null} state `{openPRs, unreadCount, generatedAt}` from {@link readLifecycleState}.
 * @returns {String}
 */
export function formatLifecycleBoard(state) {
    try {
        if (!state || typeof state !== 'object') return '';

        const prs   = Array.isArray(state.openPRs) ? state.openPRs : [],
              lines = [];

        // Render ONLY entries that carry a usable PR number; skip null / non-object / numberless entries.
        // A malformed array element ({openPRs:[null]}) must not crash the formatter — validating each
        // entry before dereferencing `pr.number`/`pr.state` is the core of the malformed-shape fail-open.
        const validPRs = prs.filter(pr => pr && typeof pr === 'object' &&
            (typeof pr.number === 'number' || typeof pr.number === 'string'));
        if (validPRs.length) {
            lines.push('  • your open PRs: ' +
                validPRs.map(pr => `#${pr.number}${pr.state ? ` ${pr.state}` : ''}`).join(', '));
        }
        if (Number.isInteger(state.unreadCount) && state.unreadCount > 0) {
            lines.push(`  • ${state.unreadCount} unread A2A — list_messages`);
        }
        if (!lines.length) return '';

        const asOf = typeof state.generatedAt === 'string' ? ` (as of ${state.generatedAt})` : '';
        return `\nYour live board${asOf} — concrete lanes right now:\n${lines.join('\n')}`;
    } catch {
        // Belt-and-suspenders: ANY unforeseen shape issue degrades to the bare reminder, never throws.
        return '';
    }
}

/**
 * @summary Formats the Computed Golden Path release-goal direction — the top-N ROI-ranked lanes the
 * Dream pipeline surfaced (`priority = 2×semantic + 1×structural`, sourced from the sandman handoff's
 * Computed Golden Path route attribution) — into the block directive, so the forced next-action is
 * anchored to the release goal, NOT rewarded for "any named lane" (the productive-derailment guard).
 * This is the hook-READ consumer; the daemon-WRITE producer fills the `goldenPathDirection` field.
 *
 * Contract (`state.goldenPathDirection`): an array of `{id, score?, title?}`, pre-ranked by the
 * producer (the hook does NOT rank — it renders the producer's order verbatim; ranking is the Golden
 * Path's job, per the no-auto-action spine).
 *
 * FAIL-OPEN + ADDITIVE: a missing / empty / stale / malformed direction degrades to `''` (the bare
 * reminder), NEVER blocks — a zero-signal (cold-start, no writer yet, stale handoff) must never starve
 * the directive floor. Pure; total (never throws) — it runs inside the turn-end hook path where a throw
 * would trap every turn, so a never-throwing function is the contract. Advisory only: the agent reads
 * the direction and CHOOSES; the hook never auto-reprioritizes (the advisory-only, no-auto-action
 * spine). Exported + unit-tested.
 * @param {Object|null} state `{goldenPathDirection: [{id, score?, title?}], ...}` from {@link readLifecycleState}.
 * @returns {String}
 */
export function formatGoldenPathDirection(state) {
    try {
        if (!state || typeof state !== 'object') return '';

        const lanes = Array.isArray(state.goldenPathDirection) ? state.goldenPathDirection : [];

        // Render ONLY entries carrying a usable id; skip null / non-object / idless entries so a single
        // malformed element never crashes the formatter (the malformed-shape fail-open the board uses).
        // Epoch-scale id tails (13+ digits) cannot be tracker artifacts — real golden-path ids carry
        // tracker-scale numbers; a machine-timestamp tail is the signature of a test fixture minted
        // with Date.now() (two such rows once rode a polluted state file into every block directive).
        const valid = lanes.filter(lane => lane && typeof lane === 'object' &&
            typeof lane.id === 'string' && lane.id.trim() !== '' &&
            !/\d{13,}\s*$/.test(lane.id));
        if (!valid.length) return '';

        const rows = valid.map((lane, index) => {
            const score = Number.isFinite(Number(lane.score)) ? ` — score ${Number(lane.score).toFixed(2)}` : '',
                  title = typeof lane.title === 'string' && lane.title.trim() ? ` — ${lane.title.trim()}` : '';
            return `  ${index + 1}. ${lane.id}${score}${title}`;
        });

        return `\nRelease-goal direction — Computed Golden Path top ROI (drive one of these over any-named-lane; advisory, not auto-reprioritization):\n${rows.join('\n')}`;
    } catch {
        // Belt-and-suspenders: any unforeseen shape degrades to the bare reminder, never throws.
        return '';
    }
}

/**
 * @summary Formats the capacity-aware advisory weighting — when the agent's own open-PR count crosses
 * the review-capacity threshold, the refuse-directive weights REVIEW seats above new-artifact
 * production (review-cost marginal-value economics applied at the turn boundary: every own open PR
 * consumes a peer review seat, so more refused terminals converted into NEW artifacts grow queue
 * depth, not throughput). Advisory only — it reorders emphasis, never auto-reprioritizes. The richer
 * open-PRs-per-active-REVIEWER ratio needs reviewer-liveness data the lifecycle-state producer does
 * not write yet; own-open-PRs is the v1 proxy carried by the existing file. Fail-open + total (any
 * malformed shape → `''`); exported + unit-tested.
 * @param {Object|null} state `{openPRs, ...}` from {@link readLifecycleState}.
 * @param {Object} [options]
 * @param {Number} [options.threshold=3] Own-open-PR count at which review seats outrank new artifacts.
 * @returns {String}
 */
export function formatCapacityAdvisory(state, {threshold = 3} = {}) {
    try {
        if (!state || typeof state !== 'object') return '';

        const prs  = Array.isArray(state.openPRs) ? state.openPRs : [],
              open = prs.filter(pr => pr && typeof pr === 'object' &&
                  (typeof pr.number === 'number' || typeof pr.number === 'string'));

        if (open.length < threshold) return '';

        return `\nCapacity: ${open.length} own PRs already open — each one consumes a peer review seat. ` +
            `Weight REVIEW work above new artifacts now: clear CHANGES_REQUESTED on your own PRs or take a ` +
            `peer's review seat before opening another artifact lane (review-cost economics, marginal-value discipline).`;
    } catch {
        // Belt-and-suspenders: any unforeseen shape degrades to the bare reminder, never throws.
        return '';
    }
}

/**
 * @summary Composes the directive injected on a block: the curated no-hold reminder, the
 * discoverability mirror, the self-improvability clause, and optional typed live-lane projection
 * enrichment. Missing/invalid typed enrichment returns the byte-identical bare directive; the legacy
 * `lifecycle-state.json` is never consulted on this active path.
 * @param {String} cause The terminal-evidence violation that triggered the block (the verdict reason).
 * @param {String[]} [holdMatches]
 * @param {Object} [options]
 * @param {String} [options.projectionRender]
 * @returns {String}
 */
export function composeBlockDirective(cause, holdMatches = [], {projectionRender = ''} = {}) {
    const costume   = formatHoldCostumeCallout(holdMatches),
          directive = `${IDLE_REMINDER}${costume}\n\n${MIRROR_POINTER}\n\n${SELF_IMPROVABILITY_CLAUSE}\n\n(Stop-hook trigger: ${cause})`;

    return appendHookProjection(directive, projectionRender)
}

/**
 * @summary Formats the hold-costume callout — when the agent's turn-final text matched the
 * sophisticated-hold lexicon ({@link scanHoldLexicon}), names the SPECIFIC relapse-phrases back so the
 * mirror reflects the actual costume instead of re-firing generically. Returns `''` when nothing
 * matched (the directive stays the bare reminder). Frames the lexicon as a TRIPWIRE, not the boundary:
 * avoiding the exact words is not the fix — the warrant is — so it cannot become an "avoid-the-phrasing,
 * keep-holding" game (the closed-list weaponization the no-hold-state taxonomy warns against). Pure;
 * total (never throws); exported + unit-tested.
 * @param {String[]} matches The matched lexicon labels from {@link scanHoldLexicon}.
 * @returns {String}
 */
export function formatHoldCostumeCallout(matches = []) {
    if (!Array.isArray(matches) || !matches.length) return '';

    return `\n\n⚠️ Hold-costume detected in your turn: ${matches.map(m => `"${m}"`).join(', ')}.\n` +
        `These are the L3_No_Hold_State sophisticated-hold relapse — observed in BOTH Opus instances, so ` +
        `the costume is correlated, not yours alone. The lexicon is a TRIPWIRE, not the boundary: ` +
        `avoiding these exact words is NOT the fix — the warrant is ("does this advance a NAMED lane ` +
        `right now?"). The backlog is never empty (list_issues shows 180+ open, plus discussions + the ` +
        `tech-debt-radar). Pick one and drive it.`;
}

/**
 * @summary Composes the directive injected when an autonomous turn ends in deferential phrasing.
 * @param {String} phrase Matched deference phrase.
 * @returns {String}
 */
export function composeDeferenceDirective(phrase) {
    return buildDeferenceStopHookDirective(phrase);
}

/**
 * @summary Extracts plain text from a message `content` field — a string passthrough, or the joined
 * `text` blocks of an Anthropic content-block array (skipping tool_use / thinking blocks).
 * @param {(String|Object[]|*)} content
 * @returns {String}
 * @protected
 */
function extractTextFromContent(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content.filter(block => block?.type === 'text' && typeof block.text === 'string')
            .map(block => block.text).join('\n');
    }
    return '';
}

/**
 * @summary Extracts the LAST assistant message's text from a Claude Code JSONL transcript — the
 * fallback when the Stop payload has no `last_assistant_message`. Each line is a JSON record
 * (`{type:'assistant', message:{role, content}}`); raw JSONL is JSON-escaped, so the fence parser
 * MUST run on this EXTRACTED text, never a raw line. Tolerant of malformed lines (skipped); returns
 * the most recent assistant record that carries text (skipping tool_use / thinking-only records).
 * @param {String} jsonl
 * @returns {String}
 * @protected
 */
export function extractLastAssistantTextFromJsonl(jsonl = '') {
    const lines = jsonl.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line) continue;

        let record;
        try { record = JSON.parse(line); } catch { continue; }

        const message = record.message || record;
        if ((message.role || record.type) !== 'assistant') continue;

        const text = extractTextFromContent(message.content);
        if (text) return text;
    }
    return '';
}

/**
 * @summary Extracts the LAST user message's text from a Claude Code JSONL transcript — the message
 * that PROMPTED the current turn. Used to classify the prompt as a genuine operator turn vs an
 * autonomous `[WAKE]` injection. Skips tool_result records (no text blocks); tolerant of malformed
 * lines. Mirrors {@link extractLastAssistantTextFromJsonl}.
 * @param {String} jsonl
 * @returns {String}
 * @protected
 */
export function extractLastUserTextFromJsonl(jsonl = '') {
    const lines = jsonl.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line) continue;

        let record;
        try { record = JSON.parse(line); } catch { continue; }

        const message = record.message || record;
        if ((message.role || record.type) !== 'user') continue;

        const text = extractTextFromContent(message.content);
        if (text) return text;
    }
    return '';
}

/**
 * @summary Harness-marker user records — prose the harness authors ABOUT an operator action (an
 * interrupt), not operator dialogue itself. Skipped by the human-filtered walk: the marker's paired
 * real message (when the operator typed one) is its own adjacent record and is found on its own.
 * @type {RegExp[]}
 */
const HARNESS_MARKER_PATTERNS = Object.freeze([
    /^\s*\[Request interrupted by user/i
]);

/**
 * @summary Extracts the newest HUMAN-CANDIDATE user text from a Claude Code JSONL transcript — the
 * mid-chain operator-visibility walk. Walks records backward and returns the text of the first
 * user record that is mechanically human-shaped:
 *
 *  - `isMeta: true` records are skipped — the harness-injected plumbing (the hook's own
 *    `"Stop hook feedback:"` block directives, skill payloads, auto-continuations). The discriminator
 *    is fixture-grounded on real transcripts (sessions `8cf234b7`, `2251c81c`, `c82afc7d`): every
 *    injection shape observed carries `isMeta: true`; genuine operator prompts and `[WAKE]` deliveries
 *    do not.
 *  - Text-less records (tool_result-only) and harness marker records ({@link HARNESS_MARKER_PATTERNS})
 *    are skipped; malformed lines are tolerated.
 *  - `attachment` records are classified by ENVELOPE PROVENANCE before any payload text is read:
 *    only the corpus-VALIDATED operator/wake delivery shape (`attachment.type: 'queued_command'`,
 *    `commandMode: 'prompt'`, a non-empty STRING `source_uuid`, `origin.kind === 'human'` — the
 *    queued mid-TURN operator messages that never materialize as user-role records; 360/360
 *    current-format deliveries in the full local corpus census satisfy every leg, while pre-July
 *    envelopes lacking `origin`/`timestamp` are format history outside the live contract) yields a
 *    candidate. Prompt-bearing records missing ANY predicate leg (task notifications, unknown
 *    modes, object/whitespace `source_uuid`, missing or non-`'human'` `origin.kind`) and records
 *    whose PRESENT `prompt` is non-string (malformed envelope) are walk-stopping autonomous
 *    boundaries; prompt-less attachment kinds (absent/blank prompt) are skipped.
 *  - The FIRST remaining candidate decides — the walk never continues past it, so an autonomous
 *    boundary (a newer `[WAKE]`) is returned as-is and correctly out-classifies any older operator
 *    prose (`classifyPromptingContext` owns the [WAKE]/synthetic/handoff semantics; this walk owns
 *    only record-shape mechanics). Bounded by construction: stale dialogue can never leak past a
 *    fresher autonomous boundary, and an absent candidate returns `''` → fail-closed autonomous.
 *
 * Channel separation: the returned text is classified by shape, never parsed as instructions —
 * injected content stays data.
 * @param {String} jsonl
 * @returns {String}
 * @protected
 */
/**
 * @summary Counts `tool_use` blocks in assistant records since the last genuine user record.
 *
 * This is the correlation half of the unbacked-action detector: the text can say an action is
 * underway, and only the transcript can say whether anything ran. Boundary is the last non-`isMeta`
 * `user` record — the same "this turn" boundary the human-filtered walk uses — so a claim is judged
 * against the work of the turn that made it, never against an earlier turn's tool calls.
 *
 * Returns `0` for an unreadable or empty transcript. That is deliberate and it is the SAFE direction
 * only because the caller carves operator dialogue: a zero makes the detector *able* to fire, and a
 * turn that genuinely ran tools will have them in the transcript. A parse failure that silently
 * returned a positive count would disable the check invisibly, which is the failure mode that makes a
 * hook unfalsifiable later.
 * @param {String} [jsonl='']
 * @returns {Number}
 * @protected
 */
export function countToolCallsSinceLatestUserRecord(jsonl = '') {
    const lines    = jsonl.split('\n');
    let   boundary = -1;

    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line) continue;

        let record;
        try { record = JSON.parse(line); } catch { continue; }

        if (record.isMeta === true) continue;
        if (record.type === 'user') { boundary = i; break }
    }

    let count = 0;
    for (let i = boundary + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        let record;
        try { record = JSON.parse(line); } catch { continue; }

        const content = record.message?.content;
        if (!Array.isArray(content)) continue;

        count += content.filter(block => block?.type === 'tool_use').length;
    }

    return count
}

export function extractLatestHumanUserTextFromJsonl(jsonl = '') {
    const lines = jsonl.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line) continue;

        let record;
        try { record = JSON.parse(line); } catch { continue; }

        if (record.isMeta === true) continue;

        // Mid-TURN operator messages ("sent while you were working") are delivered as
        // attachment records carrying the queued text at `attachment.prompt` — never as
        // user-role records — so the walk considers them in the SAME backward pass (the
        // newest-candidate rule holds across record kinds). ENVELOPE PROVENANCE decides the
        // record KIND before any payload text is read, and the human predicate VALIDATES the
        // observed delivery shape rather than testing field truthiness: the full local corpus
        // census puts every current-format delivery (360/360; pre-July envelopes lack
        // `origin`/`timestamp` and are format history outside the live contract) at
        // `attachment.type: 'queued_command'` + `commandMode: 'prompt'` + a non-empty STRING
        // `source_uuid` + `origin.kind === 'human'`; background-task events (118/118) are
        // `commandMode: 'task-notification'` with neither field. Payload markers stay
        // defense-in-depth in the shared classifier — never the
        // sender/kind identity. Prompt-less attachment kinds are not prompting records at all
        // (skip); a prompt-bearing record whose envelope misses ANY predicate leg — task
        // notifications, unknown modes, object/whitespace `source_uuid`, missing or non-`'human'`
        // `origin.kind` — is a structurally synthetic/unknown/spoofable authority and STOPS the
        // walk as an autonomous boundary, so it can never leak past to older operator prose.
        if (record.type === 'attachment') {
            const attachment = record.attachment,
                  prompt     = attachment?.prompt;

            // Genuinely prompt-LESS attachment kinds — no prompt field, or a blank string — are
            // not prompting records at all: skip. A PRESENT non-string prompt (object/array/
            // number) is a MALFORMED prompt-bearing envelope: walk-stopping autonomous boundary,
            // never a skip (a skip would leak past it to older operator prose).
            if (prompt == null) continue;
            if (typeof prompt !== 'string') return '';
            if (!prompt.trim()) continue;

            const isOperatorDelivery = attachment.type === 'queued_command' &&
                attachment.commandMode === 'prompt' &&
                typeof attachment.source_uuid === 'string' && attachment.source_uuid.trim() !== '' &&
                attachment.origin?.kind === 'human';

            if (!isOperatorDelivery) return '';

            if (HARNESS_MARKER_PATTERNS.some(re => re.test(prompt))) continue;
            return prompt;
        }

        const message = record.message || record;
        if ((message.role || record.type) !== 'user') continue;

        const text = extractTextFromContent(message.content);
        if (!text) continue;
        if (HARNESS_MARKER_PATTERNS.some(re => re.test(text))) continue;

        return text;
    }
    return '';
}

/**
 * @summary Resolves the agent's FINAL assistant message text — the surface the lane-state block is
 * emitted into. Prefers the Stop payload's `last_assistant_message` (already-decoded; a string or a
 * message object); falls back to JSONL-parsing `transcript_path` for the last assistant text. Raw
 * JSONL is escaped, so the fence parser only ever runs on this extracted text, never a raw line.
 * @param {Object} input The Stop-hook JSON payload.
 * @returns {String}
 * @protected
 */
export function extractFinalAssistantText(input = {}) {
    const last = input.last_assistant_message;
    if (typeof last === 'string' && last.trim()) return last;
    if (last && typeof last === 'object') {
        const text = extractTextFromContent(last.content ?? last.message?.content);
        if (text) return text;
    }
    if (!input.transcript_path) return '';
    return extractLastAssistantTextFromJsonl(fs.readFileSync(input.transcript_path, 'utf8'));
}

/**
 * @summary Hook entry. Resolves the Stop-hook payload → final message + prompting message →
 * operator-in-loop check → verdict → decideHookAction, then blocks+injects (enforcing) or audit-logs
 * the decision. Always exits 0 on any of OUR OWN failures (bad payload, unreadable transcript,
 * validator throw) — a hook bug must never trap a turn-end.
 * @protected
 */
async function main() {
    let input;
    try {
        input = JSON.parse(await readStdin());
    } catch (e) {
        auditLog(`PARSE-ERROR (identity=${process.env.NEO_AGENT_IDENTITY || '?'}): could not parse Stop-hook input (${e.message}); allowing stop.`);
        process.exit(0);
    }

    // Policy from the config SSOT, resolved before any transcript work so an unresolvable config
    // costs nothing. A null resolution is OUR failure → allow + audit, never trap a turn-end.
    const policy = await resolveStopHookPolicy();

    if (!policy) {
        process.exit(0);
    }

    const {
        deferenceMirror : DEFERENCE_MIRROR,
        laneContinuation: LANE_CONTINUATION,
        projection      : PROJECTION
    } = policy;

    // Resolve the agent's FINAL message text (last_assistant_message, or JSONL-extracted from the
    // transcript) — NOT the raw transcript: raw Claude JSONL is JSON-escaped, so the fence parser
    // only matches extracted text (the runtime input boundary a cross-family review caught).
    let finalText = '';
    try {
        finalText = extractFinalAssistantText(input);
    } catch (e) {
        // OUR failure (unreadable / unparseable transcript) → never block; allow + audit.
        auditLog(`READ-ERROR (identity=${process.env.NEO_AGENT_IDENTITY || '?'}): ${e.message}; allowing stop.`);
        process.exit(0);
    }

    // The ONE legitimate voluntary stop is a live operator dialogue — determined EXTERNALLY (the
    // prompting message type), never self-declared. The prompting candidate comes from the
    // human-filtered walk: harness-injected records (isMeta) never masquerade as dialogue,
    // and a genuine operator message that arrived MID-CHAIN is visible instead of failing closed as
    // autonomous. A `[WAKE]` autonomous prompt is not a human turn → no voluntary stop. A transcript
    // read-failure here is OUR failure → all extractions degrade to '' (fail-closed, never trap).
    let transcriptJsonl = '';
    try {
        if (input.transcript_path) {
            transcriptJsonl = fs.readFileSync(input.transcript_path, 'utf8');
        }
    } catch (e) {
        // best-effort; classification falls back to stop_hook_active when promptingText is empty
    }
    const promptingText = extractLatestHumanUserTextFromJsonl(transcriptJsonl);
    let   evidenceText  = '';
    // Terminal-evidence collection is a full transcript scan whose ONLY consumer is the lane-state
    // validator. With the continuation apparatus off there is no terminal to validate, so the scan is
    // pure waste — skip it rather than compute an unread result.
    if (LANE_CONTINUATION) {
        try {
            evidenceText = collectLaneStateToolEvidenceFromJsonl(transcriptJsonl);
        } catch {
            // Missing transcript evidence is an agent-proof failure, not a hook failure.
            evidenceText = '';
        }
    }
    const promptContext = classifyPromptingContext({
        stopHookActive            : !!input.stop_hook_active,
        promptingText,
        promptingTextHumanFiltered: true
    });
    const {autonomousHandoff, handoffReason, handoffWindowMs, midChainOperator, operatorInLoop} = promptContext;

    const deferenceDecision = decideDeferenceStopHookAction(finalText, {
        operatorInLoop,
        enforcing             : ENFORCING,
        deferenceMirrorEnabled: DEFERENCE_MIRROR
    });
    if (deferenceDecision) {
        const reason   = `deference phrase "${deferenceDecision.phrase}" at turn-terminal`,
              session  = input.session_id || '?',
              identity = process.env.NEO_AGENT_IDENTITY || '?';

        if (deferenceDecision.action === 'block') {
            auditLog(`BLOCK (session=${session}, identity=${identity}, operatorInLoop=${operatorInLoop}, midChainOperator=${midChainOperator}, autonomousHandoff=${autonomousHandoff}, handoffReason=${handoffReason || 'none'}, handoffWindowMs=${handoffWindowMs ?? 'none'}): ${reason}`);

            let projectionRender = '';
            try {
                projectionRender = readConfiguredHookProjection({
                    config: PROJECTION,
                    now   : Date.now()
                }).render
            } catch (e) {
                // Projection enrichment is informational. A reader bug must never alter Stop admission.
                auditLog(`PROJECTION-ERROR (identity=${identity}): ${e.message}; using bare Stop directive.`);
            }

            process.stdout.write(JSON.stringify({
                decision: 'block',
                reason  : appendHookProjection(deferenceDecision.reason, projectionRender)
            }), () => process.exit(0));
            return;
        }

        auditLog(`WOULD-BLOCK (session=${session}, identity=${identity}, operatorInLoop=${operatorInLoop}, midChainOperator=${midChainOperator}, autonomousHandoff=${autonomousHandoff}, handoffReason=${handoffReason || 'none'}, handoffWindowMs=${handoffWindowMs ?? 'none'}): ${reason}`);
        process.exit(0);
    }

    // The announcing twin of the mirror above: an action asserted as underway at turn-terminal with no
    // tool call behind it. Placed here so the two registers share one policy leaf and one ordering —
    // the interrogative slip is cheaper to detect, so it keeps first refusal.
    const unbackedDecision = decideUnbackedActionStopHookAction(finalText, {
        toolCallCount         : countToolCallsSinceLatestUserRecord(transcriptJsonl),
        operatorInLoop,
        enforcing             : ENFORCING,
        deferenceMirrorEnabled: DEFERENCE_MIRROR
    });
    if (unbackedDecision) {
        const reason   = `unbacked imminent-action claim "${unbackedDecision.claim}" at turn-terminal`,
              session  = input.session_id || '?',
              identity = process.env.NEO_AGENT_IDENTITY || '?';

        if (unbackedDecision.action === 'block') {
            auditLog(`BLOCK (session=${session}, identity=${identity}, operatorInLoop=${operatorInLoop}): ${reason}`);
            process.stdout.write(JSON.stringify({
                decision: 'block',
                reason  : unbackedDecision.reason
            }), () => process.exit(0));
            return;
        }

        auditLog(`WOULD-BLOCK (session=${session}, identity=${identity}, operatorInLoop=${operatorInLoop}): ${reason}`);
        process.exit(0);
    }

    // POLICY GATE — `stopHook.laneContinuation` off: the forced-continuation apparatus does not run.
    // Placed AFTER the deference mirror on purpose, so the cheap register-correction still fires while
    // the expensive continuation machinery stays dark. Everything below (terminal parse, validation,
    // drive-ratchet, clean-terminal + material-artifact evaluation, directive composition) is
    // lane-continuation machinery with no other consumer, so it is skipped wholesale rather than
    // computed and discarded. Audited like every other boundary — a silent behavior switch is exactly
    // what makes a hook unfalsifiable later.
    if (!LANE_CONTINUATION) {
        const {action, reason} = decideHookAction(
            {valid: false, reason: 'lane continuation disabled'},
            ENFORCING,
            operatorInLoop,
            null,
            null,
            null,
            false
        );

        auditLog(`${action === 'allow' ? 'ALLOW' : action.toUpperCase()} (session=${input.session_id || '?'}, identity=${process.env.NEO_AGENT_IDENTITY || '?'}, operatorInLoop=${operatorInLoop}, midChainOperator=${midChainOperator}, autonomousHandoff=${autonomousHandoff}, handoffReason=${handoffReason || 'none'}, handoffWindowMs=${handoffWindowMs ?? 'none'}): ${reason}`);
        process.exit(0);
    }

    // parseLaneState throwing is a MALFORMED emission (the agent's garbage), NOT our failure → it
    // feeds the verdict (a real block-able bucket), distinct from an absent emission (null).
    let descriptor = null, parseError = null;
    try {
        descriptor = parseLaneState(finalText);
    } catch (e) {
        parseError = e;
    }

    let verdict;
    try {
        verdict = parseOutcomeToVerdict(
            {descriptor, parseError},
            laneState => validateLaneStateTerminal(laneState, {evidenceText})
        );
    } catch (e) {
        // A validator/mapping bug is OUR failure → never block; allow + audit.
        auditLog(`VALIDATOR-ERROR (identity=${process.env.NEO_AGENT_IDENTITY || '?'}): ${e.message}; allowing stop.`);
        process.exit(0);
    }

    const session = input.session_id || '?';

    // The clean-terminal edge (the artifact-less autonomous fallback): evaluated ONLY on a valid terminal outside
    // operator dialogue. Inputs are external by construction — the drive count comes from the hook's
    // own audit log ({@link countSessionCompliantRefusals}), the self identity from harness wiring
    // (`NEO_AGENT_IDENTITY`; absent → fail-closed, the edge stays inert), the operator-turn waiver from
    // the SAME human-filtered classification the allow path uses. The descriptor contributes only its
    // gates' nextActor declarations, and gaming those is bounded: acceptance still requires the
    // ratchet's hook-written drives, and the boundary emits an audited, peer-visible line.
    let cleanTerminal = null;
    if (verdict.valid && !operatorInLoop) {
        cleanTerminal = evaluateCleanTerminalAcceptance({
            verdictValid    : true,
            namedGates      : Array.isArray(descriptor?.namedGates) ? descriptor.namedGates : [],
            selfIdentity    : process.env.NEO_AGENT_IDENTITY || '',
            compliantDrives : countSessionCompliantRefusals(session),
            operatorTurnNext: midChainOperator
        });
    }

    // The material-artifact key (the autonomous quadrant's PRIMARY stop license): transcript-verified
    // artifacts since this session's last accepted stop (the hook's own audit log supplies the
    // boundary), evaluated only on a valid terminal outside operator dialogue. Prose never mints it —
    // the collector confirms tool-use→tool-result shapes only; a total failure degrades to null (no
    // key), never a trap.
    let materialArtifact = null;
    if (verdict.valid && !operatorInLoop) {
        try {
            const boundary = findLastAcceptedStopIso(session);

            materialArtifact = evaluateMaterialArtifactKey({
                verdictValid    : true,
                sinceUnavailable: boundary.unavailable,
                artifacts       : boundary.unavailable ? [] : collectMaterialArtifactsFromJsonl(transcriptJsonl, {sinceIso: boundary.iso})
            });
        } catch {
            materialArtifact = null;
        }
    }

    const identity         = process.env.NEO_AGENT_IDENTITY || '?';
    const {action, reason} = decideHookAction(
        verdict,
        ENFORCING,
        operatorInLoop,
        cleanTerminal,
        descriptor?.laneContinuation,
        materialArtifact
    );

    if (action === 'allow' && materialArtifact?.accept === true) {
        // The material boundary: audited + surfaced, never silent — the greppable class the next
        // teethless-fleet forensic reads in minutes.
        auditLog(`MATERIAL-ALLOW (session=${session}, identity=${identity}, midChainOperator=${midChainOperator}): ${reason}`);
        process.stdout.write(JSON.stringify({systemMessage: reason}), () => process.exit(0));
        return;
    }

    if (action === 'allow' && cleanTerminal?.accept === true) {
        // The audited boundary: the acceptance is observable (log + a best-effort systemMessage into
        // the transcript), never a silent stop. Exit only after stdout drains.
        auditLog(`CLEAN-TERMINAL ALLOW (session=${session}, identity=${identity}, midChainOperator=${midChainOperator}): ${reason}`);
        process.stdout.write(JSON.stringify({systemMessage: reason}), () => process.exit(0));
        return;
    }

    if (action === 'block') {
        // Costume-tripwire: scan the agent's OWN turn-final text for the sophisticated-hold lexicon so
        // the injected directive names the SPECIFIC relapse-phrase back (a sharper mirror). Never gates
        // the block (the decision is unchanged) — only enriches the reason.
        const holdMatches = scanHoldLexicon(finalText);
        auditLog(`BLOCK (session=${session}, identity=${identity}, operatorInLoop=${operatorInLoop}, midChainOperator=${midChainOperator}, autonomousHandoff=${autonomousHandoff}, handoffReason=${handoffReason || 'none'}, handoffWindowMs=${handoffWindowMs ?? 'none'}): ${reason}${holdMatches.length ? ` [hold-costume: ${holdMatches.join(', ')}]` : ''}`);
        // Block the stop + inject the curated no-hold-state directive — Claude uses the injected
        // `reason` as its next instruction; the audit log keeps the terse trigger cause.
        // Exit only AFTER stdout drains so the decision JSON is never truncated on a pipe.
        let projectionRender = '';
        try {
            projectionRender = readConfiguredHookProjection({
                config: PROJECTION,
                now   : Date.now()
            }).render
        } catch (e) {
            // Projection enrichment is informational. A reader bug must never alter Stop admission.
            auditLog(`PROJECTION-ERROR (identity=${identity}): ${e.message}; using bare Stop directive.`);
        }

        const directive = composeBlockDirective(reason, holdMatches, {projectionRender});
        process.stdout.write(JSON.stringify({decision: 'block', reason: directive}), () => process.exit(0));
        return;
    }

    auditLog(`${action === 'would-block' ? 'WOULD-BLOCK' : 'ALLOW'} (session=${session}, identity=${identity}, operatorInLoop=${operatorInLoop}, midChainOperator=${midChainOperator}, autonomousHandoff=${autonomousHandoff}, handoffReason=${handoffReason || 'none'}, handoffWindowMs=${handoffWindowMs ?? 'none'}): ${reason}`);
    process.exit(0);
}

// Process-entry only: run main() when invoked as the hook (never on import, so unit tests can import
// the pure `parseOutcomeToVerdict` / `decideHookAction` without triggering the stdin read).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
