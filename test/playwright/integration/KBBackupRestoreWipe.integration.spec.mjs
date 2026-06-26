import {randomUUID}    from 'node:crypto';
import {spawnSync}     from 'node:child_process';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import {test, expect}  from '@playwright/test';
import {
    callHealthcheck,
    getReadiness
} from './fixtures/mcpClient.mjs';

const __filename  = fileURLToPath(import.meta.url);
const __dirname   = path.dirname(__filename);
const repoRoot    = path.resolve(__dirname, '../../..');
const composeFile = path.join(repoRoot, 'ai/deploy/docker-compose.test.yml');
const projectName = process.env.NEO_INTEGRATION_COMPOSE_PROJECT || 'neo-integration-test';
const KB_URL      = process.env.NEO_INTEGRATION_KB_URL || 'http://127.0.0.1:13000';

const NEO_BOOTSTRAP = `
    await import('./src/Neo.mjs');
    await import('./src/core/_export.mjs');
`;

/**
 * Runs Docker Compose against the integration fixture project.
 * @param {String[]} args Docker Compose arguments after the compose file selector.
 * @returns {import('node:child_process').SpawnSyncReturns<String>}
 */
function dockerCompose(args) {
    return spawnSync('docker', ['compose', '-p', projectName, '-f', composeFile, ...args], {
        cwd      : repoRoot,
        encoding : 'utf8',
        maxBuffer: 10 * 1024 * 1024
    });
}

/**
 * Runs an ES module snippet inside the deployed Knowledge Base container.
 * @param {String} code The JavaScript source to execute.
 * @param {Object} [env] Environment variables to pass into the process.
 * @returns {Object}
 */
function execKnowledgeBaseJson(code, env = {}) {
    const envArgs = Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`]);
    const result  = dockerCompose(['exec', '-T', ...envArgs, 'kb-server', 'node', '--input-type=module', '-e', code]);
    const output  = [
        result.stdout?.trim(),
        result.stderr?.trim()
    ].filter(Boolean).join('\n');

    expect(result.status, output || result.error?.message || 'kb-server exec failed').toBe(0);

    const jsonLine = result.stdout.trim().split('\n').filter(Boolean).reverse().find(line => {
        try {
            JSON.parse(line);
            return true;
        } catch {
            return false;
        }
    });
    expect(jsonLine, output).toBeTruthy();

    return JSON.parse(jsonLine);
}

/**
 * Seeds a deterministic record directly into the deployed KB Chroma collection.
 * @param {String} id       Chroma vector id.
 * @param {String} sentinel Unique document text.
 * @returns {Object}
 */
function seedKnowledgeBaseRecord(id, sentinel) {
    return execKnowledgeBaseJson(`
        ${NEO_BOOTSTRAP}

        const {KB_ChromaManager, KB_LifecycleService} = await import('./ai/services.mjs');

        await KB_LifecycleService.ready();

        const collection = await KB_ChromaManager.getKnowledgeBaseCollection();
        const embedding = Array.from({length: 4096}, (_, index) => index === 0 ? 1 : 0);

        await collection.upsert({
            ids       : [process.env.NEO_TEST_KB_ID],
            embeddings: [embedding],
            metadatas : [{kind: 'integration', source: 'kb-backup-restore', sentinel: process.env.NEO_TEST_KB_SENTINEL}],
            documents : [process.env.NEO_TEST_KB_SENTINEL]
        });

        const result = await collection.get({
            ids    : [process.env.NEO_TEST_KB_ID],
            include: ['documents', 'metadatas']
        });

        console.log(JSON.stringify({
            count: await collection.count(),
            found: result.ids?.includes(process.env.NEO_TEST_KB_ID)
        }));
    `, {
        NEO_TEST_KB_ID      : id,
        NEO_TEST_KB_SENTINEL: sentinel
    });
}

/**
 * Reads a deterministic record from the deployed KB Chroma collection.
 * @param {String} id Chroma vector id.
 * @returns {Object}
 */
function readKnowledgeBaseRecord(id) {
    return execKnowledgeBaseJson(`
        ${NEO_BOOTSTRAP}

        const {KB_ChromaManager, KB_LifecycleService} = await import('./ai/services.mjs');

        await KB_LifecycleService.ready();

        const collection = await KB_ChromaManager.getKnowledgeBaseCollection();
        const result = await collection.get({
            ids    : [process.env.NEO_TEST_KB_ID],
            include: ['documents', 'metadatas']
        });

        console.log(JSON.stringify({
            count   : await collection.count(),
            document: result.documents?.[0] || null,
            found   : result.ids?.includes(process.env.NEO_TEST_KB_ID) || false,
            metadata: result.metadatas?.[0] || null
        }));
    `, {
        NEO_TEST_KB_ID: id
    });
}

/**
 * Exports the deployed KB collection into a JSONL backup directory.
 * @param {String} backupPath Absolute backup path inside the container.
 * @returns {Object}
 */
function exportKnowledgeBase(backupPath) {
    return execKnowledgeBaseJson(`
        ${NEO_BOOTSTRAP}

        const {KB_DatabaseService, KB_LifecycleService} = await import('./ai/services.mjs');

        await KB_LifecycleService.ready();

        const result = await KB_DatabaseService.manageDatabaseBackup({
            action    : 'export',
            backupPath: process.env.NEO_TEST_KB_BACKUP_PATH
        });

        console.log(JSON.stringify(result));
    `, {
        NEO_TEST_KB_BACKUP_PATH: backupPath
    });
}

/**
 * Imports a deployed KB JSONL backup directory.
 * @param {String} backupPath Absolute backup path inside the container.
 * @returns {Object}
 */
function importKnowledgeBase(backupPath) {
    return execKnowledgeBaseJson(`
        ${NEO_BOOTSTRAP}

        const {KB_DatabaseService, KB_LifecycleService} = await import('./ai/services.mjs');

        await KB_LifecycleService.ready();

        const result = await KB_DatabaseService.manageDatabaseBackup({
            action: 'import',
            file  : process.env.NEO_TEST_KB_BACKUP_PATH,
            mode  : 'merge'
        });

        console.log(JSON.stringify(result));
    `, {
        NEO_TEST_KB_BACKUP_PATH: backupPath
    });
}

/**
 * Deletes the deterministic record seeded by this spec without dropping the shared fixture collection.
 * @param {String} id Chroma vector id.
 * @returns {Object}
 */
function deleteKnowledgeBaseRecord(id) {
    return execKnowledgeBaseJson(`
        ${NEO_BOOTSTRAP}

        const {KB_ChromaManager, KB_LifecycleService} = await import('./ai/services.mjs');

        await KB_LifecycleService.ready();

        const collection = await KB_ChromaManager.getKnowledgeBaseCollection();

        await collection.delete({
            ids: [process.env.NEO_TEST_KB_ID]
        });

        console.log(JSON.stringify({
            count  : await collection.count(),
            deleted: process.env.NEO_TEST_KB_ID
        }));
    `, {
        NEO_TEST_KB_ID: id
    });
}

/**
 * Deletes a backup directory from the deployed Knowledge Base container tmpfs.
 * @param {String} backupPath Absolute backup path inside the container.
 * @returns {Object}
 */
function cleanupBackupPath(backupPath) {
    return execKnowledgeBaseJson(`
        const fs = await import('node:fs/promises');

        await fs.rm(process.env.NEO_TEST_KB_BACKUP_PATH, {recursive: true, force: true});

        console.log(JSON.stringify({removed: process.env.NEO_TEST_KB_BACKUP_PATH}));
    `, {
        NEO_TEST_KB_BACKUP_PATH: backupPath
    });
}

/**
 * Runs a shadow-swap re-embed against a temporary deployed KB collection name.
 * @param {Object} options
 * @param {String} options.collectionName Temporary Chroma collection name.
 * @param {String} options.oldId          Sentinel id seeded into the pre-swap collection.
 * @param {String} options.oldSentinel    Sentinel document text seeded into the pre-swap collection.
 * @param {String} options.fixturePath    JSONL fixture path inside the container.
 * @returns {Object}
 */
function shadowSwapKnowledgeBase({collectionName, oldId, oldSentinel, fixturePath}) {
    return execKnowledgeBaseJson(`
        ${NEO_BOOTSTRAP}

        const fs = await import('node:fs/promises');
        const {
            KB_Config,
            KB_ChromaManager,
            KB_LifecycleService,
            Memory_TextEmbeddingService
        } = await import('./ai/services.mjs');
        const {default: KB_VectorService} = await import('./ai/services/knowledge-base/VectorService.mjs');

        await KB_LifecycleService.ready();

        const originalCollectionName = KB_Config.data.collectionName;
        const originalEmbedTexts     = Memory_TextEmbeddingService.embedTexts.bind(Memory_TextEmbeddingService);
        const originalEmbedChunks    = KB_VectorService.embedChunks.bind(KB_VectorService);
        const cleanupNames           = new Set([process.env.NEO_TEST_KB_COLLECTION]);
        const vectorLength           = 4096;
        let result;
        let beforePromotion;
        let promoteWindowProbe;

        KB_Config.data.collectionName = process.env.NEO_TEST_KB_COLLECTION;
        KB_ChromaManager.invalidateKnowledgeBaseCollectionCache();

        Memory_TextEmbeddingService.embedTexts = async texts => {
            return texts.map((_, index) => {
                return Array.from({length: vectorLength}, (__, dimension) => dimension === index ? 1 : 0);
            });
        };

        try {
            const collection = await KB_ChromaManager.getKnowledgeBaseCollection();
            const originalModify = collection.modify.bind(collection);
            collection.modify = async options => {
                const value = await originalModify(options);
                if (options.name.includes(\`\${process.env.NEO_TEST_KB_COLLECTION}-parking-\`)) {
                    KB_ChromaManager.invalidateKnowledgeBaseCollectionCache();
                    try {
                        await KB_ChromaManager.getKnowledgeBaseCollection();
                    } catch (error) {
                        promoteWindowProbe = {
                            activeSwapCollections: error.activeSwapCollections || [],
                            code                 : error.code || null,
                            message              : error.message
                        };
                    }
                }
                return value;
            };

            await collection.upsert({
                ids       : [process.env.NEO_TEST_KB_OLD_ID],
                embeddings: [Array.from({length: vectorLength}, (_, dimension) => dimension === 0 ? 1 : 0)],
                metadatas : [{kind: 'integration', source: 'kb-shadow-swap', sentinel: process.env.NEO_TEST_KB_OLD_SENTINEL}],
                documents : [process.env.NEO_TEST_KB_OLD_SENTINEL]
            });

            const fixtureRows = [0, 1, 2].map(index => ({
                hash       : \`shadow-swap-new-\${index}\`,
                type       : 'method',
                name       : \`shadowSwapMethod\${index}\`,
                className  : '',
                description: \`shadow swap new chunk \${index}\`,
                content    : \`shadow swap body \${index}\`
            }));
            await fs.writeFile(
                process.env.NEO_TEST_KB_FIXTURE_PATH,
                fixtureRows.map(row => JSON.stringify(row)).join('\\n'),
                'utf8'
            );

            KB_VectorService.embedChunks = async options => {
                const value = await originalEmbedChunks(options);
                const liveCollection = await KB_ChromaManager.getKnowledgeBaseCollection();
                const probe = await liveCollection.get({
                    ids    : [process.env.NEO_TEST_KB_OLD_ID],
                    include: ['documents', 'metadatas']
                });

                beforePromotion = {
                    count            : await liveCollection.count(),
                    document         : probe.documents?.[0] || null,
                    found            : probe.ids?.includes(process.env.NEO_TEST_KB_OLD_ID) || false,
                    queriedCollection: liveCollection.name,
                    shadowCollection : options.collection.name
                };

                return value;
            };

            result = await KB_VectorService.embed(process.env.NEO_TEST_KB_FIXTURE_PATH, {
                staleStrategy: 'shadow-swap'
            });
            cleanupNames.add(result.parkedCollection);

            const afterCollection = await KB_ChromaManager.getKnowledgeBaseCollection();
            const oldProbe = await afterCollection.get({
                ids    : [process.env.NEO_TEST_KB_OLD_ID],
                include: ['documents']
            });

            console.log(JSON.stringify({
                after: {
                    collectionName: afterCollection.name,
                    count         : await afterCollection.count(),
                    oldFound      : oldProbe.ids?.includes(process.env.NEO_TEST_KB_OLD_ID) || false
                },
                beforePromotion,
                promoteWindowProbe,
                result
            }));
        } finally {
            KB_VectorService.embedChunks             = originalEmbedChunks;
            Memory_TextEmbeddingService.embedTexts   = originalEmbedTexts;
            KB_Config.data.collectionName            = originalCollectionName;
            KB_ChromaManager.invalidateKnowledgeBaseCollectionCache();

            for (const name of cleanupNames) {
                try {
                    await KB_ChromaManager.client.deleteCollection({name});
                } catch {}
            }

            await fs.rm(process.env.NEO_TEST_KB_FIXTURE_PATH, {force: true});
        }
    `, {
        NEO_TEST_KB_COLLECTION  : collectionName,
        NEO_TEST_KB_FIXTURE_PATH: fixturePath,
        NEO_TEST_KB_OLD_ID      : oldId,
        NEO_TEST_KB_OLD_SENTINEL: oldSentinel
    });
}

/**
 * Drives the `ingest_source_files` MCP tool end-to-end inside the deployed KB container.
 * Exercises both the #10572 work-volume gate (an oversized batch refused up-front) and the
 * within-threshold dispatch path (parsed chunks embedded into an isolated temp collection).
 * @param {Object} options
 * @param {String} options.collectionName Temporary Chroma collection name.
 * @param {String} options.repoSlug       Repo slug stamped onto the parsed-chunk fixtures.
 * @param {String} options.tenantId       Mock tenant id for the ingestion push.
 * @returns {Object}
 */
function ingestSourceFilesViaMcpTool({collectionName, repoSlug, tenantId}) {
    return execKnowledgeBaseJson(`
        ${NEO_BOOTSTRAP}

        const {
            KB_Config,
            KB_ChromaManager,
            KB_LifecycleService,
            Memory_TextEmbeddingService
        } = await import('./ai/services.mjs');
        const {callTool} = await import('./ai/mcp/server/knowledge-base/toolService.mjs');

        await KB_LifecycleService.ready();

        const originalCollectionName   = KB_Config.data.collectionName;
        const originalThreshold        = KB_Config.data.mcpSyncMaxChunks;
        const originalEmbedTexts       = Memory_TextEmbeddingService.embedTexts.bind(Memory_TextEmbeddingService);
        const vectorLength             = 4096;
        const tenantId                 = process.env.NEO_TEST_KB_TENANT;
        const repoSlug                 = process.env.NEO_TEST_KB_REPO;

        KB_Config.data.collectionName   = process.env.NEO_TEST_KB_COLLECTION;
        KB_Config.data.mcpSyncMaxChunks = 5;
        KB_ChromaManager.invalidateKnowledgeBaseCollectionCache();

        Memory_TextEmbeddingService.embedTexts = async texts => {
            return texts.map((_, index) => {
                return Array.from({length: vectorLength}, (__, dimension) => dimension === index ? 1 : 0);
            });
        };

        let after, dispatch, gate;

        try {
            // Gate path: a 6-file batch exceeds the threshold (5) and is refused before dispatch.
            const oversizedFiles = Array.from({length: 6}, (_, index) => ({
                path   : 'ingest-gate-' + index + '.mjs',
                content: 'ingest gate file ' + index
            }));
            gate = await callTool('ingest_source_files', {tenantId, files: oversizedFiles});

            // Dispatch path: a 3-chunk batch is within the threshold and is embedded end-to-end.
            const parsedChunks = Array.from({length: 3}, (_, index) => ({
                schemaVersion: '1.0.0',
                tenantId,
                repoSlug,
                rootKind     : 'bare-repo',
                sourcePath   : 'ingest-dispatch-' + index + '.mjs',
                content      : 'ingest dispatch chunk ' + index,
                hashInputs   : ['sourcePath', 'content'],
                parserId     : 'integration-fixture',
                parserVersion: '1.0.0',
                kind         : 'doc-section',
                name         : 'ingestDispatchChunk' + index
            }));
            dispatch = await callTool('ingest_source_files', {
                tenantId,
                files: [{path: 'ingest-dispatch.mjs', parsedChunks}]
            });

            const collection = await KB_ChromaManager.getKnowledgeBaseCollection();
            after = {
                collectionName: collection.name,
                count         : await collection.count()
            };

            console.log(JSON.stringify({after, dispatch, gate}));
        } finally {
            Memory_TextEmbeddingService.embedTexts = originalEmbedTexts;
            KB_Config.data.collectionName          = originalCollectionName;
            KB_Config.data.mcpSyncMaxChunks        = originalThreshold;
            KB_ChromaManager.invalidateKnowledgeBaseCollectionCache();

            try {
                await KB_ChromaManager.client.deleteCollection({name: process.env.NEO_TEST_KB_COLLECTION});
            } catch {}
        }
    `, {
        NEO_TEST_KB_COLLECTION: collectionName,
        NEO_TEST_KB_REPO      : repoSlug,
        NEO_TEST_KB_TENANT    : tenantId
    });
}

/**
 * Drives the `ai:ingest-tenant` Phase 2C bulk-facade CLI end-to-end inside the deployed KB
 * container. Streams a 1k+-record `parsed-chunk-v1` JSONL fixture through the CLI's exported
 * orchestration units (`readJsonlRecords` -> `runIngest`) wired to the real ingestion `ingestFn`
 * (`IngestionService.ingestSourceFiles` with `viaMcp:false` — the bulk gate-bypass),
 * then verifies the isolated temp collection holds every embedded chunk. The ingestion service
 * is imported directly (not via `ai/services.mjs`) so the closure-injected `viaMcp:false` flag
 * survives the makeSafe Zod wrapper and reaches `VectorService.embed` as the explicit #10572
 * work-volume-gate bypass: a 1k+-chunk corpus far exceeds `mcpSyncMaxChunks`, so a clean
 * full-count ingest is itself proof the gate was bypassed.
 * @param {Object} options
 * @param {String} options.collectionName Temporary Chroma collection name.
 * @param {Number} options.recordCount    parsed-chunk-v1 records streamed through the CLI.
 * @param {String} options.repoSlug       Repo slug stamped onto the parsed-chunk fixtures.
 * @param {String} options.tenantId       Tenant id for the bulk ingest.
 * @returns {Object}
 */
function ingestTenantViaCli({collectionName, recordCount, repoSlug, tenantId}) {
    return execKnowledgeBaseJson(`
        ${NEO_BOOTSTRAP}

        const fs                 = await import('node:fs/promises');
        const {createReadStream} = await import('node:fs');
        const {
            KB_Config,
            KB_ChromaManager,
            KB_LifecycleService,
            Memory_TextEmbeddingService
        } = await import('./ai/services.mjs');
        // Direct import (not ai/services.mjs): the makeSafe Zod wrapper strips the
        // closure-injected viaMcp flag, and the bulk CLI relies on viaMcp:false reaching
        // VectorService.embed as the explicit #10572 work-volume-gate bypass.
        const {default: KB_IngestionService} = await import('./ai/services/knowledge-base/IngestionService.mjs');
        const {readJsonlRecords, runIngest}  = await import('./ai/scripts/maintenance/ingestTenant.mjs');

        await KB_LifecycleService.ready();

        const originalCollectionName = KB_Config.data.collectionName;
        const originalBatchDelay     = KB_Config.data.batchDelay;
        const originalEmbedTexts     = Memory_TextEmbeddingService.embedTexts.bind(Memory_TextEmbeddingService);
        const recordCount            = Number(process.env.NEO_TEST_KB_RECORD_COUNT);
        const tenantId               = process.env.NEO_TEST_KB_TENANT;
        const repoSlug               = process.env.NEO_TEST_KB_REPO;
        const fixturePath            = process.env.NEO_TEST_KB_FIXTURE_PATH;
        const vectorLength           = 8;

        KB_Config.data.collectionName = process.env.NEO_TEST_KB_COLLECTION;
        // Zero the inter-batch rate-limit sleep so the 1k+-chunk bulk ingest finishes
        // inside the 120s integration-test timeout.
        KB_Config.data.batchDelay     = 0;
        KB_ChromaManager.invalidateKnowledgeBaseCollectionCache();

        Memory_TextEmbeddingService.embedTexts = async texts => {
            return texts.map(() => Array.from({length: vectorLength}, (_, dimension) => dimension === 0 ? 1 : 0));
        };

        let after, totals;

        try {
            // One schema-valid parsed-chunk-v1 record per line; unique sourcePath + content
            // keep every server-side chunkId hash distinct so no upsert collapses a row.
            const lines = Array.from({length: recordCount}, (_, index) => JSON.stringify({
                schemaVersion: '1.0.0',
                tenantId,
                repoSlug,
                rootKind     : 'bare-repo',
                sourcePath   : 'ingest-tenant-cli-' + index + '.mjs',
                content      : 'ingest tenant cli chunk ' + index,
                hashInputs   : ['sourcePath', 'content'],
                parserId     : 'integration-fixture',
                parserVersion: '1.0.0',
                kind         : 'doc-section',
                name         : 'ingestTenantCliChunk' + index
            }));

            await fs.mkdir('/tmp/neo-integration', {recursive: true});
            await fs.writeFile(fixturePath, lines.join('\\n') + '\\n', 'utf8');

            // Exercise the CLI's exported orchestration: stream-parse the JSONL, batch at
            // the CLI default (500), and ingest each batch through the bulk gate-bypass path.
            totals = await runIngest({
                records  : readJsonlRecords(createReadStream(fixturePath, 'utf8')),
                batchSize: 500,
                ingestFn : files => KB_IngestionService.ingestSourceFiles({tenantId, files, viaMcp: false})
            });

            const collection = await KB_ChromaManager.getKnowledgeBaseCollection();
            after = {
                collectionName: collection.name,
                count         : await collection.count()
            };

            console.log(JSON.stringify({after, totals}));
        } finally {
            Memory_TextEmbeddingService.embedTexts = originalEmbedTexts;
            KB_Config.data.collectionName          = originalCollectionName;
            KB_Config.data.batchDelay              = originalBatchDelay;
            KB_ChromaManager.invalidateKnowledgeBaseCollectionCache();

            try {
                await KB_ChromaManager.client.deleteCollection({name: process.env.NEO_TEST_KB_COLLECTION});
            } catch {}

            await fs.rm(fixturePath, {force: true});
        }
    `, {
        NEO_TEST_KB_COLLECTION  : collectionName,
        NEO_TEST_KB_FIXTURE_PATH: '/tmp/neo-integration/' + collectionName + '.jsonl',
        NEO_TEST_KB_RECORD_COUNT: String(recordCount),
        NEO_TEST_KB_REPO        : repoSlug,
        NEO_TEST_KB_TENANT      : tenantId
    });
}

/**
 * Drives the #11637 Phase 2E tenant-config-storage persistence path inside the deployed KB
 * container. Writes a tenant's config as a `KnowledgeBaseTenantConfig` graph node via
 * `setTenantConfig`, reads it back, then simulates a KB-server restart by dropping the
 * in-memory Native Edge Graph cache — forcing the next `getTenantConfig` to reload the node
 * from the on-disk `memory-core-graph.sqlite`. `IngestionService` is imported
 * directly (not via `ai/services.mjs`) so the makeSafe Zod wrapper does not strip the
 * structured config payload; all calls run under the tenant's request context so the
 * `setTenantConfig` RLS gate and the `getNodeRecord` RLS re-check resolve as the owner.
 * @param {Object} options
 * @param {String} options.tenantId Tenant id whose config node is written + reloaded.
 * @returns {Object}
 */
function tenantConfigPersistsAcrossRestart({tenantId}) {
    return execKnowledgeBaseJson(`
        ${NEO_BOOTSTRAP}

        const {KB_LifecycleService}            = await import('./ai/services.mjs');
        const {default: KB_IngestionService}   = await import('./ai/services/knowledge-base/IngestionService.mjs');
        const {default: GraphService}          = await import('./ai/services/memory-core/GraphService.mjs');
        const {default: RequestContextService} = await import('./ai/mcp/server/shared/services/RequestContextService.mjs');

        await KB_LifecycleService.ready();
        await GraphService.initAsync();

        const tenantId = process.env.NEO_TEST_KB_TENANT;
        const nodeId   = 'kb-config:' + tenantId;

        function asTenant(callback) {
            return RequestContextService.run({
                userId             : tenantId,
                username           : tenantId,
                agentIdentityNodeId: '@' + tenantId,
                source             : 'integration'
            }, callback);
        }

        try {
            await asTenant(() => KB_IngestionService.setTenantConfig({
                tenantId,
                config: {useDefaultSources: false, customParsers: [{parserId: 'restart-probe'}]}
            }));

            const beforeRestart = await asTenant(() => KB_IngestionService.getTenantConfig({tenantId}));

            // Simulate a KB-server restart: drop the in-memory graph cache so the next read
            // must reload the node from the on-disk memory-core-graph.sqlite.
            GraphService.db.nodes.clearSilent();
            GraphService.db.edges.clearSilent();
            GraphService.db.vicinityLoadedNodes.clear();

            const afterRestart = await asTenant(() => KB_IngestionService.getTenantConfig({tenantId}));

            console.log(JSON.stringify({beforeRestart, afterRestart}));
        } finally {
            try {
                await asTenant(() => GraphService.removeNodes([nodeId]));
            } catch {}
        }
    `, {
        NEO_TEST_KB_TENANT: tenantId
    });
}

test.describe('Dockerized KB backup -> wipe -> restore integration (#11644)', () => {
    test('restores a seeded Knowledge Base vector after an isolated fixture wipe', async () => {
        const readiness = await getReadiness();

        test.skip(readiness.dockerAvailable === false, `Docker unavailable: ${readiness.reason}`);
        expect(readiness.servicesReady, readiness.reason).toBe(true);

        const runId      = `${Date.now()}-${randomUUID()}`;
        const recordId   = `kb-backup-restore-${runId}`;
        const sentinel   = `kb-backup-restore-sentinel-${runId}`;
        const backupPath = `/tmp/neo-integration/kb-backup-restore-${runId}`;

        try {
            const seeded = seedKnowledgeBaseRecord(recordId, sentinel);
            expect(seeded.found).toBe(true);

            const backup = exportKnowledgeBase(backupPath);
            expect(backup.message).toContain('Exported');

            const deleted = deleteKnowledgeBaseRecord(recordId);
            expect(deleted.deleted).toBe(recordId);

            const wipedHealth = await callHealthcheck(KB_URL, {
                clientName: 'neo-integration-kb-backup-restore-health',
                identity  : 'kb-backup-restore'
            });
            expect(wipedHealth.status).toBe('healthy');
            expect(wipedHealth.database.connection.connected).toBe(true);

            const wiped = readKnowledgeBaseRecord(recordId);
            expect(wiped.found).toBe(false);

            const restored = importKnowledgeBase(backupPath);
            expect(restored.imported).toBeGreaterThan(0);
            expect(restored.mode).toBe('merge');

            const restoredRecord = readKnowledgeBaseRecord(recordId);
            expect(restoredRecord.found).toBe(true);
            expect(restoredRecord.document).toBe(sentinel);
            expect(restoredRecord.metadata.sentinel).toBe(sentinel);
        } finally {
            await Promise.allSettled([
                Promise.resolve().then(() => deleteKnowledgeBaseRecord(recordId)),
                Promise.resolve().then(() => cleanupBackupPath(backupPath))
            ]);
        }
    });

    test('shadow-swap re-embed keeps the old canonical corpus queryable until promotion (#11683)', async () => {
        const readiness = await getReadiness();

        test.skip(readiness.dockerAvailable === false, `Docker unavailable: ${readiness.reason}`);
        expect(readiness.servicesReady, readiness.reason).toBe(true);

        const runId          = `${Date.now()}-${randomUUID()}`;
        const collectionName = `kb-shadow-swap-${runId}`;
        const oldId          = `kb-shadow-swap-old-${runId}`;
        const oldSentinel    = `kb-shadow-swap-sentinel-${runId}`;
        const fixturePath    = `/tmp/neo-integration/kb-shadow-swap-${runId}.jsonl`;

        const swap = shadowSwapKnowledgeBase({
            collectionName,
            fixturePath,
            oldId,
            oldSentinel
        });

        expect(swap.result.staleStrategy).toBe('shadow-swap');
        expect(swap.result.embedded).toBe(3);
        expect(swap.result.deleted).toBe(1);

        expect(swap.beforePromotion.found).toBe(true);
        expect(swap.beforePromotion.document).toBe(oldSentinel);
        expect(swap.beforePromotion.queriedCollection).toBe(collectionName);
        expect(swap.beforePromotion.shadowCollection).not.toBe(collectionName);
        expect(swap.promoteWindowProbe.code).toBe('KB_COLLECTION_SWAP_IN_PROGRESS');
        expect(swap.promoteWindowProbe.activeSwapCollections).toEqual(expect.arrayContaining([
            swap.result.parkedCollection,
            swap.result.shadowCollection
        ]));

        expect(swap.after.collectionName).toBe(collectionName);
        expect(swap.after.count).toBe(3);
        expect(swap.after.oldFound).toBe(false);
    });

    test('ingest_source_files MCP tool gates oversized batches and ingests within-threshold pushes (#11634)', async () => {
        const readiness = await getReadiness();

        test.skip(readiness.dockerAvailable === false, `Docker unavailable: ${readiness.reason}`);
        expect(readiness.servicesReady, readiness.reason).toBe(true);

        const runId          = `${Date.now()}-${randomUUID()}`;
        const collectionName = `kb-ingest-source-files-${runId}`;

        const outcome = ingestSourceFilesViaMcpTool({
            collectionName,
            repoSlug: `kb-ingest-${runId}`,
            tenantId: 'neo-shared'
        });

        // Gate path — a 6-file batch over the threshold (5) is refused before dispatch.
        expect(outcome.gate.code).toBe('KB_INGEST_VOLUME_EXCEEDED');
        expect(outcome.gate.batchSize).toBe(6);
        expect(outcome.gate.threshold).toBe(5);
        expect(outcome.gate.bulkPath).toBe(null);

        // Dispatch path — a 3-chunk batch reaches the ingestion service end-to-end.
        expect('error' in outcome.dispatch).toBe(false);
        expect(outcome.dispatch.code).not.toBe('KB_INGEST_VOLUME_EXCEEDED');
        expect(outcome.dispatch.ingested).toBe(3);
        expect(outcome.dispatch.tenantId).toBe('neo-shared');
        expect(Array.isArray(outcome.dispatch.errors)).toBe(true);

        // The within-threshold push embedded into the isolated temp collection.
        expect(outcome.after.collectionName).toBe(collectionName);
        expect(outcome.after.count).toBe(3);
    });

    test('ai:ingest-tenant CLI bulk-streams a 1k+-chunk parsed-chunk-v1 corpus past the MCP volume gate (#11635)', async () => {
        const readiness = await getReadiness();

        test.skip(readiness.dockerAvailable === false, `Docker unavailable: ${readiness.reason}`);
        expect(readiness.servicesReady, readiness.reason).toBe(true);

        const runId          = `${Date.now()}-${randomUUID()}`;
        const collectionName = `kb-ingest-tenant-cli-${runId}`;
        const recordCount    = 1024;

        const outcome = ingestTenantViaCli({
            collectionName,
            recordCount,
            repoSlug: `kb-ingest-tenant-${runId}`,
            tenantId: 'neo-shared'
        });

        // The CLI stream-batched the corpus at the default batchSize (500): ceil(1024 / 500) = 3.
        expect(outcome.totals.batches).toBe(3);
        expect(outcome.totals.parseErrors).toBe(0);
        expect(outcome.totals.errors).toEqual([]);

        // viaMcp:false bypassed the #10572 work-volume gate — a 1024-chunk corpus far exceeds
        // mcpSyncMaxChunks, so a clean full-count ingest is itself proof of the bulk bypass.
        expect(outcome.totals.ingested).toBe(recordCount);
        expect(outcome.totals.embeddingsGenerated).toBe(recordCount);
        expect(outcome.totals.deleted).toBe(0);

        // Chroma ground truth: every streamed chunk embedded into the isolated collection.
        expect(outcome.after.collectionName).toBe(collectionName);
        expect(outcome.after.count).toBe(recordCount);
    });

    test('tenant config persists across a simulated KB-server restart (#11637)', async () => {
        const readiness = await getReadiness();

        test.skip(readiness.dockerAvailable === false, `Docker unavailable: ${readiness.reason}`);
        expect(readiness.servicesReady, readiness.reason).toBe(true);

        const outcome = tenantConfigPersistsAcrossRestart({tenantId: `kb-cfg-restart-${Date.now()}`});

        // Pre-restart: the config resolves from the KnowledgeBaseTenantConfig graph node
        // setTenantConfig just wrote.
        expect(outcome.beforeRestart).toMatchObject({
            source           : 'graph',
            version          : 1,
            useDefaultSources: false,
            customParsers    : [{parserId: 'restart-probe'}]
        });

        // Post-restart: the in-memory graph cache was cleared, so this read reloaded the
        // node from memory-core-graph.sqlite — the config still resolves from the graph
        // tier, proving on-disk persistence across a restart.
        expect(outcome.afterRestart).toMatchObject({
            source           : 'graph',
            version          : 1,
            useDefaultSources: false,
            customParsers    : [{parserId: 'restart-probe'}]
        });
    });
});
