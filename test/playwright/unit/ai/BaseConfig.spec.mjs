import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'AiBaseConfigTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';

let BaseConfig, createConfigProxy, leaf, Env, originalEnv;

/**
 * Fresh meta-leaf tree per test, assigned to the `data` config (the new #12168 shape).
 * Mixes env-bound + env-free leaves, multiple `leaf()` types, a null-default-with-type leaf,
 * a nested namespace, and an object leaf whose value carries an own `constructor` key
 * (the dummy-EF duck-type that breaks `Neo.typeOf` inference — guarded by `leaf()`).
 */
function buildTree() {
    return {
        debug    : leaf(false, 'NEO_TEST_DEBUG'),
        port     : leaf(3000, 'NEO_TEST_PORT', 'port'),
        name     : leaf('neo'),
        publicUrl: leaf(null, 'NEO_TEST_URL', 'url'),
        server   : {
            host   : leaf('localhost'),
            timeout: leaf(5000, 'NEO_TEST_TIMEOUT', 'number')
        },
        ef: leaf({
            name       : 'dummy_embedding_function',
            generate   : () => null,
            getConfig  : () => ({}),
            constructor: {buildFromConfig: () => ({generate: () => null})}
        }, null, 'object')
    }
}

test.describe('Neo.ai.BaseConfig (data + afterSetData seam + leaf() factory)', () => {
    test.beforeAll(async () => {
        ({default: BaseConfig, createConfigProxy, leaf} = await import('../../../../ai/BaseConfig.mjs'));
        Env         = (await import('../../../../src/util/Env.mjs')).default;
        originalEnv = {...process.env}
    });

    test.afterEach(() => {
        Object.keys(process.env).forEach(key => {
            if (!(key in originalEnv)) {
                delete process.env[key]
            } else {
                process.env[key] = originalEnv[key]
            }
        })
    });

    test('leaf() factory: parser by type, inference, null-default type, object-no-env', () => {
        const portLeaf = leaf(3000, 'NEO_X', 'port');
        expect(portLeaf.type).toBe('port');
        expect(portLeaf.parse).toBe(Env.parsePort);
        expect(portLeaf.default).toBe(3000);

        // type inferred from a non-null default
        expect(leaf(false, 'NEO_X').type).toBe('boolean');
        expect(leaf(false, 'NEO_X').parse).toBe(Env.parseBool);

        // explicit type survives a null default (stays validatable)
        const urlLeaf = leaf(null, 'NEO_X', 'url');
        expect(urlLeaf.type).toBe('url');
        expect(urlLeaf.parse).toBe(Env.parseUrl);

        // env-free leaf carries no parser
        expect(leaf('x').parse).toBe(null);
        // object value with an own `constructor` key must not throw during inference
        const efLeaf = leaf({constructor: {buildFromConfig: () => ({})}}, null, 'object');
        expect(efLeaf.type).toBe('object');
        expect(efLeaf.parse).toBe(null)
    });

    test('afterSetData compiles reactive data from leaf defaults', () => {
        const config = Neo.create(BaseConfig, {data: buildTree()});

        expect(config.getDataConfig('debug').get()).toBe(false);
        expect(config.getDataConfig('port').get()).toBe(3000);
        expect(config.getDataConfig('name').get()).toBe('neo');
        expect(config.getDataConfig('publicUrl').get()).toBe(null);
        expect(config.getDataConfig('server.host').get()).toBe('localhost');
        expect(config.getDataConfig('server.timeout').get()).toBe(5000);

        config.destroy()
    });

    test('object leaf with an own constructor key survives compile (typeOf guard)', () => {
        const config = Neo.create(BaseConfig, {data: buildTree()}),
              ef     = config.getDataConfig('ef').get();

        expect(ef.name).toBe('dummy_embedding_function');
        expect(typeof ef.generate).toBe('function');
        expect(typeof ef.constructor.buildFromConfig).toBe('function');

        config.destroy()
    });

    test('env vars override leaf defaults (bounded, parsed to typed values)', () => {
        process.env.NEO_TEST_PORT  = '8080';
        process.env.NEO_TEST_DEBUG = 'true';

        const config = Neo.create(BaseConfig, {data: buildTree()});

        expect(config.getDataConfig('port').get()).toBe(8080);
        expect(config.getDataConfig('debug').get()).toBe(true);
        expect(config.getDataConfig('name').get()).toBe('neo'); // env-free keeps default

        config.destroy()
    });

    test('setData() writes a value through the reactive pipeline', () => {
        const config = Neo.create(BaseConfig, {data: buildTree()});

        config.setData('server.timeout', 9999);
        expect(config.getDataConfig('server.timeout').get()).toBe(9999);

        config.destroy()
    });

    test('setEnvOverride() is keyed by env var name and wins over the default', () => {
        const config = Neo.create(BaseConfig, {data: buildTree()});

        config.setEnvOverride('NEO_TEST_DEBUG', true);
        expect(config.getDataConfig('debug').get()).toBe(true);

        config.destroy()
    });

    test('refreshEnv() re-resolves env; runtime override persists', () => {
        const config = Neo.create(BaseConfig, {data: buildTree()});

        config.setEnvOverride('NEO_TEST_DEBUG', true);
        process.env.NEO_TEST_PORT = '9090';
        config.refreshEnv();

        expect(config.getDataConfig('port').get()).toBe(9090);  // re-read from env
        expect(config.getDataConfig('debug').get()).toBe(true); // override survives

        config.destroy()
    });

    test('direct assignment via createConfigProxy routes through setData', () => {
        const config = Neo.create(BaseConfig, {data: buildTree()}),
              proxy  = createConfigProxy(config);

        expect(proxy.name).toBe('neo');
        expect(proxy.server.host).toBe('localhost');

        proxy.name = 'changed';
        expect(config.getDataConfig('name').get()).toBe('changed');

        proxy.server.host = 'remote';
        expect(config.getDataConfig('server.host').get()).toBe('remote');

        config.destroy()
    });

    test('observeData fires on change and stops after cleanup', () => {
        const config = Neo.create(BaseConfig, {data: buildTree()});

        let calls     = 0;
        const cleanup = config.observeData('name', () => {calls++});

        config.setData('name', 'a');
        const afterFirstChange = calls;
        expect(afterFirstChange).toBeGreaterThan(0);

        cleanup();
        config.setData('name', 'b');
        expect(calls).toBe(afterFirstChange);

        config.destroy()
    });

    test('internalSetData validates ANY value at a known leaf path (object leaves included)', () => {
        const config   = Neo.create(BaseConfig, {data: buildTree()}),
              warnings = [],
              origWarn = console.warn;

        console.warn = msg => warnings.push(String(msg));

        try {
            // object leaf is validated (no `!== 'Object'` bypass) and kept without warning
            config.setData('ef', {name: 'x', generate: () => null});
            expect(config.getDataConfig('ef').get().name).toBe('x');

            // scalar type mismatch warns but keeps the value
            config.setData('port', 'not-a-number');
            expect(config.getDataConfig('port').get()).toBe('not-a-number');
            expect(warnings.some(w => w.includes('port'))).toBe(true)
        } finally {
            console.warn = origWarn
        }

        config.destroy()
    });

    test('nested namespaces are preserved as a deep structure', () => {
        const config = Neo.create(BaseConfig, {data: buildTree()});

        expect(config.data.server.host).toBe('localhost');
        expect(config.data.server.timeout).toBe(5000);
        expect(config.data.name).toBe('neo');

        config.destroy()
    });

    test('createConfigProxy: .data getter + method calls bind to the real instance', () => {
        const config = Neo.create(BaseConfig, {data: buildTree()}),
              proxy  = createConfigProxy(config);

        expect(proxy.data.server.host).toBe('localhost');
        expect(proxy.data.name).toBe('neo');

        proxy.setData('name', 'viaMethod');
        expect(config.getDataConfig('name').get()).toBe('viaMethod');

        config.destroy()
    });

    test('destroy() releases observeData subscriptions (no manual cleanup needed)', () => {
        const config = Neo.create(BaseConfig, {data: buildTree()});

        let calls = 0;
        config.observeData('name', () => {calls++}); // intentionally not cleaned up manually

        config.setData('name', 'x');
        expect(calls).toBeGreaterThan(0);

        expect(() => config.destroy()).not.toThrow()
    });

    test('observeData resolves leaves via getOwnerOfDataProperty (hierarchy-aware)', () => {
        const config = Neo.create(BaseConfig, {data: buildTree()});

        const {owner, propertyName} = config.getOwnerOfDataProperty('server.host');
        expect(owner).toBe(config);
        expect(owner.getDataConfig(propertyName)).toBe(config.getDataConfig('server.host'));

        let observed;
        const cleanup = config.observeData('server.host', value => {observed = value});
        config.setData('server.host', 'remote-host');
        expect(observed).toBe('remote-host');

        cleanup();
        config.destroy()
    });

    test('does not shadow core.Base set() / observeConfig()', () => {
        const config = Neo.create(BaseConfig, {data: buildTree()});

        // core.Base#observeConfig(publisher, configName, fn) — Provider#createBinding depends on it.
        let calls     = 0;
        const cleanup = config.observeConfig(config, 'data', () => {calls++});
        expect(typeof cleanup).toBe('function');
        cleanup();

        // core.Base#set(values) — batch config setter, must accept an object.
        expect(() => config.set({})).not.toThrow();

        config.destroy()
    });
});
