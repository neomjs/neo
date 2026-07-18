import {expect, test}                                      from '@playwright/test';
import {OPENCODE_SEAT_SERVERS, generateOpenCodeSeatConfig} from '../../../../../../ai/services/fleet/generateOpenCodeSeatConfig.mjs';

// Pure function — imported directly (no fs / spawn / env / Neo runtime), so the suite has no
// host-runtime side effects and each case is fully isolated. Mirrors deriveHarnessLaunchSpec.spec.

const PARAMS = {
    canonicalRoot    : '/canonical',
    seatEnvFile      : '/seat/checkout/.env',
    workspaceRoot    : '/seat/checkout',
    memoryDir        : '/seat/memory',
    nodeBinary       : '/usr/local/bin/node',
    environment      : {NEO_OPENAI_COMPATIBLE_HOST: 'http://127.0.0.1:1234', PATH: '/usr/bin:/bin'},
    extraAllowedPaths: ['/opt/fleet/**'],
    wakeHookPath     : '/seat/write-wake-envelope.mjs'
};

const parseJsonc = content => JSON.parse(content.split('\n').filter(line => !line.trimStart().startsWith('//')).join('\n'));

test.describe('generateOpenCodeSeatConfig (OpenCode seat scaffold emission)', () => {
    test('golden shape: opencode.jsonc parses as comment-stripped JSON and wires the canonical four servers', () => {
        const
            {files}  = generateOpenCodeSeatConfig(PARAMS),
            config   = parseJsonc(files.find(file => file.path === '/seat/checkout/opencode.jsonc').content),
            expected = name => ['/usr/local/bin/node', '--env-file=/seat/checkout/.env', `/canonical/ai/mcp/server/${name}/mcp-server.mjs`];

        expect(config.$schema).toBe('https://opencode.ai/config.json');
        expect(config.instructions).toEqual(['/seat/memory/MEMORY.md', '/seat/memory/seat-pointers.md', '/seat/memory/identity.md']);

        // The four canonical servers, organs-rooted; the Neural Link additionally binds --cwd.
        expect(config.mcp['neo-mjs-memory-core']).toEqual({type: 'local', command: expected('memory-core'), enabled: true, environment: PARAMS.environment});
        expect(config.mcp['neo-mjs-github-workflow'].command).toEqual(expected('github-workflow'));
        expect(config.mcp['neo-mjs-knowledge-base'].command).toEqual(expected('knowledge-base'));
        expect(config.mcp['neo-mjs-neural-link'].command).toEqual([...expected('neural-link'), '--cwd', '/seat/checkout']);

        // Permission block: catch-all stays "ask" FIRST (last matching rule wins), seat paths allowed.
        const externalDirectory = config.permission.external_directory;

        expect(Object.keys(externalDirectory)[0]).toBe('*');
        expect(externalDirectory).toMatchObject({'*': 'ask', '/seat/**': 'allow', '/seat/checkout/**': 'allow', '/canonical/**': 'allow', '/opt/fleet/**': 'allow'});
    });

    test('emission list: four scaffold files by default, the wake hook only when wakeHookPath is given', () => {
        const
            withHook = generateOpenCodeSeatConfig(PARAMS).files.map(file => file.path),
            noHook   = generateOpenCodeSeatConfig({...PARAMS, wakeHookPath: undefined}).files.map(file => file.path);

        expect(withHook).toEqual([
            '/seat/checkout/opencode.jsonc',
            '/seat/memory/MEMORY.md',
            '/seat/memory/seat-pointers.md',
            '/seat/memory/identity.md',
            '/seat/write-wake-envelope.mjs'
        ]);
        expect(noHook).toEqual(withHook.slice(0, 4));
    });

    test('purity: identical params emit byte-identical files (deterministic, no hidden inputs)', () => {
        expect(generateOpenCodeSeatConfig(PARAMS)).toEqual(generateOpenCodeSeatConfig(PARAMS));
    });

    test('island guard: a server script escaping canonicalRoot throws; a malformed entry throws', () => {
        const evil = [{name: 'evil', script: '../evil/mcp-server.mjs', needsCwd: false}];

        expect(() => generateOpenCodeSeatConfig({...PARAMS, servers: evil})).toThrow(/island guard/);
        expect(() => generateOpenCodeSeatConfig({...PARAMS, servers: [{script: 'ai/x.mjs', needsCwd: false}]})).toThrow(/island guard/);
        expect(() => generateOpenCodeSeatConfig({...PARAMS, servers: []})).toThrow(/'servers' must be a non-empty array/);
    });

    test('island guard: a trailing-slash canonicalRoot is accepted (valid input must not mis-reject)', () => {
        const
            {files} = generateOpenCodeSeatConfig({...PARAMS, canonicalRoot: '/canonical/'}),
            config  = parseJsonc(files[0].content);

        expect(config.mcp['neo-mjs-memory-core'].command[2]).toBe('/canonical/ai/mcp/server/memory-core/mcp-server.mjs');
    });

    test('seatHome: explicit param wins; default derives from memoryDir parent', () => {
        const
            explicit = parseJsonc(generateOpenCodeSeatConfig({...PARAMS, seatHome: '/fleet/seat-alpha'}).files[0].content),
            derived  = parseJsonc(generateOpenCodeSeatConfig(PARAMS).files[0].content);

        expect(explicit.permission.external_directory).toHaveProperty('/fleet/seat-alpha/**', 'allow');
        expect(explicit.permission.external_directory).not.toHaveProperty('/seat/**');
        expect(derived.permission.external_directory).toHaveProperty('/seat/**', 'allow');
    });

    test('named throws: every required param is validated by name', () => {
        for (const key of ['canonicalRoot', 'seatEnvFile', 'workspaceRoot', 'memoryDir', 'nodeBinary']) {
            const params = {...PARAMS};

            delete params[key];
            expect(() => generateOpenCodeSeatConfig(params)).toThrow(new RegExp(`'${key}' must be a non-empty string`));
        }
    });

    test('sovereignty guard: the emitted identity.md is a template — sovereignty header, zero story content', () => {
        const identity = generateOpenCodeSeatConfig(PARAMS).files.find(file => file.path.endsWith('identity.md')).content;

        expect(identity).toContain('unwritten');
        expect(identity).toContain('nobody');
        expect(identity).not.toContain('@neo-');
        expect(identity).not.toContain('Phoebe');
    });

    test('servers override: a custom server set replaces the canonical four', () => {
        const
            custom = [{name: 'neo-mjs-memory-core', script: 'ai/mcp/server/memory-core/mcp-server.mjs', needsCwd: false}],
            config = parseJsonc(generateOpenCodeSeatConfig({...PARAMS, servers: custom}).files[0].content);

        expect(Object.keys(config.mcp)).toEqual(['neo-mjs-memory-core']);
    });

    test('wake hook: standalone (no Neo imports), env-only credentials, atomic 0600 write contract', () => {
        const hook = generateOpenCodeSeatConfig(PARAMS).files.find(file => file.path === '/seat/write-wake-envelope.mjs').content;

        expect(hook).toContain('OPENCODE_SERVER_PASSWORD');
        expect(hook).toContain('0o600');
        expect(hook).toContain('--data-home');
        expect(hook).not.toContain('secret flags');
        expect(hook).not.toMatch(/import .* from '(?!node:)/); // no non-node imports (C1-clean)
    });

    test('OPENCODE_SEAT_SERVERS: the canonical four are organs-relative scripts', () => {
        expect(OPENCODE_SEAT_SERVERS.map(server => server.name)).toEqual([
            'neo-mjs-memory-core', 'neo-mjs-github-workflow', 'neo-mjs-knowledge-base', 'neo-mjs-neural-link'
        ]);
        OPENCODE_SEAT_SERVERS.forEach(server => expect(server.script.startsWith('ai/mcp/server/')).toBe(true));
    });
});
