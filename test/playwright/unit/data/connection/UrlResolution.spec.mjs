import {setup} from '../../../setup.mjs';

setup({appConfig: {name: 'ConnectionUrlResolutionTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Fetch          from '../../../../../src/data/connection/Fetch.mjs';
import Stream         from '../../../../../src/data/connection/Stream.mjs';
import Xhr            from '../../../../../src/data/connection/Xhr.mjs';

const ORIGIN = 'https://workspace.example.test';

/**
 * @summary Exercises the registered document base through the real connection dispatch paths.
 * Only the native network boundary is stubbed; the captured URLs distinguish page resolution from
 * the package worker's base and keep the existing Engine, dist and framework-scoped paths unchanged.
 */
test.describe('connection URLs use the registering document base only in workspace dev mode', () => {
    let calls, connections, descriptors, priorUrl, hadUrl;

    test.beforeEach(() => {
        calls       = [];
        descriptors = Object.fromEntries(['fetch', 'location', 'XMLHttpRequest']
            .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
        hadUrl      = Object.hasOwn(Neo.config, 'url');
        priorUrl    = Neo.config.url;

        globalThis.fetch = async url => {
            calls.push(url);

            return {
                body      : new ReadableStream({start: controller => controller.close()}),
                headers   : {get: () => null},
                json      : async () => ({}),
                ok        : true,
                redirected: false,
                status    : 200,
                statusText: 'OK',
                type      : 'basic',
                url
            }
        };

        /** @summary Records the native Xhr dispatch without opening a connection or scheduling events. */
        globalThis.XMLHttpRequest = class RecordingXhr {
            /** @summary Captures the URL the real connection passes to the browser. */
            open(method, url) {
                calls.push(url)
            }

            /** @summary The stub produces no native events. */
            addEventListener() {}

            /** @summary Header setup has no network effect in this fixture. */
            setRequestHeader() {}

            /** @summary Sending does not start a request in this fixture. */
            send() {}
        };

        connections = {
            fetch : Neo.create(Fetch),
            stream: Neo.create(Stream),
            xhr   : Neo.create(Xhr, {requests: {}})
        };
    });

    test.afterEach(() => {
        connections.stream.abort();
        Object.values(connections).forEach(connection => connection.destroy());

        for (const [key, descriptor] of Object.entries(descriptors)) {
            if (descriptor) {
                Object.defineProperty(globalThis, key, descriptor)
            } else {
                delete globalThis[key]
            }
        }

        if (hadUrl) {
            Neo.config.url = priorUrl
        } else {
            delete Neo.config.url
        }
    });

    /**
     * @summary Supplies the worker location and the document metadata delivered by registration.
     * @param {String} worker
     * @param {String|undefined} base
     * @param {String} [href=base]
     */
    function realm(worker, base, href = base) {
        globalThis.location = new URL(worker);
        Neo.config.url = {href, search: '', ...(base !== undefined && {base})}
    }

    /**
     * @summary Runs all three real transports and asserts the URL each gives its native boundary.
     * @param {String} url
     * @param {String} expected
     * @param {Object} [options]
     * @param {Boolean} [options.objectFetch=false]
     * @param {Boolean} [options.streamParams=false]
     */
    async function dispatch(url, expected, {objectFetch = false, streamParams = false} = {}) {
        calls.length = 0;

        if (objectFetch) {
            await connections.fetch.get({url, responseType: 'json'})
        } else {
            connections.fetch.url = url;
            await connections.fetch.read()
        }

        connections.stream.url = streamParams ? null : url;
        await connections.stream.read(streamParams ? {url} : undefined);
        connections.xhr.request({url});

        expect(calls, 'Fetch, Stream and Xhr must dispatch the same scoped URL').toEqual([expected, expected, expected]);
    }

    for (const [mountName, mount] of [['at the origin root', ''], ['under a mount', '/devindex']]) {
        for (const [depth, page, relative] of [
            [2, 'apps/demo/index.html', '../../apps/demo/resources/data/users.jsonl'],
            [4, 'apps/demo/childapps/nested/index.html', '../../../../apps/demo/resources/data/users.jsonl']
        ]) {
            test(`a page ${depth} levels deep ${mountName} reaches its workspace index`, async () => {
                realm(`${ORIGIN}${mount}/node_modules/neo.mjs/src/worker/App.mjs`, `${ORIGIN}${mount}/${page}`);

                await dispatch(relative, `${ORIGIN}${mount}/apps/demo/resources/data/users.jsonl`);
            });
        }
    }

    test('the effective document base wins over href, including Fetch object and Stream parameter forms', async () => {
        realm(
            `${ORIGIN}/devindex/node_modules/neo.mjs/src/worker/App.mjs`,
            `${ORIGIN}/devindex/`,
            `${ORIGIN}/devindex/apps/demo/childapps/nested/index.html`
        );

        await dispatch('./apps/demo/resources/data/users.jsonl', `${ORIGIN}/devindex/apps/demo/resources/data/users.jsonl`,
            {objectFetch: true, streamParams: true});
    });

    for (const [name, worker, base, href = base] of [
        ['Engine checkout', '/src/worker/App.mjs', '/apps/demo/index.html'],
        ['dist/development', '/devindex/dist/development/appworker.js', '/devindex/dist/development/apps/demo/index.html'],
        ['dist/production', '/devindex/dist/production/appworker.js', '/devindex/dist/production/apps/demo/index.html'],
        ['dist/esm', '/devindex/dist/esm/src/worker/App.mjs', '/devindex/dist/esm/apps/demo/index.html'],
        ['built entry with a base element', '/devindex/dist/development/appworker.js', '/devindex/dist/development/',
            '/devindex/dist/development/apps/demo/index.html'],
        ['package-hosted page', '/node_modules/neo.mjs/src/worker/App.mjs', '/node_modules/neo.mjs/examples/demo/index.html']
    ]) {
        test(`${name} keeps its existing worker-relative request`, async () => {
            realm(ORIGIN + worker, ORIGIN + base, ORIGIN + href);

            await dispatch('../../apps/demo/resources/data/users.jsonl', '../../apps/demo/resources/data/users.jsonl');
        });
    }

    for (const name of ['a registration without base', 'no registration metadata']) {
        test(`${name} falls back to the original worker-relative URL`, async () => {
            realm(`${ORIGIN}/node_modules/neo.mjs/src/worker/App.mjs`, undefined, `${ORIGIN}/apps/demo/index.html`);

            if (name === 'no registration metadata') delete Neo.config.url;

            await dispatch('../../apps/demo/resources/data/users.jsonl', '../../apps/demo/resources/data/users.jsonl');
        });
    }

    for (const url of [
        'https://other.example.test/data.json?source=other-window',
        '//other.example.test/data.json',
        '/apps/demo/resources/data/users.jsonl',
        'apps/demo/resources/data/users.jsonl'
    ]) {
        test(`${url} passes through unchanged`, async () => {
            realm(`${ORIGIN}/node_modules/neo.mjs/src/worker/App.mjs`, `${ORIGIN}/apps/demo/index.html`);

            await dispatch(url, url);
        });
    }

    test('Xhr insideNeo bypasses document resolution for a framework-scoped request', () => {
        realm(`${ORIGIN}/node_modules/neo.mjs/src/worker/App.mjs`, `${ORIGIN}/apps/demo/index.html`);

        connections.xhr.request({insideNeo: true, url: '../../resources/data/framework.json'});

        expect(calls).toEqual(['../../resources/data/framework.json']);
    });

    test('a package-looking worker query does not make an Engine worker a package worker', async () => {
        realm(`${ORIGIN}/src/worker/App.mjs?mirror=/node_modules/neo.mjs/`, `${ORIGIN}/apps/demo/index.html`);

        await dispatch('../../apps/demo/resources/data/users.jsonl', '../../apps/demo/resources/data/users.jsonl');
    });

    test('a package-looking document query does not make its page package-hosted', async () => {
        realm(`${ORIGIN}/node_modules/neo.mjs/src/worker/App.mjs`,
            `${ORIGIN}/apps/demo/index.html?engine=/node_modules/neo.mjs/`);

        await dispatch('../../apps/demo/resources/data/users.jsonl', `${ORIGIN}/apps/demo/resources/data/users.jsonl`);
    });
});
