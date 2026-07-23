import {test, expect}                                                               from '@playwright/test';
import {
    classifyDataIntegrityMode,
    classifyFreshEmptyBootstrapDiagnosis,
    DataIntegrityTerminal,
    DEFAULT_FALSE_STORM_RATE
} from '../../../../../../../ai/daemons/orchestrator/services/dataIntegrityModeClassifier.mjs';
import {
    createRestoreTargetSetDescriptor,
    fingerprintCanonical
} from '../../../../../../../ai/services/memory-core/helpers/restoreTargetSetContract.mjs';

const ADMISSION_COMPONENTS = {
    memories: {
        fileFingerprint: `sha256:${'c'.repeat(64)}`,
        rowCount       : 5
    },
    summaries: {
        fileFingerprint: `sha256:${'d'.repeat(64)}`,
        rowCount       : 3
    },
    graph: {
        fileFingerprint  : `sha256:${'e'.repeat(64)}`,
        rowCount         : 3,
        nodeCount        : 2,
        edgeCount        : 1,
        recordFingerprint: `sha256:${'f'.repeat(64)}`
    }
};
const ADMISSION_FINGERPRINT = fingerprintCanonical({
    schemaVersion    : 1,
    expectedDimension: 4096,
    components       : ADMISSION_COMPONENTS
});
const ADMISSION = {
    schemaVersion            : 1,
    status                   : 'admitted',
    bundleManifestFingerprint: `sha256:${'a'.repeat(64)}`,
    descriptorFingerprint    : ADMISSION_FINGERPRINT,
    expectedDimension        : 4096,
    components               : {
        memories : {...ADMISSION_COMPONENTS.memories, filePath: '/bundle/memories.jsonl'},
        summaries: {...ADMISSION_COMPONENTS.summaries, filePath: '/bundle/summaries.jsonl'},
        graph    : {...ADMISSION_COMPONENTS.graph, filePath: '/bundle/graph.jsonl'}
    }
};
const TARGET_SET = {
    ...createRestoreTargetSetDescriptor({
    memoriesCollection            : 'neo-agent-memory',
    summariesCollection           : 'neo-agent-sessions',
    graphDestination              : '/data/graph.sqlite',
    bundleManifestFingerprint     : `sha256:${'a'.repeat(64)}`,
    admissionDescriptorFingerprint: ADMISSION_FINGERPRINT
    }),
    admission: ADMISSION
};

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

    test('coverage gap + documents also gone → wipe / quarantine (count evidence cannot select target-set restore)', () => {
        const d = classifyDataIntegrityMode({rowCount: 1000, missingFromVectorCount: 200, documentsPresentCount: 50});
        expect(d.mode).toBe('wipe');
        expect(d.terminalAction).toBe(DataIntegrityTerminal.QUARANTINE);
    });

    test('only an explicitly enabled typed bootstrap diagnosis selects restore-empty-target', () => {
        expect(classifyFreshEmptyBootstrapDiagnosis({
            type     : 'fresh-empty-bootstrap',
            enabled  : true,
            targetSet: TARGET_SET
        })).toMatchObject({
            accepted      : true,
            mode          : 'fresh-empty-bootstrap',
            terminalAction: DataIntegrityTerminal.RESTORE_EMPTY_TARGET,
            targetSet     : TARGET_SET
        });

        expect(classifyFreshEmptyBootstrapDiagnosis({
            type     : 'wipe',
            enabled  : true,
            targetSet: TARGET_SET
        })).toMatchObject({accepted: false, terminalAction: DataIntegrityTerminal.NONE});

        expect(classifyFreshEmptyBootstrapDiagnosis({
            type     : 'fresh-empty-bootstrap',
            enabled  : false,
            targetSet: TARGET_SET
        })).toMatchObject({accepted: false, terminalAction: DataIntegrityTerminal.NONE});
    });

    test('typed bootstrap selection fails closed on a tampered topology fingerprint', () => {
        const tampered = structuredClone(TARGET_SET);
        tampered.destinations[0].id = 'different';

        expect(classifyFreshEmptyBootstrapDiagnosis({
            type     : 'fresh-empty-bootstrap',
            enabled  : true,
            targetSet: tampered
        })).toMatchObject({
            accepted      : false,
            mode          : 'invalid-fresh-empty-bootstrap',
            terminalAction: DataIntegrityTerminal.NONE
        });
    });

    test('typed bootstrap selection fails closed without the admitted source descriptor', () => {
        const noAdmission = structuredClone(TARGET_SET);
        delete noAdmission.admission;

        expect(classifyFreshEmptyBootstrapDiagnosis({
            type     : 'fresh-empty-bootstrap',
            enabled  : true,
            targetSet: noAdmission
        })).toMatchObject({
            accepted      : false,
            mode          : 'invalid-fresh-empty-bootstrap',
            terminalAction: DataIntegrityTerminal.NONE
        })
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
