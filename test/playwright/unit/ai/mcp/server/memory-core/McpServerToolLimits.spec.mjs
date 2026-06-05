import {setup} from '../../../../../setup.mjs';

const appName = 'McpServerToolLimitsTest';

setup({
    neoConfig: {
        unitTestMode: true
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
import path           from 'path';
import fs             from 'fs-extra';
import {snapshotAiConfig} from '../../../../../fixtures/aiConfigIsolation.mjs';

test.describe('Neo.ai.mcp.server.memory-core Tool limits', () => {
    let toolService;
    let restoreAiConfig;

    test.beforeAll(async () => {
        // Import the config and apply any required setup
        const aiConfig = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;

        // Setup temporary directory for db paths to avoid crashing
        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }

        restoreAiConfig = snapshotAiConfig(aiConfig, ['storagePaths.graph']);
        aiConfig.storagePaths.graph = path.join(tmpDir, `tool-limits-test-${Date.now()}.sqlite`);

        const ToolServiceModule = await import('../../../../../../../ai/mcp/server/memory-core/toolService.mjs');
        toolService = {
            listTools: ToolServiceModule.listTools
        };
    });

    test.afterAll(() => {
        restoreAiConfig?.()
    });

    test('All Memory Core tools must respect description length constraints', async () => {
        const { tools } = await toolService.listTools();
        expect(tools.length).toBeGreaterThan(0);

        for (const tool of tools) {
            // Anthropic/Gemini MCP limits
            expect(tool.name.length).toBeLessThanOrEqual(64);
            expect(tool.description.length).toBeLessThanOrEqual(1024);

            if (tool.inputSchema && tool.inputSchema.properties) {
                for (const [propName, propDef] of Object.entries(tool.inputSchema.properties)) {
                    if (propDef.description) {
                        expect(propDef.description.length).toBeLessThanOrEqual(1024);
                    }
                }
            }
        }
    });

    test('manage_wake_subscription surfaces bridge metadata contract', async () => {
        const { tools } = await toolService.listTools();
        const tool = tools.find(item => item.name === 'manage_wake_subscription');
        const metadata = tool.inputSchema.properties.harnessTargetMetadata;

        expect(metadata.required).toContain('appName');
        expect(Object.keys(metadata.properties)).toEqual(expect.arrayContaining([
            'addressType',
            'adapter',
            'appName',
            'coalesceWindow',
            'daemonSocketPath',
            'focusSeedKey',
            'instanceAddress',
            'tabShortcut',
            'tmuxSession',
            'url'
        ]));
        expect(metadata.properties.adapter.enum).toEqual(['osascript', 'tmux']);
        expect(metadata.properties.addressType.enum).toEqual(['userDataDir', 'pid', 'tmuxSession', 'webhookUrl']);
    });

    test('get_neighbors output schema exposes semanticVectorId contract (#11680)', async () => {
        const { tools } = await toolService.listTools();
        const tool = tools.find(item => item.name === 'get_neighbors');
        const neighbor = tool.outputSchema.properties.neighbors.items;

        expect(neighbor.properties.semanticVectorId.type).toBe('string');
        expect(neighbor.properties.semanticVectorId.description).toContain('semantic vector identifier');
        expect(neighbor.additionalProperties).not.toBe(false);
    });

    test('get_rem_pipeline_state surfaces the REM axis-count output contract (#12087)', async () => {
        const { tools } = await toolService.listTools();
        const tool = tools.find(item => item.name === 'get_rem_pipeline_state');

        expect(tool).toBeTruthy();
        expect(tool.annotations.readOnlyHint).toBe(true);
        expect(tool.outputSchema.properties.undigested.type).toBe('integer');
        expect(tool.outputSchema.properties.digested.type).toBe('integer');
        expect(tool.outputSchema.properties.sessionNodes.type).toBe('integer');
        expect(tool.outputSchema.properties.topologyConflicts.type).toBe('integer');
        expect(tool.outputSchema.properties.recentCycles.type).toBe('array');
        expect(tool.outputSchema.properties.recentCycles.items.properties.runId.type).toBe('string');
        expect(tool.outputSchema.properties.recentCycles.items.properties.cycleOverflowSignal.type).toBe('boolean');
        const perSession = tool.outputSchema.properties.perSession.anyOf.find(item => item.type === 'object');
        expect(perSession.properties.entityCount.type).toBe('integer');
    });
});
