import fs   from 'fs-extra';
import path from 'path';
import Base from '../../../../src/core/Base.mjs';

/**
 * Default activity window (3h) within which any sent-or-received A2A keeps the
 * identity in the `active` set. The substrate cannot depend on session-boundary
 * signals (subscription updatedAt, boot markers) because Neo agent sessions
 * routinely run 10h+ with multiple in-session context-compactions invisible to
 * the orchestrator. A2A activity is the only durable signal.
 * @type {Number}
 */
export const DEFAULT_ACTIVE_WINDOW_MS = 3 * 60 * 60 * 1000;

/**
 * Default idle threshold (15m). No A2A activity for this long → idle (wake
 * candidate). Operator's manual-prompt edge case is handled because received
 * activity at t=0 keeps the identity non-idle through t≈15m.
 * @type {Number}
 */
export const DEFAULT_IDLE_WINDOW_MS = 15 * 60 * 1000;

/**
 * Default location for orchestrator-local backoff state. Sibling to
 * `.neo-ai-data/wake-daemon/heartbeat.alive` and `swarmWakeCooldown` precedent.
 * Backoff state lives in orchestrator-local persisted file, NOT on
 * `WAKE_SUBSCRIPTION` properties (would pollute client-deployment graph
 * substrate), NOT a new graph node type.
 * @type {String}
 */
export const DEFAULT_BACKOFF_STATE_FILE = path.resolve(
    process.cwd(),
    '.neo-ai-data',
    'wake-daemon',
    'backoff.json'
);

/**
 * @summary 3-signal wake-decision substrate for orchestrator-driven harness wakes.
 *
 * Substrate-correct successor to designs that projected wake liveness through
 * Memory Core health checks or harness-side heartbeat workarounds. Implements
 * **Wake = active AND idle AND ready** with each signal derived purely from
 * existing graph activity + orchestrator-local persisted state.
 *
 * **Decision function** (`decideWake`) is pure: takes empirical inputs
 * (current time, recent A2A timestamps, active readiness sentinel, active
 * backoff window) and returns a wake-decision object. The heartbeat service's
 * pulse path gathers the inputs and invokes this
 * function; no graph or filesystem access inside the decision path.
 *
 * **Readiness sentinel parsing** (`parseReadinessSentinel` +
 * `parseActiveReadinessSentinels`) reads structured A2A `task` envelope
 * metadata; subject-only spoofing is rejected.
 *
 * **Backoff state** (instance methods) persists per-identity backoff windows
 * to orchestrator-local file (mirror of `TaskStateService` pattern). Survives
 * orchestrator restart, gracefully degrades on corrupt state, applies TTL
 * expiry on read, isolates per-identity.
 *
 * @class Neo.ai.daemons.services.WakeDecisionService
 * @extends Neo.core.Base
 * @singleton
 */
export class WakeDecisionService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.WakeDecisionService'
         * @protected
         */
        className: 'Neo.ai.daemons.services.WakeDecisionService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * Path to the persisted backoff-state JSON file. Set via `configure()`.
         * @member {String|null} stateFile_=null
         * @protected
         * @reactive
         */
        stateFile_: null,
        /**
         * Per-identity backoff state map. `{[identity]: {expiresAtMs, reason, recordedAtMs}, ...}`.
         * Loaded from `stateFile` at `configure()` time. Mutated via `setBackoffWindow` /
         * `clearBackoffWindow` / `clearExpiredWindows`.
         * @member {Object|null} backoffState_=null
         * @protected
         * @reactive
         */
        backoffState_: null,
        /**
         * Injectable log function for orchestrator-style logging. Defaults to no-op.
         * @member {Function|null} writeLogFn_=null
         * @protected
         * @reactive
         */
        writeLogFn_: null
    }

    /**
     * Pure decision function — `Wake = active AND idle AND ready`.
     *
     * Each signal is independently necessary; dropping any one yields a known
     * pathological case. Returns
     * a structured wake-decision envelope so callers can log specific reasons.
     *
     * @param {Object} input
     * @param {String} input.identity Target agent identity (e.g., `@neo-gpt`). Echoed in result for logging; not used in branch logic.
     * @param {Number} input.currentTimeMs Current time (caller-supplied to keep pure-function determinism).
     * @param {Number[]} [input.recentActivityTimestamps=[]] Millisecond timestamps of A2A activity (sent OR received) within recent window. Caller produces this from `MailboxService.listMessages` filtered to last `activeWindowMs`.
     * @param {Object|null} [input.activeReadinessSentinel=null] Active `[wake-readiness]` sentinel: `{ready, reason, expiresAtMs}` or `null`. Caller obtains via `parseActiveReadinessSentinels`.
     * @param {Object|null} [input.activeBackoffWindow=null] Active backoff window for this identity: `{expiresAtMs, reason}` or `null`. Caller obtains via `getActiveBackoffWindow`.
     * @param {Number} [input.activeWindowMs=DEFAULT_ACTIVE_WINDOW_MS] Duration treated as "active".
     * @param {Number} [input.idleWindowMs=DEFAULT_IDLE_WINDOW_MS] Duration treated as "idle threshold".
     * @returns {{wake: Boolean, reason: String, signals: {active: Boolean, idle: (Boolean|null), ready: (Boolean|null)}}}
     */
    static decideWake({
        identity,
        currentTimeMs,
        recentActivityTimestamps = [],
        activeReadinessSentinel  = null,
        activeBackoffWindow      = null,
        activeWindowMs           = DEFAULT_ACTIVE_WINDOW_MS,
        idleWindowMs             = DEFAULT_IDLE_WINDOW_MS
    } = {}) {
        const active = recentActivityTimestamps.some(ts => currentTimeMs - ts <= activeWindowMs);
        if (!active) {
            return {
                wake   : false,
                reason : 'no-active-signal',
                signals: {active: false, idle: null, ready: null}
            };
        }

        const idle = !recentActivityTimestamps.some(ts => currentTimeMs - ts <= idleWindowMs);
        if (!idle) {
            return {
                wake   : false,
                reason : 'not-idle (recent activity within idleWindow)',
                signals: {active: true, idle: false, ready: null}
            };
        }

        const sentinelBlocks = activeReadinessSentinel?.ready === false &&
                               activeReadinessSentinel?.expiresAtMs > currentTimeMs;
        const backoffBlocks = activeBackoffWindow?.expiresAtMs > currentTimeMs;
        const ready         = !sentinelBlocks && !backoffBlocks;

        if (!ready) {
            const reason = sentinelBlocks
                ? `not-ready (readiness sentinel: ${activeReadinessSentinel.reason || 'no reason given'})`
                : `not-ready (backoff window active: ${activeBackoffWindow.reason || 'no reason given'})`;
            return {
                wake   : false,
                reason,
                signals: {active: true, idle: true, ready: false}
            };
        }

        return {
            wake   : true,
            reason : 'active+idle+ready',
            signals: {active: true, idle: true, ready: true}
        };
    }

    /**
     * Parses a single MESSAGE node's structured `task` envelope for a
     * `[wake-readiness]` sentinel. Returns the sentinel or null.
     *
     * Authority for parsing is the structured `task` envelope, NOT the subject
     * line. Subject + taggedConcepts remain human-visible for mailbox UI but
     * are not parser inputs — subject-only spoofing is rejected (returns null).
     *
     * **Dual-shape support**:
     * - **Raw MESSAGE node** (graph-level read): `{id, properties: {task: {...}, ...}}`
     * - **`MailboxService.listMessages()` summary** (mailbox-API read): `{messageId, task: {...}, ...}`
     *
     * The parser reads from either shape. The heartbeat service's
     * `getReadinessSentinelMessages` helper passes summary objects; direct graph
     * reads pass raw node objects.
     *
     * @param {Object} message Mailbox message — raw node or listMessages summary.
     * @param {Number} currentTimeMs Caller-supplied current time (purity).
     * @returns {{ready: Boolean, reason: String, expiresAtMs: Number, sourceMessageId: String}|null}
     */
    static parseReadinessSentinel(message, currentTimeMs) {
        const task = message?.task || message?.properties?.task;
        if (!task || task.type !== 'wake-readiness') return null;

        if (typeof task.ready !== 'boolean') return null;

        const expiresAtMs = task.expiresAt ? Date.parse(task.expiresAt) : NaN;
        if (!Number.isFinite(expiresAtMs)) return null;

        if (expiresAtMs <= currentTimeMs) return null;

        return {
            ready          : task.ready,
            reason         : typeof task.reason === 'string' ? task.reason : '',
            expiresAtMs,
            sourceMessageId: message.id || message.messageId || message.properties?.messageId || null
        };
    }

    /**
     * Composes the active readiness state from a list of candidate MESSAGE
     * nodes. Most-restrictive-wins on `expiresAt`:
     *
     *   - Filters to non-expired `[wake-readiness]` sentinels via
     *     `parseReadinessSentinel`.
     *   - Among the remaining sentinels: if ANY block (`ready: false`),
     *     return the one with the LATEST `expiresAt` (longest block applies).
     *   - Otherwise (all sentinels say `ready: true`), return the one with
     *     the EARLIEST `expiresAt` (most-restrictive: shortest "ready"
     *     guarantee dominates, defending against author-set + operator-set
     *     conflicts).
     *   - Returns `null` if no active sentinels exist.
     *
     * Operator-set vs self-set sentinels compose by the same rule — author
     * identity is not consulted in the merge.
     *
     * @param {Object[]} messages Candidate mailbox message nodes.
     * @param {Number} currentTimeMs Caller-supplied current time.
     * @returns {Object|null} Active sentinel `{ready, reason, expiresAtMs, sourceMessageId}` or null.
     */
    static parseActiveReadinessSentinels(messages, currentTimeMs) {
        const sentinels = (messages || [])
            .map(m => this.parseReadinessSentinel(m, currentTimeMs))
            .filter(Boolean);

        if (sentinels.length === 0) return null;

        const blocking = sentinels.filter(s => s.ready === false);
        if (blocking.length > 0) {
            return blocking.reduce((latest, current) =>
                current.expiresAtMs > latest.expiresAtMs ? current : latest
            );
        }

        return sentinels.reduce((earliest, current) =>
            current.expiresAtMs < earliest.expiresAtMs ? current : earliest
        );
    }

    /**
     * Configures the service. Required before any backoff-state read/write.
     *
     * @param {Object} options
     * @param {String} [options.stateFile=DEFAULT_BACKOFF_STATE_FILE]
     * @param {Function} [options.writeLogFn] Injectable logger.
     * @returns {void}
     */
    configure(options = {}) {
        this.stateFile    = options.stateFile || DEFAULT_BACKOFF_STATE_FILE;
        this.writeLogFn   = options.writeLogFn || (() => {});
        this.backoffState = this.readState();
    }

    /**
     * Reads persisted backoff state. Corrupt state degrades gracefully to an
     * empty backoff map (NOT a crash-loop). Per Sub-ii AC3.
     * @returns {Object}
     */
    readState() {
        if (!this.stateFile || !fs.existsSync(this.stateFile)) {
            return {};
        }

        try {
            const data = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
            return data && typeof data === 'object' ? data : {};
        } catch (e) {
            this.writeLog('ERROR', `[WakeDecisionService] Failed to read backoff state file ${this.stateFile}: ${e.message}`);
            return {};
        }
    }

    /**
     * Persists the current backoff state envelope to disk.
     * @returns {void}
     */
    writeState() {
        if (!this.stateFile) return;

        try {
            fs.ensureDirSync(path.dirname(this.stateFile));
            fs.writeFileSync(this.stateFile, JSON.stringify(this.backoffState, null, 2), 'utf8');
        } catch (e) {
            this.writeLog('ERROR', `[WakeDecisionService] Failed to write backoff state file ${this.stateFile}: ${e.message}`);
        }
    }

    /**
     * Returns the active backoff window for an identity, or null if none
     * active. Applies TTL expiry on read (expired windows are pruned).
     *
     * @param {String} identity
     * @param {Number} currentTimeMs Caller-supplied (purity at the read boundary).
     * @returns {{expiresAtMs: Number, reason: String, recordedAtMs: Number}|null}
     */
    getActiveBackoffWindow(identity, currentTimeMs) {
        if (!this.backoffState || !this.backoffState[identity]) return null;

        const window = this.backoffState[identity];
        if (window.expiresAtMs <= currentTimeMs) {
            delete this.backoffState[identity];
            this.writeState();
            return null;
        }

        return window;
    }

    /**
     * Records a backoff window for an identity. Replaces any existing window
     * for the same identity (latest-wins; caller is responsible for upgrade
     * semantics like exponential backoff increment).
     *
     * @param {Object} options
     * @param {String} options.identity
     * @param {Number} options.durationMs Window duration from `recordedAtMs`.
     * @param {String} [options.reason=''] Operator-visible reason (e.g., 'rate-limit-exhausted', 'error-streak-3').
     * @param {Number} [options.recordedAtMs=Date.now()] Caller-injectable for tests.
     * @returns {Object} The recorded window.
     */
    setBackoffWindow({identity, durationMs, reason = '', recordedAtMs = Date.now()} = {}) {
        if (!identity) throw new Error('[WakeDecisionService] setBackoffWindow requires identity');
        if (!Number.isFinite(durationMs) || durationMs <= 0) {
            throw new Error('[WakeDecisionService] setBackoffWindow requires positive durationMs');
        }

        const window = {
            expiresAtMs: recordedAtMs + durationMs,
            reason,
            recordedAtMs
        };

        this.backoffState[identity] = window;
        this.writeState();
        return window;
    }

    /**
     * Removes a backoff window for an identity (e.g., operator override clears
     * an error-streak backoff).
     *
     * @param {String} identity
     * @returns {Boolean} True if a window was cleared, false if no window was present.
     */
    clearBackoffWindow(identity) {
        if (!this.backoffState || !this.backoffState[identity]) return false;

        delete this.backoffState[identity];
        this.writeState();
        return true;
    }

    /**
     * Sweeps all expired backoff windows. Returns the count of windows
     * removed. Idempotent; safe to call on every pulse cycle.
     *
     * @param {Number} currentTimeMs
     * @returns {Number}
     */
    clearExpiredWindows(currentTimeMs) {
        if (!this.backoffState) return 0;

        const identities = Object.keys(this.backoffState);
        let   cleared    = 0;

        for (const identity of identities) {
            if (this.backoffState[identity].expiresAtMs <= currentTimeMs) {
                delete this.backoffState[identity];
                cleared++;
            }
        }

        if (cleared > 0) this.writeState();
        return cleared;
    }

    /**
     * Helper to call the injected log function.
     * @param {String} level
     * @param {String} message
     * @returns {void}
     */
    writeLog(level, message) {
        if (this.writeLogFn) {
            this.writeLogFn(level, message);
        }
    }
}

export default Neo.setupClass(WakeDecisionService);
