import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';
import {
    TARGET_SET_PHASES,
    TARGET_SET_PROFILES,
    TargetSetMeasurementRecorder,
    resolveTargetSetProfile
} from '../../../../../../ai/scripts/benchmark/helpers/targetSetMeasurementCore.mjs';
import {
    copyVectorFixtureInBatches,
    createTargetSetFixture,
    directorySizeBytes,
    runSyntheticControl,
    validateGraphFixture,
    validateVectorFixture,
    writeGraphFixture,
    writeVectorFixture
} from '../../../../../../ai/scripts/benchmark/restore-empty-target-meter.mjs';

/**
 * @summary Unit coverage for the pure target-set report contract and the small,
 * disposable fixture primitives used by the target-set meter.
 *
 * The suite intentionally does not run the 5k/20k controls: those are
 * measurement executions, not unit fixtures. It pins the fixed profile
 * cardinalities, ADR phase order, high-water aggregation, provider trace,
 * interruption truthfulness, non-authoritative control label, and streaming
 * fixture format without touching Chroma, SQLite, providers, or live paths.
 */
test.describe('ai/scripts/benchmark target-set measurement (#15695)', () => {
    /**
     * Builds a fully configured recorder whose clock advances one millisecond
     * per receipt.
     *
     * @param {Object} options
     * @param {'exact-head-candidate'|'synthetic-control'} [options.evidenceClass='synthetic-control']
     * @param {String|null} [options.implementationHead=null]
     * @param {String|null} [options.scenario='full']
     * @returns {TargetSetMeasurementRecorder}
     */
    function createRecorder({
        evidenceClass     = 'synthetic-control',
        implementationHead = null,
        scenario           = 'full'
    } = {}) {
        let clock = 1000;

        const recorder = new TargetSetMeasurementRecorder({
            evidenceClass,
            implementationHead,
            now           : () => ++clock,
            profileName   : '5k-target-set',
            repositoryHead: 'a'.repeat(40),
            scenario
        });

        recorder.recordFixture({
            graphEdges          : 63,
            graphNodes          : 64,
            graphSerializedBytes: 8192,
            memories            : 5000,
            summaries           : 5000,
            vectorDimension     : 4096
        });
        recorder.declareProviderTrace({
            coverage   : 'test provider seam',
            entrypoints: ['embedText', 'embedTexts']
        });
        recorder.declareResourceRole({name: 'chroma', pid: 42, separable: true});
        recorder.declareResourceRole({
            name     : 'sqlite',
            reason   : 'better-sqlite3 shares the measured Node process',
            separable: false
        });
        recorder.recordBatch({collection: 'memories',  size: 250});
        recorder.recordBatch({collection: 'summaries', size: 125});
        recorder.recordResourceSample({
            node         : {heapUsedBytes: 100, rssBytes: 200},
            processes    : {chroma: {rssBytes: 300}},
            tempDiskBytes: 400
        });
        recorder.recordResourceSample({
            node         : {heapUsedBytes: 150, rssBytes: 180},
            processes    : {chroma: {rssBytes: 280}},
            tempDiskBytes: 450
        });

        return recorder
    }

    /**
     * Completes each supplied phase with deterministic count receipts.
     *
     * @param {TargetSetMeasurementRecorder} recorder
     * @param {String[]} phases
     */
    function completePhases(recorder, phases) {
        for (const phase of phases) {
            recorder.recordProgress({phase, state: 'started'});
            recorder.recordProgress({
                counts: {
                    graphEdges: 63,
                    graphNodes: 64,
                    memories  : 5000,
                    summaries : 5000
                },
                phase,
                state: 'completed'
            })
        }
    }

    test('fixes 5k/20k vector profiles while keeping graph cardinality independent', () => {
        expect(resolveTargetSetProfile('5k-target-set')).toEqual({
            graphEdges: 63,
            graphNodes: 64,
            memories  : 5000,
            name      : '5k-target-set',
            summaries : 5000
        });
        expect(resolveTargetSetProfile('20k-target-set')).toEqual({
            graphEdges: 63,
            graphNodes: 64,
            memories  : 20000,
            name      : '20k-target-set',
            summaries : 20000
        });
        expect(TARGET_SET_PROFILES['5k-target-set'].graphNodes)
            .toBe(TARGET_SET_PROFILES['20k-target-set'].graphNodes);
        expect(() => resolveTargetSetProfile('10k-target-set')).toThrow(/Unknown target-set profile/)
    });

    test('emits a complete ordered report with phase, progress, batch, provider, and high-water receipts', () => {
        const recorder = createRecorder();

        recorder.recordProviderCall({entrypoint: 'embedText'});
        completePhases(recorder, TARGET_SET_PHASES);

        const report = recorder.finish({detail: 'control complete', status: 'completed'});

        expect(report.completedPhases).toEqual(TARGET_SET_PHASES);
        expect(report.skippedPhases).toEqual([]);
        expect(report.progress.first).toMatchObject({phase: 'admission', state: 'started'});
        expect(report.progress.last).toMatchObject({phase: 'terminal-settlement', state: 'completed'});
        expect(report.phaseTimings['stage-memories'].durationMs).toBe(1);
        expect(report.batches).toEqual({
            globalMaximum: 250,
            perCollection: {memories: 250, summaries: 125}
        });
        expect(report.providerTrace).toMatchObject({
            callCount  : 1,
            coverage   : 'test provider seam',
            entrypoints: ['embedText', 'embedTexts']
        });
        expect(report.resources.node).toEqual({
            heapUsedHighWaterBytes: 150,
            rssHighWaterBytes     : 200,
            sampleCount           : 2
        });
        expect(report.resources.processes.chroma.rssHighWaterBytes).toBe(300);
        expect(report.resources.processes.sqlite).toMatchObject({
            reason   : 'better-sqlite3 shares the measured Node process',
            separable: false
        });
        expect(report.resources.tempDiskHighWaterBytes).toBe(450);
        expect(report.authority).toEqual({
            authoritative     : false,
            mergeGateSatisfied: false,
            reason            : 'Synthetic/seam controls cannot satisfy the #15740 exact-head merge gate.'
        })
    });

    test('rejects out-of-order success and a profile-mismatched fixture', () => {
        const recorder = createRecorder();

        expect(() => recorder.recordProgress({phase: 'stage-memories', state: 'started'}))
            .toThrow(/out of order/);

        const mismatch = new TargetSetMeasurementRecorder({
            evidenceClass: 'synthetic-control',
            now          : () => 1,
            profileName  : '5k-target-set',
            scenario     : 'full'
        });

        expect(() => mismatch.recordFixture({
            graphEdges          : 63,
            graphNodes          : 64,
            graphSerializedBytes: 1,
            memories            : 20000,
            summaries           : 5000,
            vectorDimension     : 4096
        })).toThrow(/fixture.memories=20000 does not match 5k-target-set/)
    });

    test('records an interrupted pre-promotion prefix without pretending skipped phases ran', () => {
        const recorder = createRecorder({scenario: 'interrupt-pre-promotion'});

        completePhases(recorder, TARGET_SET_PHASES.slice(0, 5));
        recorder.recordCheckpoint({
            detail: {retainedBytes: 12345},
            kind  : 'synthetic-interruption'
        });
        completePhases(recorder, ['terminal-settlement']);

        const report = recorder.finish({detail: 'interrupted', status: 'interrupted'});

        expect(report.status).toBe('interrupted');
        expect(report.completedPhases).toEqual([
            ...TARGET_SET_PHASES.slice(0, 5),
            'terminal-settlement'
        ]);
        expect(report.skippedPhases).toEqual([
            'promote-memories',
            'promote-summaries',
            'promote-graph',
            'revalidate-production'
        ]);
        expect(report.checkpoints[0]).toMatchObject({
            detail: {retainedBytes: 12345},
            kind  : 'synthetic-interruption'
        });
        expect(report.authority.authoritative).toBe(false)
    });

    test('requires an exact full SHA for candidate evidence and still leaves merge-gate authority external', () => {
        expect(() => createRecorder({
            evidenceClass     : 'exact-head-candidate',
            implementationHead: 'abc',
            scenario          : null
        })).toThrow(/40-character implementationHead/);

        const recorder = createRecorder({
            evidenceClass     : 'exact-head-candidate',
            implementationHead: 'b'.repeat(40),
            scenario          : null
        });

        completePhases(recorder, TARGET_SET_PHASES);

        const report = recorder.finish({status: 'completed'});

        expect(report.implementationHead).toBe('b'.repeat(40));
        expect(report.authority.mergeGateSatisfied).toBe(false);
        expect(report.authority.reason).toContain('publication against the exact #15740 PR head')
    });

    test('writes and validates small streaming fixtures with exact graph bytes', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-target-set-core-spec-'));

        try {
            const memoriesFile  = path.join(root, 'memory.jsonl');
            const summariesFile = path.join(root, 'summaries.jsonl');
            const graphFile     = path.join(root, 'graph.jsonl');

            const memories = await writeVectorFixture({
                collection: 'memories',
                dimension : 4,
                file      : memoriesFile,
                rows      : 251
            });
            const summaries = await writeVectorFixture({
                collection: 'summaries',
                dimension : 4,
                file      : summariesFile,
                rows      : 2
            });
            const graph = await writeGraphFixture({edges: 2, file: graphFile, nodes: 3});

            expect(await validateVectorFixture({dimension: 4, expectedRows: 251, file: memoriesFile})).toBe(251);
            expect(await validateVectorFixture({dimension: 4, expectedRows: 2, file: summariesFile})).toBe(2);
            expect(await validateGraphFixture({expectedEdges: 2, expectedNodes: 3, file: graphFile}))
                .toEqual({edges: 2, nodes: 3});
            expect(memories.bytes).toBeGreaterThan(0);
            expect(summaries.bytes).toBeGreaterThan(0);
            expect(graph.bytes).toBe(fs.statSync(graphFile).size);
            expect(await directorySizeBytes(root)).toBe(memories.bytes + summaries.bytes + graph.bytes)
        } finally {
            fs.rmSync(root, {force: true, recursive: true})
        }
    });

    test('ignores transient files removed between directory enumeration and stat', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-target-set-race-spec-'));

        try {
            fs.writeFileSync(path.join(root, 'chroma.sqlite3-journal'), 'transient');

            const readStat = async () => {
                const error = new Error('transient file disappeared');

                error.code = 'ENOENT';

                throw error
            };

            expect(await directorySizeBytes(root, {readStat})).toBe(0)
        } finally {
            fs.rmSync(root, {force: true, recursive: true})
        }
    });

    test('reports the actual 250-row synthetic copy maximum rather than the file cardinality', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-target-set-batch-spec-'));

        try {
            const source   = path.join(root, 'source.jsonl');
            const target   = path.join(root, 'target.jsonl');
            const recorder = createRecorder();

            await writeVectorFixture({
                collection: 'memories',
                dimension : 2,
                file      : source,
                rows      : 251
            });

            expect(await copyVectorFixtureInBatches({
                collection: 'memories',
                recorder,
                source,
                target
            })).toBe(251);
            expect(recorder.batchMaxima.memories).toBe(250);
            expect(await validateVectorFixture({dimension: 2, expectedRows: 251, file: target})).toBe(251)
        } finally {
            fs.rmSync(root, {force: true, recursive: true})
        }
    });

    test('runs the fixed 5k file control through every phase while keeping authority false', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-target-set-control-spec-'));

        try {
            let clock = 5000;

            const recorder = new TargetSetMeasurementRecorder({
                evidenceClass : 'synthetic-control',
                now           : () => ++clock,
                profileName   : '5k-target-set',
                repositoryHead: 'c'.repeat(40),
                scenario      : 'full'
            });
            const fixture = await createTargetSetFixture({
                dimension  : 1,
                profileName: '5k-target-set',
                root
            });

            recorder.recordFixture({
                graphEdges          : fixture.graph.edges,
                graphNodes          : fixture.graph.nodes,
                graphSerializedBytes: fixture.graph.bytes,
                memories            : fixture.memories.rows,
                summaries           : fixture.summaries.rows,
                vectorDimension     : 1
            });
            recorder.declareProviderTrace({
                coverage   : 'synthetic test seam',
                entrypoints: ['synthetic.provider']
            });
            recorder.declareResourceRole({
                name     : 'chroma',
                reason   : 'not started by the file control',
                separable: false
            });
            recorder.declareResourceRole({
                name     : 'sqlite',
                reason   : 'not started by the file control',
                separable: false
            });

            const sampleNow = async () => recorder.recordResourceSample({
                node         : {heapUsedBytes: 10, rssBytes: 20},
                tempDiskBytes: await directorySizeBytes(root)
            });

            await sampleNow();
            const outcome = await runSyntheticControl({
                fixture,
                recorder,
                sampleNow,
                scenario: 'full'
            });
            const report = recorder.finish(outcome);

            expect(report.status).toBe('completed');
            expect(report.completedPhases).toEqual(TARGET_SET_PHASES);
            expect(report.batches.globalMaximum).toBe(250);
            expect(report.providerTrace.callCount).toBe(0);
            expect(report.authority.mergeGateSatisfied).toBe(false)
        } finally {
            fs.rmSync(root, {force: true, recursive: true})
        }
    })
});
