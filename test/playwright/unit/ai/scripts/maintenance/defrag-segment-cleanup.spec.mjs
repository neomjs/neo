import {setup} from '../../../../setup.mjs';

const appName = 'DefragSegmentCleanupTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}                                  from '@playwright/test';
import Neo                                             from '../../../../../../src/Neo.mjs';
import * as core                                       from '../../../../../../src/core/_export.mjs';
import {execSync}                                      from 'child_process';
import fs                                              from 'fs-extra';
import path                                            from 'path';
import {getEmbeddingFunction, knownEmbeddingFunctions} from 'chromadb';

/**
 * Verifies the unified-store-safe physical orphan cleanup in
 * `ai/scripts/maintenance/defragChromaDB.mjs`: `resolveLiveSegmentIds` +
 * `cleanOrphanedSegmentDirs`.
 *
 * Regression anchor: the prior step-6 keep-set was built from recreated *collection* ids,
 * but on-disk UUID dirs are named by *segment* id — a disjoint UUID space. The collection-id
 * keep-set therefore matched zero live dirs and deleted every live HNSW segment across BOTH
 * subsystems sharing the single unified persist dir (`learn/agentos/decisions/0003-chroma-topology-unified-only.md`).
 * These tests pin the corrected segment-registry keep-set with an explicit negative-mutation
 * assertion: live segment dirs (this target AND a sibling collection) survive; only true
 * orphans are removed.
 */
// Serial mode: shared dynamic-import symbol + tmp filesystem state. Mirrors the
// backup-retention.spec.mjs rationale; CI runs workers=1, this is a local-DX safeguard.
test.describe.configure({mode: 'serial'});

test.describe('defragChromaDB segment cleanup — unified-store-safe keep-set (#12140)', () => {
    let TARGETS;
    let assertDefragTargetSupported;
    let assertNoIncompleteDefragState;
    let clearDefragState;
    let createSwapCollectionName;
    let resolveLiveSegmentIds;
    let rewriteCollectionViaShadowPromotion;
    let cleanOrphanedSegmentDirs;
    let writeDefragState;
    let tmpRoot;
    let nudge            = 0;
    let sqlite3Available = false;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/scripts/maintenance/defragChromaDB.mjs');
        TARGETS                             = mod.TARGETS;
        assertDefragTargetSupported         = mod.assertDefragTargetSupported;
        assertNoIncompleteDefragState       = mod.assertNoIncompleteDefragState;
        clearDefragState                    = mod.clearDefragState;
        createSwapCollectionName            = mod.createSwapCollectionName;
        resolveLiveSegmentIds               = mod.resolveLiveSegmentIds;
        rewriteCollectionViaShadowPromotion = mod.rewriteCollectionViaShadowPromotion;
        cleanOrphanedSegmentDirs            = mod.cleanOrphanedSegmentDirs;
        writeDefragState                    = mod.writeDefragState;

        try {
            execSync('sqlite3 --version', {stdio: 'ignore'});
            sqlite3Available = true;
        } catch (e) {
            sqlite3Available = false;
        }
    });

    test.beforeEach(async () => {
        tmpRoot = path.resolve(process.cwd(), 'tmp', `defrag-segment-cleanup-${process.pid}-${Date.now()}-${++nudge}`);
        await fs.ensureDir(tmpRoot);
    });

    test.afterEach(async () => {
        if (tmpRoot && await fs.pathExists(tmpRoot)) {
            await fs.remove(tmpRoot);
        }
    });

    /**
     * Seeds a UUID-named directory simulating an on-disk HNSW segment dir, with a marker file.
     */
    async function seedSegmentDir(uuid) {
        const dirPath = path.join(tmpRoot, uuid);
        await fs.ensureDir(dirPath);
        await fs.writeFile(path.join(dirPath, 'data_level0.bin'), 'hnsw-index-marker');
        return uuid;
    }

    function createRegistryBackedCollection({name, registry, failModifyTo = null}) {
        const rows       = new Map();
        const collection = {
            name,
            calls: {
                add   : [],
                get   : [],
                modify: []
            },
            async add(payload) {
                this.calls.add.push(payload);
                for (let i = 0; i < payload.ids.length; i++) {
                    rows.set(payload.ids[i], {
                        embedding: payload.embeddings[i],
                        metadata : payload.metadatas[i],
                        document : payload.documents[i]
                    });
                }
            },
            async count() {
                return rows.size;
            },
            async get({ids, include = []} = {}) {
                this.calls.get.push({ids, include});
                const foundIds = (ids || []).filter(id => rows.has(id));
                return {ids: foundIds};
            },
            async modify({name: nextName}) {
                this.calls.modify.push({name: nextName});
                if (nextName === failModifyTo) {
                    throw new Error(`forced modify failure for ${nextName}`);
                }
                registry.delete(this.name);
                this.name = nextName;
                registry.set(nextName, this);
            },
            rows
        };

        registry.set(name, collection);
        return collection;
    }

    function createRegistryBackedClient({registry, shadowFailModifyTo = null}) {
        const calls = {
            createCollection: [],
            deleteCollection: [],
            getCollection   : []
        };
        const created = [];

        return {
            calls,
            created,
            async createCollection({name}) {
                calls.createCollection.push({name});
                const collection = createRegistryBackedCollection({
                    name,
                    registry,
                    failModifyTo: shadowFailModifyTo
                });
                created.push(collection);
                return collection;
            },
            async deleteCollection({name}) {
                calls.deleteCollection.push({name});
                registry.delete(name);
            },
            async getCollection({name}) {
                calls.getCollection.push({name});
                const collection = registry.get(name);
                if (!collection) {
                    throw new Error(`Collection ${name} not found`);
                }
                return collection;
            }
        };
    }

    function createCollectionData() {
        return {
            ids       : ['chunk-1', 'chunk-2'],
            embeddings: [[1, 0], [0, 1]],
            metadatas : [{source: 'a'}, {source: 'b'}],
            documents : [null, {body: 'object-doc'}]
        };
    }

    test('preserves every live segment dir (this target AND sibling) and removes only true orphans', async () => {
        // Realistic 36-char hyphenated segment-id UUIDs. Two are live (this target + a
        // sibling collection sharing the unified store); one is a true orphan absent from
        // the live registry.
        const thisTargetLive = '11111111-1111-4111-8111-111111111111';
        const siblingLive    = '22222222-2222-4222-8222-222222222222';
        const trueOrphan     = '33333333-3333-4333-8333-333333333333';
        // Non-segment dirs that must survive the heuristic guard:
        //   - short name fails the 36-char branch
        //   - 36-char-no-hyphen fails the `includes('-')` branch
        const shortDir   = 'system-cache';
        const noHyphen36 = 'abcdefabcdefabcdefabcdefabcdef123456';

        await seedSegmentDir(thisTargetLive);
        await seedSegmentDir(siblingLive);
        await seedSegmentDir(trueOrphan);
        await fs.ensureDir(path.join(tmpRoot, shortDir));
        await fs.ensureDir(path.join(tmpRoot, noHyphen36));
        // A real persist dir always contains chroma.sqlite3 (a FILE) — the isDirectory guard
        // must leave it untouched.
        await fs.writeFile(path.join(tmpRoot, 'chroma.sqlite3'), 'sqlite-marker');

        const liveSegmentIds = new Set([thisTargetLive, siblingLive]);

        const {kept, removed} = await cleanOrphanedSegmentDirs({
            dbPath: tmpRoot,
            liveSegmentIds,
            log   : () => {}
        });

        // Negative-mutation: both live segment dirs survive on disk.
        expect(await fs.pathExists(path.join(tmpRoot, thisTargetLive))).toBe(true);
        expect(await fs.pathExists(path.join(tmpRoot, siblingLive))).toBe(true);
        // Non-segment entries survive (heuristic + isDirectory guards).
        expect(await fs.pathExists(path.join(tmpRoot, shortDir))).toBe(true);
        expect(await fs.pathExists(path.join(tmpRoot, noHyphen36))).toBe(true);
        expect(await fs.pathExists(path.join(tmpRoot, 'chroma.sqlite3'))).toBe(true);
        // Only the true orphan is physically removed.
        expect(await fs.pathExists(path.join(tmpRoot, trueOrphan))).toBe(false);

        // Return contract.
        expect(kept.sort()).toEqual([thisTargetLive, siblingLive].sort());
        expect(removed).toEqual([trueOrphan]);
    });

    test('target adapters share one unified store path while scoping collections per group', () => {
        const unifiedPath = path.join(tmpRoot, 'chroma', 'unified');

        const kbConfig = TARGETS['knowledge-base'].adapt({
            collectionName: 'neo-knowledge-base',
            host          : 'localhost',
            path          : unifiedPath,
            port          : 8000
        });

        const mcConfig = TARGETS['memory-core'].adapt({
            collections: {
                graph  : 'neo-native-graph',
                memory : 'neo-agent-memory',
                session: 'neo-agent-sessions'
            },
            engines: {
                chroma: {
                    dataDir: unifiedPath,
                    host   : 'localhost',
                    port   : 8000
                }
            }
        });

        expect(kbConfig.path).toBe(unifiedPath);
        expect(mcConfig.path).toBe(unifiedPath);
        expect(kbConfig.collections).toEqual(['neo-knowledge-base']);
        expect(mcConfig.collections).toEqual([
            'neo-agent-memory',
            'neo-agent-sessions',
            'neo-native-graph'
        ]);
    });

    test('fails closed for Memory Core until safe multi-collection promotion exists', () => {
        expect(() => assertDefragTargetSupported({targetName: 'memory-core'}))
            .toThrow(/Memory Core defrag is disabled/);
        try {
            assertDefragTargetSupported({targetName: 'memory-core'});
        } catch (error) {
            expect(error.code).toBe('DEFRAG_MEMORY_CORE_UNSAFE');
        }

        expect(() => assertDefragTargetSupported({targetName: 'knowledge-base'})).not.toThrow();
    });

    test('durable phase markers block reruns until an incomplete defrag is cleared', async () => {
        const statePath = path.join(tmpRoot, 'defrag-state.json');

        await writeDefragState({
            statePath,
            state: {
                targetName    : 'knowledge-base',
                collectionName: 'neo-knowledge-base',
                phase         : 'live-parked',
                shadowName    : 'neo-knowledge-base-shadow-test',
                parkingName   : 'neo-knowledge-base-parking-test'
            }
        });

        await expect(assertNoIncompleteDefragState({statePath}))
            .rejects.toMatchObject({
                code : 'DEFRAG_INCOMPLETE_STATE',
                state: expect.objectContaining({phase: 'live-parked'})
            });

        await clearDefragState({statePath});
        await expect(assertNoIncompleteDefragState({statePath})).resolves.toBeUndefined();
    });

    test('durable phase marker can be returned when the caller owns resumability for that phase', async () => {
        const statePath = path.join(tmpRoot, 'defrag-state-resumable.json');

        await writeDefragState({
            statePath,
            state: {
                targetName    : 'memory-core',
                collectionName: 'neo-agent-memory',
                phase         : 'memory-core-repair-shadow-loading',
                shadowName    : 'neo-agent-memory-shadow-resume'
            }
        });

        const state = await assertNoIncompleteDefragState({
            statePath,
            allowedPhases: ['memory-core-repair-shadow-loading']
        });

        expect(state).toMatchObject({
            targetName    : 'memory-core',
            collectionName: 'neo-agent-memory',
            phase         : 'memory-core-repair-shadow-loading',
            shadowName    : 'neo-agent-memory-shadow-resume'
        });
    });

    test('shadow promotion loads replacement before parking live and never deletes canonical', async () => {
        const registry       = new Map();
        const collectionName = 'neo-knowledge-base';
        const live           = createRegistryBackedCollection({name: collectionName, registry});
        const client         = createRegistryBackedClient({registry});
        const data           = createCollectionData();
        const statePath      = path.join(tmpRoot, 'defrag-state.json');
        let   uuid           = 0;

        const result = await rewriteCollectionViaShadowPromotion({
            client,
            collectionName,
            data,
            embeddingFunction: {name: 'dummy'},
            statePath,
            timestamp        : 123,
            uuidFactory      : () => `uuid-${++uuid}`,
            log          : () => {},
            writeProgress: () => {}
        });

        expect(result.shadowName).toBe('neo-knowledge-base-shadow-123-uuid-1');
        expect(result.parkingName).toBe('neo-knowledge-base-parking-123-uuid-2');
        expect(result.parkingDeleted).toBe(true);
        expect(client.calls.createCollection).toEqual([{name: result.shadowName}]);
        expect(client.calls.deleteCollection).toEqual([{name: result.parkingName}]);
        expect(client.calls.deleteCollection).not.toContainEqual({name: collectionName});
        expect(live.calls.modify).toEqual([{name: result.parkingName}]);

        const canonical = registry.get(collectionName);
        expect(canonical).toBe(client.created[0]);
        expect(canonical.rows.size).toBe(2);
        expect(canonical.calls.add[0].documents).toEqual(['', '{"body":"object-doc"}']);
        expect(registry.has(result.parkingName)).toBe(false);

        const state = await fs.readJson(statePath);
        expect(state.phase).toBe('parking-deleted');
    });

    test('shadow promotion rolls live collection back when promotion fails after parking', async () => {
        const registry       = new Map();
        const collectionName = 'neo-knowledge-base';
        const data           = createCollectionData();
        const statePath      = path.join(tmpRoot, 'defrag-state.json');
        const parkingName    = createSwapCollectionName(collectionName, 'parking', {
            timestamp: 456,
            uuid     : 'uuid-2'
        });
        const failedName = createSwapCollectionName(collectionName, 'failed-shadow', {
            timestamp: 456,
            uuid     : 'uuid-3'
        });
        const live   = createRegistryBackedCollection({name: collectionName, registry});
        const client = createRegistryBackedClient({
            registry,
            shadowFailModifyTo: collectionName
        });
        let uuid = 0;

        await expect(rewriteCollectionViaShadowPromotion({
            client,
            collectionName,
            data,
            embeddingFunction: {name: 'dummy'},
            statePath,
            timestamp        : 456,
            uuidFactory      : () => `uuid-${++uuid}`,
            log          : () => {},
            warn         : () => {},
            writeProgress: () => {}
        })).rejects.toThrow(`forced modify failure for ${collectionName}`);

        expect(registry.get(collectionName)).toBe(live);
        expect(live.calls.modify).toEqual([
            {name: parkingName},
            {name: collectionName}
        ]);
        expect(client.calls.deleteCollection).toEqual([]);
        expect(registry.has(failedName)).toBe(true);

        const state = await fs.readJson(statePath);
        expect(state.phase).toBe('shadow-parked-after-failure');
        expect(state.failedShadowName).toBe(failedName);
    });

    test('registers Neo Chroma embedding functions before defrag collection hydration', async () => {
        const {default: AiConfig} = await import('../../../../../../ai/config.mjs');
        const warnings            = [];
        const originalWarn        = console.warn;

        console.warn = (...args) => warnings.push(args.join(' '));

        try {
            expect(knownEmbeddingFunctions.has('dummy_embedding_function')).toBe(true);
            expect(knownEmbeddingFunctions.has('dynamic_text_embedding_service')).toBe(true);

            const dummy = await getEmbeddingFunction({
                collectionName: 'schema deserialization',
                client        : {},
                efConfig      : {type: 'known', name: 'dummy_embedding_function', config: {}}
            });
            const dynamic = await getEmbeddingFunction({
                collectionName: 'schema deserialization',
                client        : {},
                efConfig      : {type: 'known', name: 'dynamic_text_embedding_service', config: {}}
            });

            expect(dummy?.name).toBe('dummy_embedding_function');
            expect(dummy).toBe(AiConfig.dummyEmbeddingFunction);
            expect(dynamic?.name).toBe('dynamic_text_embedding_service');
            expect(warnings).toEqual([]);
        } finally {
            console.warn = originalWarn;
        }
    });

    test('skips UUID-named entries that are files, not directories', async () => {
        const liveSeg       = '66666666-6666-4666-8666-666666666666';
        const uuidNamedFile = '77777777-7777-4777-8777-777777777777';

        await seedSegmentDir(liveSeg);
        // A stray file whose name matches the UUID heuristic must not be removed: the
        // isDirectory guard short-circuits before any fs.remove.
        await fs.writeFile(path.join(tmpRoot, uuidNamedFile), 'not-a-dir');

        const {kept, removed} = await cleanOrphanedSegmentDirs({
            dbPath        : tmpRoot,
            liveSegmentIds: new Set([liveSeg]),
            log           : () => {}
        });

        expect(await fs.pathExists(path.join(tmpRoot, uuidNamedFile))).toBe(true);
        expect(removed).toHaveLength(0);
        expect(kept).toEqual([liveSeg]);
    });

    test('resolveLiveSegmentIds parses multiline sqlite output, trimming blanks and whitespace', async () => {
        // Existence guard requires a real chroma.sqlite3 file present before execFn runs.
        await fs.writeFile(path.join(tmpRoot, 'chroma.sqlite3'), 'sqlite-marker');

        const result = resolveLiveSegmentIds({
            dbPath: tmpRoot,
            execFn: () => 'seg-a\n  seg-b  \n\n\nseg-c\n'
        });

        expect(result).toBeInstanceOf(Set);
        expect([...result].sort()).toEqual(['seg-a', 'seg-b', 'seg-c']);
    });

    test('resolveLiveSegmentIds returns an empty Set and never shells out when no chroma.sqlite3 is present', () => {
        let execCalled = false;

        const result = resolveLiveSegmentIds({
            dbPath: tmpRoot,  // empty dir, no chroma.sqlite3
            execFn: () => { execCalled = true; return ''; }
        });

        expect(result).toBeInstanceOf(Set);
        expect(result.size).toBe(0);
        expect(execCalled).toBe(false);
    });

    test('resolveLiveSegmentIds reads ids from a real chroma.sqlite3 via the real sqlite3 CLI', async () => {
        test.skip(!sqlite3Available, 'sqlite3 CLI not available in this environment');

        const sqlitePath = path.join(tmpRoot, 'chroma.sqlite3');
        const idA        = '44444444-4444-4444-8444-444444444444';
        const idB        = '55555555-5555-4555-8555-555555555555';

        // Build a minimal real segments table — exercises the production SELECT against the
        // actual sqlite3 CLI output shape (stub-drift guard: the default execFn is used).
        execSync(
            `sqlite3 "${sqlitePath}" "CREATE TABLE segments (id TEXT PRIMARY KEY); INSERT INTO segments (id) VALUES ('${idA}'), ('${idB}');"`,
            {stdio: 'ignore'}
        );

        const result = resolveLiveSegmentIds({dbPath: tmpRoot});

        expect([...result].sort()).toEqual([idA, idB].sort());
    });
});
