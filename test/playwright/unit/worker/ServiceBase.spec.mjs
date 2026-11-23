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

    /**
     * @summary Runs `fn` as the worker of a registration at `scope`, the way `ServiceWorkerGlobalScope` exposes it.
     */
    const inScope = async (scope, fn) => {
        globalThis.registration = {scope};

        try {
            return await fn()
        } finally {
            delete globalThis.registration
        }
    };

    test('two builds of one version get two cache names, and one build keeps its name', () => inScope('https://example.test/dist/production/', () => {
        const
            create = buildId => Neo.create(ServiceBase, {buildId, version: '13.4.0', workerId: `service-cache-name-${buildId}`}),
            buildA = create('a'),
            buildB = create('b'),
            again  = create('a'),
            dev    = create(null);

        try {
            expect(buildA.cacheName).toBe('neo-runtime:/dist/production/:13.4.0:a');
            expect(buildB.cacheName).not.toBe(buildA.cacheName);
            expect(again.cacheName).toBe(buildA.cacheName);
            expect(dev.cacheName, 'development mode builds nothing and keeps a version-only name').toBe('neo-runtime:/dist/production/:13.4.0')
        } finally {
            [buildA, buildB, again, dev].forEach(service => service.destroy())
        }
    }));

    test('a worker reads its build from the stamp the build wrote into its script', () => {
        const unstamped = ServiceBase.buildStamp;

        ServiceBase.buildStamp = 'neo-build-id:mi2k3x9';

        const service = Neo.create(ServiceBase, {version: '13.4.0', workerId: 'service-build-from-stamp'});

        try {
            expect(service.buildId).toBe('mi2k3x9')
        } finally {
            ServiceBase.buildStamp = unstamped;
            service.destroy()
        }

        const development = Neo.create(ServiceBase, {version: '13.4.0', workerId: 'service-unstamped'});

        expect(development.buildId, 'an unstamped script has no build').toBe(null);
        development.destroy()
    });

    [
        {scope: '/dist/production/', buildId: 'b', deleted: ['neo-runtime:/dist/production/:13.3.1', 'neo-runtime:/dist/production/:13.4.0:a']},
        {scope: '/dist/esm/',        buildId: 'c', deleted: ['neo-runtime:/dist/esm/:13.4.0:a', 'neo-runtime:/dist/esm/:13.4.0:b']}
    ].forEach(({buildId, deleted: expected, scope}) => {
        test(`activation under ${scope} deletes its own superseded caches, and keeps its sibling's and the version-only ones`, () => inScope(`https://example.test${scope}`, async () => {
            const
                originalCaches = globalThis.caches,
                deleted        = [],
                service        = Neo.create(ServiceBase, {buildId, version: '13.4.0', workerId: `service-cleanup-${buildId}`});

            globalThis.caches = {
                async delete(name) {deleted.push(name); return true},
                async keys() {
                    return [
                        'neo-runtime:/dist/production/:13.4.0:a', 'neo-runtime:/dist/production/:13.4.0:b', 'neo-runtime:/dist/production/:13.3.1',
                        'neo-runtime:/dist/esm/:13.4.0:a', 'neo-runtime:/dist/esm/:13.4.0:b', 'neo-runtime:/dist/esm/:13.4.0:c',
                        'neo-runtime-13.4.0', 'unrelated'
                    ]
                }
            };

            try {
                await service.cleanUpCaches();
                expect(deleted.sort()).toEqual(expected)
            } finally {
                globalThis.caches = originalCaches;
                service.destroy()
            }
        }))
    });

    test('offline, a network-first request answers from its own registration\'s cache only', () => inScope('https://example.test/dist/esm/', async () => {
        const
            originalCaches = globalThis.caches,
            originalFetch  = globalThis.fetch,
            opened         = [],
            service        = Neo.create(ServiceBase, {buildId: 'c', version: '13.4.0', workerId: 'service-offline-own-cache'});

        globalThis.fetch  = async () => {throw new TypeError('offline')};
        globalThis.caches = {
            async match() {return 'a sibling registration\'s copy'},
            async open(name) {opened.push(name); return {async match() {return 'own copy'}}}
        };

        try {
            const response = await new Promise(resolve => service.onFetch({
                request    : {method: 'GET', url: 'https://example.test/apps/portal/resources/data/blog.json'},
                respondWith: resolve
            }));

            expect(await response).toBe('own copy');
            expect(opened).toEqual(['neo-runtime:/dist/esm/:13.4.0:c'])
        } finally {
            globalThis.caches = originalCaches;
            globalThis.fetch  = originalFetch;
            service.destroy()
        }
    }))
});
