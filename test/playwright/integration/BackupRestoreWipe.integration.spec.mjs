import {randomUUID}    from 'node:crypto';
import {spawnSync}     from 'node:child_process';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import {test, expect}  from '@playwright/test';
import {
    callHealthcheck,
    callJsonTool,
    createIdentityClient,
    getReadiness
} from './fixtures/mcpClient.mjs';

const __filename  = fileURLToPath(import.meta.url);
const __dirname   = path.dirname(__filename);
const repoRoot    = path.resolve(__dirname, '../../..');
const composeFile = path.join(repoRoot, 'ai/deploy/docker-compose.test.yml');
const projectName = process.env.NEO_INTEGRATION_COMPOSE_PROJECT || 'neo-integration-test';
const MC_URL      = process.env.NEO_INTEGRATION_MC_URL || 'http://127.0.0.1:13001';

const CONFIRMATION = 'CONFIRM_PRODUCTION_DESTRUCTIVE_AI_SUBSTRATE';
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
 * Runs an ES module snippet inside the deployed Memory Core container.
 * @param {String} code The JavaScript source to execute.
 * @param {Object} [env] Environment variables to pass into the process.
 * @returns {Object}
 */
function execMemoryCoreJson(code, env={}) {
    const envArgs = Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`]);
    const result  = dockerCompose(['exec', '-T', ...envArgs, 'mc-server', 'node', '--input-type=module', '-e', code]);
    const output  = [
        result.stdout?.trim(),
        result.stderr?.trim()
    ].filter(Boolean).join('\n');

    expect(result.status, output || result.error?.message || 'mc-server exec failed').toBe(0);

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
 * Creates an atomic backup bundle from inside the deployed Memory Core container.
 * @param {String} bundleRoot Absolute bundle target inside the container.
 * @returns {Object}
 */
function createBackupBundle(bundleRoot) {
    return execMemoryCoreJson(`
        ${NEO_BOOTSTRAP}

        const silentLogger = {log(){}, warn(){}, error(){}};
        const {runBackup} = await import('./ai/scripts/maintenance/backup.mjs');
        const result = await runBackup({
            bundleRoot: process.env.NEO_TEST_BACKUP_BUNDLE,
            logger    : silentLogger
        });
        console.log(JSON.stringify({
            bundleRoot: result.bundleRoot,
            completedAt: result.completedAt,
            subsystems: result.subsystems,
            integrity : result.meta.integrity
        }));
    `, {
        NEO_TEST_BACKUP_BUNDLE: bundleRoot
    });
}

/**
 * Restores an atomic backup bundle from inside the deployed Memory Core container.
 * @param {String} bundleRoot Absolute bundle target inside the container.
 * @returns {Object}
 */
function restoreBackupBundle(bundleRoot) {
    return execMemoryCoreJson(`
        ${NEO_BOOTSTRAP}

        const silentLogger = {log(){}, warn(){}, error(){}};
        const {runRestore} = await import('./ai/scripts/maintenance/restore.mjs');
        const result = await runRestore({
            bundleRoot: process.env.NEO_TEST_BACKUP_BUNDLE,
            mode      : 'merge',
            logger    : silentLogger
        });
        console.log(JSON.stringify({
            mode      : result.mode,
            subsystems: result.subsystems,
            topology  : result.topology
        }));
    `, {
        NEO_TEST_BACKUP_BUNDLE: bundleRoot
    });
}

/**
 * Truncates the deployed fixture graph inside the disposable container path.
 * @returns {Object}
 */
function truncateGraph() {
    return execMemoryCoreJson(`
        ${NEO_BOOTSTRAP}

        const {Memory_DatabaseService, Memory_LifecycleService} = await import('./ai/services.mjs');

        await Memory_LifecycleService.ready();

        const result = await Memory_DatabaseService.manageDatabaseBackup({
            action      : 'truncate',
            include     : ['graph'],
            confirmation: process.env.NEO_DESTRUCTIVE_CONFIRMATION
        });

        console.log(JSON.stringify(result));
    `, {
        NEO_ALLOW_PRODUCTION_DESTRUCTIVE_AI_SUBSTRATE: 'true',
        NEO_DESTRUCTIVE_CONFIRMATION                : CONFIRMATION
    });
}

/**
 * Reads graph evidence directly inside the deployed Memory Core container.
 * @param {String} memoryId The graph node id to probe.
 * @returns {Object}
 */
function readGraphEvidence(memoryId) {
    return execMemoryCoreJson(`
        ${NEO_BOOTSTRAP}

        const {Memory_LifecycleService} = await import('./ai/services.mjs');
        const {default: GraphService} = await import('./ai/services/memory-core/GraphService.mjs');

        await Memory_LifecycleService.ready();

        const db = GraphService.db.storage.db;
        const node = db.prepare('SELECT data FROM Nodes WHERE id = ?').get(process.env.NEO_TEST_MEMORY_ID);
        const edgeCount = db.prepare('SELECT count(*) as count FROM Edges WHERE source = ? OR target = ?')
            .get(process.env.NEO_TEST_MEMORY_ID, process.env.NEO_TEST_MEMORY_ID).count;
        const totalNodes = db.prepare('SELECT count(*) as count FROM Nodes').get().count;

        console.log(JSON.stringify({
            edgeCount,
            exists    : Boolean(node),
            totalNodes
        }));
    `, {
        NEO_TEST_MEMORY_ID: memoryId
    });
}

/**
 * Removes test-only graph residue for the seeded memory node.
 * @param {String} memoryId The graph node id to remove.
 * @returns {Object}
 */
function cleanupGraphNode(memoryId) {
    return execMemoryCoreJson(`
        ${NEO_BOOTSTRAP}

        const {Memory_LifecycleService} = await import('./ai/services.mjs');
        const {default: GraphService} = await import('./ai/services/memory-core/GraphService.mjs');

        await Memory_LifecycleService.ready();

        const db = GraphService.db.storage.db;
        const edgeInfo = db.prepare('DELETE FROM Edges WHERE source = ? OR target = ?')
            .run(process.env.NEO_TEST_MEMORY_ID, process.env.NEO_TEST_MEMORY_ID);
        const nodeInfo = db.prepare('DELETE FROM Nodes WHERE id = ?')
            .run(process.env.NEO_TEST_MEMORY_ID);

        console.log(JSON.stringify({
            deletedEdges: edgeInfo.changes,
            deletedNodes: nodeInfo.changes
        }));
    `, {
        NEO_TEST_MEMORY_ID: memoryId
    });
}

/**
 * Deletes a backup bundle from the deployed Memory Core container tmpfs.
 * @param {String} bundleRoot Absolute bundle path inside the container.
 * @returns {Object}
 */
function cleanupBackupBundle(bundleRoot) {
    return execMemoryCoreJson(`
        const fs = await import('node:fs/promises');

        await fs.rm(process.env.NEO_TEST_BACKUP_BUNDLE, {recursive: true, force: true});

        console.log(JSON.stringify({removed: process.env.NEO_TEST_BACKUP_BUNDLE}));
    `, {
        NEO_TEST_BACKUP_BUNDLE: bundleRoot
    });
}

/**
 * Flattens a memory query response into searchable test evidence.
 * @param {Object} result The query_raw_memories tool result.
 * @returns {String}
 */
function memoryTexts(result) {
    return result.results.map(memory => [
        memory.prompt,
        memory.thought,
        memory.response
    ].join('\n')).join('\n');
}

test.describe('Dockerized MC backup -> wipe detection -> restore integration (#10949)', () => {
    test('restores seeded memory and graph evidence after an isolated fixture wipe', async () => {
        const readiness = await getReadiness();

        test.skip(readiness.dockerAvailable === false, `Docker unavailable: ${readiness.reason}`);

        expect(readiness.servicesReady, readiness.reason).toBe(true);

        const runId      = `${Date.now()}-${randomUUID()}`;
        const sessionId  = `integration-backup-restore-${runId}`;
        const sentinel   = `backup-restore-sentinel-${runId}`;
        const bundleRoot = `/tmp/neo-integration/backup-restore-${runId}`;
        const client     = await createIdentityClient({
            baseUrl   : MC_URL,
            clientName: 'neo-integration-backup-restore',
            identity  : 'backup-restore'
        });
        let memoryId;

        try {
            const addResult = await callJsonTool(client, 'add_memory', {
                amountToolCalls: 1,
                agent          : 'backup-restore',
                model          : 'integration',
                prompt         : `seed prompt ${sentinel}`,
                response       : `seed response ${sentinel}`,
                sessionId,
                thought        : `seed thought ${sentinel}`,
                toolsUsed      : ['integration-backup-restore']
            });

            memoryId = addResult.id;
            expect(memoryId).toBeTruthy();

            // Semantic recall is eventually consistent (server-hosted WAL drain) — poll the
            // seeded read-back to convergence before snapshotting backup evidence.
            await expect.poll(async () => memoryTexts(await callJsonTool(client, 'query_raw_memories', {
                nResults: 5,
                query   : sentinel,
                sessionId
            })), {timeout: 20000, message: 'WAL drain convergence (seeded memory)'}).toContain(sentinel);

            const seededGraph = readGraphEvidence(memoryId);
            expect(seededGraph.exists).toBe(true);
            expect(seededGraph.edgeCount).toBeGreaterThan(0);

            const backup = createBackupBundle(bundleRoot);
            expect(backup.completedAt).toBeTruthy();
            expect(backup.subsystems.mc.message).toContain('Exported');
            expect(backup.subsystems.graph.message).toContain('Exported');
            expect(backup.integrity.filter(check => check.status === 'fail')).toEqual([]);

            await callJsonTool(client, 'purge_session', {sessionId});
            truncateGraph();

            const wipedHealth = await callHealthcheck(MC_URL, {
                clientName: 'neo-integration-backup-restore-health',
                identity  : 'backup-restore'
            });
            expect(wipedHealth.status).toBe('healthy');
            expect(wipedHealth.database.connection.connected).toBe(true);

            const wipedResults = await callJsonTool(client, 'query_raw_memories', {
                nResults: 5,
                query   : sentinel,
                sessionId
            });
            expect(memoryTexts(wipedResults)).not.toContain(sentinel);

            const wipedGraph = readGraphEvidence(memoryId);
            expect(wipedGraph.exists).toBe(false);

            const restored = restoreBackupBundle(bundleRoot);
            expect(restored.mode).toBe('merge');
            expect(restored.subsystems.mc.imported).toBeGreaterThan(0);
            expect(restored.subsystems.graph.imported).toBeGreaterThan(0);

            const restoredResults = await callJsonTool(client, 'query_raw_memories', {
                nResults: 5,
                query   : sentinel,
                sessionId
            });
            expect(memoryTexts(restoredResults)).toContain(sentinel);

            const restoredGraph = readGraphEvidence(memoryId);
            expect(restoredGraph.exists).toBe(true);
            expect(restoredGraph.edgeCount).toBeGreaterThan(0);
        } finally {
            await Promise.allSettled([
                callJsonTool(client, 'purge_session', {sessionId})
            ]);

            await Promise.allSettled([
                client.close()
            ]);

            if (memoryId) {
                cleanupGraphNode(memoryId);
            }

            cleanupBackupBundle(bundleRoot);
        }
    });
});
