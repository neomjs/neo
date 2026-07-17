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

    // What a reader validates itself against before acting on the projection.
    const binding = {agentId: '@neo-opus-ada', harnessType: 'claude-code', instanceKeyDigest: 'inst-1'};

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
            unlinkSync   : path => written.delete(path),
            readdirSync  : () => [...written.keys()].filter(k => k.endsWith('.tmp')).map(k => k.split('/').pop())
        }
    };

    const iso = ms => new Date(ms).toISOString();

    const submit = (channel, watermark, envelope) => submitProjectionChannel({
        db,
        targetId,
        channel,
        envelope,
        sourceWatermark  : watermark,
        capturedAt       : iso(t0),
        expiresAt        : iso(t0 + ttl),
        now              : iso(t0),
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
              result = publishProjection({db, targetId, token: lease.token, epoch: lease.epoch, clock: () => t0 + 1, consumerBinding: binding, hashToken, writeAtomic, sweepOrphans: () => {}});

        expect(result.published).toBe(true);

        // the path is the config root + the target id — NOT the root with a duplicated segment
        const file = `${root}/${targetId}/current.json`;
        expect([...fs.written.keys()]).toEqual([file]);

        const payload = JSON.parse(fs.written.get(file));

        // A reader binds to the contract version and needs epoch/time/watermarks to judge what it holds.
        expect(payload.schemaVersion).toBe(PROJECTION_SCHEMA_VERSION);
        // publication is NESTED per ADR §2.7 — the flat shape my earlier tests blessed was not the contract
        expect(payload.publication).toEqual({
            targetId,
            fencingEpoch      : lease.epoch,
            generatedAt       : t0 + 1,
            producerWatermarks: {'computed-route': 'w-1', 'lifecycle-frontier': 'w-2'}
        });
        expect(payload.consumerBinding).toEqual(binding);
        expect(payload.notAuthority).toBe(true);

        // FIXED SLOTS, not a list: a lifecycle update cannot erase the route and vice versa
        expect(payload.lifecycleActions.status).toBe('fresh');
        expect(payload.lifecycleActions.envelope).toEqual({schemaVersion: 'lifecycle-frontier.v1', items: [], notAuthority: true});
        expect(payload.computedRoute.status).toBe('fresh');
        expect(payload.computedRoute.envelope).toEqual({schemaVersion: 'computed-route.v1', notAuthority: true});
        expect(payload.contextViews).toEqual([]);
        expect(payload.coverage.degradedSources).toEqual([]);
    });

    test('a CONTESTED channel publishes as contested — the conflict survives to the reader', () => {
        const
            fs            = makeFs(),
            {writeAtomic} = makeAtomicProjectionTransport({fs, runtimeRoot: root, uniqueSuffix: () => 't1'});

        submit('lifecycle-frontier', 'w-1', {schemaVersion: 'lifecycle-frontier.v1', items: [], notAuthority: true});
        // same watermark, different payload → source conflict, recorded on the row
        submit('lifecycle-frontier', 'w-1', {schemaVersion: 'lifecycle-frontier.v1', items: [{id: 'x'}], notAuthority: true});

        const lease = acquireProjectionLease({db, targetId, instanceDigest: 'i1', now: t0, leaseTtlMs: ttl, mintToken, hashToken});
        publishProjection({db, targetId, token: lease.token, epoch: lease.epoch, clock: () => t0 + 1, consumerBinding: binding, hashToken, writeAtomic, sweepOrphans: () => {}});

        const payload = JSON.parse(fs.written.get(`${root}/${targetId}/current.json`));

        // Reading the row and dropping the conflict column would render a disputed watermark as clean —
        // making the whole conflict mechanism inert.
        expect(payload.coverage.degradedSources).toEqual(['lifecycle-frontier']);
        expect(payload.lifecycleActions.status).toBe('degraded');
        expect(payload.lifecycleActions.degradedReason).toContain('two payloads claim watermark');
    });

    test('ONE unreadable channel does not deny the others — damage is isolated to its own row', () => {
        const
            fs            = makeFs(),
            {writeAtomic} = makeAtomicProjectionTransport({fs, runtimeRoot: root, uniqueSuffix: () => 't1'});

        submit('computed-route', 'w-1', {schemaVersion: 'computed-route.v1', notAuthority: true});
        submit('lifecycle-frontier', 'w-2', {schemaVersion: 'lifecycle-frontier.v1', items: [], notAuthority: true});

        // A torn row, as a crash or a partial write would leave it.
        db.prepare(`UPDATE HookProjectionChannels SET envelope_json = '{"schemaVersion":' WHERE target_id = ? AND channel = ?`)
            .run(targetId, 'lifecycle-frontier');

        const lease  = acquireProjectionLease({db, targetId, instanceDigest: 'i1', now: t0, leaseTtlMs: ttl, mintToken, hashToken}),
              result = publishProjection({db, targetId, token: lease.token, epoch: lease.epoch, clock: () => t0 + 1, consumerBinding: binding, hashToken, writeAtomic, sweepOrphans: () => {}});

        // A bare JSON.parse in a map let one corrupt envelope abort the whole publication — denying the
        // reader a perfectly good computed-route because a DIFFERENT channel was damaged.
        expect(result.published).toBe(true);

        const payload = JSON.parse(fs.written.get(`${root}/${targetId}/current.json`));

        expect(payload.computedRoute.envelope).toEqual({schemaVersion: 'computed-route.v1', notAuthority: true});
        expect(payload.computedRoute.status).toBe('fresh');

        // the damaged one is listed as degraded and names why — "this is broken" is a different fact
        // from "this does not exist", and only the first tells the reader to wait rather than act
        expect(payload.lifecycleActions.envelope).toBeNull();
        expect(payload.lifecycleActions.status).toBe('degraded');
        expect(payload.lifecycleActions.degradedReason).toContain('unreadable envelope');
        expect(payload.coverage.degradedSources).toEqual(['lifecycle-frontier']);
    });

    test('an EXPIRED channel publishes as stale, not fresh — a stored expiry must be honoured', () => {
        const
            fs            = makeFs(),
            {writeAtomic} = makeAtomicProjectionTransport({fs, runtimeRoot: root, uniqueSuffix: () => 't1'});

        // A producer that stopped an hour ago: its window closed before the publication.
        submitProjectionChannel({
            db,
            targetId,
            channel          : 'lifecycle-frontier',
            envelope         : {schemaVersion: 'lifecycle-frontier.v1', items: [], notAuthority: true},
            sourceWatermark  : 'w-old',
            capturedAt       : iso(t0 - 7_200_000),
            expiresAt        : iso(t0 - 3_600_000),
            now              : iso(t0 - 7_200_000),
            isTargetAdmitted : () => true,
            mayProduceChannel: () => true
        });

        submit('computed-route', 'w-1', {schemaVersion: 'computed-route.v1', notAuthority: true});

        const lease = acquireProjectionLease({db, targetId, instanceDigest: 'i1', now: t0, leaseTtlMs: ttl, mintToken, hashToken});
        publishProjection({db, targetId, token: lease.token, epoch: lease.epoch, clock: () => t0 + 1, consumerBinding: binding, hashToken, writeAtomic, sweepOrphans: () => {}});

        const payload = JSON.parse(fs.written.get(`${root}/${targetId}/current.json`));

        // Recording an expiry and then ignoring it is worse than not recording one: the reader trusts a
        // field the writer never honoured, and acts on a channel whose producer stopped hours ago.
        expect(payload.lifecycleActions.status).toBe('stale');
        expect(payload.lifecycleActions.degradedReason).toContain('expired at');
        expect(payload.coverage.degradedSources).toEqual(['lifecycle-frontier']);
        // ...and the still-live channel is untouched by its neighbour's staleness
        expect(payload.computedRoute.status).toBe('fresh');
    });

    test('a refused publication reaches the transport not at all — no file, no temp debris', () => {
        const
            fs            = makeFs(),
            {writeAtomic} = makeAtomicProjectionTransport({fs, runtimeRoot: root, uniqueSuffix: () => 't1'});

        submit('computed-route', 'w-1', {schemaVersion: 'computed-route.v1', notAuthority: true});

        const first = acquireProjectionLease({db, targetId, instanceDigest: 'i1', now: t0, leaseTtlMs: ttl, mintToken, hashToken});

        // takeover after expiry
        acquireProjectionLease({db, targetId, instanceDigest: 'i2', now: t0 + ttl + 1, leaseTtlMs: ttl, mintToken, hashToken});

        const stale = publishProjection({db, targetId, token: first.token, epoch: first.epoch, clock: () => t0 + ttl + 2, consumerBinding: binding, hashToken, writeAtomic, sweepOrphans: () => {}});

        expect(stale.published).toBe(false);
        expect(stale.reason).toBe('superseded-epoch');
        expect(fs.written.size).toBe(0);
    });
});
