import fs   from 'node:fs/promises';
import os   from 'node:os';
import path from 'node:path';

import {setup}        from '../../../../../setup.mjs';
import {test, expect} from '@playwright/test';
import Database       from 'better-sqlite3';

import '../../../../../../../src/Neo.mjs';

import {
    createGraphBootSeedEdgeRecord,
    createGraphBootSeedManifest,
    createGraphBootSeedNodeRecord
} from '../../../../../../../ai/graph/bootSeedManifest.mjs';
import {
    createRestoreEmptyTargetOperation
} from '../../../../../../../ai/services/memory-core/helpers/restoreEmptyTargetOperation.mjs';
import {
    admitRestoreTargetSetBundle
} from '../../../../../../../ai/services/memory-core/helpers/restoreTargetSetAdmission.mjs';
import {
    createRestoreTargetSetStorage
} from '../../../../../../../ai/services/memory-core/helpers/restoreTargetSetStorage.mjs';
import {
    appendRestoreTargetSetTransition,
    readRestoreTargetSetTransitions
} from '../../../../../../../ai/services/memory-core/helpers/restoreTargetSetStateStore.mjs';
import {
    createRestoreTargetSetDescriptor,
    deriveRestoreTargetSetIdentity
} from '../../../../../../../ai/services/memory-core/helpers/restoreTargetSetContract.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'RestoreTargetSetStorageTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

test.describe('restoreTargetSetStorage — fake Chroma + disposable SQLite target set', () => {
    let fixture;

    test.beforeEach(async () => {
        fixture = await createFixture()
    });

    test.afterEach(async () => {
        fixture.graphDb.close();
        await fs.rm(fixture.root, {recursive: true, force: true})
    });

    test('stages, validates, promotes memories → summaries → graph, and commits provider-free', async () => {
        const
            phases    = [],
            storage   = createStorage(fixture, event => phases.push(event)),
            operation = createRestoreEmptyTargetOperation({
                withWriterFence: async (identity, task) => task(),
                ...storage,
                readTransitions: ({attemptFingerprint}) => readRestoreTargetSetTransitions({
                    dir: fixture.ledgerDir,
                    attemptFingerprint
                }),
                appendTransition: input => appendRestoreTargetSetTransition(input, {
                    dir: fixture.ledgerDir
                })
            }),
            identity = deriveRestoreTargetSetIdentity(fixture.targetSet),
            outcome  = await operation({
                targetSet: fixture.targetSet,
                ...identity
            });

        expect(outcome).toMatchObject({
            status: 'committed',
            detail: {
                terminal       : 'committed',
                serviceEligible: true
            }
        });
        expect(await fixture.client.getCollection({
            name: fixture.destinations.memories
        }).then(collection => collection.count())).toBe(3);
        expect(await fixture.client.getCollection({
            name: fixture.destinations.summaries
        }).then(collection => collection.count())).toBe(2);
        expect(fixture.graphDb.prepare('SELECT COUNT(*) AS count FROM Nodes').get().count).toBe(2);
        expect(fixture.graphDb.prepare('SELECT COUNT(*) AS count FROM Edges').get().count).toBe(1);
        expect(fixture.providerCalls).toBe(0);
        expect(fixture.cacheInvalidations).toEqual(['memory', 'summary']);
        expect(fixture.graphCacheSyncs).toBe(1);

        const phaseNames = phases
            .filter(event => event.event === 'complete')
            .map(event => event.phase);

        expect(phaseNames).toEqual([
            'action-time-proof',
            'stage-memories',
            'stage-summaries',
            'stage-graph',
            'validate-staged-target-set',
            'promote-memories',
            'promote-summaries',
            'promote-graph',
            'revalidate-production'
        ]);

        const transitions = await readRestoreTargetSetTransitions({
            dir               : fixture.ledgerDir,
            attemptFingerprint: identity.attemptFingerprint
        });
        expect(transitions.map(item => item.state)).toEqual([
            'admitted',
            'fenced',
            'staged',
            'promoted:memories',
            'promoted:summaries',
            'promoted:graph',
            'validated',
            'committed'
        ])
    });

    test('rejects a non-seed graph under the fence with zero staging/promotion', async () => {
        fixture.graphDb.prepare(
            'INSERT INTO Nodes (id, user_id, data) VALUES (?, ?, ?)'
        ).run('unexpected', null, JSON.stringify({
            id        : 'unexpected',
            label     : 'NODE',
            properties: {}
        }));

        const
            storage  = createStorage(fixture),
            identity = deriveRestoreTargetSetIdentity(fixture.targetSet),
            proof    = await storage.inspectFreshTargetSet({
                targetSet : fixture.targetSet,
                descriptor: identity.descriptor,
                ...identity
            });

        expect(proof.fresh).toBe(false);
        expect(proof.reason).toContain('persisted graph differs from boot seed')
    });

    test('an election landing during staging fences every vector promote of that attempt (#17035)', async () => {
        const {
            VECTOR_PLANE_COLLECTION_KEYS,
            commitVectorGenerationElection,
            createVectorGenerationIdentity,
            declareBaselineVectorGeneration,
            declareCandidateVectorGeneration,
            recordCandidateValidationReceipt
        } = await import('../../../../../../../ai/services/shared/vector/generationElectionStore.mjs');

        const electionDir = path.join(fixture.root, 'election');
        const identityFor = model => createVectorGenerationIdentity({
            provider       : 'openAiCompatible',
            model,
            quantization   : 'q4_K_M',
            vectorDimension: 8,
            pooling        : 'last-token',
            distance       : 'cosine',
            strategyVersion: 'v1'
        });

        await declareBaselineVectorGeneration({
            dir     : electionDir,
            identity: identityFor('hf://fixture/G1@sha256:1111111111111111111111111111111111111111111111111111111111111111')
        });

        const
            storage = createRestoreTargetSetStorage({
                chromaClient          : fixture.client,
                dummyEmbeddingFunction: fixture.dummyEmbeddingFunction,
                graphDb               : fixture.graphDb,
                expectedDestinations  : fixture.destinations,
                stagingRoot           : fixture.stagingRoot,
                electionDir
            }),
            identity = deriveRestoreTargetSetIdentity(fixture.targetSet),
            context  = {
                targetSet : fixture.targetSet,
                descriptor: identity.descriptor,
                ...identity
            };

        // A promote before any staging refuses loudly — the view must exist for the attempt.
        await expect(storage.promoteComponent({...context, role: 'memories'}))
            .rejects.toThrow(/stage before promoting/);

        // Staging captures the attempt's election view (elected G1 at epoch 1).
        const staging = await storage.stageTargetSet(context);
        await storage.validateStagedTargetSet({...context, staging});

        // An election commits WHILE the attempt is between staging and promotion.
        await declareCandidateVectorGeneration({
            dir          : electionDir,
            identity     : identityFor('hf://fixture/G2@sha256:2222222222222222222222222222222222222222222222222222222222222222'),
            expectedEpoch: 1
        });
        for (const key of VECTOR_PLANE_COLLECTION_KEYS) {
            await recordCandidateValidationReceipt({
                dir          : electionDir, collectionKey: key,
                receipt      : {candidateCollection: `shadow-${key}`, rowCount: 1},
                expectedEpoch: 1
            })
        }
        await commitVectorGenerationElection({
            dir    : electionDir, expectedEpoch: 1,
            quiesce: {scope: 'staging-race-window', boundMs: 60 * 60 * 1000}
        });

        // The attempt's staged content was built under the pre-election view: every vector-role
        // promote is fenced as stale, and the graph promote (outside the vector election) is not.
        await expect(storage.promoteComponent({...context, staging, role: 'memories'}))
            .rejects.toThrow(/stale writer fenced/);
        await expect(storage.promoteComponent({...context, staging, role: 'summaries'}))
            .rejects.toThrow(/stale writer fenced/)
    });

    test('detects a live component that advanced without its strict transition', async () => {
        const
            storage  = createStorage(fixture),
            identity = deriveRestoreTargetSetIdentity(fixture.targetSet),
            context  = {
                targetSet : fixture.targetSet,
                descriptor: identity.descriptor,
                ...identity
            },
            staging = await storage.stageTargetSet(context);

        await storage.validateStagedTargetSet({...context, staging});
        await storage.promoteComponent({...context, staging, role: 'memories'});

        const reconciliation = await storage.reconcileAttempt({
            ...context,
            transitions: [
                transition(identity, 1, null, 'admitted'),
                transition(identity, 2, 'admitted', 'fenced'),
                transition(identity, 3, 'fenced', 'staged')
            ]
        });

        expect(reconciliation).toMatchObject({
            safe  : false,
            reason: 'memories live storage advanced without a promoted transition'
        })
    });

    for (const role of ['memories', 'summaries']) {
        test(`contains a crash between the ${role} canonical-to-parking and shadow-to-canonical renames`, async () => {
            const
                storage  = createStorage(fixture),
                identity = deriveRestoreTargetSetIdentity(fixture.targetSet),
                context  = {
                    targetSet : fixture.targetSet,
                    descriptor: identity.descriptor,
                    ...identity
                },
                staging   = await storage.stageTargetSet(context),
                states    = ['admitted', 'fenced', 'staged'],
                rowCounts = {memories: 3, summaries: 2};

            await storage.validateStagedTargetSet({...context, staging});

            if (role === 'summaries') {
                await storage.promoteComponent({...context, staging, role: 'memories'});
                states.push('promoted:memories')
            }

            for (const [index, state] of states.entries()) {
                await appendRestoreTargetSetTransition({
                    ...identity,
                    state,
                    at     : index + 1,
                    details: {}
                }, {dir: fixture.ledgerDir})
            }

            const live = await fixture.client.getCollection({
                name             : fixture.destinations[role],
                embeddingFunction: fixture.dummyEmbeddingFunction
            });

            await live.modify({name: staging.collections[role].parking});

            const transitions = await readRestoreTargetSetTransitions({
                dir               : fixture.ledgerDir,
                attemptFingerprint: identity.attemptFingerprint
            });
            const reconciliation = await storage.reconcileAttempt({
                ...context,
                transitions
            });

            expect(reconciliation).toMatchObject({
                safe         : false,
                reason       : `${role} canonical storage is missing after vector promotion began`,
                observedState: {
                    [role]: {
                        canonical: false,
                        liveCount: null,
                        shadow   : true,
                        parking  : true
                    }
                }
            });

            const freshProof = await storage.inspectFreshTargetSet(context);
            expect(freshProof).toMatchObject({
                fresh : false,
                reason: expect.stringContaining(
                    `canonical ${role} collection '${fixture.destinations[role]}' is missing`
                ),
                components: {
                    [role]: {
                        count : null,
                        exists: false
                    }
                }
            });

            await expect(storage.cleanupUnpromotedStaging({
                ...context,
                staging,
                transitions
            })).rejects.toThrow(
                role === 'memories'
                    ? 'refusing to delete restore staging because memories vector promotion may have begun'
                    : 'refusing to delete restore staging after production promotion began'
            );

            const operation = createRestoreEmptyTargetOperation({
                withWriterFence: async (identity, task) => task(),
                ...storage,
                readTransitions: ({attemptFingerprint}) => readRestoreTargetSetTransitions({
                    dir: fixture.ledgerDir,
                    attemptFingerprint
                }),
                appendTransition: input => appendRestoreTargetSetTransition(input, {
                    dir: fixture.ledgerDir
                })
            });
            const firstOutcome = await operation({
                targetSet: fixture.targetSet,
                ...identity
            });

            expect(firstOutcome).toMatchObject({
                status: 'failed-contained',
                detail: {
                    terminal       : 'failed-contained',
                    serviceEligible: false
                }
            });

            const terminalTransitions = await readRestoreTargetSetTransitions({
                dir               : fixture.ledgerDir,
                attemptFingerprint: identity.attemptFingerprint
            });
            const secondOutcome = await operation({
                targetSet: fixture.targetSet,
                ...identity
            });

            expect(secondOutcome).toMatchObject({
                status: 'failed-contained',
                detail: {
                    terminal       : 'failed-contained',
                    serviceEligible: false
                }
            });
            expect(await readRestoreTargetSetTransitions({
                dir               : fixture.ledgerDir,
                attemptFingerprint: identity.attemptFingerprint
            })).toEqual(terminalTransitions);
            expect(await fixture.client.getCollection({
                name             : staging.collections[role].shadow,
                embeddingFunction: fixture.dummyEmbeddingFunction
            }).then(collection => collection.count())).toBe(rowCounts[role]);
            expect(await fixture.client.getCollection({
                name             : staging.collections[role].parking,
                embeddingFunction: fixture.dummyEmbeddingFunction
            }).then(collection => collection.count())).toBe(0)
        })
    }
});

test.describe('restoreTargetSetStorage — live disposable Chroma + SQLite target set', () => {
    let AiConfig;
    let ChromaManager;
    let fixture;

    test.beforeAll(async () => {
        [
            {default: AiConfig},
            {default: ChromaManager}
        ] = await Promise.all([
            import('../../../../../../../ai/mcp/server/memory-core/config.template.mjs'),
            import('../../../../../../../ai/services/memory-core/managers/ChromaManager.mjs')
        ]);

        await ChromaManager.ready()
    });

    test.beforeEach(async ({}, testInfo) => {
        fixture = await createFixture({
            client                : ChromaManager.client,
            dummyEmbeddingFunction: AiConfig.dummyEmbeddingFunction,
            collectionSuffix      : `${process.pid}-${testInfo.workerIndex}-${Date.now()}`
        })
    });

    test.afterEach(async () => {
        await deleteFixtureCollections(fixture);
        fixture.graphDb.close();
        await fs.rm(fixture.root, {recursive: true, force: true})
    });

    test('executes the provider-free ordered promotion against the live Chroma SDK', async () => {
        const
            storage   = createStorage(fixture),
            operation = createRestoreEmptyTargetOperation({
                withWriterFence: async (identity, task) => task(),
                ...storage,
                readTransitions: ({attemptFingerprint}) => readRestoreTargetSetTransitions({
                    dir: fixture.ledgerDir,
                    attemptFingerprint
                }),
                appendTransition: input => appendRestoreTargetSetTransition(input, {
                    dir: fixture.ledgerDir
                })
            }),
            identity = deriveRestoreTargetSetIdentity(fixture.targetSet),
            outcome  = await operation({
                targetSet: fixture.targetSet,
                ...identity
            });

        expect(outcome).toMatchObject({
            status: 'committed',
            detail: {
                terminal       : 'committed',
                serviceEligible: true
            }
        });
        expect(await fixture.client.getCollection({
            name             : fixture.destinations.memories,
            embeddingFunction: fixture.dummyEmbeddingFunction
        }).then(collection => collection.count())).toBe(3);
        expect(await fixture.client.getCollection({
            name             : fixture.destinations.summaries,
            embeddingFunction: fixture.dummyEmbeddingFunction
        }).then(collection => collection.count())).toBe(2);
        expect(fixture.graphDb.prepare('SELECT COUNT(*) AS count FROM Nodes').get().count).toBe(2);
        expect(fixture.graphDb.prepare('SELECT COUNT(*) AS count FROM Edges').get().count).toBe(1);
        expect(fixture.providerCalls).toBe(0)
    });
});

async function createFixture({
    client = createFakeChromaClient(),
    dummyEmbeddingFunction = null,
    collectionSuffix = process.pid
} = {}) {
    const
        root               = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-restore-target-set-storage-')),
        bundleManifestPath = path.join(root, 'bundle-meta.json'),
        memoriesFile       = path.join(root, 'memory-backup.jsonl'),
        summariesFile      = path.join(root, 'summaries-backup.jsonl'),
        graphFile          = path.join(root, 'graph-backup.jsonl'),
        graphPath          = path.join(root, 'production-graph.sqlite'),
        ledgerDir          = path.join(root, 'ledger'),
        stagingRoot        = path.join(root, 'staging'),
        graphDb            = createGraphDb(graphPath),
        destinations       = {
            memories : `test-memories-${collectionSuffix}`,
            summaries: `test-summaries-${collectionSuffix}`,
            graph    : graphPath
        };

    let   providerCalls            = 0;
    const guardedEmbeddingFunction = dummyEmbeddingFunction ? {
        name       : dummyEmbeddingFunction.name,
        getConfig  : () => dummyEmbeddingFunction.getConfig(),
        constructor: dummyEmbeddingFunction.constructor,
        async generate(...args) {
            providerCalls++;
            return dummyEmbeddingFunction.generate(...args)
        }
    } : {
        name: 'neo-test-dummy',
        getConfig() {
            return {}
        },
        async generate() {
            providerCalls++;
            throw new Error('provider path must remain unused')
        }
    };

    await fs.writeFile(bundleManifestPath, JSON.stringify({bundleVersion: 1}));
    await writeJsonl(memoriesFile, [
        vectorRow('memory-1', [1, 0, 0]),
        vectorRow('memory-2', [0, 1, 0]),
        vectorRow('memory-3', [0, 0, 1])
    ]);
    await writeJsonl(summariesFile, [
        vectorRow('summary-1', [0.5, 0.5, 0]),
        vectorRow('summary-2', [0, 0.5, 0.5])
    ]);
    await writeJsonl(graphFile, [
        {
            type: 'node',
            data: {
                id        : 'restored-a',
                label     : 'MEMORY',
                properties: {name: 'A', userId: null}
            }
        },
        {
            type: 'node',
            data: {
                id        : 'restored-b',
                label     : 'SESSION',
                properties: {name: 'B', userId: null}
            }
        },
        {
            type: 'edge',
            data: {
                id        : 'restored-edge',
                source    : 'restored-a',
                target    : 'restored-b',
                type      : 'SUMMARIZED_IN',
                properties: {weight: 1, userId: null}
            }
        }
    ]);

    seedBootGraph(graphDb);
    await client.createCollection({
        name             : destinations.memories,
        embeddingFunction: guardedEmbeddingFunction
    });
    await client.createCollection({
        name             : destinations.summaries,
        embeddingFunction: guardedEmbeddingFunction
    });

    const admission = await admitRestoreTargetSetBundle({
        bundleManifestPath,
        memoriesFile,
        summariesFile,
        graphFile,
        expectedDimension: 3
    });
    const targetSet = {
        ...createRestoreTargetSetDescriptor({
            memoriesCollection            : destinations.memories,
            summariesCollection           : destinations.summaries,
            graphDestination              : destinations.graph,
            bundleManifestFingerprint     : admission.bundleManifestFingerprint,
            admissionDescriptorFingerprint: admission.descriptorFingerprint
        }),
        admission
    };

    return {
        root,
        ledgerDir,
        stagingRoot,
        client,
        graphDb,
        destinations,
        dummyEmbeddingFunction: guardedEmbeddingFunction,
        targetSet,
        cacheInvalidations    : [],
        graphCacheSyncs       : 0,
        get providerCalls() {
            return providerCalls
        }
    }
}

async function deleteFixtureCollections(fixture) {
    const
        identity = deriveRestoreTargetSetIdentity(fixture.targetSet),
        suffix   = identity.attemptFingerprint.replace('sha256:', '').slice(0, 20),
        names    = [
            fixture.destinations.memories,
            `${fixture.destinations.memories}-restore-shadow-${suffix}`,
            `${fixture.destinations.memories}-restore-parking-${suffix}`,
            fixture.destinations.summaries,
            `${fixture.destinations.summaries}-restore-shadow-${suffix}`,
            `${fixture.destinations.summaries}-restore-parking-${suffix}`
        ];

    for (const name of names) {
        try {
            await fixture.client.deleteCollection({name})
        } catch {}
    }
}

function createStorage(fixture, onPhase = () => {}) {
    return createRestoreTargetSetStorage({
        chromaClient          : fixture.client,
        dummyEmbeddingFunction: fixture.dummyEmbeddingFunction,
        graphDb               : fixture.graphDb,
        expectedDestinations  : fixture.destinations,
        stagingRoot           : fixture.stagingRoot,
        invalidateCollectionCache(type) {
            fixture.cacheInvalidations.push(type)
        },
        syncGraphCache() {
            fixture.graphCacheSyncs++
        },
        onPhase
    })
}

function createFakeChromaClient() {
    const collections = new Map();

    const client = {
        async createCollection({name}) {
            if (collections.has(name)) {
                throw new Error(`collection '${name}' already exists`)
            }

            const rows       = new Map();
            const collection = {
                name,
                async add({ids, embeddings, metadatas, documents}) {
                    ids.forEach((id, index) => {
                        if (rows.has(id)) {
                            throw new Error(`duplicate id '${id}'`)
                        }
                        rows.set(id, {
                            id,
                            embedding: [...embeddings[index]],
                            metadata : structuredClone(metadatas[index]),
                            document : documents[index]
                        })
                    })
                },
                async count() {
                    return rows.size
                },
                async get({ids}) {
                    const selected = ids
                        .filter(id => rows.has(id))
                        .map(id => rows.get(id));

                    return {
                        ids       : selected.map(row => row.id),
                        embeddings: selected.map(row => [...row.embedding]),
                        metadatas : selected.map(row => structuredClone(row.metadata)),
                        documents : selected.map(row => row.document)
                    }
                },
                async modify({name: nextName}) {
                    if (collections.has(nextName)) {
                        throw new Error(`collection '${nextName}' already exists`)
                    }
                    collections.delete(collection.name);
                    collection.name = nextName;
                    collections.set(nextName, collection)
                }
            };

            collections.set(name, collection);
            return collection
        },
        async deleteCollection({name}) {
            if (!collections.delete(name)) {
                throw new Error(`collection '${name}' not found`)
            }
        },
        async getCollection({name}) {
            const collection = collections.get(name);
            if (!collection) {
                throw new Error(`collection '${name}' not found`)
            }
            return collection
        }
    };

    return client
}

function createGraphDb(filePath) {
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

function seedBootGraph(db) {
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

function vectorRow(id, embedding) {
    return {
        id,
        embedding,
        metadata: {id},
        document: `document:${id}`
    }
}

async function writeJsonl(filePath, rows) {
    await fs.writeFile(
        filePath,
        `${rows.map(row => JSON.stringify(row)).join('\n')}\n`
    )
}

function transition(identity, sequence, previousState, state) {
    return {
        schemaVersion: 1,
        type         : 'restore-target-set-transition',
        ...identity,
        sequence,
        previousState,
        state,
        at     : sequence,
        details: {}
    }
}
