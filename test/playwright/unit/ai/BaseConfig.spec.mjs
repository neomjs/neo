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

    test('set() writes a value through the reactive pipeline', () => {
        const config = Neo.create(BaseConfig, {metaTree: buildTree()});

        config.set('server.timeout', 9999);
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

    test('observeConfig fires on change and stops after cleanup', () => {
        const config = Neo.create(BaseConfig, {metaTree: buildTree()});

        let calls   = 0;
        const cleanup = config.observeConfig('name', () => {calls++});

        config.set('name', 'a');
        const afterFirstChange = calls;
        expect(afterFirstChange).toBeGreaterThan(0);

        cleanup();
        config.set('name', 'b');
        expect(calls).toBe(afterFirstChange);

        config.destroy();
    });

    test('internalSetData warns on a leaf type mismatch but keeps the value', () => {
        const config   = Neo.create(BaseConfig, {metaTree: buildTree()}),
              warnings = [],
              origWarn = console.warn;

        console.warn = msg => warnings.push(String(msg));

        try {
            config.set('port', 'not-a-number');
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
        proxy.set('name', 'viaMethod');
        expect(config.getDataConfig('name').get()).toBe('viaMethod');

        config.destroy();
    });
});
