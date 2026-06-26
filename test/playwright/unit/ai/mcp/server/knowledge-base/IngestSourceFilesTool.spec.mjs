import {setup} from '../../../../../setup.mjs';

const appName = 'KBIngestSourceFilesToolTest';

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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';

/**
 * Coverage for the `ingest_source_files` MCP facade (#11634, Phase 2B).
 *
 * `ingestSourceFilesViaMcp` wraps `IngestionService.ingestSourceFiles`
 * with the #10572 work-volume gate: an oversized agent-initiated push is refused
 * up-front with a structured `KB_INGEST_VOLUME_EXCEEDED` payload instead of being
 * dispatched (which would embed synchronously and freeze the calling agent).
 *
 * The facade is tested directly from `ingestSourceFilesTool.mjs` so the gate logic
 * is isolated from the openapi -> Zod dispatch layer and the `callTool` telemetry
 * wrapper; `listTools()` separately confirms the openapi operation registers.
 *
 * Serial mode: specs mutate the `aiConfig.mcpSyncMaxChunks` threshold and the
 * `IngestionService.ingestSourceFiles` singleton method.
 */
test.describe.configure({mode: 'serial'});

test.describe('ingest_source_files MCP facade — work-volume gate (#11634)', () => {
    let callTool, ingestSourceFilesViaMcp, listTools, IngestionService, aiConfig;
    let originalIngest, originalThreshold, originalTransport;

    test.beforeAll(async () => {
        const toolService = await import('../../../../../../../ai/mcp/server/knowledge-base/toolService.mjs');
        const ingestTool  = await import('../../../../../../../ai/mcp/server/knowledge-base/ingestSourceFilesTool.mjs');
        callTool               = toolService.callTool;
        ingestSourceFilesViaMcp = ingestTool.ingestSourceFilesViaMcp;
        listTools               = toolService.listTools;

        IngestionService = (await import('../../../../../../../ai/services/knowledge-base/IngestionService.mjs')).default;
        aiConfig                      = (await import('../../../../../../../ai/mcp/server/knowledge-base/config.mjs')).default;

        originalIngest    = IngestionService.ingestSourceFiles;
        originalThreshold = aiConfig.mcpSyncMaxChunks;
        originalTransport = aiConfig.transport;
    });

    test.afterAll(() => {
        if (IngestionService) {
            IngestionService.ingestSourceFiles = originalIngest;
        }
        if (aiConfig) {
            aiConfig.mcpSyncMaxChunks = originalThreshold;
            aiConfig.transport        = originalTransport;
        }
    });

    test.beforeEach(() => {
        // Tight, predictable threshold; restore the real service method before each spec.
        aiConfig.mcpSyncMaxChunks                       = 5;
        aiConfig.transport                              = 'sse';
        IngestionService.ingestSourceFiles = originalIngest;
    });

    test('gate fires above threshold — returns KB_INGEST_VOLUME_EXCEEDED, service not dispatched', async () => {
        let dispatched = false;
        IngestionService.ingestSourceFiles = async () => {
            dispatched = true;
            return {};
        };

        const files  = Array.from({length: 6}, (_, i) => ({path: `raw${i}.mjs`, content: `body ${i}`}));
        const result = await ingestSourceFilesViaMcp({tenantId: 'neo-shared', files});

        expect(result.code).toBe('KB_INGEST_VOLUME_EXCEEDED');
        expect(result.batchSize).toBe(6);
        expect(result.threshold).toBe(5);
        expect(result.bulkPath).toBe(null);
        expect('error' in result).toBe(true);
        expect(result.message).toContain('exceeds');
        expect(dispatched, 'service must not be dispatched when the gate fires').toBe(false);
    });

    test('gate does not fire at the threshold boundary — dispatches to the ingestion service', async () => {
        let dispatchedArgs = null;
        const summary      = {ingested: 5, deleted: 0, embeddingsGenerated: 5, errors: [], tenantId: 'neo-shared', durationMs: 1};

        IngestionService.ingestSourceFiles = async args => {
            dispatchedArgs = args;
            return summary;
        };

        const files  = Array.from({length: 5}, (_, i) => ({path: `raw${i}.mjs`, content: `body ${i}`}));
        const result = await ingestSourceFilesViaMcp({tenantId: 'neo-shared', files});

        expect(dispatchedArgs, 'service must be dispatched at-or-below the threshold').not.toBe(null);
        expect(dispatchedArgs.files.length).toBe(5);
        expect(result).toBe(summary);
        expect('error' in result).toBe(false);
    });

    test('batch volume sums parsedChunks lengths and counts each raw file as 1', async () => {
        let dispatched = false;
        IngestionService.ingestSourceFiles = async () => {
            dispatched = true;
            return {};
        };

        // 2 raw files (2) + 1 file carrying 4 parsed chunks (4) = batch volume 6 > 5.
        const files = [
            {path: 'raw-a.mjs', content: 'a'},
            {path: 'raw-b.mjs', content: 'b'},
            {path: 'parsed-c.mjs', parsedChunks: [{name: 'c0'}, {name: 'c1'}, {name: 'c2'}, {name: 'c3'}]}
        ];
        const result = await ingestSourceFilesViaMcp({files});

        expect(result.code).toBe('KB_INGEST_VOLUME_EXCEEDED');
        expect(result.batchSize).toBe(6);
        expect(dispatched).toBe(false);
    });

    test('missing files field dispatches with a zero batch volume', async () => {
        let dispatchedArgs = 'unset';
        IngestionService.ingestSourceFiles = async args => {
            dispatchedArgs = args;
            return {ingested: 0, deleted: 0, embeddingsGenerated: 0, errors: [], tenantId: 'neo-shared', durationMs: 0};
        };

        const result = await ingestSourceFilesViaMcp({tenantId: 'neo-shared'});

        expect(dispatchedArgs, 'a no-files envelope must still reach the service for its structured error').not.toBe('unset');
        expect('error' in result).toBe(false);
    });

    test('ingest_source_files is listed for the remote SSE transport profile', () => {
        aiConfig.transport = 'sse';

        const {tools} = listTools();
        const tool    = tools.find(item => item.name === 'ingest_source_files');

        expect(tool, 'ingest_source_files must be listed by the KB MCP server').toBeTruthy();
        expect(tool.inputSchema, 'ingest_source_files must advertise an input schema').toBeTruthy();

        // MCP description-budget guard (Anthropic/Gemini limits; pr-review guide §5.3).
        expect(tool.name.length, 'tool name within the 64-char MCP limit').toBeLessThanOrEqual(64);
        expect(tool.description.length, 'tool description within the 1024-char MCP budget').toBeLessThanOrEqual(1024);
    });

    test('ingest_source_files is hidden and fail-closed for local stdio transport', async () => {
        aiConfig.transport = 'stdio';

        const {tools} = listTools();

        expect(tools.find(item => item.name === 'ingest_source_files')).toBeUndefined();
        await expect(callTool('ingest_source_files', {files: []})).rejects.toThrow(/transport: "sse"/);
    });
});
