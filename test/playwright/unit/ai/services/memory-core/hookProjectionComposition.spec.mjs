import {setup} from '../../../../setup.mjs';

const appName = 'HookProjectionCompositionTest';

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
 * The REAL lease + REAL transport, composed with no stub between them.
 *
 * This suite exists because its absence hid a defect that both unit suites were green over: the lease
 * called `writeAtomic({channels})` while the transport required `{targetId, channels}`, so the two
 * halves could not compose at all. Each suite supplied its own stub — the lease's ignored its
 * arguments, the transport's was called directly — and neither stub was the other module. Two green
 * suites, zero working publications.
 *
 * The rule this encodes: when module A calls module B, at least one test must let A call the real B.
 * A stub can only ever assert the contract its author believed in.
 */
test.describe('hookProjection — the lease and the transport, actually composed', () => {
    let createHookProjectionTables, acquireProjectionLease, publishProjection, PROJECTION_SCHEMA_VERSION;
    let addProjectionConflictColumn, submitProjectionChannel, makeAtomicProjectionTransport;
    let db;

    const targetId = 'targetabc',
          root     = '/runtime/mc/hook-projections',
          ttl      = 60_000,
          t0       = 1_800_000_000_000;

    const hashToken = raw => `h-${[...String(raw)].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 7).toString(16)}`;

    let minted = 0;

    const mintToken = () => `token-${++minted}`;

    // An fs double that keeps what was written, so the composed payload can be read back.
    //
    // It honours the FULL transport contract including the flush methods. The first version omitted
    // them, and because durability was optional it silently blessed a no-flush downgrade the real fs
    // would never take — a double that under-implements a contract quietly weakens it.
    const makeFs = () => {
        const written = new Map();

        return {
            written,
            mkdirSync    : () => {},
            writeFileSync: (path, body) => written.set(path, body),
            renameSync   : (from, to) => { written.set(to, written.get(from)); written.delete(from) },
            openSync     : () => 1,
            fsyncSync    : () => {},
            closeSync    : () => {},
            unlinkSync   : path => written.delete(path)
        }
    };

    const submit = (channel, watermark, envelope) => submitProjectionChannel({
        db,
        targetId,
        channel,
        envelope,
        sourceWatermark  : watermark,
        capturedAt       : '2026-07-16T12:00:00.000Z',
        expiresAt        : '2026-07-16T12:05:00.000Z',
        now              : '2026-07-16T12:00:00.000Z',
        isTargetAdmitted : () => true,
        mayProduceChannel: () => true
    });

    test.beforeAll(async () => {
        const lease     = await import('../../../../../../ai/services/memory-core/hookProjectionLease.mjs'),
              submitMod = await import('../../../../../../ai/services/memory-core/hookProjectionSubmission.mjs'),
              transport = await import('../../../../../../ai/services/memory-core/hookProjectionTransport.mjs');

        createHookProjectionTables  = lease.createHookProjectionTables;
        acquireProjectionLease      = lease.acquireProjectionLease;
        publishProjection           = lease.publishProjection;
        PROJECTION_SCHEMA_VERSION   = lease.PROJECTION_SCHEMA_VERSION;
        addProjectionConflictColumn = submitMod.addProjectionConflictColumn;
        submitProjectionChannel     = submitMod.submitProjectionChannel;
        makeAtomicProjectionTransport = transport.makeAtomicProjectionTransport;
    });

    test.beforeEach(() => {
        db     = new Database(':memory:');
        minted = 0;
        createHookProjectionTables(db);
        addProjectionConflictColumn(db);
    });

    test.afterEach(() => db?.close());

    test('acquire → submit → publish writes one complete envelope through the REAL transport', () => {
        const
            fs            = makeFs(),
            {writeAtomic} = makeAtomicProjectionTransport({fs, runtimeRoot: root, uniqueSuffix: () => 't1'});

        submit('computed-route', 'w-1', {schemaVersion: 'computed-route.v1', notAuthority: true});
        submit('lifecycle-frontier', 'w-2', {schemaVersion: 'lifecycle-frontier.v1', items: [], notAuthority: true});

        const lease  = acquireProjectionLease({db, targetId, instanceDigest: 'i1', now: t0, leaseTtlMs: ttl, mintToken, hashToken}),
              result = publishProjection({db, targetId, token: lease.token, epoch: lease.epoch, clock: () => t0 + 1, hashToken, writeAtomic});

        expect(result.published).toBe(true);

        // the path is the config root + the target id — NOT the root with a duplicated segment
        const file = `${root}/${targetId}/current.json`;
        expect([...fs.written.keys()]).toEqual([file]);

        const payload = JSON.parse(fs.written.get(file));

        // A reader binds to the contract version and needs epoch/time/watermarks to judge what it holds.
        expect(payload.schemaVersion).toBe(PROJECTION_SCHEMA_VERSION);
        expect(payload.targetId).toBe(targetId);
        expect(payload.fencingEpoch).toBe(lease.epoch);
        expect(payload.publishedAt).toBe(t0 + 1);
        expect(payload.notAuthority).toBe(true);
        expect(payload.sourceWatermarks).toEqual({'computed-route': 'w-1', 'lifecycle-frontier': 'w-2'});
        expect(payload.degradedChannels).toEqual([]);
        expect(payload.channels.map(channel => channel.channel)).toEqual(['computed-route', 'lifecycle-frontier']);
    });

    test('a CONTESTED channel publishes as contested — the conflict survives to the reader', () => {
        const
            fs            = makeFs(),
            {writeAtomic} = makeAtomicProjectionTransport({fs, runtimeRoot: root, uniqueSuffix: () => 't1'});

        submit('lifecycle-frontier', 'w-1', {schemaVersion: 'lifecycle-frontier.v1', items: [], notAuthority: true});
        // same watermark, different payload → source conflict, recorded on the row
        submit('lifecycle-frontier', 'w-1', {schemaVersion: 'lifecycle-frontier.v1', items: [{id: 'x'}], notAuthority: true});

        const lease = acquireProjectionLease({db, targetId, instanceDigest: 'i1', now: t0, leaseTtlMs: ttl, mintToken, hashToken});
        publishProjection({db, targetId, token: lease.token, epoch: lease.epoch, clock: () => t0 + 1, hashToken, writeAtomic});

        const payload = JSON.parse(fs.written.get(`${root}/${targetId}/current.json`));

        // Reading the row and dropping the conflict column would render a disputed watermark as clean —
        // making the whole conflict mechanism inert.
        expect(payload.degradedChannels).toEqual(['lifecycle-frontier']);
        expect(payload.channels[0].conflictReason).toContain('two payloads claim watermark');
    });

    test('a refused publication reaches the transport not at all — no file, no temp debris', () => {
        const
            fs            = makeFs(),
            {writeAtomic} = makeAtomicProjectionTransport({fs, runtimeRoot: root, uniqueSuffix: () => 't1'});

        submit('computed-route', 'w-1', {schemaVersion: 'computed-route.v1', notAuthority: true});

        const first = acquireProjectionLease({db, targetId, instanceDigest: 'i1', now: t0, leaseTtlMs: ttl, mintToken, hashToken});

        // takeover after expiry
        acquireProjectionLease({db, targetId, instanceDigest: 'i2', now: t0 + ttl + 1, leaseTtlMs: ttl, mintToken, hashToken});

        const stale = publishProjection({db, targetId, token: first.token, epoch: first.epoch, clock: () => t0 + ttl + 2, hashToken, writeAtomic});

        expect(stale.published).toBe(false);
        expect(stale.reason).toBe('superseded-epoch');
        expect(fs.written.size).toBe(0);
    });
});
