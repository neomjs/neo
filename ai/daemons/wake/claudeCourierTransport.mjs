/**
 * @summary Focus-free wake transport for Claude seats: the receiver spools the digest, a
 * long-lived courier session drains the spool and delivers through Claude Code's contracted
 * cross-session messaging (`ListAgents` / `SendMessage`).
 *
 * **Why this transport exists.** The osascript delivery sequence must steal OS focus — activate,
 * focus, keystroke — and focus is a single global resource whose rightful owner is the human at
 * the keyboard. Every such delivery is a bet that the operator is not touching the machine; the
 * receiver log is the record of that bet losing. Worse, the race has a silent branch: keystrokes
 * arriving after an unexpected focus change type one seat's payload into another seat's window
 * while reporting success. This transport touches no window, no clipboard, and no focus, so that
 * entire failure class is structurally absent.
 *
 * **Layered honesty about outcomes.** A successful spool write means *handed to the courier*,
 * not *rendered in the target session*. The adapter therefore marks deliveries with the
 * `courier-spool-accepted` reason so logs can distinguish channel-acceptance from confirmed
 * rendering; the receipt half of this module exists so a later pass can consume the courier's
 * held/expired/refused reports instead of trusting silence. What this layer never does is report
 * success for something that failed loudly here: an unmapped identity, a seat with no live
 * session, or an ambiguous prefix match all return typed failures rather than a quiet
 * best-effort guess.
 *
 * **Routing keys, and why the obvious one is wrong.** Claude Code derives each session's `name`
 * from its working directory's folder name, and every seat clone ends in the same folder name —
 * derived names collide by construction across the fleet, so names are never a routing key. The
 * identity→cwd binding is therefore an explicit table, deliberately refusing to parse a path
 * convention: the fleet's historical layout breaks the tempting rule on its most active seat,
 * and a convention-parser would misroute silently. Session matching against the table is
 * prefix-based, because a live worktree session runs with a cwd inside the seat's clone.
 *
 * @see ai/daemons/wake/localWakeAdapters.mjs — the dispatch seam this transport plugs into
 */

import crypto from 'crypto';
import fs     from 'fs';
import os     from 'os';
import path   from 'path';

import {writeFileAtomicSync} from '../../services/shared/atomicFileWrite.mjs';

/** The adapter name routes select in `harnessTargetMetadata.adapter`. @type {String} */
export const COURIER_ADAPTER = 'claude-courier';

/**
 * Default spool root, beside the receiver's own state directory convention.
 * @param {Function} [homedir=os.homedir]
 * @returns {{outboxDir: String, receiptsDir: String}}
 */
export function defaultCourierDirs(homedir = os.homedir) {
    const root = path.join(homedir(), 'Library/Application Support/Neo/AgentOS/wake/courier');

    return {outboxDir: path.join(root, 'outbox'), receiptsDir: path.join(root, 'receipts')}
}

/**
 * @summary Parses the explicit identity→cwd routing table.
 *
 * The table is data, not convention: every binding is written down by an operator, and anything
 * that cannot be validated exactly is rejected rather than repaired, because a silently dropped
 * binding is a silently misrouted wake waiting to happen.
 *
 * @param {String} raw JSON text of the form `[{"identity":"@seat","cwd":"/abs/path"}]`.
 * @returns {Array<{identity: String, cwd: String}>}
 */
export function parseIdentityCwdMap(raw) {
    let parsed;

    try {
        parsed = JSON.parse(raw)
    } catch (error) {
        throw new Error(`courier map is not valid JSON: ${error.message}`)
    }

    if (!Array.isArray(parsed)) throw new Error('courier map must be a JSON array');

    const seenIds  = new Set();
    const seenCwds = new Set();

    return parsed.map(binding => {
        if (!binding || typeof binding.identity !== 'string' || !binding.identity.startsWith('@')) {
            throw new Error(`courier map identity must be an "@identity" string, got ${JSON.stringify(binding?.identity)}`)
        }

        if (typeof binding.cwd !== 'string' || !path.isAbsolute(binding.cwd)) {
            throw new Error(`courier map cwd for ${binding.identity} must be an absolute path`)
        }

        if (seenIds.has(binding.identity)) throw new Error(`courier map binds ${binding.identity} twice`);
        if (seenCwds.has(binding.cwd)) throw new Error(`courier map binds ${binding.cwd} to a second identity — one seat per clone`);

        seenIds.add(binding.identity);
        seenCwds.add(binding.cwd);

        return {identity: binding.identity, cwd: binding.cwd}
    })
}

/**
 * @summary Reads Claude Code's per-session registry files into normalized rows.
 *
 * Only sessions exposing a messaging socket are returned: a bare session cannot receive, and
 * pretending otherwise would trade a loud gap for a silent one.
 *
 * @param {Object} [options]
 * @param {String} [options.sessionsDir] Defaults to `<home>/.claude/sessions`.
 * @param {Object} [options.fs] Injectable filesystem for hermetic tests.
 * @returns {Array<{pid: Number, cwd: String, name: String, socketPath: String}>}
 */
export function readSessionRegistry({sessionsDir, fs: userFs = fs} = {}) {
    const dir     = sessionsDir || path.join(os.homedir(), '.claude/sessions');
    let   entries = [];

    try {
        entries = userFs.readdirSync(dir)
    } catch {
        return []
    }

    return entries
        .filter(name => name.endsWith('.json'))
        .map(name => {
            try {
                return JSON.parse(userFs.readFileSync(path.join(dir, name), 'utf8'))
            } catch {
                return null
            }
        })
        .filter(row => row
            && Number.isFinite(Number(row.pid)) && Number(row.pid) > 0
            && typeof row.cwd === 'string' && path.isAbsolute(row.cwd)
            && typeof row.messagingSocketPath === 'string' && row.messagingSocketPath)
        .map(row => ({
            pid       : Number(row.pid),
            cwd       : String(row.cwd),
            name      : String(row.name || ''),
            socketPath: String(row.messagingSocketPath)
        }))
}

/**
 * @summary Resolves one wake's addressee to a live session via the explicit table.
 *
 * Prefix matching is deliberate: a worktree session's cwd sits inside the seat's clone, and an
 * exact-match rule would strand it. Ambiguity is reported, never resolved by guessing — two
 * candidate sessions mean the operator gets a typed failure, not a coin flip with someone's
 * coordination traffic.
 *
 * @param {Object} params
 * @param {String} params.identity Target agent identity, e.g. `@neo-opus-grace`.
 * @param {Array<{identity: String, cwd: String}>} params.map Parsed routing table.
 * @param {Array<{pid: Number, cwd: String}>} params.sessions Live registry rows.
 * @returns {Object} Resolution result. `status` is exactly one of `resolved`, `unmapped`,
 *   `no-live-session`, or `ambiguous`; `session` and `mappedCwd` accompany `resolved`,
 *   `mappedCwd` alone accompanies `no-live-session`, and `candidates` accompanies `ambiguous`.
 */
export function resolveSessionForIdentity({identity, map, sessions}) {
    const binding = map.find(entry => entry.identity === identity);

    if (!binding) return {status: 'unmapped'};

    const prefix  = binding.cwd.endsWith(path.sep) ? binding.cwd : binding.cwd + path.sep;
    const matches = sessions.filter(session =>
        session.cwd === binding.cwd || session.cwd.startsWith(prefix)
    );

    if (matches.length === 0) return {status: 'no-live-session', mappedCwd: binding.cwd};

    if (matches.length > 1) {
        // The deepest match wins only while it is unique; a tie at maximum depth is reported,
        // never guessed — two equally deep worktrees mean the table cannot say which seat meant it.
        const maxDepth = Math.max(...matches.map(session => session.cwd.split(path.sep).length));
        const deepest  = matches.filter(session => session.cwd.split(path.sep).length === maxDepth);

        if (deepest.length === 1) {
            return {status: 'resolved', session: deepest[0], mappedCwd: binding.cwd}
        }

        return {status: 'ambiguous', mappedCwd: binding.cwd, candidates: deepest}
    }

    return {status: 'resolved', session: matches[0], mappedCwd: binding.cwd}
}

/**
 * @summary Atomically writes one spool entry for the courier to drain.
 *
 * Write-to-temp plus rename is owned by the shared atomic-write primitive, which owns the unique
 * scratch, the failure cleanup, and the opt-in fsync: the courier never observes a half-written
 * envelope and never needs a lock — presence in the outbox IS the commit.
 *
 * @param {Object} params
 * @param {String} params.outboxDir
 * @param {Object} params.entry Payload persisted verbatim for the courier.
 * @param {String} params.eventId Correlates the receipt with the accepted record.
 * @param {Object} [params.fs] Injectable filesystem for hermetic tests.
 * @param {Function} [params.randomToken] Injectable filename randomness source.
 * @returns {{file: String}}
 */
export function enqueueCourierEntry({outboxDir, entry, eventId, fs: userFs = fs, randomToken = () => crypto.randomBytes(8).toString('hex'), now = Date.now}) {
    userFs.mkdirSync(outboxDir, {recursive: true});

    const file = path.join(outboxDir, `${now()}-${randomToken()}-${eventId.replace(/[^\w.-]/g, '_')}.json`);

    writeFileAtomicSync(file, JSON.stringify(entry, null, 4), {
        encoding: 'utf8',
        fsModule: userFs
    });

    return {file}
}

/**
 * @summary The `claude-courier` adapter: hand one accepted record to the courier, loudly.
 *
 * **Route-owned authority.** The identity→cwd table is read from the subscription's own
 * `adapterConfig.courierIdentityCwdMap` (array or JSON text of one) and pushed through the same
 * strict parser an operator-authored table gets — a production route and a test reach the field
 * through the identical path, so green arms certify inputs production actually supplies.
 *
 * Success carries the `courier-spool-accepted` reason — channel acceptance, not rendered-in-
 * session confirmation. Every resolution failure carries a typed reason an operator can act on
 * without reading this file.
 *
 * @param {Object} params
 * @param {Object} params.digest Formatted wake digest (persisted verbatim).
 * @param {Object} params.effects Injectable host effects; recognized keys: `fs`, `homedir`,
 *   `courierDirs`, `sessionRegistry`.
 * @param {Object} params.meta Route harnessTargetMetadata (unused today, reserved).
 * @param {Object} params.record Durable receiver record; `route.adapterConfig.courierIdentityCwdMap`
 *   is the map authority.
 * @returns {Promise<{outcome: String, outcomeReason: String}>}
 */
export async function deliverClaudeCourier({digest, effects, meta, record}) {
    const deps = {
        fs             ,
        homedir        : os.homedir,
        ...effects
    };

    const identity = record?.route?.agentIdentity || record?.envelope?.identity;

    if (!identity) {
        return {outcome: 'failed', outcomeReason: 'courier-target-identity-missing'}
    }

    const rawMap = record?.route?.adapterConfig?.courierIdentityCwdMap;

    if (!rawMap) {
        return {outcome: 'failed', outcomeReason: 'courier-map-missing'}
    }

    let map;

    try {
        map = parseIdentityCwdMap(typeof rawMap === 'string' ? rawMap : JSON.stringify(rawMap));
    } catch (error) {
        return {outcome: 'failed', outcomeReason: `courier-map-invalid:${error.message}`}
    }

    const sessions = Array.isArray(deps.sessionRegistry)
        ? deps.sessionRegistry
        : readSessionRegistry({fs: deps.fs, sessionsDir: path.join(deps.homedir(), '.claude/sessions')});

    const resolution = resolveSessionForIdentity({identity, map, sessions});

    if (resolution.status === 'unmapped') {
        return {outcome: 'failed', outcomeReason: `courier-unmapped-identity:${identity}`}
    }

    if (resolution.status === 'no-live-session') {
        return {outcome: 'failed', outcomeReason: `courier-no-live-session:${identity}`}
    }

    if (resolution.status === 'ambiguous') {
        return {
            outcome      : 'failed',
            outcomeReason: `courier-ambiguous-session:${identity}:${resolution.candidates.map(candidate => candidate.pid).join('+')}`
        }
    }

    const dirs    = deps.courierDirs || defaultCourierDirs(deps.homedir);
    const eventId = record?.eventId || record?.recordKey || `unkeyed-${Date.now()}`;

    enqueueCourierEntry({
        outboxDir: dirs.outboxDir,
        eventId,
        fs       : deps.fs,
        entry    : {
            schemaVersion : '1.0',
            eventId,
            subscriptionId: record?.subscriptionId || null,
            targetIdentity: identity,
            targetPid     : resolution.session.pid,
            targetSocket  : resolution.session.socketPath,
            subject       : record?.envelope?.payload?.latestMessage?.subject || '',
            digest,
            enqueuedAt    : new Date().toISOString()
        }
    });

    return {outcome: 'delivered', outcomeReason: 'courier-spool-accepted'}
}

/**
 * @summary Lists the spool entries awaiting a courier pass, oldest first.
 *
 * Listing does not claim anything: an entry stays in the outbox until `completeOutboxEntry`
 * removes it after the SendMessage outcome is known, so a courier that dies mid-pass re-drains
 * the same entries rather than losing them.
 *
 * @param {Object} params
 * @param {String} params.outboxDir
 * @param {Object} [params.fs] Injectable filesystem for hermetic tests.
 * @returns {Array<{file: String, entry: Object}>}
 */
export function listOutboxEntries({outboxDir, fs: userFs = fs}) {
    let names = [];

    try {
        names = userFs.readdirSync(outboxDir)
    } catch {
        return []
    }

    return names
        .filter(name => name.endsWith('.json'))
        .sort()
        .map(name => {
            try {
                return {file: path.join(outboxDir, name), entry: JSON.parse(userFs.readFileSync(path.join(outboxDir, name), 'utf8'))}
            } catch {
                return null
            }
        })
        .filter(Boolean)
}

/**
 * @summary Removes one fully handled outbox entry.
 * @param {Object} params
 * @param {String} params.file Absolute entry path returned by {@link listOutboxEntries}.
 * @param {Object} [params.fs] Injectable filesystem for hermetic tests.
 */
export function completeOutboxEntry({file, fs: userFs = fs}) {
    userFs.rmSync(file, {force: true})
}

/**
 * The outcomes a courier may report. Anything else is a programming error at the call site,
 * not data to persist.
 * @type {String[]}
 */
export const RECEIPT_OUTCOMES = ['delivered', 'held', 'expired', 'refused', 'error'];

/**
 * @summary Persists the courier's latest outcome for one event — the proof channel.
 *
 * Claude Code reports held / expired / refused outcomes back to the SENDER; the courier records
 * them here so delivery is observable end to end instead of trusted on silence. The envelope is
 * a **replaceable latest-outcome** record: a courier that first reports `held` and later
 * `delivered` overwrites the file, because the reader's question is "what happened LAST", and
 * the full history stays in the courier's own transcript. One file per sanitized event id keeps
 * correlation trivial; the schema version travels inside so a consumer can reject futures
 * instead of misreading them.
 *
 * @param {Object} params
 * @param {String} params.receiptsDir
 * @param {String} params.eventId Correlated with the spool entry's event id; reduced to a
 *   path-safe segment so the receipt can never land outside `receiptsDir`.
 * @param {String} params.outcome One of {@link RECEIPT_OUTCOMES}.
 * @param {String} [params.detail] Verbatim report or error text, for triage without a session.
 * @param {Object} [params.fs] Injectable filesystem for hermetic tests.
 * @returns {{file: String}}
 */
export function writeCourierReceipt({receiptsDir, eventId, outcome, detail = '', fs: userFs = fs}) {
    if (!RECEIPT_OUTCOMES.includes(outcome)) {
        throw new Error(`courier receipt outcome must be one of ${RECEIPT_OUTCOMES.join(' / ')}, got ${JSON.stringify(outcome)}`)
    }

    const safeId = String(eventId).replace(/[^\w.-]/g, '_');

    if (!safeId || safeId.startsWith('.')) {
        throw new Error(`courier receipt eventId must reduce to a non-empty path-safe segment, got ${JSON.stringify(eventId)}`)
    }

    userFs.mkdirSync(receiptsDir, {recursive: true});

    const file = path.join(receiptsDir, `${safeId}.json`);

    writeFileAtomicSync(file, JSON.stringify({
        schemaVersion: '1.0',
        eventId,
        outcome,
        detail: String(detail).slice(0, 2000),
        at    : new Date().toISOString()
    }, null, 4), {
        encoding: 'utf8',
        fsModule: userFs
    });

    return {file}
}
