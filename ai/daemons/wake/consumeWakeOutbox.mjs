/**
 * @module ai/daemons/wake/consumeWakeOutbox
 * @summary Seat-side consumer for the `kimi-pull-bridge` wake outbox: drains the seat's local
 * wake-outbox under the STRICT outbox lock (no TTL reclaim of a live holder, no unlocked
 * fall-through), validates every entry against the CURRENT seat authority before surfacing or
 * acknowledging it, prints each accepted wake digest for the calling agent turn, records a
 * correlated owner-ack receipt per entry, and compacts the file — so a daemon append landing
 * mid-consume is preserved, never erased by a stale snapshot rewrite.
 *
 * Contract:
 * - **One strict lock, both sides.** Read + compact run inside `withOutboxLock(outboxPath)`; the
 *   daemon's append takes the same lock. A live consumer is never reclaimed (no TTL), and a
 *   writer that cannot acquire throws rather than writing unlocked.
 * - **Exact-owner validation.** The wake envelope names the current seat owner
 *   (`{sessionId, pid}`). An entry is accepted only when its `{sessionId, processEpoch}` matches
 *   the envelope's owner exactly and that owner is alive. Anything else — a session mismatch
 *   (queued for a previous TUI session) or a stale epoch (queued for a dead/rotated process) —
 *   is moved to `<outboxPath>.dead.jsonl` with its reason, never printed, never acked.
 * - **Owner-ack.** Each accepted entry appends `{wakeId, sessionId, processEpoch, consumedAt,
 *   pid}` to `<outboxPath>.acks.jsonl` — the receipt correlating the queued tuple to the owner
 *   process that actually consumed the wake.
 * - **Idempotency.** `wakeId` is the daemon's content digest of the logical wake; an entry
 *   already present in the ack ledger is dropped as a duplicate (retry-safe).
 * - **Torn-write tolerance.** A final line that does not parse as JSON is kept untouched for the
 *   next consume; mid-file unparseable lines are kept and counted as corrupt-kept.
 * - **Fail-open.** A missing outbox is a no-op; a missing/stale envelope refuses visibly (the CLI
 *   warns and exits 0 — a poll must never break the seat's cron turn).
 *
 * Usage (the seat's wake-poll cron prompt):
 * `node ai/daemons/wake/consumeWakeOutbox.mjs --outbox ~/.kimi-code/wake-outbox.jsonl`
 */
import fs   from 'node:fs';
import os   from 'node:os';
import path from 'node:path';

import {withOutboxLock} from './outboxLock.mjs';

/**
 * @summary Reads + validates the current seat owner from the wake envelope.
 * @param {String} envelopePath
 * @returns {Promise<{sessionId: String, processEpoch: Number}>}
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

    return {sessionId: envelope.sessionId, processEpoch: envelope.pid}
}

/**
 * @summary Drains the outbox once under the strict lock, validating each entry against the
 * current seat authority before surfacing or acknowledging it.
 * @param {Object}   options
 * @param {String}   options.outboxPath    Absolute outbox path (seat home only).
 * @param {String}  [options.envelopePath] Wake envelope path (default `~/.kimi-code/wake-envelope.json`).
 * @param {String}  [options.ackPath]      Ack ledger path (default `<outboxPath>.acks.jsonl`).
 * @param {String}  [options.deadPath]     Dead-letter path (default `<outboxPath>.dead.jsonl`).
 * @param {Number}  [options.pid]          Consuming process (defaults to the caller's parent).
 * @param {Function}[options.isAlive]      Liveness probe `(pid) => boolean` (injected for specs).
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
    logger       = console
} = {}) {
    if (typeof outboxPath !== 'string' || outboxPath.length === 0) {
        throw new Error('consumeWakeOutbox requires an outboxPath');
    }

    const owner = await readOwnerAuthority(envelopePath);

    if (!isAlive(owner.processEpoch)) {
        throw new Error(`wake envelope at '${envelopePath}' names a dead owner process (pid ${owner.processEpoch}) — the seat rotated; refusing to consume for a stale owner`);
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

            // Exact-owner validation BEFORE output or acknowledgement: the entry must name the
            // current seat owner — anything else is rejected to the dead-letter file with its
            // reason, never printed, never acked.
            if (entry?.sessionId !== owner.sessionId) {
                deadLetters++;
                await fs.promises.appendFile(deadPath, JSON.stringify({wakeId: entry?.wakeId ?? null, reason: 'session-mismatch', entry, deadAt: new Date().toISOString(), byPid: pid}) + '\n', {mode: 0o600});
                continue
            }
            if (entry?.processEpoch !== owner.processEpoch) {
                deadLetters++;
                await fs.promises.appendFile(deadPath, JSON.stringify({wakeId: entry?.wakeId ?? null, reason: 'stale-epoch', entry, deadAt: new Date().toISOString(), byPid: pid}) + '\n', {mode: 0o600});
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
                consumedAt  : new Date().toISOString(),
                pid
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
