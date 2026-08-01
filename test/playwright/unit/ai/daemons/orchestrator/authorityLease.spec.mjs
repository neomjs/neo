import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import os             from 'node:os';
import path           from 'path';
import Neo            from '../../../../../../src/Neo.mjs';
import '../../../../../../src/core/_export.mjs';
import {Orchestrator}           from '../../../../../../ai/daemons/orchestrator/Orchestrator.mjs';
import {
    acquireAuthorityLease,
    AUTHORITY_LEASE_TTL_MS,
    authorityLeaseFilename,
    inspectAuthorityLease
} from '../../../../../../ai/daemons/orchestrator/authorityLease.mjs';
import {FileLeaseHeldError} from '../../../../../../ai/daemons/shared/fileLease.mjs';

/**
 * The authority lease specialization + its orchestrator wiring, falsifier-first.
 *
 * Guard ordering is the load-bearing property: the lease is acquired AFTER the data dir exists and
 * BEFORE the authority receipt is written. A refused boot must leave the plane exactly as it found
 * it — no receipt, no state beyond the pre-existing lease file — because the receipt is a
 * last-writer-wins artifact and writing it is itself the collision this ticket closes.
 *
 * The specialization's refusal message must name the holder, the role, and both entrypoints
 * (AC-1), so an operator reading one line knows who holds the role and which command produced
 * the duplicate.
 */

const
    T0  = Date.parse('2026-07-31T23:00:00.000Z'),
    TTL = AUTHORITY_LEASE_TTL_MS;

function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'neo-authority-lease-'));
}

function orchestratorFor() {
    const logs = [];

    const orchestrator = Object.create(Orchestrator.prototype);
    orchestrator.logs     = logs;
    orchestrator.writeLog = (level, message) => logs.push({level, message});

    return {orchestrator, logs};
}

test.describe('#16230 — authorityLease specialization', () => {
    test('the lease filename is per-role (coexistence is constructive)', () => {
        expect(authorityLeaseFilename('host-edge')).toBe('.authority-lease-host-edge');
        expect(authorityLeaseFilename('container-plane')).toBe('.authority-lease-container-plane');
        expect(AUTHORITY_LEASE_TTL_MS).toBe(60_000);
    });

    test('the descriptor carries pid, owner, profile, startedAt and lastPulse (diagnostics, per the ruling)', () => {
        const dir = tmpDir();

        const handle = acquireAuthorityLease({
            dir,
            profile      : 'container-plane',
            agentIdentity: '@neo-kimi-phoebe',
            pid          : 4242,
            now          : () => T0,
            isAlive      : () => false
        });

        const written = fs.readJsonSync(path.join(dir, '.authority-lease-container-plane'));
        expect(written).toMatchObject({pid: 4242, owner: '@neo-kimi-phoebe', profile: 'container-plane'});
        expect(typeof written.ownerToken).toBe('string');
        expect(written.startedAt).toBe('2026-07-31T23:00:00.000Z');
        expect(written.lastPulse).toBe('2026-07-31T23:00:00.000Z');

        handle.release();
    });

    test('#16283: inspection shares validation, role, and TTL semantics with acquisition', () => {
        const dir       = tmpDir();
        const profile   = 'container-plane';
        const leaseFile = path.join(dir, authorityLeaseFilename(profile));
        const holder    = {
            pid       : 7,
            owner     : 'plane-daemon',
            ownerToken: 'plane-token',
            profile,
            startedAt : new Date(T0).toISOString(),
            lastPulse : new Date(T0).toISOString()
        };

        fs.writeJsonSync(leaseFile, holder);
        expect(inspectAuthorityLease({dir, profile, now: T0 + TTL - 1})).toMatchObject({fresh: true, holder, status: 'fresh'});
        expect(inspectAuthorityLease({dir, profile, now: T0 + TTL})).toMatchObject({fresh: false, holder, status: 'stale'});

        fs.writeJsonSync(leaseFile, {...holder, profile: 'host-edge'});
        expect(inspectAuthorityLease({dir, profile, now: T0})).toMatchObject({fresh: false, status: 'invalid'});
        expect(() => acquireAuthorityLease({dir, profile, pid: 8, now: () => T0 + TTL})).toThrow(FileLeaseHeldError);

        fs.writeJsonSync(leaseFile, {...holder, lastPulse: 'not-a-date'});
        expect(inspectAuthorityLease({dir, profile, now: T0})).toMatchObject({fresh: false, holder: null, status: 'invalid'});

        fs.writeJsonSync(leaseFile, {...holder, lastPulse: new Date(T0 + 1).toISOString()});
        expect(inspectAuthorityLease({dir, profile, now: T0})).toMatchObject({fresh: false, status: 'invalid'});
        expect(() => acquireAuthorityLease({dir, profile, pid: 8, now: () => T0})).toThrow(FileLeaseHeldError);

        fs.writeFileSync(leaseFile, '{corrupt', 'utf8');
        expect(inspectAuthorityLease({dir, profile, now: T0})).toMatchObject({fresh: false, holder: null, status: 'invalid'});

        fs.rmSync(leaseFile);
        expect(inspectAuthorityLease({dir, profile, now: T0})).toMatchObject({fresh: false, holder: null, status: 'invalid'});
    });

    test('the default holder identity is host-qualified, not a bare generic', () => {
        const dir = tmpDir();

        const handle = acquireAuthorityLease({dir, profile: 'host-edge', pid: 4242, now: () => T0, isAlive: () => false});

        const written = fs.readJsonSync(path.join(dir, '.authority-lease-host-edge'));
        expect(written.owner).toMatch(/^orchestrator@.+/);

        handle.release();
    });

    test('corrupt authority state fails CLOSED (unjudgeable is a refusal, never a reclaim)', () => {
        const dir = tmpDir();

        fs.writeFileSync(path.join(dir, '.authority-lease-container-plane'), '{corrupt', 'utf8');

        expect(() => acquireAuthorityLease({dir, profile: 'container-plane', pid: 9999, now: () => T0, isAlive: () => false}))
            .toThrow(FileLeaseHeldError);
    });

    test('an equal numeric pid with a different token still refuses while fresh (cross-namespace collision)', () => {
        const dir = tmpDir();

        const holder = acquireAuthorityLease({dir, profile: 'container-plane', agentIdentity: 'plane-daemon', pid: 7, now: () => T0, isAlive: () => false});

        expect(() => acquireAuthorityLease({dir, profile: 'container-plane', agentIdentity: 'bare-host', pid: 7, now: () => T0, isAlive: () => false}))
            .toThrow(FileLeaseHeldError);

        holder.release();
    });

    test('a fresh same-role holder refuses, naming the holder, the role, and BOTH entrypoints', () => {
        const dir = tmpDir();

        acquireAuthorityLease({dir, profile: 'container-plane', agentIdentity: 'plane-daemon', pid: 7, now: () => T0, isAlive: () => false});

        let caught;
        try {
            acquireAuthorityLease({dir, profile: 'container-plane', agentIdentity: 'bare-host', pid: 9999, now: () => T0, isAlive: () => false});
        } catch (err) {
            caught = err;
        }

        expect(caught).toBeInstanceOf(FileLeaseHeldError);
        expect(caught.message).toContain('pid 7');
        expect(caught.message).toContain('container-plane');
        expect(caught.message).toContain('ai:host-edge');
    });
});

test.describe('#16230 — orchestrator wiring: lease before receipt, refusal is silent-free', () => {
    test('a fresh same-role lease makes the lease seam reject — nothing is written but the pre-existing lease', () => {
        const dataDir        = tmpDir();
        const {orchestrator} = orchestratorFor();
        orchestrator.authorityProfile = 'legacy-mixed';

        // Pre-place the "container's" fresh lease — fresh by TTL even though its pid (7) has no
        // existence in this namespace.
        fs.writeJsonSync(path.join(dataDir, '.authority-lease-legacy-mixed'), {
            pid      : 7, owner: 'plane-daemon', profile: 'legacy-mixed',
            startedAt: new Date(T0).toISOString(), lastPulse: new Date().toISOString()
        });

        expect(() => orchestrator.acquireRoleLease({
            dataDir,
            factory: opts => acquireAuthorityLease({...opts, isAlive: () => false})
        })).toThrow(FileLeaseHeldError);

        // Nothing but the pre-placed lease may exist in the data dir: a refused boot leaves the
        // plane exactly as it found it — no receipt, no PID file, no state.
        expect(fs.readdirSync(dataDir)).toEqual(['.authority-lease-legacy-mixed']);
    });

    test('the lease seam propagates factory failures (sentinel proof)', () => {
        const dataDir        = tmpDir();
        const {orchestrator} = orchestratorFor();
        orchestrator.authorityProfile = 'legacy-mixed';

        const sentinel = new Error('lease-seam-reached');

        expect(() => orchestrator.acquireRoleLease({
            dataDir,
            factory: () => { throw sentinel; }
        })).toThrow(sentinel);
    });

    test('start() claims the lease BEFORE writing the authority receipt (source-order pin)', () => {
        // The full start() is un-runnable on a prototype instance (reactive configs need the
        // constructed singleton), so the ordering is pinned where it lives: in the source.
        const source = fs.readFileSync(
            new URL('../../../../../../ai/daemons/orchestrator/Orchestrator.mjs', import.meta.url),
            'utf8'
        );

        const leaseIndex   = source.indexOf('this.acquireRoleLease({dataDir: this.dataDir');
        const receiptIndex = source.indexOf('this.writeAuthorityReceipt();', leaseIndex);

        expect(leaseIndex, 'the lease seam is missing from start()').toBeGreaterThan(-1);
        expect(receiptIndex, 'the receipt write must follow the lease claim').toBeGreaterThan(leaseIndex);
    });

    test('stop() releases the lease', () => {
        const {orchestrator} = orchestratorFor();

        let released = 0;
        orchestrator.authorityLease = {release: () => { released++; }};

        orchestrator.stop();

        expect(released).toBe(1);
        expect(orchestrator.authorityLease).toBeNull();
    });

    test('a lost lease mid-run routes to the refusal path: ERROR, stop, non-zero exit code — never silent continuation', () => {
        const {orchestrator, logs} = orchestratorFor();

        let released = 0;
        orchestrator.authorityLease = {
            pulse  : () => {
                const err = new Error('lease reclaimed by another live holder');
                err.code  = 'FILE_LEASE_LOST';
                throw err;
            },
            release: () => { released++; }
        };
        orchestrator.isPolling = true;

        const priorExitCode = process.exitCode;
        try {
            orchestrator.pulseAuthorityLease();
        } finally {
            var exitCodeAfter = process.exitCode;
            process.exitCode = priorExitCode;
        }

        expect(logs.some(({level, message}) => level === 'ERROR' && message.includes('lease'))).toBe(true);
        expect(orchestrator.isPolling).toBe(false);
        expect(exitCodeAfter).toBe(1);
    });

    test('a healthy pulse keeps the loop quiet', () => {
        const {orchestrator, logs} = orchestratorFor();

        let pulsed = 0;
        orchestrator.authorityLease = {pulse: () => { pulsed++; return {held: true}; }};

        orchestrator.pulseAuthorityLease();

        expect(pulsed).toBe(1);
        expect(logs.filter(({level}) => level === 'ERROR')).toEqual([]);
    });

    test('a contended pulse DEFERS the sweep — unverified is not held: no stop, no exit code, no lost-path', () => {
        const {orchestrator, logs} = orchestratorFor();

        orchestrator.authorityLease = {pulse: () => ({contended: true, held: false})};
        orchestrator.isPolling      = true;

        const priorExitCode = process.exitCode;
        let exitCodeAfter;

        try {
            expect(orchestrator.pulseAuthorityLease()).toBe('contended');
        } finally {
            exitCodeAfter    = process.exitCode;
            process.exitCode = priorExitCode;
        }

        expect(orchestrator.isPolling).toBe(true);       // deferred, not stopped
        expect(exitCodeAfter).toBe(priorExitCode);        // no fail-stop
        expect(logs.filter(({level}) => level === 'ERROR')).toEqual([]); // no lost-path
        expect(logs.some(({level, message}) => level === 'INFO' && message.includes('contended'))).toBe(true);
    });

    test('a contended poll defers every mutation but PRESERVES the cadence (exactly one next sweep armed)', () => {
        const {orchestrator} = orchestratorFor();

        orchestrator.authorityLease = {pulse: () => ({contended: true, held: false})};
        orchestrator.isPolling      = true;

        // poll()'s next statement after the lease tri-state binds the supervisor — reaching it
        // proves the sweep continued past contention.
        Object.defineProperty(orchestrator, 'processSupervisorService', {
            get() { throw new Error('sweep continued past a contended lease'); }
        });

        orchestrator.poll();

        try {
            expect(orchestrator.pollHandle, 'one contended sweep must not disarm the cadence').not.toBeNull();
        } finally {
            clearTimeout(orchestrator.pollHandle);
            orchestrator.pollHandle = null;
        }

        expect(orchestrator.isPolling).toBe(true);
    });

    test('the boot-identity write is fenced at WRITE time — a loss mid-production voids the write', async () => {
        const dataDir        = tmpDir();
        const {orchestrator} = orchestratorFor();

        // Held: the write lands.
        const written = await orchestrator.writeBootIdentityFactIfHeld({bootId: 'test-boot'}, {dir: dataDir});
        expect(written).toBeTruthy();

        // The paused-continuation case: the latch flips AFTER the invocation (while a producer
        // would still be gathering) — the write must not land.
        const secondDir = tmpDir();
        orchestrator.authorityLeaseLost = true;

        const fenced = await orchestrator.writeBootIdentityFactIfHeld({bootId: 'displaced-boot'}, {dir: secondDir});

        expect(fenced).toBeNull();
        expect(fs.readdirSync(secondDir)).toEqual([]);
    });

    test('a lease lost mid-reprobe ABORTS the unfreeze success pipeline: no ledger event, no tombstone, no "unfrozen" report', async () => {
        const {getFreezeRecord, upsertFreezeRecord}  = await import('../../../../../../ai/services/memory-core/helpers/freezeRecordStore.mjs');
        const {HEAL_LEDGER_DIR_NAME, readHealLedger} = await import('../../../../../../ai/services/memory-core/helpers/healEventLedgerStore.mjs');

        const dataDir        = tmpDir();
        const {orchestrator} = orchestratorFor();

        // A frozen collection due for unfreeze: old freeze, healthy probe.
        await upsertFreezeRecord({dir: path.join(dataDir, 'data-freeze-records'), collectionName: 'c1', faultFingerprint: 'embedder', frozenAt: 1000});

        let unfenceCalls = 0;

        // `dataDir` is a reactive config: an own data property shadows the accessor, which a
        // prototype-only instance has no `#configs` to reach (plain assignment would throw).
        Object.defineProperty(orchestrator, 'dataDir', {value: dataDir});

        orchestrator.authorityProfile            = 'host-edge';
        orchestrator.authorityLeaseLost          = true;
        orchestrator.probeFrozenCollectionHealth = async () => ({dimensionConsistent: true, embedderHealthy: true});
        orchestrator.getStoreFenceOperations     = () => ({unfence: async () => { unfenceCalls++; }});

        const outcomes = await orchestrator.runFreezeReprobeCycleIfActive(2_000_000);

        expect(unfenceCalls).toBe(0);                     // the fence never fired…
        expect(outcomes[0].status).toBe('failed');        // …reported as failed, never as unfrozen
        expect(outcomes[0].unfroze).toBe(false);

        const record = await getFreezeRecord({dir: path.join(dataDir, 'data-freeze-records'), collectionName: 'c1'});
        expect(record.unfrozenAt ?? null).toBeNull();     // no success tombstone

        let events = [];
        try {
            events = (await readHealLedger({dir: path.join(dataDir, HEAL_LEDGER_DIR_NAME)})).events ?? [];
        } catch (err) { /* a missing ledger file is the empty case */ }

        expect(events.filter(event => event.type === 'unfreeze')).toEqual([]); // no false-success event
    });

    test('the deployment snapshot honors shouldWrite at its effect boundary (fenced, never written)', async () => {
        const {DeploymentStateBridgeService} = await import('../../../../../../ai/daemons/orchestrator/services/DeploymentStateBridgeService.mjs');

        const service = Object.create(DeploymentStateBridgeService.prototype);

        service.now             = () => Date.now();
        service.writeInFlight   = false;
        service.lastWriteAt     = 0;
        service.writeLog        = () => {};
        service.collectSnapshot = async () => ({services: []});

        const result = await service.writeSnapshotIfDue({force: true, shouldWrite: () => false});

        expect(result.status).toBe('fenced');
        expect(service.lastWriteAt).toBe(0);
    });

    test('poll() itself aborts before any mutating action when the lease is lost (fencing, not just stopping)', () => {
        const {orchestrator} = orchestratorFor();

        orchestrator.pulseAuthorityLease = () => 'lost'; // a lost lease, already routed

        // poll()'s very next statement binds processSupervisorService.runTask — reaching it
        // proves the sweep continued past a lost lease.
        Object.defineProperty(orchestrator, 'processSupervisorService', {
            get() { throw new Error('poll continued past a lost lease'); }
        });

        expect(() => orchestrator.poll()).not.toThrow();
    });

    test('the daemon boot claims the lease BEFORE enforceSingleton (source-order pin)', () => {
        // enforceSingleton() can SIGTERM whatever holds the PID file, so the lease must bind
        // first — pinned where it lives, since the full boot is a subprocess concern (see the
        // boot falsifier spec).
        const source = fs.readFileSync(
            new URL('../../../../../../ai/daemons/orchestrator/daemon.mjs', import.meta.url),
            'utf8'
        );

        const leaseIndex     = source.indexOf('acquireAuthorityLease({');
        const singletonIndex = source.indexOf('await enforceSingleton();');

        expect(leaseIndex, 'the lease claim is missing from startOrchestrator').toBeGreaterThan(-1);
        expect(singletonIndex, 'enforceSingleton must follow the lease claim').toBeGreaterThan(leaseIndex);
    });
});
