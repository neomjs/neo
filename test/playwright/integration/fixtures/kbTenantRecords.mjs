import {spawnSync}     from 'node:child_process';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import {expect}        from '@playwright/test';

const __filename  = fileURLToPath(import.meta.url);
const __dirname   = path.dirname(__filename);
const repoRoot    = path.resolve(__dirname, '../../..');
const composeFile = path.join(repoRoot, 'ai/deploy/docker-compose.test.yml');
const projectName = process.env.NEO_INTEGRATION_COMPOSE_PROJECT || 'neo-integration-test';

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
 * Seeds deterministic KB records directly into the deployed Chroma collection.
 * @param {Array<{id: String, content: String, metadata: Object}>} records Records to seed.
 * @returns {Object}
 */
export function seedKnowledgeBaseRecords(records) {
    return execKnowledgeBaseJson(`
        ${NEO_BOOTSTRAP}

        const records = JSON.parse(process.env.NEO_TEST_KB_RECORDS);
        const {KB_ChromaManager, KB_LifecycleService} = await import('./ai/services.mjs');
        const TextEmbeddingService = (await import('./ai/services/memory-core/TextEmbeddingService.mjs')).default;
        const mcConfig = (await import('./ai/mcp/server/memory-core/config.mjs')).default;

        await KB_LifecycleService.ready();

        const collection = await KB_ChromaManager.getKnowledgeBaseCollection();
        const embeddings = [];

        for (const record of records) {
            embeddings.push(await TextEmbeddingService.embedText(record.content, mcConfig.embeddingProvider));
        }

        await collection.upsert({
            ids       : records.map(record => record.id),
            embeddings,
            metadatas : records.map(record => record.metadata),
            documents : records.map(record => record.content)
        });

        console.log(JSON.stringify({
            count: await collection.count(),
            ids  : records.map(record => record.id)
        }));
    `, {
        NEO_TEST_KB_RECORDS: JSON.stringify(records)
    });
}

/**
 * Deletes deterministic KB records seeded by integration specs.
 * @param {String[]} ids Chroma ids to delete.
 * @returns {Object}
 */
export function deleteKnowledgeBaseRecords(ids) {
    if (ids.length === 0) {
        return {deleted: []};
    }

    return execKnowledgeBaseJson(`
        ${NEO_BOOTSTRAP}

        const ids = JSON.parse(process.env.NEO_TEST_KB_IDS);
        const {KB_ChromaManager, KB_LifecycleService} = await import('./ai/services.mjs');

        await KB_LifecycleService.ready();

        const collection = await KB_ChromaManager.getKnowledgeBaseCollection();

        await collection.delete({ids});

        console.log(JSON.stringify({
            count  : await collection.count(),
            deleted: ids
        }));
    `, {
        NEO_TEST_KB_IDS: JSON.stringify(ids)
    });
}
