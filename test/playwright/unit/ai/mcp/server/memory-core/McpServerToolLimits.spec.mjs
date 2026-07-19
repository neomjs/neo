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

import {test, expect}  from '@playwright/test';
import path            from 'path';
import {fileURLToPath} from 'url';
import Neo             from '../../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../../src/core/_export.mjs';
import ToolService     from '../../../../../../../ai/mcp/ToolService.mjs';

const
    __filename = fileURLToPath(import.meta.url),
    __dirname  = path.dirname(__filename),
    repoRoot   = path.resolve(__dirname, '../../../../../../..');

test.describe('Neo.ai.mcp.server.memory-core Tool limits', () => {
    let toolService;

    test.beforeAll(async () => {
        // ADR 0019 B4: storagePaths.graph resolves to ':memory:' by construction under // ticket-ref-ok: ADR id
        // UNIT_TEST_MODE — no singleton mutation, no temp DB path needed.

        const ToolServiceModule = await import('../../../../../../../ai/mcp/server/memory-core/toolService.mjs');
        toolService = {
            listTools              : ToolServiceModule.listTools,
            readLaneLandscapeConfig: ToolServiceModule.readLaneLandscapeConfig
        };
    });

    test('explore_lane_landscape resolves both owning child-config domains (#15468)', () => {
        expect(toolService.readLaneLandscapeConfig()).toEqual({
            census: {
                edgeLimit: 5000,
                maxPages : 50,
                pageLimit: 100
            },
            source: {
                maxAssignees: 10,
                maxLabels   : 20,
                owner       : 'neomjs',
                repo        : 'neo'
            }
        })
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

        expect(metadata.required).toBeUndefined();
        expect(metadata.description).toContain("not for adapters 'opencode-server' or 'kimi-server'");
        expect(Object.keys(metadata.properties)).toEqual(expect.arrayContaining([
            'addressType',
            'adapter',
            'appName',
            'coalesceWindow',
            'cwd',
            'daemonSocketPath',
            'envelopePath',
            'focusSeedKey',
            'instanceAddress',
            'lockPath',
            'tabShortcut',
            'tmuxSession',
            'tokenPath',
            'url'
        ]));
        expect(metadata.properties.adapter.enum).toEqual(['osascript', 'tmux', 'codex-app-server', 'opencode-server', 'kimi-server']);
        expect(metadata.properties.envelopePath.type).toBe('string');
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
        const perSessionSchema = tool.outputSchema.properties.perSession;
        const perSession       = perSessionSchema.type === 'object'
            ? perSessionSchema
            : perSessionSchema.anyOf.find(item => item.type === 'object');

        expect(perSession.properties.entityCount.type).toBe('integer');
    });

    test('healthcheck exposes diagnostic options through the MCP schema (#13460)', async () => {
        const { tools } = await toolService.listTools();
        const tool = tools.find(item => item.name === 'healthcheck');

        expect(tool).toBeTruthy();
        expect(tool.annotations.readOnlyHint).toBe(true);
        expect(tool.inputSchema.properties.freshObservability.type).toBe('boolean');
        expect(tool.inputSchema.properties.chromaProbeTimeoutMs.type).toBe('integer');
        expect(tool.inputSchema.properties.chromaProbeTimeoutMs.minimum).toBe(1);
        expect(tool.inputSchema.properties.embeddingWriteCanaryTimeoutMs.type).toBe('integer');
        expect(tool.inputSchema.properties.embeddingWriteCanaryTimeoutMs.minimum).toBe(1);
        expect(tool.inputSchema.properties.includeSqliteHolders).toBeUndefined();
    });

    test('get_sqlite_holder_diagnostics exposes read-only grouped holder contract (#13475)', async () => {
        const { tools } = await toolService.listTools();
        const tool = tools.find(item => item.name === 'get_sqlite_holder_diagnostics');

        expect(tool).toBeTruthy();
        expect(tool.annotations.readOnlyHint).toBe(true);
        expect(tool.inputSchema.properties).toEqual({});
        expect(tool.outputSchema.properties.status.enum).toEqual(['ok', 'degraded']);
        expect(tool.outputSchema.properties.totalProcesses.type).toBe('integer');
        expect(tool.outputSchema.properties.byHarness.additionalProperties.type).toBe('integer');
        expect(tool.outputSchema.properties.groups.items.properties.harness.type).toBe('string');
        expect(tool.outputSchema.properties.groups.items.properties.processes.type).toBe('array');
        expect(tool.outputSchema.properties.processes.items.properties.pid.type).toBe('integer');
        expect(tool.outputSchema.properties.processes.items.properties.chain.type).toBe('array');
        expect(tool.outputSchema.properties.warnings.items.properties.code.type).toBe('string');
    });

    test('healthcheck dispatch passes diagnostic options as one object (#13460)', async () => {
        const observedArgs = [];
        const spyToolService = Neo.create(ToolService, {
            openApiFilePath: path.join(repoRoot, 'ai/mcp/server/memory-core/openapi.yaml'),
            serviceMapping : {
                healthcheck: async args => {
                    observedArgs.push(args);
                    return {status: 'healthy', args};
                }
            }
        });

        const args = {
            freshObservability           : false,
            chromaProbeTimeoutMs         : 1234,
            embeddingWriteCanaryTimeoutMs: 5678
        };

        await expect(spyToolService.callTool('healthcheck', args)).resolves.toEqual({
            status: 'healthy',
            args
        });
        expect(observedArgs).toEqual([args]);
    });
});
