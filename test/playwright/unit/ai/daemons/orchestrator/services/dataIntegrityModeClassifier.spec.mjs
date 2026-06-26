import {test, expect}                                                               from '@playwright/test';
import {classifyDataIntegrityMode, DataIntegrityTerminal, DEFAULT_FALSE_STORM_RATE} from '../../../../../../../ai/daemons/orchestrator/services/dataIntegrityModeClassifier.mjs';

test.describe('dataIntegrityModeClassifier', () => {
    test('clean evidence → clean / none', () => {
        const d = classifyDataIntegrityMode({collection: 'neo-agent-memory', rowCount: 100});
        expect(d).toMatchObject({collection: 'neo-agent-memory', mode: 'clean', terminalAction: DataIntegrityTerminal.NONE, autonomous: true});
    });

    test('coverage gap + documents intact → wal-stall / re-embed-missing (lossless)', () => {
        const d = classifyDataIntegrityMode({rowCount: 1000, missingFromVectorCount: 200, documentsPresentCount: 200});
        expect(d.mode).toBe('wal-stall');
        expect(d.terminalAction).toBe(DataIntegrityTerminal.REEMBED_MISSING);
        expect(d.autonomous).toBe(true);
    });

    test('coverage gap + documents also gone → wipe / restore-delta-merge', () => {
        const d = classifyDataIntegrityMode({rowCount: 1000, missingFromVectorCount: 200, documentsPresentCount: 50});
        expect(d.mode).toBe('wipe');
        expect(d.terminalAction).toBe(DataIntegrityTerminal.RESTORE_DELTA_MERGE);
    });

    test('row-count regressed → count-loss / quarantine', () => {
        const d = classifyDataIntegrityMode({rowCount: 800, countRegressed: true});
        expect(d.mode).toBe('count-loss');
        expect(d.terminalAction).toBe(DataIntegrityTerminal.QUARANTINE);
    });

    test('few wrong-dimension vectors (rate < bound) → dimension-targeted / re-embed-rows', () => {
        const d = classifyDataIntegrityMode({rowCount: 1000, mismatchedVectorCount: 5});
        expect(d.mode).toBe('dimension-targeted');
        expect(d.terminalAction).toBe(DataIntegrityTerminal.REEMBED_ROWS);
    });

    test('mass dimension mismatch (rate ≥ bound) → dimension-systemic / freeze (never mass re-embed)', () => {
        const d = classifyDataIntegrityMode({rowCount: 1000, mismatchedVectorCount: 800});
        expect(d.mode).toBe('dimension-systemic');
        expect(d.terminalAction).toBe(DataIntegrityTerminal.FREEZE);
    });

    test('the false-storm boundary is the configured rate', () => {
        // rate exactly at the bound is systemic (freeze); just below is targeted (re-embed).
        const atBound = classifyDataIntegrityMode({rowCount: 100, mismatchedVectorCount: 50, falseStormRate: 0.5});
        expect(atBound.terminalAction).toBe(DataIntegrityTerminal.FREEZE);

        const belowBound = classifyDataIntegrityMode({rowCount: 100, mismatchedVectorCount: 49, falseStormRate: 0.5});
        expect(belowBound.terminalAction).toBe(DataIntegrityTerminal.REEMBED_ROWS);
    });

    test('SQLite integrity failure → sqlite-integrity / quarantine', () => {
        const d = classifyDataIntegrityMode({sqliteIntegrityOk: false});
        expect(d.mode).toBe('sqlite-integrity');
        expect(d.terminalAction).toBe(DataIntegrityTerminal.QUARANTINE);
    });

    test('size anomaly → store-bloat / defrag', () => {
        const d = classifyDataIntegrityMode({rowCount: 1000, sizeAnomaly: true});
        expect(d.mode).toBe('store-bloat');
        expect(d.terminalAction).toBe(DataIntegrityTerminal.DEFRAG);
    });

    test('precedence: a systemic SQLite fault wins over a co-present coverage gap (no row-level repair on a corrupt store)', () => {
        const d = classifyDataIntegrityMode({rowCount: 1000, missingFromVectorCount: 200, documentsPresentCount: 200, sqliteIntegrityOk: false});
        expect(d.mode).toBe('sqlite-integrity');
        expect(d.terminalAction).toBe(DataIntegrityTerminal.QUARANTINE);
    });

    test('INVARIANT: no terminal is ever escalate or page (100% autonomous)', () => {
        const cases = [
            {rowCount: 100},
            {rowCount: 1000, missingFromVectorCount: 200, documentsPresentCount: 200},
            {rowCount: 1000, missingFromVectorCount: 200, documentsPresentCount: 0},
            {rowCount: 800, countRegressed: true},
            {rowCount: 1000, mismatchedVectorCount: 5},
            {rowCount: 1000, mismatchedVectorCount: 800},
            {sqliteIntegrityOk: false},
            {rowCount: 1000, sizeAnomaly: true}
        ];
        const terminals = new Set(Object.values(DataIntegrityTerminal));
        for (const evidence of cases) {
            const d = classifyDataIntegrityMode(evidence);
            expect(d.autonomous).toBe(true);
            expect(d.terminalAction).not.toBe('escalate');
            expect(d.terminalAction).not.toBe('page');
            expect(terminals.has(d.terminalAction)).toBe(true);
        }
    });

    test('DEFAULT_FALSE_STORM_RATE is exported and sane', () => {
        expect(DEFAULT_FALSE_STORM_RATE).toBeGreaterThan(0);
        expect(DEFAULT_FALSE_STORM_RATE).toBeLessThanOrEqual(1);
    });
});
