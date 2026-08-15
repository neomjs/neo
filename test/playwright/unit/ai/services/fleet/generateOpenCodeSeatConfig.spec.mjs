import {expect, test}                                      from '@playwright/test';
import {createHash}                                        from 'node:crypto';
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
        // The always-loaded slot carries the seat boot files + the canonical (fleet-shared) boot
        // references — detail files (seat-pointers, about-this-layer) load on demand by path;
        // every instructions entry costs context every turn (the 27.2KB → ~10KB hot-index
        // reshape). Canonical entries resolve against the canonical checkout, after the seat
        // files — self first, then now.
        expect(config.instructions).toEqual(['/seat/memory/MEMORY.md', '/seat/memory/identity.md', '/canonical/NOW.md']);

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

    test('emission list: five scaffold files by default, the wake hook only when wakeHookPath is given', () => {
        const
            withHook = generateOpenCodeSeatConfig(PARAMS).files.map(file => file.path),
            noHook   = generateOpenCodeSeatConfig({...PARAMS, wakeHookPath: undefined}).files.map(file => file.path);

        expect(withHook).toEqual([
            '/seat/checkout/opencode.jsonc',
            '/seat/memory/MEMORY.md',
            '/seat/memory/seat-pointers.md',
            '/seat/memory/identity.md',
            '/seat/memory/about-this-layer.md',
            '/seat/write-wake-envelope.mjs'
        ]);
        expect(noHook).toEqual(withHook.slice(0, 5));
    });

    test('memory scaffold: MEMORY.md is the capped hot index (Grace-pattern), weak-spots empty at birth (#15697)', () => {
        const files  = generateOpenCodeSeatConfig(PARAMS).files,
              memory = files.find(file => file.path.endsWith('MEMORY.md')).content;

        // The cap discipline travels with the file it governs: thresholds, measurement, levers.
        expect(memory).toContain('<17KB');
        expect(memory).toContain('24.6KB');
        expect(memory).toContain('wc -c');
        expect(memory).toContain('move-to-ARCHIVE');
        // The weak-spots section exists but starts EMPTY — the index accretes from the seat's
        // own public record, never from another seat's mistakes.
        expect(memory).toContain('Weak-spots');
        expect(memory).toContain('Empty at birth');
        // The opencode load-mechanism line names the instructions slot.
        expect(memory).toContain('instructions');

        const about = files.find(file => file.path.endsWith('about-this-layer.md')).content;
        expect(about).toContain('Grace-pattern');
        expect(about).toContain('opencode.jsonc');
        expect(about).toContain('story-sovereignty');
    });

    test('purity: identical params emit byte-identical files (deterministic, no hidden inputs)', () => {
        expect(generateOpenCodeSeatConfig(PARAMS)).toEqual(generateOpenCodeSeatConfig(PARAMS));
        expect(generateOpenCodeSeatConfig(PARAMS))
            .toEqual(generateOpenCodeSeatConfig({...PARAMS, remoteServers: {}}))
    });

    test('no remote intent stays byte-identical to the origin/dev stdio artifact set', () => {
        const digest = createHash('sha256')
            .update(JSON.stringify(generateOpenCodeSeatConfig(PARAMS).files))
            .digest('hex');

        // Live-frozen from the pre-change origin/dev artifact. This catches remote-only prose or grammar
        // leaking into the default artifact set even when current-vs-current purity stays green.
        // Bumped 2026-08-15: the canonical NOW.md reference joined `instructions`.
        expect(digest).toBe('39b8e31868b18d3eb9843552042b916b318e390ec1c8efe7e484ec78a8450fe3')
    });

    test('remote map replaces only selected servers with the exact OpenCode HTTP adapter grammar', () => {
        const
            remoteServers = {
                'neo-mjs-memory-core': {
                    url: 'https://tenant.example.com/mc/mcp', credentialEnvVar: 'NEO_MCP_REMOTE_TOKEN'
                },
                'neo-mjs-knowledge-base': {
                    url: 'https://tenant.example.com/kb/mcp', credentialEnvVar: 'NEO_MCP_REMOTE_TOKEN'
                }
            },
            config = parseJsonc(generateOpenCodeSeatConfig({...PARAMS, remoteServers}).files[0].content);

        expect(config.mcp['neo-mjs-memory-core']).toEqual({
            type   : 'remote',
            url    : 'https://tenant.example.com/mc/mcp',
            enabled: true,
            headers: {Authorization: 'Bearer {env:NEO_MCP_REMOTE_TOKEN}'},
            oauth  : false
        });
        expect(config.mcp['neo-mjs-knowledge-base']).toEqual({
            type   : 'remote',
            url    : 'https://tenant.example.com/kb/mcp',
            enabled: true,
            headers: {Authorization: 'Bearer {env:NEO_MCP_REMOTE_TOKEN}'},
            oauth  : false
        });
        expect(config.mcp['neo-mjs-github-workflow'].type).toBe('local');
        expect(config.mcp['neo-mjs-neural-link'].type).toBe('local');
        expect(JSON.stringify(config)).not.toContain('Bearer secret')
    });

    test('remote map rejects unknown servers and every secret/header/env-bearing carrier', () => {
        const malformed = [{
            unknown: {url: 'https://tenant.example.com/mc/mcp', credentialEnvVar: 'NEO_MCP_REMOTE_TOKEN'}
        }, {
            'neo-mjs-memory-core': {
                url             : 'https://tenant.example.com/mc/mcp',
                credentialEnvVar: 'NEO_MCP_REMOTE_TOKEN',
                credential      : 'secret'
            }
        }, {
            'neo-mjs-memory-core': {
                url             : 'https://tenant.example.com/mc/mcp',
                credentialEnvVar: 'NEO_MCP_REMOTE_TOKEN',
                headers         : {Authorization: 'Bearer secret'}
            }
        }, {
            'neo-mjs-memory-core': {
                url             : 'https://tenant.example.com/mc/mcp',
                credentialEnvVar: 'GH_TOKEN'
            }
        }, {
            'neo-mjs-memory-core': {
                url             : 'https://tenant.example.com/mc/mcp',
                credentialEnvVar: '9INVALID'
            }
        }, []];

        malformed.forEach(remoteServers => {
            expect(() => generateOpenCodeSeatConfig({...PARAMS, remoteServers}))
                .toThrow(/remoteServers|remote server/)
        })
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
