import {test, expect} from '@playwright/test';

import {
    createRestoreMeasurementPhaseObserver
} from '../../../../restoreEmptyTargetMeasurementAdapter.mjs';

test.describe('restore-empty-target exact-head measurement adapter', () => {
    test('maps production store events to exact meter phases, counts, batches, and proof', () => {
        const
            batches     = [],
            checkpoints = [],
            progress    = [],
            observer    = createRestoreMeasurementPhaseObserver({
                fixture: {
                    profile: {
                        memories  : 5000,
                        summaries : 5000,
                        graphNodes: 64,
                        graphEdges: 63
                    }
                },
                recordBatch     : receipt => batches.push(receipt),
                recordCheckpoint: receipt => checkpoints.push(receipt),
                recordProgress  : receipt => progress.push(receipt)
            });

        observer({phase: 'action-time-proof', event: 'start'});
        observer({
            phase : 'action-time-proof',
            event : 'complete',
            result: {
                fresh                         : true,
                reason                        : null,
                destinationTopologyFingerprint: 'sha256:topology'
            }
        });
        observer({phase: 'stage-memories', event: 'start'});
        observer({
            phase  : 'stage-memories',
            event  : 'batch',
            receipt: {batchSize: 250}
        });
        observer({phase: 'stage-memories', event: 'complete'});
        observer({phase: 'stage-summaries', event: 'start'});
        observer({phase: 'stage-summaries', event: 'complete'});
        observer({phase: 'stage-graph', event: 'start'});
        observer({phase: 'stage-graph', event: 'complete'});
        observer({phase: 'validate-staged-target-set', event: 'start'});
        observer({phase: 'validate-staged-target-set', event: 'complete'});
        observer({phase: 'promote-memories', event: 'start'});
        observer({phase: 'promote-memories', event: 'complete'});
        observer({phase: 'promote-summaries', event: 'start'});
        observer({phase: 'promote-summaries', event: 'complete'});
        observer({phase: 'promote-graph', event: 'start'});
        observer({phase: 'promote-graph', event: 'complete'});
        observer({phase: 'revalidate-production', event: 'start'});
        observer({phase: 'revalidate-production', event: 'complete'});

        expect(checkpoints).toEqual([{
            kind  : 'action-time-proof',
            detail: {
                fresh                         : true,
                reason                        : null,
                destinationTopologyFingerprint: 'sha256:topology'
            }
        }]);
        expect(batches).toEqual([{collection: 'memories', size: 250}]);
        expect(progress.map(item => `${item.phase}:${item.state}`)).toEqual([
            'stage-memories:started',
            'stage-memories:completed',
            'stage-summaries:started',
            'stage-summaries:completed',
            'stage-graph:started',
            'stage-graph:completed',
            'validate-staged-target-set:started',
            'validate-staged-target-set:completed',
            'promote-memories:started',
            'promote-memories:completed',
            'promote-summaries:started',
            'promote-summaries:completed',
            'promote-graph:started',
            'promote-graph:completed',
            'revalidate-production:started',
            'revalidate-production:completed'
        ]);
        expect(progress.find(item => item.phase === 'promote-memories' &&
            item.state === 'completed').counts).toEqual({memories: 5000});
        expect(progress.find(item => item.phase === 'promote-graph' &&
            item.state === 'completed').counts).toEqual({
            graphNodes: 64,
            graphEdges: 63
        });
        expect(progress.find(item => item.phase === 'revalidate-production' &&
            item.state === 'completed').counts).toEqual({
            memories  : 5000,
            summaries : 5000,
            graphNodes: 64,
            graphEdges: 63
        })
    });

    test('fails closed on unknown production events', () => {
        const observer = createRestoreMeasurementPhaseObserver({
            fixture: {
                profile: {
                    memories  : 1,
                    summaries : 1,
                    graphNodes: 1,
                    graphEdges: 0
                }
            },
            recordBatch() {},
            recordCheckpoint() {},
            recordProgress() {}
        });

        expect(() => observer({phase: 'unexpected', event: 'complete'}))
            .toThrow(/unknown production phase/);
        expect(() => observer({phase: 'promote-graph', event: 'batch'}))
            .toThrow(/batch outside vector staging/)
    })
});
