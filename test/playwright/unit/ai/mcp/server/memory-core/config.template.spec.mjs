import { test, expect } from '@playwright/test';
import path from 'path';
import Neo from '../../../../../../../src/Neo.mjs';

test.describe('Memory Core Config (#10010)', () => {
    let originalEnv;
    let config;

    test.beforeAll(async () => {
        originalEnv = { ...process.env };
        config = (await import('../../../../../../../ai/mcp/server/memory-core/config.template.mjs')).default;
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
