import {test, expect}                  from '@playwright/test';
import {evaluateDetectionRetentionSla} from '../../../../../../ai/scripts/maintenance/detectionRetentionSla.mjs';

// Pure verdict logic (no I/O / clock / config) — imported directly, mirrors parseAgentEnvelope.spec.
// Backup-reliability AC3: the detect cadence must beat backup retention with margin so a corruption
// is caught before the last good backup ages out of retention (the incident's failed backup sat
// unalerted ~5 days).

const DAY = 86400000;

test.describe('evaluateDetectionRetentionSla (#14030 AC3 verdict-half)', () => {
    test('within SLA — detect cadence well under retention/safetyFactor', () => {
        // retention 30d, safetyFactor 2 → ceiling 15d; hourly detect → far within.
        const r = evaluateDetectionRetentionSla({detectCadenceMs: 3600000, backupRetentionMs: 30 * DAY});
        expect(r.withinSla).toBe(true);
        expect(r.requiredMaxDetectMs).toBe(15 * DAY);
        expect(r.marginMs).toBe(15 * DAY - 3600000);
        expect(r.reason).toBe(null);
    });

    test('breached — detect cadence exceeds retention/safetyFactor', () => {
        // retention 30d, safetyFactor 2 → ceiling 15d; detect every 20d → breach.
        const r = evaluateDetectionRetentionSla({detectCadenceMs: 20 * DAY, backupRetentionMs: 30 * DAY});
        expect(r.withinSla).toBe(false);
        expect(r.requiredMaxDetectMs).toBe(15 * DAY);
        expect(r.marginMs).toBeLessThan(0);
        expect(r.reason).toContain('exceeds the SLA ceiling');
    });

    test('boundary — detect cadence exactly at the ceiling is within SLA (margin 0)', () => {
        // retention 30d, safetyFactor 2 → ceiling 15d; detect every 15d → margin 0, still within.
        const r = evaluateDetectionRetentionSla({detectCadenceMs: 15 * DAY, backupRetentionMs: 30 * DAY});
        expect(r.withinSla).toBe(true);
        expect(r.marginMs).toBe(0);
        expect(r.reason).toBe(null);
    });

    test('explicit safetyFactor tightens the ceiling', () => {
        // retention 30d, safetyFactor 3 → ceiling 10d; detect every 12d → breach.
        const r = evaluateDetectionRetentionSla({detectCadenceMs: 12 * DAY, backupRetentionMs: 30 * DAY, safetyFactor: 3});
        expect(r.requiredMaxDetectMs).toBe(10 * DAY);
        expect(r.withinSla).toBe(false);
    });

    test('safetyFactor 1 — detection only needs to beat the full retention window', () => {
        const r = evaluateDetectionRetentionSla({detectCadenceMs: 20 * DAY, backupRetentionMs: 30 * DAY, safetyFactor: 1});
        expect(r.requiredMaxDetectMs).toBe(30 * DAY);
        expect(r.withinSla).toBe(true);
    });

    test('rejects missing / non-positive / non-numeric detectCadenceMs — no silent pass', () => {
        for (const bad of [undefined, 0, -1, NaN, Infinity, '1000']) {
            expect(() => evaluateDetectionRetentionSla({detectCadenceMs: bad, backupRetentionMs: 30 * DAY}))
                .toThrow('detectCadenceMs');
        }
    });

    test('rejects missing / non-positive / non-numeric backupRetentionMs — no silent pass', () => {
        for (const bad of [undefined, 0, -1, NaN, Infinity, '1000']) {
            expect(() => evaluateDetectionRetentionSla({detectCadenceMs: 3600000, backupRetentionMs: bad}))
                .toThrow('backupRetentionMs');
        }
    });

    test('rejects safetyFactor < 1', () => {
        for (const bad of [0, 0.5, -2, NaN]) {
            expect(() => evaluateDetectionRetentionSla({detectCadenceMs: 3600000, backupRetentionMs: 30 * DAY, safetyFactor: bad}))
                .toThrow('safetyFactor');
        }
    });
});
