import {setup} from '../../../../setup.mjs';

const appName = 'HookProjectionLeaseTest';

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

/**
 * The fencing property, against a real SQLite store rather than a stub — a fake db cannot prove
 * serialization, which is the entire mechanism under test.
 *
 * The rejected-alternative these pin: an atomic rename alone prevents a torn read but NOT a lost
 * update. Two writers can each complete a rename, and the later one silently wins carrying older
 * content. So the assertions target the transaction, not the file.
 */
test.describe('hookProjectionLease — the fenced single-writer gate', () => {
    let createHookProjectionTables, acquireProjectionLease, publishProjection, releaseProjectionLease;
    let db;

    const targetId = 'target-abc',
          ttl      = 60_000,
          t0       = 1_800_000_000_000;

    // A deterministic token source: the fencing property must not depend on randomness to hold.
    // The stub hash deliberately does NOT embed its input — otherwise "the raw token is not stored"
    // would be unfalsifiable, since every hash would trivially contain the token.
    let minted = 0;
    const
        mintToken = () => `token-${++minted}`,
        hashToken = raw => `h-${[...String(raw)].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 7).toString(16)}`;

    const seedChannel = (channel, watermark) => db.prepare(`
        INSERT INTO HookProjectionChannels (target_id, channel, source_watermark, envelope_json, captured_at, expires_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(target_id, channel) DO UPDATE SET
            source_watermark = excluded.source_watermark,
            envelope_json    = excluded.envelope_json
    `).run(targetId, channel, watermark, JSON.stringify({schemaVersion: `${channel}.v1`, notAuthority: true}), '2026-07-16T12:00:00.000Z', '2026-07-16T12:05:00.000Z', '2026-07-16T12:00:00.000Z');

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/memory-core/hookProjectionLease.mjs');
        createHookProjectionTables = mod.createHookProjectionTables;
        acquireProjectionLease     = mod.acquireProjectionLease;
        publishProjection          = mod.publishProjection;
        releaseProjectionLease     = mod.releaseProjectionLease;
    });

    test.beforeEach(() => {
        db     = new Database(':memory:');
        minted = 0;
        createHookProjectionTables(db);
    });

    test.afterEach(() => db?.close());

    test('acquisition succeeds on an unheld target and hands out a monotonic epoch', () => {
        const result = acquireProjectionLease({db, targetId, instanceDigest: 'inst-1', now: t0, leaseTtlMs: ttl, mintToken, hashToken});

        expect(result.acquired).toBe(true);
        expect(result.epoch).toBe(1);
        expect(result.token).toBe('token-1');
        expect(result.expiresAt).toBe(t0 + ttl);

        // Only the HASH is persisted. The lease row is exactly what a competing writer reads, so a raw
        // token in it would let any reader impersonate its holder.
        const row = db.prepare('SELECT holder_token_hash FROM HookProjectionLeases WHERE target_id = ?').get(targetId);
        expect(row.holder_token_hash).toBe(hashToken('token-1'));
        expect(row.holder_token_hash).not.toContain('token-1');
    });

    test('normal contention returns held + retry metadata and performs NO write', () => {
        acquireProjectionLease({db, targetId, instanceDigest: 'inst-1', now: t0, leaseTtlMs: ttl, mintToken, hashToken});

        const
            before = db.prepare('SELECT * FROM HookProjectionLeases WHERE target_id = ?').get(targetId),
            second = acquireProjectionLease({db, targetId, instanceDigest: 'inst-2', now: t0 + 1_000, leaseTtlMs: ttl, mintToken, hashToken}),
            after  = db.prepare('SELECT * FROM HookProjectionLeases WHERE target_id = ?').get(targetId);

        expect(second.acquired).toBe(false);
        expect(second.state).toBe('held');
        expect(second.retryAfterMs).toBe(ttl - 1_000);
        // the loser must not have touched the row — contention is not a write
        expect(after).toEqual(before);
    });

    test('an EXPIRED holder is taken over — a crashed writer never released, so only the clock frees it', () => {
        acquireProjectionLease({db, targetId, instanceDigest: 'inst-1', now: t0, leaseTtlMs: ttl, mintToken, hashToken});

        const takeover = acquireProjectionLease({db, targetId, instanceDigest: 'inst-2', now: t0 + ttl + 1, leaseTtlMs: ttl, mintToken, hashToken});

        expect(takeover.acquired).toBe(true);
        // the epoch moves, so a takeover is always distinguishable from the holder it displaced
        expect(takeover.epoch).toBe(2);
    });

    test('THE FENCING PROPERTY: a stale holder cannot publish after takeover', () => {
        const first = acquireProjectionLease({db, targetId, instanceDigest: 'inst-1', now: t0, leaseTtlMs: ttl, mintToken, hashToken});
        seedChannel('computed-route', 'w-1');

        // inst-1 stalls past its window; inst-2 takes over
        const second = acquireProjectionLease({db, targetId, instanceDigest: 'inst-2', now: t0 + ttl + 1, leaseTtlMs: ttl, mintToken, hashToken});
        expect(second.acquired).toBe(true);

        let writes = 0;

        const stale = publishProjection({
            db, targetId, token: first.token, epoch: first.epoch, now: t0 + ttl + 2, hashToken,
            writeAtomic: () => { writes++ }
        });

        // The decisive assertion: the stale holder's write NEVER HAPPENS. An epoch carried in the
        // payload would have let this write land and merely look wrong to a reader afterwards.
        expect(writes).toBe(0);
        expect(stale.published).toBe(false);
        expect(stale.reason).toBe('superseded-epoch');

        // and the legitimate successor still publishes
        const fresh = publishProjection({
            db, targetId, token: second.token, epoch: second.epoch, now: t0 + ttl + 2, hashToken,
            writeAtomic: () => { writes++ }
        });
        expect(fresh.published).toBe(true);
        expect(writes).toBe(1);
    });

    test('publish is fail-closed on an expired lease and on a foreign token — each names its own reason', () => {
        const lease = acquireProjectionLease({db, targetId, instanceDigest: 'inst-1', now: t0, leaseTtlMs: ttl, mintToken, hashToken});

        let writes = 0;

        const writeAtomic = () => { writes++ };

        const expired = publishProjection({db, targetId, token: lease.token, epoch: lease.epoch, now: t0 + ttl + 1, hashToken, writeAtomic});
        expect(expired.published).toBe(false);
        expect(expired.reason).toBe('lease-expired');

        const foreign = publishProjection({db, targetId, token: 'token-not-mine', epoch: lease.epoch, now: t0 + 1, hashToken, writeAtomic});
        expect(foreign.published).toBe(false);
        expect(foreign.reason).toBe('foreign-token');

        // no fail-closed path may reach the transport
        expect(writes).toBe(0);
    });

    test('publish reads the latest committed channels and hands them over parsed', () => {
        const lease = acquireProjectionLease({db, targetId, instanceDigest: 'inst-1', now: t0, leaseTtlMs: ttl, mintToken, hashToken});
        seedChannel('computed-route', 'w-1');
        seedChannel('lifecycle-frontier', 'w-2');

        let payload = null;

        const result = publishProjection({
            db, targetId, token: lease.token, epoch: lease.epoch, now: t0 + 1, hashToken,
            writeAtomic: written => { payload = written }
        });

        expect(result.published).toBe(true);
        expect(result.channels).toBe(2);
        expect(payload.channels.map(c => c.channel)).toEqual(['computed-route', 'lifecycle-frontier']);
        expect(payload.channels[0].envelope).toEqual({schemaVersion: 'computed-route.v1', notAuthority: true});
        expect(payload.channels[1].sourceWatermark).toBe('w-2');
    });

    test('release is conditional on token AND epoch — a stale holder cannot release its successor', () => {
        const
            first  = acquireProjectionLease({db, targetId, instanceDigest: 'inst-1', now: t0, leaseTtlMs: ttl, mintToken, hashToken}),
            second = acquireProjectionLease({db, targetId, instanceDigest: 'inst-2', now: t0 + ttl + 1, leaseTtlMs: ttl, mintToken, hashToken});

        const staleRelease = releaseProjectionLease({db, targetId, token: first.token, epoch: first.epoch, hashToken});

        expect(staleRelease.released).toBe(false);
        expect(staleRelease.reason).toBe('not-current-holder');
        // the successor still holds it — a stale release must not free another writer's target
        expect(db.prepare('SELECT state FROM HookProjectionLeases WHERE target_id = ?').get(targetId).state).toBe('held');

        expect(releaseProjectionLease({db, targetId, token: second.token, epoch: second.epoch, hashToken}).released).toBe(true);
    });

    test('a released target is immediately re-acquirable, with the epoch still moving forward', () => {
        const first = acquireProjectionLease({db, targetId, instanceDigest: 'inst-1', now: t0, leaseTtlMs: ttl, mintToken, hashToken});
        releaseProjectionLease({db, targetId, token: first.token, epoch: first.epoch, hashToken});

        // an aborted render frees the target rather than parking it until expiry
        const next = acquireProjectionLease({db, targetId, instanceDigest: 'inst-2', now: t0 + 10, leaseTtlMs: ttl, mintToken, hashToken});

        expect(next.acquired).toBe(true);
        expect(next.epoch).toBe(2);
    });

    test('leaseTtlMs has NO default — an un-materialized config leaf fails loud, never a guessed window', () => {
        expect(() => acquireProjectionLease({db, targetId, instanceDigest: 'i', now: t0, leaseTtlMs: undefined, mintToken, hashToken}))
            .toThrow(/leaseTtlMs is required from config/);
        expect(() => acquireProjectionLease({db, targetId, instanceDigest: 'i', now: t0, leaseTtlMs: 0, mintToken, hashToken}))
            .toThrow(/leaseTtlMs is required from config/);
        // and the clock is injected too — no hidden Date.now()
        expect(() => acquireProjectionLease({db, targetId, instanceDigest: 'i', now: undefined, leaseTtlMs: ttl, mintToken, hashToken}))
            .toThrow(/now \(epoch ms\) must be injected/);
    });
});
