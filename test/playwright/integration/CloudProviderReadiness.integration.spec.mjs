import {spawnSync}     from 'node:child_process';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import {test, expect}  from '@playwright/test';
import {getReadiness}  from './fixtures/mcpClient.mjs';

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
 * @summary Runs Docker Compose against the integration fixture project.
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
 * @summary Runs an ES module snippet inside the deployed Memory Core container.
 * Runs an ES module snippet inside the deployed Memory Core container.
 * @param {String} code The JavaScript source to execute.
 * @param {Object} [payload] JSON payload exposed as NEO_TEST_PAYLOAD.
 * @returns {Object}
 */
function execMemoryCoreJson(code, payload={}) {
    const result = dockerCompose([
        'exec',
        '-T',
        '-e',
        `NEO_TEST_PAYLOAD=${JSON.stringify(payload)}`,
        'mc-server',
        'node',
        '--input-type=module',
        '-e',
        code
    ]);
    const output = [
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

test.describe('Cloud provider readiness integration (#11964)', () => {
    test('proves embeddings and chat completions under the cloud OpenAI-compatible profile', async () => {
        const readiness = await getReadiness();

        test.skip(readiness.dockerAvailable === false, `Docker unavailable: ${readiness.reason}`);

        expect(readiness.servicesReady, readiness.reason).toBe(true);

        const result = execMemoryCoreJson(`
            ${NEO_BOOTSTRAP}

            const {Memory_LifecycleService, Memory_TextEmbeddingService, Memory_SessionService} = await import('./ai/services.mjs');
            const aiConfig = (await import('./ai/mcp/server/memory-core/config.mjs')).default;
            const sentinel = 'cloud-readiness-chat-sentinel';

            await Memory_LifecycleService.ready();

            const embedding = await Memory_TextEmbeddingService.embedText(
                'cloud-readiness-embedding-sentinel',
                aiConfig.embeddingProvider
            );
            const chat = await Memory_SessionService.model.generateContent(sentinel);

            console.log(JSON.stringify({
                embeddingProvider: aiConfig.embeddingProvider,
                modelProvider    : aiConfig.modelProvider,
                embeddingLength  : embedding.length,
                embeddingFirst   : embedding[0],
                chatText         : chat.response.text()
            }));
        `);

        expect(result.embeddingProvider).toBe('openAiCompatible');
        expect(result.modelProvider).toBe('openAiCompatible');
        expect(result.embeddingLength).toBe(4096);
        expect(typeof result.embeddingFirst).toBe('number');
        expect(result.chatText).toContain('"provider":"openAiCompatible"');
        expect(result.chatText).toContain('cloud-readiness-chat-sentinel');
    });

    test('proves the Dream/REM graph-mutator path uses the deployed provider', async () => {
        const readiness = await getReadiness();

        test.skip(readiness.dockerAvailable === false, `Docker unavailable: ${readiness.reason}`);

        expect(readiness.servicesReady, readiness.reason).toBe(true);

        const result = execMemoryCoreJson(`
            ${NEO_BOOTSTRAP}

            const aiConfig = (await import('./ai/mcp/server/memory-core/config.mjs')).default;
            const {Memory_LifecycleService} = await import('./ai/services.mjs');
            const SemanticGraphExtractor = (await import('./ai/services/graph/SemanticGraphExtractor.mjs')).default;

            await Memory_LifecycleService.ready();

            const extraction = await SemanticGraphExtractor.executeTriVectorExtraction({
                id      : 'cloud-readiness-vector-id',
                meta    : {sessionId: 'cloud-readiness-session'},
                document: 'Dream REM graph mutation provider proof cloud-readiness-graph-sentinel'
            });

            console.log(JSON.stringify({
                modelProvider: aiConfig.modelProvider,
                nodeIds      : extraction?.session_artifact?.graph?.nodes?.map(node => node.id) || []
            }));
        `);

        expect(result.modelProvider).toBe('openAiCompatible');
        expect(result.nodeIds).toContain('CONCEPT:cloud-readiness-graph-sentinel');
    });
});
