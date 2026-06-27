import {test, expect}                  from '@playwright/test';
import {assembleDataIntegrityEvidence} from '../../../../../../../ai/daemons/orchestrator/services/dataIntegrityEvidenceAssembler.mjs';
import {classifyDataIntegrityMode}     from '../../../../../../../ai/daemons/orchestrator/services/dataIntegrityModeClassifier.mjs';

// The glue: producers' per-signal diagnoses (recoveryClass + evidenceFacts) → per-collection classifier rows,
// augmenting with rowCount (false-storm denominator) + documentsPresentCount (WAL-stall-vs-wipe).

const coverageDiag  = facts => ({recoveryClass: 'data-integrity', evidenceFacts: facts});
const dimensionDiag = facts => ({recoveryClass: 'data-integrity', evidenceFacts: facts});

test.describe('assembleDataIntegrityEvidence — producers→classifier glue', () => {
    test('coverage-drift fact → a per-collection row augmented with rowCount + documentsPresentCount', () => {
        const rows = assembleDataIntegrityEvidence({
            diagnoses                   : [coverageDiag([{type: 'vector-coverage-drift', collection: 'neo-agent-memory', missingFromVectorCount: 200}])],
            collectionSizes             : {'neo-agent-memory': 1000},
            documentsPresentByCollection: {'neo-agent-memory': 200}
        });

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({collection: 'neo-agent-memory', rowCount: 1000, missingFromVectorCount: 200, documentsPresentCount: 200});
    });

    test('multiple per-collection signals fold into one row per collection', () => {
        const rows = assembleDataIntegrityEvidence({
            diagnoses: [
                coverageDiag([{type: 'vector-coverage-drift', collection: 'neo-agent-memory', missingFromVectorCount: 50}]),
                dimensionDiag([{type: 'vector-dimension-mismatch', collection: 'neo-agent-memory', mismatchedVectorCount: 3}]),
                {recoveryClass: 'data-integrity', evidenceFacts: [{type: 'vector-count-regression', collection: 'neo-agent-sessions', previousCount: 100, currentCount: 80}]}
            ],
            collectionSizes: {'neo-agent-memory': 1000, 'neo-agent-sessions': 100}
        });

        const mem  = rows.find(r => r.collection === 'neo-agent-memory'),
              sess = rows.find(r => r.collection === 'neo-agent-sessions');
        expect(mem).toMatchObject({missingFromVectorCount: 50, mismatchedVectorCount: 3});
        expect(sess).toMatchObject({countRegressed: true});
    });

    test('store-level signals (sqlite / bloat) fold into one store-level row keyed by serviceId', () => {
        const rows = assembleDataIntegrityEvidence({
            diagnoses: [
                {recoveryClass: 'data-integrity', evidenceFacts: [{type: 'sqlite-integrity-failure', pragma: 'quick_check'}]},
                {recoveryClass: 'data-integrity', evidenceFacts: [{type: 'store-bloat', signal: 'absolute'}]}
            ],
            serviceId: 'mc-server'
        });

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({collection: 'mc-server', sqliteIntegrityOk: false, sizeAnomaly: true});
    });

    test('no diagnoses → no rows', () => {
        expect(assembleDataIntegrityEvidence({diagnoses: []})).toEqual([]);
    });

    test('end-to-end: assemble → classify → the right autonomous modes', () => {
        // WAL-stall: coverage gap + documents intact.
        const walStall = assembleDataIntegrityEvidence({
            diagnoses                   : [coverageDiag([{type: 'vector-coverage-drift', collection: 'neo-agent-memory', missingFromVectorCount: 200}])],
            collectionSizes             : {'neo-agent-memory': 1000},
            documentsPresentByCollection: {'neo-agent-memory': 200}
        });
        expect(classifyDataIntegrityMode(walStall[0])).toMatchObject({mode: 'wal-stall', terminalAction: 're-embed-missing'});

        // Wipe: coverage gap + documents gone.
        const wipe = assembleDataIntegrityEvidence({
            diagnoses                   : [coverageDiag([{type: 'vector-coverage-drift', collection: 'neo-agent-memory', missingFromVectorCount: 200}])],
            collectionSizes             : {'neo-agent-memory': 1000},
            documentsPresentByCollection: {'neo-agent-memory': 0}
        });
        expect(classifyDataIntegrityMode(wipe[0])).toMatchObject({mode: 'wipe', terminalAction: 'restore-delta-merge'});

        // Store-level sqlite failure → quarantine.
        const sqlite = assembleDataIntegrityEvidence({
            diagnoses: [{recoveryClass: 'data-integrity', evidenceFacts: [{type: 'sqlite-integrity-failure', pragma: 'integrity_check'}]}]
        });
        expect(classifyDataIntegrityMode(sqlite[0])).toMatchObject({mode: 'sqlite-integrity', terminalAction: 'quarantine'});
    });
});
