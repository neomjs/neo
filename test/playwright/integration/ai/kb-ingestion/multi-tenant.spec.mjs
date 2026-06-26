import {randomUUID}    from 'node:crypto';
import {spawnSync}     from 'node:child_process';
import fs              from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import {test, expect}  from '@playwright/test';
import {getReadiness}  from '../../fixtures/mcpClient.mjs';

const __filename  = fileURLToPath(import.meta.url);
const __dirname   = path.dirname(__filename);
const repoRoot    = path.resolve(__dirname, '../../../../..');
const composeFile = path.join(repoRoot, 'ai/deploy/docker-compose.test.yml');
const projectName = process.env.NEO_INTEGRATION_COMPOSE_PROJECT || 'neo-integration-test';
const fixtureRoot = path.join(__dirname, 'fixtures/external-workspaces');

const NEO_BOOTSTRAP = `
    await import('./src/Neo.mjs');
    await import('./src/core/_export.mjs');
`;

const fixtureSpecs = [
    {
        name      : 'mini-neo-workspace',
        sampleGlob: ['src/MainView.mjs', 'src/controller/MainController.mjs', 'src/model/UserModel.mjs'],
        configBits: ['useDefaultSources: true', 'neo-fixture-parser']
    },
    {
        name      : 'mini-es5-workspace',
        sampleGlob: ['src/legacy-widget.js', 'src/legacy-store.js', 'src/legacy-util.js'],
        configBits: ['useDefaultSources: false', 'es5-fixture-parser']
    },
    {
        name      : 'mini-cpp-workspace',
        sampleGlob: ['src/main.cpp', 'src/worker.cpp', 'src/worker.hpp'],
        configBits: ['transportContract: parsed-chunk-v1', 'useDefaultSources: false'],
        extraFiles : ['parsed-chunks.jsonl']
    },
    {
        name      : 'mini-custom-source',
        sampleGlob: ['schemas/agent.proto', 'schemas/task.proto', 'schemas/result.proto'],
        configBits: ['sourceName: ProtoSource', 'proto-fixture-parser'],
        extraFiles : ['sources/ProtoSource.mjs']
    }
];

/**
 * Runs Docker Compose against the integration fixture project.
 * @param {String[]} args Docker Compose arguments after the compose file selector.
 * @returns {import('node:child_process').SpawnSyncReturns<String>}
 */
function dockerCompose(args) {
    return spawnSync('docker', ['compose', '-p', projectName, '-f', composeFile, ...args], {
        cwd      : repoRoot,
        encoding : 'utf8',
        maxBuffer: 20 * 1024 * 1024
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
 * Reads newline-delimited JSON fixture rows.
 * @param {String} filePath Absolute JSONL path.
 * @returns {Object[]}
 */
function readJsonl(filePath) {
    return fs.readFileSync(filePath, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line));
}

function runMultiTenantMatrix(collectionName) {
    return execKnowledgeBaseJson(`
        ${NEO_BOOTSTRAP}

        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const {
            KB_Config,
            KB_ChromaManager,
            KB_LifecycleService,
            Memory_TextEmbeddingService
        } = await import('./ai/services.mjs');
        const {callTool} = await import('./ai/mcp/server/knowledge-base/toolService.mjs');
        const {default: KbReconciliationService} = await import('./ai/daemons/kb-reconciliation/KbReconciliationService.mjs');
        const {default: IngestionService} = await import('./ai/services/knowledge-base/IngestionService.mjs');
        const {default: QueryService} = await import('./ai/services/knowledge-base/QueryService.mjs');
        const {default: SearchService} = await import('./ai/services/knowledge-base/SearchService.mjs');
        const {default: SourceRegistry} = await import('./ai/services/knowledge-base/source/_export.mjs');
        const {default: RequestContextService} = await import('./ai/mcp/server/shared/services/RequestContextService.mjs');

        await KB_LifecycleService.ready();

        const fixtureRoot = process.env.NEO_TEST_FIXTURE_ROOT;
        const vectorLength = 4096;

        function readText(relativePath) {
            return fs.readFile(path.join(fixtureRoot, relativePath), 'utf8');
        }

        async function readJsonl(relativePath) {
            const text = await readText(relativePath);
            return text.trim().split('\\n').filter(Boolean).map(line => JSON.parse(line));
        }

        function normalizeChunk(chunk, tenantId, repoSlug) {
            return {
                ...chunk,
                tenantId,
                repoSlug
            };
        }

        function vectorFor(text) {
            const lower = String(text).toLowerCase();
            let index = 15;

            if (lower.includes('alpha-exclusive-query')) index = 0;
            else if (lower.includes('beta-exclusive-query')) index = 1;
            else if (lower.includes('neo-shared-query')) index = 2;
            else if (lower.includes('proto-alpha-hydration')) index = 3;
            else if (lower.includes('es5-alpha-parser')) index = 4;
            else if (lower.includes('same-content-sentinel')) index = 5;
            else if (lower.includes('force-push-new')) index = 6;

            return Array.from({length: vectorLength}, (_, dimension) => dimension === index ? 1 : 0);
        }

        function asTenant(userId, callback) {
            return RequestContextService.run({
                userId,
                username           : userId,
                agentIdentityNodeId: '@' + userId,
                source             : 'integration'
            }, callback);
        }

        async function getRows(where = {}) {
            const collection = await KB_ChromaManager.getKnowledgeBaseCollection();
            const result = await collection.get({
                include: ['metadatas'],
                limit  : 2000,
                where
            });

            return (result.ids || []).map((id, index) => ({
                id,
                metadata: result.metadatas?.[index] || {}
            }));
        }

        async function waitForRows(where, predicate, {timeoutMs = 3000, intervalMs = 100} = {}) {
            const startedAt = Date.now();
            let rows = [];

            do {
                rows = await getRows(where);
                if (predicate(rows)) return rows;
                await new Promise(resolve => setTimeout(resolve, intervalMs));
            } while (Date.now() - startedAt < timeoutMs);

            return rows;
        }

        async function querySources(tenantId, query) {
            const result = await asTenant(tenantId, () => QueryService.queryDocuments({
                includeMetadata: true,
                limit          : 10,
                query
            }));

            return (result.results || []).map(item => ({
                source: item.source,
                metadata: item.metadata || {}
            }));
        }

        function buildFixtureParser({parserId, fixtureName, rootKind}) {
            return {
                async parseIngestionFile(file, {tenantContext}) {
                    const expected = await readJsonl(fixtureName + '/expected-chunks.jsonl');
                    const sourcePath = file.sourcePath;
                    return expected
                        .filter(chunk => chunk.sourcePath === sourcePath)
                        .map(chunk => normalizeChunk(chunk, tenantContext.tenantId, file.repoSlug || tenantContext.repoSlug || chunk.repoSlug));
                }
            };
        }

        const originals = {
            collectionName   : KB_Config.data.collectionName,
            defaultRepoSlug  : KB_Config.data.defaultRepoSlug,
            defaultTenantId  : KB_Config.data.defaultTenantId,
            defaultVisibility: KB_Config.data.defaultVisibility,
            batchDelay       : KB_Config.data.batchDelay,
            mcpSyncMaxChunks : KB_Config.data.mcpSyncMaxChunks,
            spoofRejectionMode: KB_Config.data.spoofRejectionMode,
            embedText        : Memory_TextEmbeddingService.embedText.bind(Memory_TextEmbeddingService),
            embedTexts       : Memory_TextEmbeddingService.embedTexts.bind(Memory_TextEmbeddingService),
            revisionResolver : IngestionService.revisionResolver
        };

        KB_Config.data.collectionName     = process.env.NEO_TEST_KB_COLLECTION;
        KB_Config.data.defaultTenantId    = 'neo-shared';
        KB_Config.data.defaultRepoSlug    = 'neo';
        KB_Config.data.defaultVisibility  = 'team';
        KB_Config.data.batchDelay         = 0;
        KB_Config.data.mcpSyncMaxChunks   = 5;
        KB_Config.data.spoofRejectionMode = 'overwrite';
        KB_ChromaManager.invalidateKnowledgeBaseCollectionCache();

        Memory_TextEmbeddingService.embedText = async text => vectorFor(text);
        Memory_TextEmbeddingService.embedTexts = async texts => texts.map(text => vectorFor(text));

        SourceRegistry.registerParser(buildFixtureParser({
            fixtureName: 'mini-neo-workspace',
            parserId   : 'neo-fixture-parser',
            rootKind   : 'neo-workspace'
        }), {parserId: 'neo-fixture-parser'});
        SourceRegistry.registerParser(buildFixtureParser({
            fixtureName: 'mini-es5-workspace',
            parserId   : 'es5-fixture-parser',
            rootKind   : 'bare-repo'
        }), {parserId: 'es5-fixture-parser'});
        SourceRegistry.registerParser(buildFixtureParser({
            fixtureName: 'mini-custom-source',
            parserId   : 'proto-fixture-parser',
            rootKind   : 'external-source'
        }), {parserId: 'proto-fixture-parser'});

        const result = {};

        try {
            const neoChunks = await readJsonl('mini-neo-workspace/expected-chunks.jsonl');
            const es5Chunks = await readJsonl('mini-es5-workspace/expected-chunks.jsonl');
            const cppChunks = await readJsonl('mini-cpp-workspace/parsed-chunks.jsonl');
            const cppExpected = await readJsonl('mini-cpp-workspace/expected-chunks.jsonl');
            const protoChunks = await readJsonl('mini-custom-source/expected-chunks.jsonl');
            const neoConfig = await readText('mini-neo-workspace/kb-config.yaml');
            const es5Config = await readText('mini-es5-workspace/kb-config.yaml');

            result.clientSideCppParity = JSON.stringify(cppChunks) === JSON.stringify(cppExpected);
            result.defaultInheritanceConfig = neoConfig.includes('useDefaultSources: true') && neoConfig.includes('neo-fixture-parser');
            result.defaultExclusionConfig = es5Config.includes('useDefaultSources: false') && es5Config.includes('es5-fixture-parser');

            const serverParsed = await SourceRegistry.getParsers()[SourceRegistry.getParserIds().indexOf('neo-fixture-parser')]
                .parseIngestionFile({sourcePath: 'src/MainView.mjs', repoSlug: 'mini-neo-workspace'}, {
                    tenantContext: {tenantId: 'tenant-alpha', repoSlug: 'mini-neo-workspace'}
                });
            result.transportParity = JSON.stringify(serverParsed[0]) === JSON.stringify(normalizeChunk(neoChunks[0], 'tenant-alpha', 'mini-neo-workspace'));

            const alphaNeoPush = await asTenant('tenant-alpha', async () => callTool('ingest_source_files', {
                tenantId: 'tenant-alpha',
                repoSlug: 'mini-neo-workspace',
                files   : [
                    {
                        sourcePath: 'src/MainView.mjs',
                        content   : await readText('mini-neo-workspace/src/MainView.mjs'),
                        parserId  : 'neo-fixture-parser',
                        repoSlug  : 'mini-neo-workspace'
                    },
                    {
                        sourcePath: 'src/controller/MainController.mjs',
                        content   : await readText('mini-neo-workspace/src/controller/MainController.mjs'),
                        parserId  : 'neo-fixture-parser',
                        repoSlug  : 'mini-neo-workspace'
                    }
                ]
            }));
            result.pushPipeline = {
                errors  : alphaNeoPush.errors,
                ingested: alphaNeoPush.ingested,
                tenantId: alphaNeoPush.tenantId
            };

            await asTenant('tenant-alpha', async () => callTool('ingest_source_files', {
                tenantId: 'tenant-alpha',
                repoSlug: 'mini-es5-workspace',
                files   : [
                    {
                        sourcePath: 'src/legacy-widget.js',
                        content   : await readText('mini-es5-workspace/src/legacy-widget.js'),
                        parserId  : 'es5-fixture-parser',
                        repoSlug  : 'mini-es5-workspace'
                    },
                    {
                        sourcePath: 'src/legacy-store.js',
                        content   : await readText('mini-es5-workspace/src/legacy-store.js'),
                        parserId  : 'es5-fixture-parser',
                        repoSlug  : 'mini-es5-workspace'
                    }
                ]
            }));

            await asTenant('tenant-alpha', () => callTool('ingest_source_files', {
                tenantId: 'tenant-alpha',
                repoSlug: 'mini-custom-source',
                files   : protoChunks.map(chunk => ({parsedChunks: [chunk]}))
            }));

            await asTenant('tenant-beta', () => callTool('ingest_source_files', {
                tenantId: 'tenant-beta',
                repoSlug: 'mini-cpp-workspace',
                files   : cppChunks.map(chunk => ({parsedChunks: [chunk]}))
            }));

            await asTenant('neo-shared', () => callTool('ingest_source_files', {
                tenantId: 'neo-shared',
                repoSlug: 'neo',
                files   : [{
                    parsedChunks: [normalizeChunk({
                        ...neoChunks[0],
                        repoSlug  : 'neo',
                        sourcePath: 'learn/shared-fixture.md',
                        content   : 'neo-shared-query curated baseline',
                        name      : 'Neo shared fixture'
                    }, 'neo-shared', 'neo')]
                }]
            }));

            const alphaSources = await querySources('tenant-alpha', 'alpha-exclusive-query');
            const betaSources = await querySources('tenant-beta', 'beta-exclusive-query');
            const alphaSharedSources = await querySources('tenant-alpha', 'neo-shared-query');
            result.multiTenantQuery = {
                alphaSeesOwn   : alphaSources.some(item => item.metadata.tenantId === 'tenant-alpha'),
                alphaSeesBeta  : alphaSources.some(item => item.metadata.tenantId === 'tenant-beta'),
                betaSeesOwn    : betaSources.some(item => item.metadata.tenantId === 'tenant-beta'),
                betaSeesAlpha  : betaSources.some(item => item.metadata.tenantId === 'tenant-alpha'),
                alphaSeesShared: alphaSharedSources.some(item => item.metadata.tenantId === 'neo-shared')
            };

            const sameContentChunk = normalizeChunk({
                ...neoChunks[0],
                sourcePath: 'src/index.js',
                content   : 'same-content-sentinel',
                name      : 'same-content-sentinel'
            }, 'fixture-tenant', 'same-content-repo');
            await asTenant('tenant-alpha', () => callTool('ingest_source_files', {
                tenantId: 'tenant-alpha',
                repoSlug: 'same-content-repo',
                files   : [{parsedChunks: [sameContentChunk]}]
            }));
            await asTenant('tenant-beta', () => callTool('ingest_source_files', {
                tenantId: 'tenant-beta',
                repoSlug: 'same-content-repo',
                files   : [{parsedChunks: [sameContentChunk]}]
            }));
            const sameRows = await getRows({sourcePath: 'src/index.js'});
            result.sameContentIsolation = {
                count      : sameRows.length,
                distinctIds: new Set(sameRows.map(row => row.id)).size,
                tenants    : sameRows.map(row => row.metadata.tenantId).sort()
            };

            const schemaMismatch = await asTenant('tenant-alpha', () => callTool('ingest_source_files', {
                tenantId: 'tenant-alpha',
                repoSlug: 'schema-mismatch',
                files   : [{parsedChunks: [{...neoChunks[0], schemaVersion: '0.9.0'}]}]
            }));
            result.schemaMismatch = schemaMismatch.errors.map(error => error.code);

            const backupRecord = await asTenant('tenant-alpha', () => callTool('ingest_source_files', {
                tenantId: 'tenant-alpha',
                repoSlug: 'backup-record-rejection',
                files   : [{parsedChunks: [{...neoChunks[0], embedding: [0.1, 0.2]}]}]
            }));
            result.backupRecordRejection = backupRecord.errors.map(error => error.code);

            const oversizedFiles = Array.from({length: 6}, (_, index) => ({
                path   : 'threshold-' + index + '.mjs',
                content: 'threshold chunk ' + index
            }));
            const thresholdGate = await asTenant('tenant-alpha', () => callTool('ingest_source_files', {
                tenantId: 'tenant-alpha',
                files   : oversizedFiles
            }));
            result.thresholdGate = {
                code          : thresholdGate.code,
                batchSize     : thresholdGate.batchSize,
                threshold     : thresholdGate.threshold,
                hasBulkPathKey: Object.prototype.hasOwnProperty.call(thresholdGate, 'bulkPath'),
                bulkPathType  : thresholdGate.bulkPath === null ? 'null' : typeof thresholdGate.bulkPath
            };

            const protoHydration = await SearchService.hydrateReferenceContent({
                source  : 'schemas/agent.proto',
                metadata: {
                    content : protoChunks[0].content,
                    repoSlug: 'mini-custom-source',
                    tenantId: 'tenant-alpha'
                }
            });
            result.nonLocalHydration = protoHydration === protoChunks[0].content;

            const tombstoneRepoSlug    = 'mini-neo-workspace';
            const tombstoneSourcePath = 'src/controller/MainController.mjs';

            await waitForRows({tenantId: 'tenant-alpha'}, rows => rows.some(row => (
                row.metadata.repoSlug === tombstoneRepoSlug && row.metadata.sourcePath === tombstoneSourcePath
            )));
            const tombstone = await asTenant('tenant-alpha', () => callTool('ingest_source_files', {
                tenantId: 'tenant-alpha',
                deleted : [{repoSlug: tombstoneRepoSlug, sourcePath: tombstoneSourcePath}],
                files   : []
            }));
            const tombstoneRows = await getRows({tenantId: 'tenant-alpha'});
            result.tombstoneFlow = {
                deleted: tombstone.deleted,
                foundDeletedPath: tombstoneRows.some(row => (
                    row.metadata.repoSlug === tombstoneRepoSlug && row.metadata.sourcePath === tombstoneSourcePath
                ))
            };

            const forcePushRepoSlug    = 'mini-es5-workspace';
            const forcePushSourcePath = 'src/legacy-store.js';

            await waitForRows({tenantId: 'tenant-alpha'}, rows => rows.some(row => (
                row.metadata.repoSlug === forcePushRepoSlug && row.metadata.sourcePath === forcePushSourcePath
            )));
            IngestionService.revisionResolver = {
                resolveDeletedPaths: async () => [{repoSlug: forcePushRepoSlug, sourcePath: forcePushSourcePath}]
            };
            const forcePush = await asTenant('tenant-alpha', () => callTool('ingest_source_files', {
                tenantId    : 'tenant-alpha',
                baseRevision: 'old',
                headRevision: 'new',
                files       : [{parsedChunks: [normalizeChunk({
                    ...es5Chunks[0],
                    sourcePath: 'src/new.js',
                    content   : 'force-push-new replacement chunk',
                    name      : 'force-push-new'
                }, 'tenant-alpha', forcePushRepoSlug)]}]
            }));
            const forceRows = await getRows({tenantId: 'tenant-alpha'});
            result.forcePushReconciliation = {
                deleted: forcePush.deleted,
                orphanPresent: forceRows.some(row => (
                    row.metadata.repoSlug === forcePushRepoSlug && row.metadata.sourcePath === forcePushSourcePath
                )),
                newPresent: forceRows.some(row => row.metadata.repoSlug === forcePushRepoSlug && row.metadata.sourcePath === 'src/new.js')
            };

            await asTenant('tenant-alpha', () => IngestionService.setTenantManifest({
                tenantId      : 'tenant-alpha',
                repoSlug      : forcePushRepoSlug,
                pathsAfterPush: ['src/new.js']
            }));
            const manifestCollection = await KB_ChromaManager.getKnowledgeBaseCollection();
            const manifestMetrics = [];
            KbReconciliationService.recordReconcileMetric = metric => { manifestMetrics.push(metric) };
            await KbReconciliationService.reconcileTenant({
                tenantId        : 'tenant-alpha',
                repoSlug        : forcePushRepoSlug,
                collection      : manifestCollection,
                orphanVersionGap: 2,
                autoTombstone   : true
            });
            const manifestRows = await getRows({tenantId: 'tenant-alpha'});
            result.manifestOrphanReconciliation = {
                metricCount  : manifestMetrics.length,
                orphanPresent: manifestRows.some(row => (
                    row.metadata.repoSlug === forcePushRepoSlug && row.metadata.sourcePath === 'src/legacy-widget.js'
                )),
                deletedCount: manifestMetrics[0]?.tombstonedCount,
                orphanCount : manifestMetrics[0]?.diff?.manifestOrphanCount
            };

            const spoofPayload = await asTenant('tenant-alpha', () => callTool('ingest_source_files', {
                tenantId  : 'tenant-alpha',
                repoSlug  : 'spoof-repo',
                visibility: 'private',
                files     : [{parsedChunks: [{
                    ...neoChunks[0],
                    tenantId  : 'tenant-beta',
                    repoSlug  : 'spoof-repo',
                    sourcePath: 'src/spoof.js',
                    content   : 'alpha-exclusive-query spoof-overwrite'
                }]}]
            }));
            const spoofRows = await getRows({sourcePath: 'src/spoof.js'});
            result.spoofRejection = {
                ingested: spoofPayload.ingested,
                tenantIds: spoofRows.map(row => row.metadata.tenantId),
                visibilities: spoofRows.map(row => row.metadata.visibility)
            };

            console.log(JSON.stringify(result));
        } finally {
            Memory_TextEmbeddingService.embedText  = originals.embedText;
            Memory_TextEmbeddingService.embedTexts = originals.embedTexts;
            IngestionService.revisionResolver = originals.revisionResolver;
            delete KbReconciliationService.recordReconcileMetric;
            KB_Config.data.collectionName      = originals.collectionName;
            KB_Config.data.defaultRepoSlug     = originals.defaultRepoSlug;
            KB_Config.data.defaultTenantId     = originals.defaultTenantId;
            KB_Config.data.defaultVisibility   = originals.defaultVisibility;
            KB_Config.data.batchDelay          = originals.batchDelay;
            KB_Config.data.mcpSyncMaxChunks    = originals.mcpSyncMaxChunks;
            KB_Config.data.spoofRejectionMode  = originals.spoofRejectionMode;
            SourceRegistry.unregisterParser('neo-fixture-parser');
            SourceRegistry.unregisterParser('es5-fixture-parser');
            SourceRegistry.unregisterParser('proto-fixture-parser');
            KB_ChromaManager.invalidateKnowledgeBaseCollectionCache();

            try {
                await KB_ChromaManager.client.deleteCollection({name: process.env.NEO_TEST_KB_COLLECTION});
            } catch {}
        }
    `, {
        NEO_TEST_FIXTURE_ROOT : '/app/test/playwright/integration/ai/kb-ingestion/fixtures/external-workspaces',
        NEO_TEST_KB_COLLECTION: collectionName
    });
}

test.describe('KB ingestion external workspace fixtures (#11638)', () => {
    test('fixtures define four external workspace shapes with golden parsed chunks', () => {
        for (const spec of fixtureSpecs) {
            const dir = path.join(fixtureRoot, spec.name);

            expect(fs.existsSync(path.join(dir, 'README.md')), `${spec.name} README`).toBe(true);
            expect(fs.existsSync(path.join(dir, 'expected-chunks.jsonl')), `${spec.name} expected chunks`).toBe(true);

            for (const sample of spec.sampleGlob) {
                expect(fs.existsSync(path.join(dir, sample)), `${spec.name}/${sample}`).toBe(true);
            }

            for (const extra of spec.extraFiles || []) {
                expect(fs.existsSync(path.join(dir, extra)), `${spec.name}/${extra}`).toBe(true);
            }

            const config = fs.readFileSync(path.join(dir, 'kb-config.yaml'), 'utf8');
            for (const bit of spec.configBits) {
                expect(config).toContain(bit);
            }

            const rows = readJsonl(path.join(dir, 'expected-chunks.jsonl'));
            expect(rows.length, `${spec.name} expected chunk count`).toBeGreaterThan(0);
            for (const row of rows) {
                expect(row.schemaVersion).toBe('1.0.0');
                expect(row.hashInputs).toContain('content');
                expect(row.sourcePath).toBeTruthy();
            }
        }

        expect(readJsonl(path.join(fixtureRoot, 'mini-cpp-workspace/parsed-chunks.jsonl'))).toEqual(
            readJsonl(path.join(fixtureRoot, 'mini-cpp-workspace/expected-chunks.jsonl'))
        );
    });

    test('drives all Discussion #11623 section-8 integration scenarios through the KB server', async () => {
        const readiness = await getReadiness();

        test.skip(readiness.dockerAvailable === false, `Docker unavailable: ${readiness.reason}`);
        expect(readiness.servicesReady, readiness.reason).toBe(true);

        const runId          = `${Date.now()}-${randomUUID()}`;
        const collectionName = `kb-multi-tenant-${runId}`;
        const outcome        = runMultiTenantMatrix(collectionName);

        expect(outcome.defaultInheritanceConfig).toBe(true);
        expect(outcome.defaultExclusionConfig).toBe(true);
        expect(outcome.transportParity).toBe(true);
        expect(outcome.clientSideCppParity).toBe(true);

        expect(outcome.pushPipeline).toMatchObject({
            errors  : [],
            ingested: 2,
            tenantId: 'tenant-alpha'
        });

        expect(outcome.multiTenantQuery).toEqual({
            alphaSeesOwn   : true,
            alphaSeesBeta  : false,
            betaSeesOwn    : true,
            betaSeesAlpha  : false,
            alphaSeesShared: true
        });

        expect(outcome.sameContentIsolation).toMatchObject({
            count      : 2,
            distinctIds: 2,
            tenants    : ['tenant-alpha', 'tenant-beta']
        });

        expect(outcome.schemaMismatch).toContain('KB_PARSED_CHUNK_INVALID');
        expect(outcome.backupRecordRejection).toContain('KB_PARSED_CHUNK_EMBEDDING_REJECTED');
        expect(outcome.thresholdGate).toMatchObject({
            code          : 'KB_INGEST_VOLUME_EXCEEDED',
            batchSize     : 6,
            threshold     : 5,
            hasBulkPathKey: true
        });
        expect(['null', 'string']).toContain(outcome.thresholdGate.bulkPathType);

        expect(outcome.nonLocalHydration).toBe(true);
        expect(outcome.tombstoneFlow).toMatchObject({
            deleted         : 1,
            foundDeletedPath: false
        });
        expect(outcome.forcePushReconciliation).toMatchObject({
            deleted      : 1,
            orphanPresent: false,
            newPresent   : true
        });
        expect(outcome.manifestOrphanReconciliation).toMatchObject({
            metricCount  : 1,
            orphanPresent: false,
            deletedCount : 1,
            orphanCount  : 1
        });
        expect(outcome.spoofRejection).toMatchObject({
            ingested    : 1,
            tenantIds   : ['tenant-alpha'],
            visibilities: ['private']
        });
    });
});
