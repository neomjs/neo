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

const CONFIRMATION  = 'CONFIRM_PRODUCTION_DESTRUCTIVE_AI_SUBSTRATE';
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
 * Truncates the deployed KB collection.
 * @returns {Object}
 */
function truncateKnowledgeBase() {
    return execKnowledgeBaseJson(`
        ${NEO_BOOTSTRAP}

        const {KB_DatabaseService, KB_LifecycleService} = await import('./ai/services.mjs');

        await KB_LifecycleService.ready();

        const result = await KB_DatabaseService.manageDatabaseBackup({
            action      : 'truncate',
            confirmation: process.env.NEO_DESTRUCTIVE_CONFIRMATION
        });

        console.log(JSON.stringify(result));
    `, {
        NEO_ALLOW_PRODUCTION_DESTRUCTIVE_AI_SUBSTRATE: 'true',
        NEO_DESTRUCTIVE_CONFIRMATION                : CONFIRMATION
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

            const truncated = truncateKnowledgeBase();
            expect(truncated.message).toContain('truncated successfully');

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
});
