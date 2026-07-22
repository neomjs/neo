/**
 * @module ai/daemons/wake/consumeWakeOutbox
 * @summary Seat-side consumer for the `kimi-pull-bridge` wake outbox: drains the seat's local
 * wake-outbox under the STRICT outbox lock, validates every entry against ALL THREE
 * independently-authoritative owner legs before surfacing or acknowledging it — agent identity,
 * session id, and a reuse-safe process epoch (pid + start time) — and compacts the file, so a
 * daemon append landing mid-consume is preserved, never erased by a stale snapshot rewrite.
 *
 * Contract:
 * - **One strict lock, both sides.** Read + compact run inside `withOutboxLock(outboxPath)`; the
 *   daemon's append takes the same lock. A live consumer is never reclaimed (no TTL), and a
 *   writer that cannot acquire throws rather than writing unlocked.
 * - **Three-leg owner validation.** The wake envelope names the current seat owner
 *   (`{agentIdentity, sessionId, pid, pidStartedAt}`). The owner must be alive AND match its
 *   recorded start time (a pid whose number was reassigned by the OS fails the comparison). Each
 *   entry must match all three legs; the consumer itself must run inside the owner's process
 *   tree (descent from `pid` via `ps`). Anything else — foreign identity, session mismatch,
 *   stale or reused epoch, foreign caller — is rejected: entries go to `<outboxPath>.dead.jsonl`
 *   with their reason; a foreign caller or stale envelope refuses visibly.
 * - **Truthful owner-ack.** Each accepted entry appends `{wakeId, sessionId, processEpoch,
 *   consumedAt}` to `<outboxPath>.acks.jsonl` — the receipt names the validated owner tuple and
 *   nothing else. No arbitrary caller pid is recorded as owner proof.
 * - **Idempotency.** `wakeId` is the daemon's content digest of the logical wake; an entry
 *   already present in the ack ledger is dropped as a duplicate (retry-safe).
 * - **Torn-write tolerance.** A final line that does not parse as JSON is kept untouched for the
 *   next consume; mid-file unparseable lines are kept and counted as corrupt-kept.
 * - **Fail-open.** A missing outbox is a no-op; a missing/stale envelope or a foreign caller
 *   refuses visibly (the CLI warns and exits 0 — a poll must never break the seat's cron turn).
 *
 * Usage (the seat's wake-poll cron prompt):
 * `node ai/daemons/wake/consumeWakeOutbox.mjs --outbox ~/.kimi-code/wake-outbox.jsonl`
 */
import fs          from 'node:fs';
import os          from 'node:os';
import path        from 'node:path';
import {spawnSync} from 'node:child_process';

import {withOutboxLock} from './outboxLock.mjs';

/**
 * @summary Reads + validates the current seat owner from the wake envelope — all three
 * independently-authoritative legs must be present.
 * @param {String} envelopePath
 * @returns {Promise<{agentIdentity: String, sessionId: String, processEpoch: Number, pidStartedAt: String}>}
 */
async function readOwnerAuthority(envelopePath) {
    let envelope;

    try {
        envelope = JSON.parse(await fs.promises.readFile(envelopePath, 'utf8'));
    } catch (error) {
        throw new Error(`consumeWakeOutbox requires a readable wake envelope at '${envelopePath}' (${error.message})`);
    }

    if (typeof envelope?.sessionId !== 'string' || envelope.sessionId.length === 0) {
        throw new Error(`wake envelope at '${envelopePath}' requires 'sessionId' to be a non-empty string`);
    }
    if (!Number.isInteger(envelope?.pid)) {
        throw new Error(`wake envelope at '${envelopePath}' requires an integer 'pid' (owner process epoch)`);
    }
    if (typeof envelope?.pidStartedAt !== 'string' || envelope.pidStartedAt.length === 0) {
        throw new Error(`wake envelope at '${envelopePath}' requires 'pidStartedAt' (reuse-safe owner epoch)`);
    }
    if (typeof envelope?.agentIdentity !== 'string' || envelope.agentIdentity.length === 0) {
        throw new Error(`wake envelope at '${envelopePath}' requires 'agentIdentity' — provision the seat identity and refresh via the SessionStart hook`);
    }

    return {
        agentIdentity: envelope.agentIdentity,
        sessionId    : envelope.sessionId,
        processEpoch : envelope.pid,
        pidStartedAt : envelope.pidStartedAt
    }
}

/**
 * @summary Default `ps lstart` lookup — a process's recorded start time on this host.
 * @param {Number} pid
 * @returns {String|null}
 */
function defaultLstartOf(pid) {
    try {
        const out = spawnSync('ps', ['-p', String(pid), '-o', 'lstart=']).stdout?.toString().trim();
        return out || null
    } catch {
        return null
    }
}

/**
 * @summary Default `ps -o ppid=` lookup for the process-tree descent check.
 * @param {Number} pid
 * @returns {Number|null}
 */
function defaultPpidOf(pid) {
    try {
        const out  = spawnSync('ps', ['-p', String(pid), '-o', 'ppid=']).stdout?.toString().trim();
        const ppid = Number(out);
        return Number.isInteger(ppid) && ppid > 0 ? ppid : null
    } catch {
        return null
    }
}

/**
 * @summary Drains the outbox once under the strict lock, validating every entry against all
 * three owner legs before surfacing or acknowledging it.
 * @param {Object}   options
 * @param {String}   options.outboxPath    Absolute outbox path (seat home only).
 * @param {String}  [options.envelopePath] Wake envelope path (default `~/.kimi-code/wake-envelope.json`).
 * @param {String}  [options.ackPath]      Ack ledger path (default `<outboxPath>.acks.jsonl`).
 * @param {String}  [options.deadPath]     Dead-letter path (default `<outboxPath>.dead.jsonl`).
 * @param {Number}  [options.pid]          Consuming process (defaults to the caller's parent).
 * @param {Function}[options.isAlive]      Liveness probe `(pid) => boolean` (injected for specs).
 * @param {Function}[options.lstartOf]     `(pid) => startTime` lookup (injected for specs).
 * @param {Function}[options.ppidOf]       `(pid) => parentPid` lookup (injected for specs).
 * @param {Object}  [options.logger]       Console-compatible sink for digests + the summary line.
 * @returns {Promise<{consumed: Number, duplicates: Number, deadLetters: Number, keptCorrupt: Number, remaining: Number}>}
 */
export async function consumeWakeOutbox({
    outboxPath,
    envelopePath = path.join(os.homedir(), '.kimi-code', 'wake-envelope.json'),
    ackPath      = `${outboxPath}.acks.jsonl`,
    deadPath     = `${outboxPath}.dead.jsonl`,
    pid          = process.ppid,
    isAlive      = pidToCheck => { try { process.kill(pidToCheck, 0); return true } catch (error) { return error.code === 'EPERM' } },
    lstartOf     = defaultLstartOf,
    ppidOf       = defaultPpidOf,
    logger       = console
} = {}) {
    if (typeof outboxPath !== 'string' || outboxPath.length === 0) {
        throw new Error('consumeWakeOutbox requires an outboxPath');
    }

    const owner = await readOwnerAuthority(envelopePath);

    if (!isAlive(owner.processEpoch)) {
        throw new Error(`wake envelope at '${envelopePath}' names a dead owner process (pid ${owner.processEpoch}) — the seat rotated; refusing to consume for a stale owner`);
    }
    if (lstartOf(owner.processEpoch) !== owner.pidStartedAt) {
        throw new Error(`wake envelope at '${envelopePath}' epoch mismatch for pid ${owner.processEpoch} — a pid-reused owner; refusing to consume for a stale owner`);
    }

    // The consumer must run inside the owner's process tree (cron child of the TUI or its
    // descendants): walk the parent chain; a foreign caller can never authenticate.
    let ancestor = pid, levels = 0;

    while (ancestor && ancestor !== owner.processEpoch && levels < 6) {
        ancestor = ppidOf(ancestor);
        levels++;
    }

    if (ancestor !== owner.processEpoch) {
        throw new Error(`consumer pid ${pid} is not inside the owner process tree (owner pid ${owner.processEpoch}) — refusing to consume as a foreign caller`);
    }

    let consumed = 0, duplicates = 0, deadLetters = 0, keptCorrupt = 0, remaining = 0;

    await withOutboxLock(outboxPath, async () => {
        const raw      = await fs.promises.readFile(outboxPath, 'utf8').catch(() => '');
        const lines    = raw.split('\n').filter(line => line.trim().length > 0);
        const ackedIds = new Set(
            (await fs.promises.readFile(ackPath, 'utf8').catch(() => ''))
                .split('\n')
                .filter(line => line.trim().length > 0)
                .map(line => { try { return JSON.parse(line).wakeId } catch { return null } })
                .filter(Boolean)
        );
        const kept = [];

        const deadLetter = async (entry, reason) => {
            deadLetters++;
            await fs.promises.appendFile(deadPath, JSON.stringify({wakeId: entry?.wakeId ?? null, reason, entry, deadAt: new Date().toISOString(), byPid: pid}) + '\n', {mode: 0o600});
        };

        for (const line of lines) {
            let entry;

            try {
                entry = JSON.parse(line);
            } catch {
                // A torn final line (partial append) or a corrupt mid-file line: keep it for the
                // next pass rather than judging it now.
                kept.push(line);
                keptCorrupt++;
                continue;
            }

            // Three-leg owner validation BEFORE output or acknowledgement — identity, session,
            // and the reuse-safe epoch must all match the current seat authority.
            if (entry?.agentIdentity !== owner.agentIdentity) {
                await deadLetter(entry, 'identity-mismatch');
                continue
            }
            if (entry?.sessionId !== owner.sessionId) {
                await deadLetter(entry, 'session-mismatch');
                continue
            }
            if (entry?.processEpoch !== owner.processEpoch || entry?.pidStartedAt !== owner.pidStartedAt) {
                await deadLetter(entry, 'stale-epoch');
                continue
            }

            if (entry?.wakeId && ackedIds.has(entry.wakeId)) {
                duplicates++;
                continue
            }

            consumed++;
            ackedIds.add(entry.wakeId);

            logger.log(`[wake-outbox] ${entry.digest ?? JSON.stringify(entry)}`);
            await fs.promises.appendFile(ackPath, JSON.stringify({
                wakeId      : entry.wakeId,
                sessionId   : entry.sessionId,
                processEpoch: entry.processEpoch,
                consumedAt  : new Date().toISOString()
            }) + '\n', {mode: 0o600});
        }

        remaining = kept.length;

        await fs.promises.writeFile(outboxPath, kept.length ? kept.join('\n') + '\n' : '', {mode: 0o600});
    });

    logger.log(`[wake-outbox] consume complete: consumed=${consumed} duplicates=${duplicates} deadLetters=${deadLetters} keptCorrupt=${keptCorrupt} remaining=${remaining}`);

    return {consumed, duplicates, deadLetters, keptCorrupt, remaining}
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
    const args       = process.argv.slice(2),
          outboxFlag = args.indexOf('--outbox'),
          outboxPath = outboxFlag >= 0
              ? args[outboxFlag + 1]
              : path.join(os.homedir(), '.kimi-code', 'wake-outbox.jsonl');

    consumeWakeOutbox({outboxPath}).catch(error => {
        // Fail-open: a poll must never break the seat's cron turn.
        console.warn(`[wake-outbox] consume failed softly: ${error.message}`);
        process.exit(0)
    });
}
