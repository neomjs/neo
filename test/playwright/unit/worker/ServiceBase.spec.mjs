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
    });

    test('two builds of one version get two cache names, and one build keeps its name', () => {
        const
            create = buildId => Neo.create(ServiceBase, {buildId, version: '13.4.0', workerId: `service-cache-name-${buildId}`}),
            buildA = create('a'),
            buildB = create('b'),
            again  = create('a'),
            dev    = create(null);

        try {
            expect(buildA.cacheName).toBe('neo-runtime-13.4.0-a');
            expect(buildB.cacheName).not.toBe(buildA.cacheName);
            expect(again.cacheName).toBe(buildA.cacheName);
            expect(dev.cacheName, 'development mode builds nothing and keeps the version-only name').toBe('neo-runtime-13.4.0')
        } finally {
            [buildA, buildB, again, dev].forEach(service => service.destroy())
        }
    });

    test('a worker reads its build from the URL it was registered under', () => {
        const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');

        Object.defineProperty(globalThis, 'location', {configurable: true, value: {search: '?buildId=mi2k3x9'}});

        const service = Neo.create(ServiceBase, {version: '13.4.0', workerId: 'service-build-from-url'});

        try {
            expect(service.buildId).toBe('mi2k3x9');
            expect(service.cacheName).toBe('neo-runtime-13.4.0-mi2k3x9')
        } finally {
            originalLocation ? Object.defineProperty(globalThis, 'location', originalLocation) : delete globalThis.location;
            service.destroy()
        }
    });

    test('activation deletes the caches of other builds and versions, and only those', async () => {
        const
            originalCaches = globalThis.caches,
            deleted        = [],
            service        = Neo.create(ServiceBase, {buildId: 'b', version: '13.4.0', workerId: 'service-cleanup-builds'});

        globalThis.caches = {
            async delete(name) {deleted.push(name); return true},
            async keys() {return ['neo-runtime-13.4.0', 'neo-runtime-13.4.0-a', 'neo-runtime-13.4.0-b', 'neo-runtime-13.3.1', 'unrelated']}
        };

        try {
            await service.cleanUpCaches();
            expect(deleted.sort()).toEqual(['neo-runtime-13.3.1', 'neo-runtime-13.4.0', 'neo-runtime-13.4.0-a'])
        } finally {
            globalThis.caches = originalCaches;
            service.destroy()
        }
    })
});
