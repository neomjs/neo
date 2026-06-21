import {test, expect}       from '@playwright/test';
import {createLeaseMonitor} from '../../../../../../../ai/daemons/orchestrator/services/leaseMonitor.mjs';

/**
 * Coverage for the hung-lease watchdog integration (the orchestrator lease-monitor). All I/O is
 * seam-injected. Pins: sustained-idle → release + recorded outcome; the slow-but-progressing guard
 * (Grace's interval-coupling flag); and the fail-SAFE contract (a bad lease-read / cpu-sample never
 * force-releases).
 */
test.describe('ai/daemons/orchestrator/services/leaseMonitor — createLeaseMonitor', () => {
    const leaseOf = (pid, owner = 'kbSync') => ({active: true, lease: {pid, owner}});

    test('a sustained-idle holder → force-released + outcome recorded failed', async () => {
        const released = [], outcomes = [], cpuSeq = [0, 0, 0, 0]; // 4 idle = minConsecutiveIdle default
        let i = 0;
        const monitor = createLeaseMonitor({
            inspectLease    : async () => leaseOf(4242),
            sampleCpuPercent: async () => cpuSeq[i++],
            releaseLease    : async l => released.push(l),
            recordOutcome   : (owner, state, d) => outcomes.push({owner, state, d})
        });
        let last;
        for (let t = 0; t < 4; t++) last = await monitor.tick();
        expect(last.action).toBe('released-hung');
        expect(released).toHaveLength(1);
        expect(outcomes).toHaveLength(1);
        // a hung holder ran-then-stalled → 'failed' (not 'skipped'=never-ran); preserves the typed-outcome separation
        expect(outcomes[0]).toMatchObject({owner: 'kbSync', state: 'failed'});
        expect(outcomes[0].d.reason).toBe('watchdog-released-hung-holder');
        expect(outcomes[0].d.failurePhase).toBe('hung-lease-holder');
    });

    test('a slow-but-progressing holder → NOT released (Grace interval-coupling guard)', async () => {
        const released = [], cpuSeq = [0, 0, 35, 0, 0]; // an active sample within the window
        let i = 0;
        const monitor = createLeaseMonitor({
            inspectLease    : async () => leaseOf(7),
            sampleCpuPercent: async () => cpuSeq[i++],
            releaseLease    : async l => released.push(l),
            recordOutcome   : () => {}
        });
        let last;
        for (let t = 0; t < 5; t++) last = await monitor.tick();
        expect(released).toHaveLength(0);
        expect(last.action).toBe('monitoring');
    });

    test('no active lease → no-op (and resets the window)', async () => {
        const monitor = createLeaseMonitor({
            inspectLease    : async () => ({active: false, lease: null}),
            sampleCpuPercent: async () => 0,
            releaseLease    : async () => { throw new Error('should not release'); },
            recordOutcome   : () => {}
        });
        expect((await monitor.tick()).action).toBe('no-active-lease');
    });

    test('fail-SAFE: a cpu-sample failure never force-releases', async () => {
        const released = [];
        const monitor = createLeaseMonitor({
            inspectLease    : async () => leaseOf(9),
            sampleCpuPercent: async () => { throw new Error('ps failed'); },
            releaseLease    : async l => released.push(l),
            recordOutcome   : () => {}
        });
        expect((await monitor.tick()).action).toBe('sample-failed');
        expect(released).toHaveLength(0);
    });

    test('fail-SAFE: a lease-inspect failure never force-releases', async () => {
        const released = [];
        const monitor = createLeaseMonitor({
            inspectLease    : async () => { throw new Error('read failed'); },
            sampleCpuPercent: async () => 0,
            releaseLease    : async l => released.push(l),
            recordOutcome   : () => {}
        });
        expect((await monitor.tick()).action).toBe('inspect-failed');
        expect(released).toHaveLength(0);
    });

    test('fail-SAFE: a non-finite cpu reading is not treated as idle', async () => {
        const released = [];
        const monitor = createLeaseMonitor({
            inspectLease    : async () => leaseOf(5),
            sampleCpuPercent: async () => NaN,
            releaseLease    : async l => released.push(l),
            recordOutcome   : () => {}
        });
        for (let t = 0; t < 5; t++) await monitor.tick();
        expect(released).toHaveLength(0);
    });

    test('a bad sample RESETS the idle window — 0,0,0,NaN,0 does NOT release (the gap is not bridged)', async () => {
        const released = [], cpuSeq = [0, 0, 0, NaN, 0]; // the NaN must break the consecutive-idle run
        let i = 0;
        const monitor = createLeaseMonitor({
            inspectLease    : async () => leaseOf(11),
            sampleCpuPercent: async () => cpuSeq[i++],
            releaseLease    : async l => released.push(l),
            recordOutcome   : () => {}
        });
        let last;
        for (let t = 0; t < 5; t++) last = await monitor.tick();
        expect(released).toHaveLength(0); // only 1 valid idle sample survives the NaN reset
        expect(last.action).toBe('monitoring');
    });

    test('no-throw contract: a releaseLease exception returns release-failed (never breaks the loop)', async () => {
        const monitor = createLeaseMonitor({
            inspectLease    : async () => leaseOf(13),
            sampleCpuPercent: async () => 0,
            releaseLease    : async () => { throw new Error('release seam failed'); },
            recordOutcome   : () => {}
        });
        let last;
        for (let t = 0; t < 4; t++) last = await monitor.tick(); // resolves, does not throw
        expect(last.action).toBe('release-failed');
    });

    test('no-throw contract: a recordOutcome exception returns release-failed (never breaks the loop)', async () => {
        const monitor = createLeaseMonitor({
            inspectLease    : async () => leaseOf(17),
            sampleCpuPercent: async () => 0,
            releaseLease    : async () => {},
            recordOutcome   : () => { throw new Error('record seam failed'); }
        });
        let last;
        for (let t = 0; t < 4; t++) last = await monitor.tick();
        expect(last.action).toBe('release-failed');
    });
});
