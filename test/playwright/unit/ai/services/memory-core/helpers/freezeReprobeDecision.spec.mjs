import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import {
    decideFreezeReprobe,
    DEFAULT_REPROBE_BOUNDS,
    FREEZE_REPROBE_STATUSES
} from '../../../../../../../ai/services/memory-core/helpers/freezeReprobeDecision.mjs';

const NOW    = 1_000_000_000_000;
const record = (overrides = {}) => ({collectionName: 'neo-native-graph', frozenAt: 0, faultFingerprint: 'fp', unfreezeAttempts: 0, lastProbeAt: -Infinity, ...overrides});
const CLEAR  = {embedderHealthy: true,  dimensionConsistent: true};

test.describe('decideFreezeReprobe — fail-closed-to-frozen guards', () => {
    test('a missing freezeRecord stays frozen (unsafe-input)', () => {
        expect(decideFreezeReprobe({freezeRecord: null, probe: CLEAR, now: NOW}))
            .toMatchObject({unfreeze: false, status: 'unsafe-input'});
    });

    test('a record without a collectionName stays frozen', () => {
        expect(decideFreezeReprobe({freezeRecord: {unfreezeAttempts: 0}, probe: CLEAR, now: NOW}))
            .toMatchObject({unfreeze: false, status: 'unsafe-input'});
    });

    test('a non-finite now stays frozen (no clock → no unfreeze)', () => {
        expect(decideFreezeReprobe({freezeRecord: record(), probe: CLEAR, now: undefined}))
            .toMatchObject({unfreeze: false, status: 'unsafe-input'});
    });

    test('non-finite bounds stay frozen (a broken bound cannot disable the gate)', () => {
        expect(decideFreezeReprobe({freezeRecord: record(), probe: CLEAR, now: NOW, bounds: {minReprobeIntervalMs: NaN}}))
            .toMatchObject({unfreeze: false, status: 'unsafe-input'});
    });

    test('every status is in the exported vocabulary', () => {
        expect(FREEZE_REPROBE_STATUSES).toContain('unfreeze');
        expect(FREEZE_REPROBE_STATUSES).toContain('contained');
    });
});

test.describe('decideFreezeReprobe — unfreeze on a cleared fault', () => {
    test('fault cleared + past back-off + under cap → unfreeze + re-heal', () => {
        const decision = decideFreezeReprobe({freezeRecord: record({lastProbeAt: -Infinity}), probe: CLEAR, now: NOW});
        expect(decision).toMatchObject({unfreeze: true, status: 'unfreeze'});
    });

    test('the very first probe (no prior lastProbeAt) is not deferred', () => {
        const decision = decideFreezeReprobe({freezeRecord: record({lastProbeAt: -Infinity}), probe: CLEAR, now: NOW});
        expect(decision.status).toBe('unfreeze');
    });
});

test.describe('decideFreezeReprobe — stay frozen on a present / inconclusive fault', () => {
    test('embedder still unhealthy → stay frozen', () => {
        expect(decideFreezeReprobe({freezeRecord: record(), probe: {embedderHealthy: false, dimensionConsistent: true}, now: NOW}))
            .toMatchObject({unfreeze: false, status: 'stay-frozen'});
    });

    test('dimensions still inconsistent → stay frozen', () => {
        expect(decideFreezeReprobe({freezeRecord: record(), probe: {embedderHealthy: true, dimensionConsistent: false}, now: NOW}))
            .toMatchObject({unfreeze: false, status: 'stay-frozen'});
    });

    test('a missing / partial probe is inconclusive → stay frozen (fail closed)', () => {
        expect(decideFreezeReprobe({freezeRecord: record(), probe: undefined, now: NOW}))
            .toMatchObject({unfreeze: false, status: 'stay-frozen'});
        expect(decideFreezeReprobe({freezeRecord: record(), probe: {embedderHealthy: true}, now: NOW}))
            .toMatchObject({unfreeze: false, status: 'stay-frozen'});
    });
});

test.describe('decideFreezeReprobe — anti-thrash back-off + cap', () => {
    test('within the re-probe interval → defer (no re-probe this tick)', () => {
        const decision = decideFreezeReprobe({
            freezeRecord: record({unfreezeAttempts: 0, lastProbeAt: NOW - 1000}), // 1s ago, < 10min base
            probe       : CLEAR,
            now         : NOW
        });
        expect(decision).toMatchObject({unfreeze: false, status: 'defer'});
    });

    test('past the re-probe interval → assesses the probe (not deferred)', () => {
        const decision = decideFreezeReprobe({
            freezeRecord: record({unfreezeAttempts: 0, lastProbeAt: NOW - DEFAULT_REPROBE_BOUNDS.minReprobeIntervalMs - 1}),
            probe       : CLEAR,
            now         : NOW
        });
        expect(decision.status).toBe('unfreeze');
    });

    test('back-off widens the probe interval exponentially per prior unfreeze attempt', () => {
        const at1 = decideFreezeReprobe({freezeRecord: record({unfreezeAttempts: 1, lastProbeAt: -Infinity}), probe: CLEAR, now: NOW}),
              at2 = decideFreezeReprobe({freezeRecord: record({unfreezeAttempts: 2, lastProbeAt: -Infinity}), probe: CLEAR, now: NOW});

        expect(at1.nextProbeAfterMs).toBe(DEFAULT_REPROBE_BOUNDS.minReprobeIntervalMs * 2);  // 2^1
        expect(at2.nextProbeAfterMs).toBe(DEFAULT_REPROBE_BOUNDS.minReprobeIntervalMs * 4);  // 2^2
    });

    test('the unfreeze-attempt cap → contained (persistent fault), even when the probe reads clear', () => {
        const decision = decideFreezeReprobe({
            freezeRecord: record({unfreezeAttempts: DEFAULT_REPROBE_BOUNDS.maxUnfreezeAttempts, lastProbeAt: -Infinity}),
            probe       : CLEAR, // cap wins over a clear probe — no thrash
            now         : NOW
        });
        expect(decision).toMatchObject({unfreeze: false, status: 'contained'});
    });
});
