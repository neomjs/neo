#!/usr/bin/env node
/**
 * @module ai/daemons/wake/consumeWakeOutbox
 * @summary Seat-side consumer for the `kimi-pull-bridge` wake outbox: drains the seat's local
 * wake-outbox under the same cross-process append lock the daemon writes with, prints each
 * pending wake digest for the calling agent turn, records an owner-ack receipt per entry, and
 * compacts the file — atomically, so a daemon append landing mid-consume is preserved, never
 * erased by a stale snapshot rewrite.
 *
 * Contract:
 * - **One lock, both sides.** Read + compact run inside `withAppendLock(outboxPath)`; the
 *   daemon's append takes the same lock, so consume and append can never interleave.
 * - **Owner-ack.** Each consumed entry appends `{wakeId, consumedAt, pid}` to
 *   `<outbox>.acks.jsonl` — the receipt that the owner process actually saw the wake.
 * - **Idempotency.** `wakeId` is the daemon's content digest of the logical wake; an entry
 *   already present in the ack ledger is dropped as a duplicate (retry-safe) without being
 *   re-delivered to the agent.
 * - **Torn-write tolerance.** A final line that does not parse as JSON is kept untouched for
 *   the next consume; mid-file unparseable lines are kept and counted as corrupt-kept.
 * - **Fail-open.** Any read/parse problem exits 0 with a note — a poll must never break the
 *   seat's cron turn.
 *
 * Usage (the seat's wake-poll cron prompt):
 * `node ai/daemons/wake/consumeWakeOutbox.mjs --outbox ~/.kimi-code/wake-outbox.jsonl`
 */
import fs   from 'node:fs';
import os   from 'node:os';
import path from 'node:path';

import {withAppendLock} from '../../services/memory-core/helpers/walAppendLock.mjs';

/**
 * @summary Drains the outbox once under the shared append lock.
 * @param {Object}   options
 * @param {String}   options.outboxPath Absolute outbox path (seat home only).
 * @param {String}  [options.ackPath]   Ack ledger path (default `<outboxPath>.acks.jsonl`).
 * @param {Number}  [options.pid]       Consuming process (defaults to the caller's parent).
 * @param {Object}  [options.logger]    Console-compatible sink for digests + the summary line.
 * @returns {Promise<{consumed: Number, duplicates: Number, keptCorrupt: Number, remaining: Number}>}
 */
export async function consumeWakeOutbox({
    outboxPath,
    ackPath = `${outboxPath}.acks.jsonl`,
    pid     = process.ppid,
    logger  = console
} = {}) {
    if (typeof outboxPath !== 'string' || outboxPath.length === 0) {
        throw new Error('consumeWakeOutbox requires an outboxPath');
    }

    let consumed = 0, duplicates = 0, keptCorrupt = 0, remaining = 0;

    await withAppendLock(outboxPath, async () => {
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

        for (const [index, line] of lines.entries()) {
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

            if (entry?.wakeId && ackedIds.has(entry.wakeId)) {
                duplicates++;
                continue
            }

            consumed++;
            ackedIds.add(entry.wakeId);

            logger.log(`[wake-outbox] ${entry.digest ?? JSON.stringify(entry)}`);
            await fs.promises.appendFile(ackPath, JSON.stringify({
                wakeId    : entry.wakeId,
                consumedAt: new Date().toISOString(),
                pid
            }) + '\n', {mode: 0o600});
        }

        remaining = kept.length;

        await fs.promises.writeFile(outboxPath, kept.length ? kept.join('\n') + '\n' : '', {mode: 0o600});
    });

    logger.log(`[wake-outbox] consume complete: consumed=${consumed} duplicates=${duplicates} keptCorrupt=${keptCorrupt} remaining=${remaining}`);

    return {consumed, duplicates, keptCorrupt, remaining}
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
