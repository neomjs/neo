import {setup} from '../../setup.mjs';

const appName = 'AiClientDispatcherTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';

test.describe('Neo.ai.Client Dispatcher', () => {
    let client;

    test.beforeAll(() => {
        // Mock Neo.currentWorker which is required by Window.mjs and Client.mjs
        if (!Neo.currentWorker) {
            Neo.currentWorker = {
                on: () => {},
                isSharedWorker: false
            };
        }
        if (!Neo.worker) {
            Neo.worker = {
                App: { id: 'test-worker' }
            };
        }
    });

    test.beforeEach(async () => {
        // We need to import the class to ensure it's loaded, even if it's a singleton
        const { default: Client } = await import('../../../../src/ai/Client.mjs');
        
        client = Neo.ai.Client;
        if (!client) {
            client = Neo.create(Client, {appName});
        }
    });

    test('should route check_namespace to RuntimeService.checkNamespace', async () => {
        let called = false;
        const originalFn = client.services.runtime.checkNamespace;
        
        client.services.runtime.checkNamespace = (params) => {
            called = true;
            expect(params.namespace).toBe('Neo.button.Base');
            return true;
        };

        const result = await client.handleRequest('check_namespace', {namespace: 'Neo.button.Base'});
        expect(called).toBe(true);
        expect(result).toBe(true);
        
        client.services.runtime.checkNamespace = originalFn;
    });

    test('should route get_namespace_tree to RuntimeService.getNamespaceTree', async () => {
        let called = false;
        const originalFn = client.services.runtime.getNamespaceTree;
        
        client.services.runtime.getNamespaceTree = (params) => {
            called = true;
            expect(params.root).toBe('Neo.manager');
            return { tree: {} };
        };

        const result = await client.handleRequest('get_namespace_tree', {root: 'Neo.manager'});
        expect(called).toBe(true);
        
        client.services.runtime.getNamespaceTree = originalFn;
    });

    test('should route get_neo_config to RuntimeService.getNeoConfig', async () => {
        let called = false;
        const originalFn = client.services.runtime.getNeoConfig;
        
        client.services.runtime.getNeoConfig = (params) => {
            called = true;
            return { config: {} };
        };

        const result = await client.handleRequest('get_neo_config', {});
        expect(called).toBe(true);
        
        client.services.runtime.getNeoConfig = originalFn;
    });
});
