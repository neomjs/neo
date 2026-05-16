import { test, expect } from '@playwright/test';
import path from 'path';
import '../../../../../../../src/Neo.mjs';

test.describe('Memory Core Config (#10010)', () => {
    let originalEnv;

    test.beforeAll(() => {
        originalEnv = { ...process.env };
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
        
        // Using dynamic imports with query parameters for cache-busting
    });

    test('defaultPolicy initializes to legacy', async () => {
        const config = (await import('../../../../../../../ai/mcp/server/memory-core/config.template.mjs?default=' + Date.now())).default;
        expect(config.memorySharing.defaultPolicy).toBe('legacy');
    });

    test('NEO_MEMORY_SHARING_DEFAULT_POLICY env override parses correctly', async () => {
        process.env.NEO_MEMORY_SHARING_DEFAULT_POLICY = 'team';
        
        // Dynamic import with cache busting query param
        const config = (await import('../../../../../../../ai/mcp/server/memory-core/config.template.mjs?team=' + Date.now())).default;
        
        // Re-load the config to pick up env vars (the config.load method handles this)
        config.load();
        
        expect(config.memorySharing.defaultPolicy).toBe('team');
    });

    test('invalid NEO_MEMORY_SHARING_DEFAULT_POLICY throws Error', async () => {
        process.env.NEO_MEMORY_SHARING_DEFAULT_POLICY = 'public';
        
        // The error is thrown synchronously during module initialization (Neo.setupClass -> construct -> applyEnv)
        await expect(
            import('../../../../../../../ai/mcp/server/memory-core/config.template.mjs?invalid=' + Date.now())
        ).rejects.toThrow(/\[Config\] Invalid NEO_MEMORY_SHARING_DEFAULT_POLICY value: "public"\. Must be one of: legacy, private, team/);
    });
});
