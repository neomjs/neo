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

let BaseConfig, createConfigProxy, Env, originalEnv;

/**
 * Fresh prototype meta-leaf tree per test (must run after Env is imported in beforeAll).
 * Mixes env-bound + env-free leaves, multiple parser types, and a nested namespace.
 */
function buildTree() {
    return {
        debug: {env: 'NEO_TEST_DEBUG', default: false, parse: Env.parseBool},
        port : {env: 'NEO_TEST_PORT',  default: 3000,  parse: Env.parsePort},
        name : {default: 'neo'},
        server: {
            host   : {default: 'localhost'},
            timeout: {env: 'NEO_TEST_TIMEOUT', default: 5000, parse: Env.parseNumber}
        }
    };
}

test.describe('Neo.ai.BaseConfig (meta-leaf tree + Provider extension)', () => {
    test.beforeAll(async () => {
        ({default: BaseConfig, createConfigProxy} = await import('../../../../ai/BaseConfig.mjs'));
        Env         = (await import('../../../../src/util/Env.mjs')).default;
        originalEnv = {...process.env};
    });

    test.afterEach(() => {
        Object.keys(process.env).forEach(key => {
            if (!(key in originalEnv)) {
                delete process.env[key];
            } else {
                process.env[key] = originalEnv[key];
            }
        });
    });

    test('compileMetaLeaves seeds reactive data from leaf defaults', () => {
        const config = Neo.create(BaseConfig, {metaTree: buildTree()});

        expect(config.getDataConfig('debug').get()).toBe(false);
        expect(config.getDataConfig('port').get()).toBe(3000);
        expect(config.getDataConfig('name').get()).toBe('neo');
        expect(config.getDataConfig('server.host').get()).toBe('localhost');
        expect(config.getDataConfig('server.timeout').get()).toBe(5000);

        config.destroy();
    });

    test('env vars override leaf defaults (parsed to typed values)', () => {
        process.env.NEO_TEST_PORT  = '8080';
        process.env.NEO_TEST_DEBUG = 'true';

        const config = Neo.create(BaseConfig, {metaTree: buildTree()});

        expect(config.getDataConfig('port').get()).toBe(8080);
        expect(config.getDataConfig('debug').get()).toBe(true);
        // env-free leaf keeps its default
        expect(config.getDataConfig('name').get()).toBe('neo');

        config.destroy();
    });

    test('setData() writes a value through the reactive pipeline', () => {
        const config = Neo.create(BaseConfig, {metaTree: buildTree()});

        config.setData('server.timeout', 9999);
        expect(config.getDataConfig('server.timeout').get()).toBe(9999);

        config.destroy();
    });

    test('setEnvOverride() applies and wins over the default', () => {
        const config = Neo.create(BaseConfig, {metaTree: buildTree()});

        config.setEnvOverride('debug', true);
        expect(config.getDataConfig('debug').get()).toBe(true);

        config.destroy();
    });

    test('direct assignment via createConfigProxy routes through setData', () => {
        const config = Neo.create(BaseConfig, {metaTree: buildTree()}),
              proxy  = createConfigProxy(config);

        // read-through
        expect(proxy.name).toBe('neo');
        expect(proxy.server.host).toBe('localhost');

        // top-level assignment (proxy set trap)
        proxy.name = 'changed';
        expect(config.getDataConfig('name').get()).toBe('changed');

        // nested assignment (Provider hierarchical proxy set trap)
        proxy.server.host = 'remote';
        expect(config.getDataConfig('server.host').get()).toBe('remote');

        config.destroy();
    });

    test('observeData fires on change and stops after cleanup', () => {
        const config = Neo.create(BaseConfig, {metaTree: buildTree()});

        let calls   = 0;
        const cleanup = config.observeData('name', () => {calls++});

        config.setData('name', 'a');
        const afterFirstChange = calls;
        expect(afterFirstChange).toBeGreaterThan(0);

        cleanup();
        config.setData('name', 'b');
        expect(calls).toBe(afterFirstChange);

        config.destroy();
    });

    test('internalSetData warns on a leaf type mismatch but keeps the value', () => {
        const config   = Neo.create(BaseConfig, {metaTree: buildTree()}),
              warnings = [],
              origWarn = console.warn;

        console.warn = msg => warnings.push(String(msg));

        try {
            config.setData('port', 'not-a-number');
            expect(config.getDataConfig('port').get()).toBe('not-a-number');
            expect(warnings.some(w => w.includes('port'))).toBe(true);
        } finally {
            console.warn = origWarn;
        }

        config.destroy();
    });

    test('nested namespaces are preserved as a deep structure', () => {
        const config = Neo.create(BaseConfig, {metaTree: buildTree()});

        expect(config.data.server.host).toBe('localhost');
        expect(config.data.server.timeout).toBe(5000);
        expect(config.data.name).toBe('neo');

        config.destroy();
    });

    test('createConfigProxy: .data getter + method calls bind to the real instance', () => {
        const config = Neo.create(BaseConfig, {metaTree: buildTree()}),
              proxy  = createConfigProxy(config);

        // `.data` access must NOT run the reactive getter with `this` = outer proxy
        expect(proxy.data.server.host).toBe('localhost');
        expect(proxy.data.name).toBe('neo');

        // a method invoked through the proxy must run with `this` = the real instance
        proxy.setData('name', 'viaMethod');
        expect(config.getDataConfig('name').get()).toBe('viaMethod');

        config.destroy();
    });

    test('destroy() releases observeData subscriptions (no manual cleanup needed)', () => {
        const config = Neo.create(BaseConfig, {metaTree: buildTree()});

        let calls = 0;
        config.observeData('name', () => {calls++}); // intentionally not cleaned up manually

        config.setData('name', 'x');
        expect(calls).toBeGreaterThan(0);

        // destroy must tear down the tracked subscription without throwing
        expect(() => config.destroy()).not.toThrow();
    });

    test('observeData resolves leaves via getOwnerOfDataProperty (hierarchy-aware)', () => {
        const config = Neo.create(BaseConfig, {metaTree: buildTree()});

        // The resolved Config must be the exact instance getOwnerOfDataProperty points at —
        // i.e. resolution goes through the owner, not a direct this.#dataConfigs reach-in.
        const {owner, propertyName} = config.getOwnerOfDataProperty('server.host');
        expect(owner).toBe(config);
        expect(owner.getDataConfig(propertyName)).toBe(config.getDataConfig('server.host'));

        let observed;
        const cleanup = config.observeData('server.host', value => {observed = value});
        config.setData('server.host', 'remote-host');
        expect(observed).toBe('remote-host');

        cleanup();
        config.destroy();
    });

    test('does not shadow core.Base set() / observeConfig()', () => {
        const config = Neo.create(BaseConfig, {metaTree: buildTree()});

        // core.Base#observeConfig(publisher, configName, fn) is a cross-instance subscription
        // returning a cleanup fn — and Provider#createBinding depends on it. BaseConfig must
        // NOT shadow it with a path-scoped override (that surface is `observeData`).
        let calls     = 0;
        const cleanup = config.observeConfig(config, 'data', () => {calls++});
        expect(typeof cleanup).toBe('function');
        cleanup();

        // core.Base#set(values) is the batch config setter — must accept an object, not a path.
        expect(() => config.set({})).not.toThrow();

        config.destroy();
    });
});
