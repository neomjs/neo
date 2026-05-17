import { test, expect } from '@playwright/test';
import path from 'path';
import Neo from '../../../../../../../src/Neo.mjs';

test.describe('Memory Core Config (#10010)', () => {
    let originalEnv;
    let config;

    test.beforeAll(async () => {
        originalEnv = { ...process.env };

        // Remove the class from Neo's namespace to prevent collisions if another spec
        // already imported the real config.mjs in the same worker.
        if (Neo.ai?.mcp?.server?.['memory-core']?.Config) {
            delete Neo.ai.mcp.server['memory-core'].Config;
        }
        if (Neo.classHierarchyMap?.['Neo.ai.mcp.server.memory-core.Config']) {
            delete Neo.classHierarchyMap['Neo.ai.mcp.server.memory-core.Config'];
        }

        config = (await import('../../../../../../../ai/mcp/server/memory-core/config.template.mjs')).default;
    });

    test.afterAll(() => {
        // Remove the class from Neo's namespace to prevent collisions with other specs
        // that import the real config.mjs in the same worker.
        if (Neo.ai?.mcp?.server?.['memory-core']?.Config) {
            delete Neo.ai.mcp.server['memory-core'].Config;
        }
        if (Neo.classHierarchyMap?.['Neo.ai.mcp.server.memory-core.Config']) {
            delete Neo.classHierarchyMap['Neo.ai.mcp.server.memory-core.Config'];
        }
    });

    test.afterEach(() => {
        // Restore environment variables
        Object.keys(process.env).forEach(key => {
            if (!(key in originalEnv)) {
                delete process.env[key];
            } else {
                process.env[key] = originalEnv[key];
            }
        });

        // Restore config to default by reloading without test env overrides
        config.data = Neo.clone(config.defaultConfig, true);
        config.applyEnv();
    });

    test('defaultPolicy initializes to legacy', () => {
        expect(config.memorySharing.defaultPolicy).toBe('legacy');
    });

    test('NEO_MEMORY_SHARING_DEFAULT_POLICY env override parses correctly', () => {
        process.env.NEO_MEMORY_SHARING_DEFAULT_POLICY = 'team';

        // Re-load the config to pick up env vars
        config.applyEnv();

        expect(config.memorySharing.defaultPolicy).toBe('team');
    });

    test('invalid NEO_MEMORY_SHARING_DEFAULT_POLICY throws Error', () => {
        process.env.NEO_MEMORY_SHARING_DEFAULT_POLICY = 'public';

        expect(() => {
            config.applyEnv();
        }).toThrow(/\[Config\] Invalid NEO_MEMORY_SHARING_DEFAULT_POLICY value: "public"\. Must be one of: legacy, private, team/);
    });
});
