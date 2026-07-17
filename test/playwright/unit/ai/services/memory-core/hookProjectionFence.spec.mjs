import {setup} from '../../../../setup.mjs';

const appName = 'HookProjectionFenceTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import Database       from 'better-sqlite3';
import fs             from 'fs-extra';
import os             from 'os';
import path           from 'path';

/**
 * The fencing property, demonstrated rather than described.
 *
 * The claim is that no takeover can commit BETWEEN a holder's token revalidation and its resource
 * mutation. Proving it needs a real race: two connections against a file-backed store, with the
 * competing acquisition attempted WHILE the holder's publication transaction is still open.
 *
 * The earlier version of this test could not have shown any of that. It used one `:memory:` connection
 * (which cannot contend with itself) and performed the takeover BEFORE calling the stale holder — so it
 * only ever asserted that an epoch comparison rejects a stale epoch. That is a real property, and it is
 * not this one: an implementation that revalidated first and renamed afterwards would have passed it
 * while leaving the exact window the fence exists to close.
 */
test.describe('hookProjectionLease — the fence, under a real two-connection race', () => {
    let createHookProjectionTables, acquireProjectionLease, publishProjection;
    let dir, dbPath, holder, rival;

    const targetId = 'targetabc',
          ttl      = 60_000,
          t0       = 1_800_000_000_000;

    const hashToken = raw => `h-${[...String(raw)].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 7).toString(16)}`;

    let minted = 0;

    const mintToken = () => `token-${++minted}`;

    test.beforeAll(async () => {
        ({createHookProjectionTables, acquireProjectionLease, publishProjection} =
            await import('../../../../../../ai/services/memory-core/hookProjectionLease.mjs'))
    });

    test.beforeEach(() => {
        // File-backed on purpose: two connections to one `:memory:` db are two DIFFERENT databases, so
        // the contention under test cannot occur there at all.
        dir    = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-fence-'));
        dbPath = path.join(dir, 'fence.db');
        minted = 0;

        holder = new Database(dbPath);
        // timeout 0 so a blocked write reports SQLITE_BUSY immediately instead of waiting the default
        // out — the test asserts the block, and a retry loop would hide it.
        rival  = new Database(dbPath, {timeout: 0});

        createHookProjectionTables(holder);
        holder.prepare(`
            INSERT INTO HookProjectionChannels
                (target_id, channel, source_watermark, envelope_json, captured_at, expires_at, updated_at, conflict_reason)
            VALUES (?, 'computed-route', 'w-1', '{"schemaVersion":"computed-route.v1"}', 'c', 'e', 'u', NULL)
        `).run(targetId);
    });

    test.afterEach(() => {
        holder?.close();
        rival?.close();
        fs.rmSync(dir, {recursive: true, force: true});
    });

    test('a rival CANNOT acquire while the holder\'s publication transaction is open', () => {
        const lease = acquireProjectionLease({db: holder, targetId, instanceDigest: 'i1', now: t0, leaseTtlMs: ttl, mintToken, hashToken});

        let rivalOutcome = 'never-attempted';

        const result = publishProjection({
            db: holder, targetId, token: lease.token, epoch: lease.epoch, clock: () => t0 + 1, consumerBinding: {agentId: '@me'}, hashToken,
            // This runs INSIDE the serialized transaction, at exactly the instant the resource is being
            // mutated — the window a successor would have to win for the fence to be fake.
            writeAtomic: () => {
                try {
                    acquireProjectionLease({db: rival, targetId, instanceDigest: 'i2', now: t0 + ttl + 1, leaseTtlMs: ttl, mintToken, hashToken});
                    rivalOutcome = 'ACQUIRED — the fence does not hold'
                } catch (error) {
                    rivalOutcome = error.code || error.message
                }
            },
            sweepOrphans: () => {}
        });

        expect(result.published).toBe(true);
        // The decisive assertion: even an EXPIRED-lease takeover, which would otherwise succeed, cannot
        // commit while the holder is mid-publication. The transaction is the fence; the epoch only
        // describes it.
        expect(rivalOutcome).toBe('SQLITE_BUSY');
    });

    test('...and the same rival acquires immediately once that transaction commits', () => {
        const lease = acquireProjectionLease({db: holder, targetId, instanceDigest: 'i1', now: t0, leaseTtlMs: ttl, mintToken, hashToken});

        publishProjection({
            db             : holder,
            targetId,
            token          : lease.token,
            epoch          : lease.epoch,
            clock          : () => t0 + 1,
            consumerBinding: {agentId: '@me'},
            hashToken,
            writeAtomic    : () => {},
            sweepOrphans   : () => {}
        });

        // Proves the block above was the transaction and not a permanently wedged store — without this,
        // SQLITE_BUSY could mean the fence works OR that nothing can ever acquire again.
        const takeover = acquireProjectionLease({db: rival, targetId, instanceDigest: 'i2', now: t0 + ttl + 1, leaseTtlMs: ttl, mintToken, hashToken});

        expect(takeover.acquired).toBe(true);
        expect(takeover.epoch).toBe(2);
    });

    test('a rival that DID take over first is refused at revalidation, inside the transaction', () => {
        const first = acquireProjectionLease({db: holder, targetId, instanceDigest: 'i1', now: t0, leaseTtlMs: ttl, mintToken, hashToken});

        // the rival wins the target while the holder is idle, not mid-publish
        const second = acquireProjectionLease({db: rival, targetId, instanceDigest: 'i2', now: t0 + ttl + 1, leaseTtlMs: ttl, mintToken, hashToken});
        expect(second.acquired).toBe(true);

        let writes = 0;

        const stale = publishProjection({
            db             : holder,
            targetId,
            token          : first.token,
            epoch          : first.epoch,
            clock          : () => t0 + ttl + 2,
            consumerBinding: {agentId: '@me'},
            hashToken,
            writeAtomic    : () => { writes++ },
            sweepOrphans   : () => {}
        });

        // the two halves of the fence: blocked while open (above), rejected when superseded (here)
        expect(stale.published).toBe(false);
        expect(stale.reason).toBe('superseded-epoch');
        expect(writes).toBe(0);
    });
});
