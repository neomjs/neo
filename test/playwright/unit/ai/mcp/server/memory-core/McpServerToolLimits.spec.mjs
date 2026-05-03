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

test.describe('Neo.ai.mcp.server.memory-core Tool limits', () => {
    let toolService;

    test.beforeAll(async () => {
        // Import the config and apply any required setup
        const aiConfig = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        
        // Setup temporary directory for db paths to avoid crashing
        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        
        aiConfig.storagePaths.graph = path.join(tmpDir, `tool-limits-test-${Date.now()}.sqlite`);

        const ToolServiceModule = await import('../../../../../../../ai/mcp/server/memory-core/services/toolService.mjs');
        toolService = {
            listTools: ToolServiceModule.listTools
        };
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
            'adapter',
            'appName',
            'coalesceWindow',
            'daemonSocketPath',
            'focusSeedKey',
            'tabShortcut',
            'tmuxSession',
            'url'
        ]));
        expect(metadata.properties.adapter.enum).toEqual(['osascript', 'tmux']);
    });
});
