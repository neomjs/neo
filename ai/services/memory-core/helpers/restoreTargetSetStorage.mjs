import fs   from 'node:fs/promises';
import path from 'node:path';

import {
    evaluateGraphBootSeedFreshness
} from '../../../graph/bootSeedManifest.mjs';
import {importGraphJsonl} from './graphJsonlImport.mjs';
import {
    fingerprintRestoreSourceFile,
    normalizeRestoreTargetSetAdmission
} from './restoreTargetSetAdmission.mjs';
import {
    fingerprintCanonical,
    RESTORE_TARGET_ROLES
} from './restoreTargetSetContract.mjs';
import {
    importVectorJsonlToEmptyCollection,
    validateVectorCollectionFromJsonl
} from './vectorJsonlImport.mjs';
import {
    assertCapturedPromoteView,
    captureVectorPromoteView,
    recordPromoteCompletion
} from '../../shared/vector/generationElectionStore.mjs';

/**
 * @module ai/services/memory-core/helpers/restoreTargetSetStorage
 * @summary Production store adapter for the fenced `restore-empty-target`
 * controller.
 *
 * Chroma components use run-owned shadow and parking collections. Graph staging
 * uses one run-owned SQLite file and promotes last in a single SQLite
 * transaction. Reconciliation compares strict-ledger state with actual stores;
 * it never infers a missing transition from observed live state.
 */

const VECTOR_ROLES = Object.freeze(['memories', 'summaries']);

// Election census keys for the vector roles this seam promotes. The graph component is SQLite,
// not an embedding collection, so it is deliberately outside the vector-generation election; the
// temporal-summary collection has no restore seam here — its promote path belongs to the
// resumable rebuild runner, which calls the election fence directly.
const ELECTION_KEY_BY_ROLE = Object.freeze({memories: 'mc.memory', summaries: 'mc.session'});

/**
 * @summary Creates store collaborators consumed by
 * `createRestoreEmptyTargetOperation`.
 *
 * @param {Object} options
 * @param {Object} options.chromaClient Raw Chroma client.
 * @param {Object} options.dummyEmbeddingFunction Provider-free EF.
 * @param {Object} options.graphDb Open production better-sqlite3 graph DB.
 * @param {Object} options.expectedDestinations `{memories,summaries,graph}`.
 * @param {String} options.stagingRoot Gitignored run-owned staging directory.
 * @param {String} [options.electionDir=null] Shared vector-generation election directory (resolved
 * by the entrypoint from its per-server config). When set, every vector-role promote passes the
 * stale-writer fence and reports completion; `null` means a plane without election gating
 * (tests / pre-adoption planes).
 * @param {Function} [options.invalidateCollectionCache=()=>{}] Cache invalidator.
 * @param {Function} [options.syncGraphCache=()=>{}] Native graph cache sync.
 * @param {Function} [options.onPhase=()=>{}] Measurement/diagnostic observer.
 * @returns {Object} Controller collaborator methods.
 */
export function createRestoreTargetSetStorage({
    chromaClient,
    dummyEmbeddingFunction,
    graphDb,
    expectedDestinations,
    stagingRoot,
    electionDir = null,
    invalidateCollectionCache = () => {},
    syncGraphCache = () => {},
    onPhase = () => {}
} = {}) {
    validateDependencies({
        chromaClient,
        dummyEmbeddingFunction,
        graphDb,
        expectedDestinations,
        stagingRoot,
        invalidateCollectionCache,
        syncGraphCache,
        onPhase
    });

    // One captured view per restore run: every role's promote validates against the SAME view, so
    // a generation commit landing between two role promotes cannot split one run across generations.
    let promoteViewPromise = null;

    function capturePromoteViewOnce() {
        promoteViewPromise ??= captureVectorPromoteView({dir: electionDir});
        return promoteViewPromise
    }

    return {
        inspectFreshTargetSet,
        stageTargetSet,
        validateStagedTargetSet,
        promoteComponent,
        revalidateProductionTargetSet,
        reconcileAttempt,
        cleanupUnpromotedStaging,
        cleanupCommittedArtifacts
    };

    /**
     * @summary Proves that both canonical vector collections exist and that the
     * complete production target set remains seed-aware empty.
     */
    async function inspectFreshTargetSet(context) {
        const admission = normalizeContext(context, expectedDestinations);
        onPhase({phase: 'action-time-proof', event: 'start'});

        const
            memories       = await getCollection(expectedDestinations.memories),
            summaries      = await getCollection(expectedDestinations.summaries),
            memoryCount    = memories ? await memories.count() : null,
            summaryCount   = summaries ? await summaries.count() : null,
            graphFreshness = inspectGraphBootFreshness(graphDb),
            fresh          = memoryCount === 0 &&
                summaryCount === 0 &&
                graphFreshness.fresh;

        const reasons = [];
        if (!memories) {
            reasons.push(`canonical memories collection '${expectedDestinations.memories}' is missing`)
        } else if (memoryCount !== 0) {
            reasons.push(`memories count is ${memoryCount}`)
        }
        if (!summaries) {
            reasons.push(`canonical summaries collection '${expectedDestinations.summaries}' is missing`)
        } else if (summaryCount !== 0) {
            reasons.push(`summaries count is ${summaryCount}`)
        }
        if (!graphFreshness.fresh) reasons.push(graphFreshness.reason);

        const result = {
            fresh,
            reason                        : reasons.join('; ') || null,
            destinationTopologyFingerprint: context.descriptor.destinationTopologyFingerprint,
            admissionDescriptorFingerprint: admission.descriptorFingerprint,
            components                    : {
                memories : {count: memoryCount, exists: Boolean(memories)},
                summaries: {count: summaryCount, exists: Boolean(summaries)},
                graph    : graphFreshness
            }
        };

        onPhase({phase: 'action-time-proof', event: 'complete', result});
        return result
    }

    async function stageTargetSet(context) {
        const
            admission = normalizeContext(context, expectedDestinations),
            staging   = createStagingDescriptor({
                attemptFingerprint: context.attemptFingerprint,
                expectedDestinations,
                stagingRoot
            });

        await fs.mkdir(stagingRoot, {recursive: true});

        for (const role of VECTOR_ROLES) {
            onPhase({phase: `stage-${role}`, event: 'start'});
            await ensureVectorShadow({
                role,
                component        : admission.components[role],
                expectedDimension: admission.expectedDimension,
                shadowName       : staging.collections[role].shadow
            });
            onPhase({phase: `stage-${role}`, event: 'complete'})
        }

        onPhase({phase: 'stage-graph', event: 'start'});
        await ensureGraphStaging({
            graphPath: staging.graphPath,
            component: admission.components.graph
        });
        onPhase({phase: 'stage-graph', event: 'complete'});

        return staging
    }

    async function validateStagedTargetSet(context) {
        const
            admission = normalizeContext(context, expectedDestinations),
            staging   = context.staging ?? createStagingDescriptor({
                attemptFingerprint: context.attemptFingerprint,
                expectedDestinations,
                stagingRoot
            });

        onPhase({phase: 'validate-staged-target-set', event: 'start'});
        const components = {};

        for (const role of VECTOR_ROLES) {
            const collection = await getCollection(staging.collections[role].shadow);
            if (!collection) {
                return {valid: false, reason: `missing ${role} staging collection`}
            }

            components[role] = await validateVectorCollectionFromJsonl({
                collection,
                filePath               : admission.components[role].filePath,
                expectedDimension      : admission.expectedDimension,
                expectedFileFingerprint: admission.components[role].fileFingerprint,
                expectedRowCount       : admission.components[role].rowCount
            })
        }

        components.graph = await validateGraphFile({
            graphPath: staging.graphPath,
            component: admission.components.graph
        });

        const result = {
            valid                : true,
            componentFingerprints: projectFingerprints(components),
            components
        };

        onPhase({phase: 'validate-staged-target-set', event: 'complete', result});
        return result
    }

    async function promoteComponent(context) {
        const
            admission = normalizeContext(context, expectedDestinations),
            staging   = context.staging ?? createStagingDescriptor({
                attemptFingerprint: context.attemptFingerprint,
                expectedDestinations,
                stagingRoot
            }),
            role      = context.role;

        if (!RESTORE_TARGET_ROLES.includes(role)) {
            throw new Error(`unknown restore target-set promotion role '${role}'`)
        }

        onPhase({phase: `promote-${role}`, event: 'start'});

        const electionKey      = ELECTION_KEY_BY_ROLE[role];
        let   promoteAdmission = null;

        if (electionDir && electionKey) {
            promoteAdmission = await assertCapturedPromoteView({
                dir          : electionDir,
                collectionKey: electionKey,
                view         : await capturePromoteViewOnce()
            })
        }

        const result = role === 'graph'
            ? await promoteGraph({
                graphPath: staging.graphPath,
                component: admission.components.graph
            })
            : await promoteVector({
                role,
                component        : admission.components[role],
                expectedDimension: admission.expectedDimension,
                names            : staging.collections[role]
            });

        if (promoteAdmission?.mode === 'elected' && promoteAdmission.electionStatus === 'committed') {
            try {
                await recordPromoteCompletion({dir: electionDir, collectionKey: electionKey, expectedEpoch: promoteAdmission.epoch})
            } catch (completionError) {
                // The promote landed; a lost completion mark only keeps acceptance blocked
                // (rollback authority retained) — never unwind a successful promote for bookkeeping.
                onPhase({phase: `promote-${role}`, event: 'election-completion-failed', error: completionError.message})
            }
        }

        onPhase({phase: `promote-${role}`, event: 'complete', result});
        return result
    }

    async function revalidateProductionTargetSet(context) {
        const admission = normalizeContext(context, expectedDestinations);
        onPhase({phase: 'revalidate-production', event: 'start'});

        const components = {};

        for (const role of VECTOR_ROLES) {
            components[role] = await validateVectorCollectionFromJsonl({
                collection             : await getCanonicalCollection(role),
                filePath               : admission.components[role].filePath,
                expectedDimension      : admission.expectedDimension,
                expectedFileFingerprint: admission.components[role].fileFingerprint,
                expectedRowCount       : admission.components[role].rowCount
            })
        }

        components.graph = validateGraphDatabase({
            db       : graphDb,
            component: admission.components.graph
        });

        const result = {
            valid                : true,
            componentFingerprints: projectFingerprints(components),
            components
        };

        onPhase({phase: 'revalidate-production', event: 'complete', result});
        return result
    }

    /**
     * @summary Reconciles strict-ledger state with canonical, shadow, and
     * parking storage without inferring an unrecorded promotion transition.
     */
    async function reconcileAttempt(context) {
        const
            admission = normalizeContext(context, expectedDestinations),
            staging   = createStagingDescriptor({
                attemptFingerprint: context.attemptFingerprint,
                expectedDestinations,
                stagingRoot
            }),
            transitions = context.transitions ?? [],
            latest      = transitions.at(-1)?.state ?? null,
            staged      = transitions.some(item => item.state === 'staged'),
            observed    = {};

        for (const role of VECTOR_ROLES) {
            const
                promoted  = transitions.some(item => item.state === `promoted:${role}`),
                canonical = await getCollection(expectedDestinations[role]),
                shadow    = await getCollection(staging.collections[role].shadow),
                parking   = await getCollection(staging.collections[role].parking),
                liveCount = canonical ? await canonical.count() : null;

            observed[role] = {
                canonical: Boolean(canonical),
                liveCount,
                shadow   : Boolean(shadow),
                parking  : Boolean(parking)
            };

            if (!canonical) {
                return unsafeReconciliation(
                    parking
                        ? `${role} canonical storage is missing after vector promotion began`
                        : `${role} canonical storage is missing`,
                    observed
                )
            }

            if (promoted) {
                if (!parking || shadow || liveCount !== admission.components[role].rowCount) {
                    return unsafeReconciliation(
                        `${role} storage does not match its promoted ledger state`,
                        observed
                    )
                }
                try {
                    await validateVectorCollectionFromJsonl({
                        collection             : canonical,
                        filePath               : admission.components[role].filePath,
                        expectedDimension      : admission.expectedDimension,
                        expectedFileFingerprint: admission.components[role].fileFingerprint,
                        expectedRowCount       : admission.components[role].rowCount
                    })
                } catch (error) {
                    return unsafeReconciliation(`${role} promoted fingerprint mismatch: ${error.message}`, observed)
                }
            } else {
                if (liveCount !== 0 || parking) {
                    return unsafeReconciliation(
                        `${role} live storage advanced without a promoted transition`,
                        observed
                    )
                }
                if (staged && !shadow) {
                    return unsafeReconciliation(
                        `${role} staging is missing for ledger state ${latest}`,
                        observed
                    )
                }
            }
        }

        const
            graphPromoted  = transitions.some(item => item.state === 'promoted:graph'),
            graphFreshness = inspectGraphBootFreshness(graphDb);

        observed.graph = {
            liveFingerprint: fingerprintGraphDatabase(graphDb),
            stagingPath    : staging.graphPath
        };

        if (graphPromoted) {
            try {
                validateGraphDatabase({db: graphDb, component: admission.components.graph})
            } catch (error) {
                return unsafeReconciliation(`graph promoted fingerprint mismatch: ${error.message}`, observed)
            }
        } else if (!graphFreshness.fresh) {
            return unsafeReconciliation(
                'graph live storage advanced without a promoted transition',
                observed
            )
        }

        if (staged) {
            try {
                const result = await validateStagedTargetSet({...context, staging});
                if (!result.valid) {
                    return unsafeReconciliation(result.reason, observed)
                }
            } catch (error) {
                return unsafeReconciliation(`staging reconciliation failed: ${error.message}`, observed)
            }
        }

        return {
            safe         : true,
            staging,
            observedState: latest,
            observed
        }
    }

    /**
     * @summary Deletes run-owned staging only when neither the ledger nor
     * vector-store topology indicates that production promotion may have begun.
     */
    async function cleanupUnpromotedStaging(context) {
        const transitions = context.transitions ?? [];

        if (transitions.some(item => item.state.startsWith('promoted:'))) {
            throw new Error('refusing to delete restore staging after production promotion began')
        }

        const staging = context.staging ?? createStagingDescriptor({
            attemptFingerprint: context.attemptFingerprint,
            expectedDestinations,
            stagingRoot
        });

        for (const role of VECTOR_ROLES) {
            const
                canonical = await getCollection(expectedDestinations[role]),
                parking   = await getCollection(staging.collections[role].parking);

            if (!canonical || parking) {
                throw new Error(
                    `refusing to delete restore staging because ${role} vector promotion may have begun`
                )
            }
        }

        for (const role of VECTOR_ROLES) {
            await deleteRunOwnedCollection(staging.collections[role].shadow)
        }

        await removeGraphStaging(staging.graphPath)
    }

    async function cleanupCommittedArtifacts(context) {
        const staging = createStagingDescriptor({
            attemptFingerprint: context.attemptFingerprint,
            expectedDestinations,
            stagingRoot
        });

        for (const role of VECTOR_ROLES) {
            await deleteRunOwnedCollection(staging.collections[role].parking)
        }

        await removeGraphStaging(staging.graphPath)
    }

    async function ensureVectorShadow({
        role,
        component,
        expectedDimension,
        shadowName
    }) {
        let shadow = await getCollection(shadowName);

        if (shadow) {
            try {
                return await validateVectorCollectionFromJsonl({
                    collection             : shadow,
                    filePath               : component.filePath,
                    expectedDimension,
                    expectedFileFingerprint: component.fileFingerprint,
                    expectedRowCount       : component.rowCount
                })
            } catch {
                await deleteRunOwnedCollection(shadowName);
                shadow = null
            }
        }

        shadow = await chromaClient.createCollection({
            name             : shadowName,
            embeddingFunction: dummyEmbeddingFunction,
            metadata         : {
                'neo:owner': 'restore-empty-target',
                'neo:role' : role
            }
        });

        return importVectorJsonlToEmptyCollection({
            collection             : shadow,
            filePath               : component.filePath,
            expectedDimension,
            expectedFileFingerprint: component.fileFingerprint,
            expectedRowCount       : component.rowCount,
            recordBatch            : receipt => onPhase({
                phase: `stage-${role}`,
                event: 'batch',
                receipt
            })
        })
    }

    async function ensureGraphStaging({graphPath, component}) {
        try {
            return await validateGraphFile({graphPath, component})
        } catch {
            await removeGraphStaging(graphPath)
        }

        const db = await openGraphStagingDatabase(graphPath);

        try {
            const fingerprint = await fingerprintRestoreSourceFile(component.filePath);
            if (fingerprint !== component.fileFingerprint) {
                throw new Error('restore graph source changed after admission')
            }

            const receipt = await importGraphJsonl({
                db,
                filePath: component.filePath,
                mode    : 'replace'
            });

            if (receipt.counts.nodes.failed !== 0 ||
                receipt.counts.edges.failed !== 0) {
                throw new Error('restore graph staging importer rejected one or more records')
            }
        } finally {
            db.close()
        }

        return validateGraphFile({graphPath, component})
    }

    async function validateGraphFile({graphPath, component}) {
        const db = await openGraphStagingDatabase(graphPath, {create: false});
        try {
            return validateGraphDatabase({db, component})
        } finally {
            db.close()
        }
    }

    async function promoteVector({
        role,
        component,
        expectedDimension,
        names
    }) {
        const
            live   = await getCanonicalCollection(role),
            shadow = await getCollection(names.shadow);

        if (!shadow) {
            throw new Error(`restore ${role} shadow collection is missing`)
        }
        if (await live.count() !== 0) {
            throw new Error(`restore ${role} live collection changed before promotion`)
        }
        if (await getCollection(names.parking)) {
            throw new Error(`restore ${role} parking collection already exists`)
        }

        await validateVectorCollectionFromJsonl({
            collection             : shadow,
            filePath               : component.filePath,
            expectedDimension,
            expectedFileFingerprint: component.fileFingerprint,
            expectedRowCount       : component.rowCount
        });

        await live.modify({name: names.parking});
        await shadow.modify({name: expectedDestinations[role]});
        invalidateCollectionCache(role === 'memories' ? 'memory' : 'summary');

        const canonical = await getCanonicalCollection(role);
        await validateVectorCollectionFromJsonl({
            collection             : canonical,
            filePath               : component.filePath,
            expectedDimension,
            expectedFileFingerprint: component.fileFingerprint,
            expectedRowCount       : component.rowCount
        });

        return {
            fingerprint: component.fileFingerprint,
            count      : component.rowCount,
            parkingName: names.parking
        }
    }

    async function promoteGraph({graphPath, component}) {
        await withGraphStagingDb(
            graphPath,
            db => validateGraphDatabase({db, component})
        );

        const fresh = inspectGraphBootFreshness(graphDb);
        if (!fresh.fresh) {
            throw new Error(`restore graph live database changed before promotion: ${fresh.reason}`)
        }

        graphDb.prepare('ATTACH DATABASE ? AS restore_stage').run(graphPath);
        try {
            graphDb.transaction(() => {
                graphDb.prepare('DELETE FROM restore_stage.PriorEdges').run();
                graphDb.prepare('DELETE FROM restore_stage.PriorNodes').run();
                graphDb.prepare(`
                    INSERT INTO restore_stage.PriorNodes (id, user_id, data)
                    SELECT id, user_id, data FROM main.Nodes
                `).run();
                graphDb.prepare(`
                    INSERT INTO restore_stage.PriorEdges (id, user_id, source, target, type, data)
                    SELECT id, user_id, source, target, type, data FROM main.Edges
                `).run();

                graphDb.prepare('DELETE FROM main.Edges').run();
                graphDb.prepare('DELETE FROM main.Nodes').run();
                graphDb.prepare(`
                    INSERT INTO main.Nodes (id, user_id, data)
                    SELECT id, user_id, data FROM restore_stage.Nodes
                `).run();
                graphDb.prepare(`
                    INSERT INTO main.Edges (id, user_id, source, target, type, data)
                    SELECT id, user_id, source, target, type, data FROM restore_stage.Edges
                `).run()
            }).immediate()
        } finally {
            graphDb.prepare('DETACH DATABASE restore_stage').run()
        }

        syncGraphCache();
        const result = validateGraphDatabase({db: graphDb, component});

        return {
            fingerprint: result.fingerprint,
            count      : result.rowCount
        }
    }

    async function getCanonicalCollection(role) {
        const collection = await getCollection(expectedDestinations[role]);
        if (!collection) {
            throw new Error(`canonical ${role} collection '${expectedDestinations[role]}' is missing`)
        }
        return collection
    }

    async function getCollection(name) {
        try {
            return await chromaClient.getCollection({
                name,
                embeddingFunction: dummyEmbeddingFunction
            })
        } catch (error) {
            if (isCollectionMissing(error)) {
                return null
            }
            throw error
        }
    }

    async function deleteRunOwnedCollection(name) {
        if (!isRunOwnedCollectionName(name)) {
            throw new Error(`refusing to delete non-run-owned collection '${name}'`)
        }

        if (await getCollection(name)) {
            await chromaClient.deleteCollection({name})
        }
    }
}

function normalizeContext(context, expectedDestinations) {
    const descriptor = context?.descriptor;
    assertDestinationIdentity(descriptor, expectedDestinations);
    return normalizeRestoreTargetSetAdmission(context?.targetSet?.admission, descriptor)
}

function assertDestinationIdentity(descriptor, expected) {
    const byRole = Object.fromEntries(
        (descriptor?.destinations ?? []).map(item => [item.role, item.id])
    );

    for (const role of RESTORE_TARGET_ROLES) {
        if (byRole[role] !== expected[role]) {
            throw new Error(
                `restore target-set ${role} destination '${byRole[role] ?? 'missing'}' ` +
                `does not match configured '${expected[role]}'`
            )
        }
    }
}

function createStagingDescriptor({
    attemptFingerprint,
    expectedDestinations,
    stagingRoot
}) {
    const suffix = attemptFingerprint.replace('sha256:', '').slice(0, 20);

    return {
        owner      : 'restore-empty-target',
        attemptFingerprint,
        collections: {
            memories: {
                shadow : `${expectedDestinations.memories}-restore-shadow-${suffix}`,
                parking: `${expectedDestinations.memories}-restore-parking-${suffix}`
            },
            summaries: {
                shadow : `${expectedDestinations.summaries}-restore-shadow-${suffix}`,
                parking: `${expectedDestinations.summaries}-restore-parking-${suffix}`
            }
        },
        graphPath: path.join(stagingRoot, `${suffix}.sqlite`)
    }
}

function inspectGraphBootFreshness(db) {
    return evaluateGraphBootSeedFreshness({
        nodes: db.prepare('SELECT data FROM Nodes ORDER BY id').all(),
        edges: db.prepare('SELECT data FROM Edges ORDER BY id').all()
    })
}

function validateGraphDatabase({db, component}) {
    const
        nodeRows = db.prepare('SELECT data FROM Nodes ORDER BY id').all(),
        edgeRows = db.prepare('SELECT data FROM Edges ORDER BY id').all(),
        result   = {
            valid      : true,
            rowCount   : nodeRows.length + edgeRows.length,
            nodeCount  : nodeRows.length,
            edgeCount  : edgeRows.length,
            fingerprint: fingerprintGraphRecords({
                nodes: nodeRows,
                edges: edgeRows
            })
        };

    if (result.rowCount !== component.rowCount ||
        result.nodeCount !== component.nodeCount ||
        result.edgeCount !== component.edgeCount ||
        result.fingerprint !== component.recordFingerprint) {
        throw new Error(
            `restore graph validation mismatch: rows=${result.rowCount}/${component.rowCount}, ` +
            `nodes=${result.nodeCount}/${component.nodeCount}, ` +
            `edges=${result.edgeCount}/${component.edgeCount}, ` +
            `fingerprint=${result.fingerprint}/${component.recordFingerprint}`
        )
    }

    return result
}

function fingerprintGraphDatabase(db) {
    return fingerprintGraphRecords({
        nodes: db.prepare('SELECT data FROM Nodes ORDER BY id').all(),
        edges: db.prepare('SELECT data FROM Edges ORDER BY id').all()
    })
}

function fingerprintGraphRecords({nodes, edges}) {
    return fingerprintCanonical({
        nodes: nodes.map(parseGraphRow).map(canonicalJson).sort(),
        edges: edges.map(parseGraphRow).map(canonicalJson).sort()
    })
}

async function openGraphStagingDatabase(filePath, {create = true} = {}) {
    if (!create) {
        await fs.access(filePath)
    } else {
        await fs.mkdir(path.dirname(filePath), {recursive: true})
    }

    const Database = (await import('better-sqlite3')).default;
    const db       = new Database(filePath);

    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(`
        CREATE TABLE IF NOT EXISTS Nodes (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            data TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS Edges (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            source TEXT NOT NULL,
            target TEXT NOT NULL,
            type TEXT NOT NULL,
            data TEXT NOT NULL,
            FOREIGN KEY (source) REFERENCES Nodes(id) ON DELETE CASCADE,
            FOREIGN KEY (target) REFERENCES Nodes(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS PriorNodes (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            data TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS PriorEdges (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            source TEXT NOT NULL,
            target TEXT NOT NULL,
            type TEXT NOT NULL,
            data TEXT NOT NULL
        );
    `);

    return db
}

async function withGraphStagingDb(filePath, callback) {
    const db = await openGraphStagingDatabase(filePath, {create: false});
    try {
        return callback(db)
    } finally {
        db.close()
    }
}

async function removeGraphStaging(filePath) {
    for (const candidate of [filePath, `${filePath}-wal`, `${filePath}-shm`]) {
        await fs.rm(candidate, {force: true})
    }
}

function projectFingerprints(components) {
    return Object.fromEntries(
        RESTORE_TARGET_ROLES.map(role => [role, components[role].fingerprint])
    )
}

function unsafeReconciliation(reason, observedState) {
    return {
        safe: false,
        reason,
        observedState
    }
}

function parseGraphRow(row) {
    return typeof row === 'string'
        ? JSON.parse(row)
        : typeof row?.data === 'string' ? JSON.parse(row.data) : row
}

function canonicalJson(value) {
    if (Array.isArray(value)) {
        return `[${value.map(canonicalJson).join(',')}]`
    }
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
    }
    return JSON.stringify(value)
}

function isCollectionMissing(error) {
    return /not found|does not exist|could not be found/i.test(error?.message ?? '')
}

function isRunOwnedCollectionName(name) {
    return typeof name === 'string' &&
        /-restore-(?:shadow|parking)-[0-9a-f]{20}$/.test(name)
}

function validateDependencies(options) {
    for (const method of ['createCollection', 'deleteCollection', 'getCollection']) {
        if (typeof options.chromaClient?.[method] !== 'function') {
            throw new TypeError(`restore target-set Chroma client requires ${method}()`)
        }
    }
    if (!options.dummyEmbeddingFunction ||
        typeof options.dummyEmbeddingFunction.generate !== 'function') {
        throw new TypeError('restore target-set dummyEmbeddingFunction is required')
    }
    if (!options.graphDb ||
        typeof options.graphDb.prepare !== 'function' ||
        typeof options.graphDb.transaction !== 'function') {
        throw new TypeError('restore target-set production graphDb is required')
    }
    for (const role of RESTORE_TARGET_ROLES) {
        if (typeof options.expectedDestinations?.[role] !== 'string' ||
            options.expectedDestinations[role].length === 0) {
            throw new TypeError(`restore target-set expectedDestinations.${role} is required`)
        }
    }
    if (typeof options.stagingRoot !== 'string' ||
        options.stagingRoot.length === 0) {
        throw new TypeError('restore target-set stagingRoot is required')
    }
    for (const name of [
        'invalidateCollectionCache',
        'syncGraphCache',
        'onPhase'
    ]) {
        if (typeof options[name] !== 'function') {
            throw new TypeError(`restore target-set ${name} must be a function`)
        }
    }
}
