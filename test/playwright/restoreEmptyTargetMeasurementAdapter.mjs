import path            from 'node:path';
import {fileURLToPath} from 'node:url';

import Database       from 'better-sqlite3';
import {ChromaClient} from 'chromadb';

import {
    createGraphBootSeedEdgeRecord,
    createGraphBootSeedManifest,
    createGraphBootSeedNodeRecord
} from '../../ai/graph/bootSeedManifest.mjs';
import {
    createRestoreEmptyTargetOperation
} from '../../ai/services/memory-core/helpers/restoreEmptyTargetOperation.mjs';
import {
    admitRestoreTargetSetBundle
} from '../../ai/services/memory-core/helpers/restoreTargetSetAdmission.mjs';
import {
    createRestoreTargetSetDescriptor,
    deriveRestoreTargetSetIdentity
} from '../../ai/services/memory-core/helpers/restoreTargetSetContract.mjs';
import {
    appendRestoreTargetSetTransition,
    readRestoreTargetSetTransitions
} from '../../ai/services/memory-core/helpers/restoreTargetSetStateStore.mjs';
import {
    createRestoreTargetSetStorage
} from '../../ai/services/memory-core/helpers/restoreTargetSetStorage.mjs';
import {
    registerNeoChromaEmbeddingFunctions
} from '../../ai/services/shared/vector/chromaClientPrimitives.mjs';
import {startChromaProcess, stopDetachedProcess} from './chromaProcess.mjs';
import {resolveFreePortSync}                     from './resolveFreePort.mjs';

/**
 * @module test/playwright/restoreEmptyTargetMeasurementAdapter
 * @summary Exact-head adapter from the disposable target-set meter to the
 * production `restore-empty-target` operation and store collaborators.
 *
 * The adapter starts one private Chroma process below the meter-owned temporary
 * root, creates a real SQLite graph with the canonical boot seeds, admits the
 * generated source bundle, and invokes the production operation. It never opens
 * configured Memory Core paths. The meter remains the report authority and
 * samples the registered Chroma PID while this adapter owns lifecycle cleanup.
 */

const
    ADMISSION_PHASE = 'admission',
    ACTION_PHASES   = Object.freeze([
        'stage-memories',
        'stage-summaries',
        'stage-graph',
        'validate-staged-target-set',
        'promote-memories',
        'promote-summaries',
        'promote-graph',
        'revalidate-production'
    ]),
    TERMINAL_PHASE  = 'terminal-settlement';

/**
 * @summary Converts production store phase events into the meter's canonical
 * progress, batch, and action-time-proof receipts.
 *
 * @param {Object} options
 * @param {Object} options.fixture Meter fixture.
 * @param {Function} options.recordBatch Meter batch callback.
 * @param {Function} options.recordCheckpoint Meter checkpoint callback.
 * @param {Function} options.recordProgress Meter phase callback.
 * @returns {Function} Production `onPhase` observer.
 */
export function createRestoreMeasurementPhaseObserver({
    fixture,
    recordBatch,
    recordCheckpoint,
    recordProgress
} = {}) {
    for (const [name, value] of Object.entries({
        recordBatch,
        recordCheckpoint,
        recordProgress
    })) {
        if (typeof value !== 'function') {
            throw new TypeError(`restore measurement observer requires ${name}()`)
        }
    }
    if (!fixture?.profile) {
        throw new TypeError('restore measurement observer requires fixture.profile')
    }

    return event => {
        const {phase} = event ?? {};

        if (phase === 'action-time-proof') {
            if (event.event === 'complete') {
                recordCheckpoint({
                    kind  : 'action-time-proof',
                    detail: {
                        fresh : event.result?.fresh === true,
                        reason: event.result?.reason ?? null,
                        destinationTopologyFingerprint:
                            event.result?.destinationTopologyFingerprint ?? null
                    }
                })
            }
            return
        }

        if (!ACTION_PHASES.includes(phase)) {
            throw new Error(`restore measurement observed unknown production phase '${phase}'`)
        }

        if (event.event === 'batch') {
            const collection = phase === 'stage-memories'
                ? 'memories'
                : phase === 'stage-summaries' ? 'summaries' : null;

            if (!collection) {
                throw new Error(`restore measurement observed a batch outside vector staging: ${phase}`)
            }

            recordBatch({
                collection,
                size: event.receipt?.batchSize
            });
            return
        }

        if (!['start', 'complete'].includes(event.event)) {
            throw new Error(`restore measurement observed unknown event '${event.event}' for ${phase}`)
        }

        recordProgress({
            phase,
            state : event.event === 'start' ? 'started' : 'completed',
            counts: event.event === 'complete'
                ? createPhaseCounts(fixture.profile, phase)
                : {}
        })
    }
}

/**
 * @summary Runs the exact production action against disposable Chroma and
 * SQLite targets created below the meter fixture root.
 *
 * @param {Object} context Meter adapter callbacks and fixture.
 * @returns {Promise<{status: 'completed', detail: Object}>} Compact terminal
 * measurement outcome.
 */
export async function runTargetSetMeasurementAdapter({
    fixture,
    recordBatch,
    recordCheckpoint,
    recordProgress,
    recordProviderCall,
    registerProcess,
    registerSharedRole,
    sampleNow,
    traceProviders
} = {}) {
    validateAdapterContext({
        fixture,
        recordBatch,
        recordCheckpoint,
        recordProgress,
        recordProviderCall,
        registerProcess,
        registerSharedRole,
        sampleNow,
        traceProviders
    });

    const
        fixtureRoot  = path.dirname(fixture.paths.bundle),
        repoRoot     = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
        host         = '127.0.0.1',
        port         = resolveFreePortSync(),
        chromaData   = path.join(fixture.paths.productionRoot, 'neo-chroma-unit-test-target-set'),
        chromaLog    = path.join(fixture.paths.productionRoot, 'neo-chroma-unit-test-target-set.log'),
        graphPath    = path.join(fixture.paths.productionRoot, 'target-set-graph.sqlite'),
        ledgerDir    = path.join(fixture.paths.productionRoot, 'restore-ledger'),
        destinations = {
            memories : 'test-restore-target-memories',
            summaries: 'test-restore-target-summaries',
            graph    : graphPath
        },
        observer = createRestoreMeasurementPhaseObserver({
            fixture,
            recordBatch,
            recordCheckpoint,
            recordProgress
        });

    let chromaPid = null,
        graphDb   = null,
        stopError = null;

    traceProviders({
        coverage: 'The production restore storage accepts only explicit vectors; its sole embedding-capable ' +
            'collaborator is the guarded Chroma dummy embedding function.',
        entrypoints: ['dummy_embedding_function.generate']
    });
    registerSharedRole({
        name  : 'sqlite',
        reason: 'better-sqlite3 executes inside the measured Node adapter process'
    });

    const dummyEmbeddingFunction = createGuardedEmbeddingFunction(recordProviderCall);
    registerNeoChromaEmbeddingFunctions({dummyEmbeddingFunction});

    try {
        chromaPid = await startChromaProcess({
            repoRoot,
            dataDir: chromaData,
            host,
            port,
            logPath: chromaLog
        });
        registerProcess({name: 'chroma', pid: chromaPid});

        const client = new ChromaClient({host, port, ssl: false});
        await client.heartbeat();
        await sampleNow();

        await client.createCollection({
            name             : destinations.memories,
            embeddingFunction: dummyEmbeddingFunction
        });
        await client.createCollection({
            name             : destinations.summaries,
            embeddingFunction: dummyEmbeddingFunction
        });

        graphDb = createGraphDatabase(graphPath);
        seedGraphBootManifest(graphDb);

        recordCheckpoint({
            kind  : 'disposable-store-ready',
            detail: {
                chromaPid,
                graphDestination   : path.basename(graphPath),
                memoriesCollection : destinations.memories,
                summariesCollection: destinations.summaries
            }
        });

        recordProgress({phase: ADMISSION_PHASE, state: 'started', counts: {}});
        const admission = await admitRestoreTargetSetBundle({
            bundleManifestPath: path.join(fixture.paths.bundle, 'bundle-meta.json'),
            memoriesFile      : fixture.paths.memoriesFile,
            summariesFile     : fixture.paths.summariesFile,
            graphFile         : fixture.paths.graphFile,
            expectedDimension : fixture.dimension
        });
        recordProgress({
            phase : ADMISSION_PHASE,
            state : 'completed',
            counts: createPhaseCounts(fixture.profile, ADMISSION_PHASE)
        });

        const
            targetSet = {
                ...createRestoreTargetSetDescriptor({
                    memoriesCollection            : destinations.memories,
                    summariesCollection           : destinations.summaries,
                    graphDestination              : destinations.graph,
                    bundleManifestFingerprint     : admission.bundleManifestFingerprint,
                    admissionDescriptorFingerprint: admission.descriptorFingerprint
                }),
                admission
            },
            identity = deriveRestoreTargetSetIdentity(targetSet),
            storage  = createRestoreTargetSetStorage({
                chromaClient        : client,
                dummyEmbeddingFunction,
                graphDb,
                expectedDestinations: destinations,
                stagingRoot         : fixture.paths.stagingRoot,
                invalidateCollectionCache() {},
                syncGraphCache() {},
                onPhase: observer
            }),
            operation = createRestoreEmptyTargetOperation({
                withWriterFence: createSingleWriterFence(recordCheckpoint),
                ...storage,
                readTransitions: ({attemptFingerprint}) => readRestoreTargetSetTransitions({
                    dir: ledgerDir,
                    attemptFingerprint
                }),
                appendTransition: input => appendRestoreTargetSetTransition(input, {
                    dir: ledgerDir
                })
            }),
            outcome = await operation({
                targetSet,
                ...identity
            });

        if (outcome.status !== 'committed' ||
            outcome.detail?.serviceEligible !== true) {
            throw new Error(`exact restore measurement did not commit: ${outcome.status}`)
        }

        recordProgress({phase: TERMINAL_PHASE, state: 'started', counts: {}});
        await sampleNow();
        recordCheckpoint({
            kind  : 'strict-ledger-terminal',
            detail: {
                serviceEligible: true,
                terminal       : outcome.detail.terminal,
                transitionCount: outcome.detail.destinationTransitions.length
            }
        });
        recordProgress({
            phase : TERMINAL_PHASE,
            state : 'completed',
            counts: {
                transitions: outcome.detail.destinationTransitions.length
            }
        });

        return {
            status: 'completed',
            detail: {
                serviceEligible: true,
                terminal       : outcome.detail.terminal,
                transitionCount: outcome.detail.destinationTransitions.length
            }
        }
    } finally {
        graphDb?.close();

        if (chromaPid !== null) {
            const stopped = await stopDetachedProcess(chromaPid);

            recordCheckpoint({
                kind  : 'disposable-chroma-stop',
                detail: stopped
            });

            if (!stopped.groupEmpty) {
                stopError = new Error(`disposable Chroma process group ${chromaPid} survived teardown`)
            }
        }

        if (stopError) {
            throw stopError
        }
    }
}

function createPhaseCounts(profile, phase) {
    const counts = {
        memories  : profile.memories,
        summaries : profile.summaries,
        graphNodes: profile.graphNodes,
        graphEdges: profile.graphEdges
    };

    if (phase.endsWith('memories')) {
        return {memories: counts.memories}
    }
    if (phase.endsWith('summaries')) {
        return {summaries: counts.summaries}
    }
    if (phase.endsWith('graph')) {
        return {
            graphNodes: counts.graphNodes,
            graphEdges: counts.graphEdges
        }
    }

    return counts
}

function createGuardedEmbeddingFunction(recordProviderCall) {
    const embeddingFunction = {
        name: 'dummy_embedding_function',
        getConfig() {
            return {}
        },
        async generate() {
            recordProviderCall({entrypoint: 'dummy_embedding_function.generate'});
            throw new Error('restore measurement refused an unexpected embedding-function call')
        }
    };

    embeddingFunction.constructor = {
        buildFromConfig: () => embeddingFunction
    };

    return embeddingFunction
}

function createSingleWriterFence(recordCheckpoint) {
    let active = false;

    return async (identity, task) => {
        if (active) {
            throw new Error('restore measurement writer fence is already held')
        }

        active = true;
        recordCheckpoint({
            kind  : 'writer-fence-acquired',
            detail: {
                attemptFingerprint: identity.attemptFingerprint,
                recoveryUnitKey   : identity.recoveryUnitKey
            }
        });

        try {
            return await task()
        } finally {
            active = false
        }
    }
}

function createGraphDatabase(filePath) {
    const db = new Database(filePath);
    db.pragma('foreign_keys = ON');
    db.exec(`
        CREATE TABLE Nodes (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            data TEXT NOT NULL
        );
        CREATE TABLE Edges (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            source TEXT NOT NULL,
            target TEXT NOT NULL,
            type TEXT NOT NULL,
            data TEXT NOT NULL,
            FOREIGN KEY (source) REFERENCES Nodes(id) ON DELETE CASCADE,
            FOREIGN KEY (target) REFERENCES Nodes(id) ON DELETE CASCADE
        );
    `);
    return db
}

function seedGraphBootManifest(db) {
    const
        manifest = createGraphBootSeedManifest(),
        addNode  = db.prepare('INSERT INTO Nodes (id, user_id, data) VALUES (?, ?, ?)'),
        addEdge  = db.prepare(
            'INSERT INTO Edges (id, user_id, source, target, type, data) VALUES (?, ?, ?, ?, ?, ?)'
        );

    for (const node of manifest.nodes.map(createGraphBootSeedNodeRecord)) {
        addNode.run(node.id, null, JSON.stringify(node))
    }
    for (const [index, edge] of manifest.edges.map(createGraphBootSeedEdgeRecord).entries()) {
        const record = {id: `boot-edge-${index}`, ...edge};

        addEdge.run(
            record.id,
            null,
            record.source,
            record.target,
            record.type,
            JSON.stringify(record)
        )
    }
}

function validateAdapterContext(context) {
    if (!context.fixture?.paths ||
        !context.fixture?.profile ||
        !Number.isInteger(context.fixture?.dimension)) {
        throw new TypeError('restore target-set measurement adapter requires a complete fixture')
    }

    for (const name of [
        'recordBatch',
        'recordCheckpoint',
        'recordProgress',
        'recordProviderCall',
        'registerProcess',
        'registerSharedRole',
        'sampleNow',
        'traceProviders'
    ]) {
        if (typeof context[name] !== 'function') {
            throw new TypeError(`restore target-set measurement adapter requires ${name}()`)
        }
    }
}
