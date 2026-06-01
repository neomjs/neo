import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'ServiceBaseTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import ServiceBase    from '../../../../src/worker/ServiceBase.mjs';

/**
 * @summary Pins the Service Worker cache policy for generated app data JSON.
 */
test.describe('Neo.worker.ServiceBase', () => {
    test('loads generated resources/data JSON network-first before the generic resources cache', async () => {
        const
            originalCaches = globalThis.caches,
            originalFetch  = globalThis.fetch,
            request        = {
                method: 'GET',
                url   : 'https://example.test/apps/portal/resources/data/pulls/index.json'
            },
            service = Neo.create(ServiceBase, {
                workerId: 'service-base-data-cache-policy-test'
            });

        let fetchConfig;

        globalThis.fetch = async (receivedRequest, config) => {
            fetchConfig = config;

            return {
                ok: true,
                clone() {
                    return this
                }
            }
        };

        globalThis.caches = {
            async open() {
                return {
                    async put() {}
                }
            },
            async match() {
                return null
            }
        };

        try {
            const response = new Promise(resolve => {
                service.onFetch({
                    request,
                    respondWith: resolve
                })
            });

            await response;

            expect(service.cachePaths).toContain('/resources/');
            expect(service.networkFirstPaths).toContain('/resources/data/');
            expect(fetchConfig).toEqual({cache: 'reload'})
        } finally {
            globalThis.caches = originalCaches;
            globalThis.fetch  = originalFetch;

            service.destroy()
        }
    })
});
