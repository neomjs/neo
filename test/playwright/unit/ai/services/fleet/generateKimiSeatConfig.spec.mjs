import {expect, test}                              from '@playwright/test';
import {KIMI_SEAT_SERVERS, generateKimiSeatConfig} from '../../../../../../ai/services/fleet/generateKimiSeatConfig.mjs';

// Pure function — imported directly (no fs / spawn / env / Neo runtime), so the suite has no
// host-runtime side effects and each case is fully isolated. Mirrors generateOpenCodeSeatConfig.spec.

const PARAMS = {
    canonicalRoot: '/canonical',
    seatEnvFile  : '/seat/checkout/.env',
    workspaceRoot: '/seat/checkout',
    kimiHome     : '/fleet/instances/p/kimi',
    memoryDir    : '/seat/memory',
    nodeBinary   : '/usr/local/bin/node',
    environment  : {NEO_OPENAI_COMPATIBLE_HOST: 'http://127.0.0.1:1234', PATH: '/usr/bin:/bin', HOME: '/Users/fleet'}
};

const findFile = (files, suffix) => files.find(file => file.path.endsWith(suffix));

test.describe('generateKimiSeatConfig (Kimi Code seat scaffold emission, #15612)', () => {
    test('golden shape: mcp.json parses as strict JSON and wires the canonical four servers, organs-rooted', () => {
        const
            {files} = generateKimiSeatConfig(PARAMS),
            mcp     = JSON.parse(findFile(files, '.kimi-code/mcp.json').content).mcpServers,
            script  = name => `/canonical/ai/mcp/server/${name}/mcp-server.mjs`;

        for (const server of KIMI_SEAT_SERVERS) {
            const entry = mcp[server.name];

            expect(entry, `server '${server.name}' must be wired`).toBeDefined();
            expect(entry.command).toBe('/usr/local/bin/node');
            expect(entry.args[0]).toBe('--env-file=/seat/checkout/.env');
            expect(entry.env).toEqual(PARAMS.environment);
            expect(entry.enabled).toBe(true);
        }

        expect(mcp['neo-mjs-memory-core'].args[1]).toBe(script('memory-core'));
        expect(mcp['neo-mjs-github-workflow'].args[1]).toBe(script('github-workflow'));
        expect(mcp['neo-mjs-knowledge-base'].args[1]).toBe(script('knowledge-base'));
        // The Neural Link additionally binds --cwd to the seat's own working tree.
        expect(mcp['neo-mjs-neural-link'].args).toEqual(['--env-file=/seat/checkout/.env', script('neural-link'), '--cwd', '/seat/checkout']);
    });

    test('golden shape: config.toml carries the auto permission posture, default model, per-server allow rules, and the tracked wake hook', () => {
        const toml = findFile(generateKimiSeatConfig(PARAMS).files, 'config.toml').content;

        expect(toml).toContain('default_permission_mode = "auto"');
        expect(toml).toContain('default_model           = "kimi-code/k3"');

        for (const server of KIMI_SEAT_SERVERS) {
            expect(toml).toContain(`pattern  = "mcp__${server.name.replaceAll('-', '_')}__*"`);
        }

        // The wake-envelope SessionStart hook: git-tracked, KIMI_CODE_HOME-aware.
        expect(toml).toContain('event   = "SessionStart"');
        expect(toml).toContain('command = "node .kimi-code/hooks/wakeEnvelopeHook.mjs"');
    });

    test('emission list: five files across both roots + the memory dir', () => {
        const paths = generateKimiSeatConfig(PARAMS).files.map(file => file.path);

        expect(paths).toEqual([
            '/fleet/instances/p/kimi/config.toml',
            '/seat/checkout/.kimi-code/mcp.json',
            '/seat/memory/MEMORY.md',
            '/seat/memory/seat-pointers.md',
            '/seat/memory/identity.md'
        ]);
    });

    test('memory scaffold: MEMORY.md carries the boot checklist (the day-two reload lesson is substrate, not folklore)', () => {
        const memory = findFile(generateKimiSeatConfig(PARAMS).files, 'MEMORY.md').content;

        expect(memory).toContain('Boot checklist');
        expect(memory).toContain('persistence without reload is a no-op');
        expect(memory).toContain('add_memory');
        // Story-sovereignty: identity.md stays a near-empty template.
        const identity = findFile(generateKimiSeatConfig(PARAMS).files, 'identity.md').content;
        expect(identity).toContain('nobody');
        expect(identity.length).toBeLessThan(600);
    });

    test('purity: identical params emit byte-identical files (deterministic, no hidden inputs)', () => {
        expect(generateKimiSeatConfig(PARAMS)).toEqual(generateKimiSeatConfig(PARAMS));
    });

    test('island guard: a server script escaping canonicalRoot throws; a malformed entry throws', () => {
        const evil = [{name: 'evil', script: '../evil/mcp-server.mjs', needsCwd: false}];

        expect(() => generateKimiSeatConfig({...PARAMS, servers: evil})).toThrow(/island guard/);
        expect(() => generateKimiSeatConfig({...PARAMS, servers: [{script: 'ai/x.mjs', needsCwd: false}]})).toThrow(/island guard/);
        expect(() => generateKimiSeatConfig({...PARAMS, servers: []})).toThrow(/'servers' must be a non-empty array/);
    });

    test('island guard: a trailing-slash canonicalRoot is accepted (valid input must not mis-reject)', () => {
        const
            {files} = generateKimiSeatConfig({...PARAMS, canonicalRoot: '/canonical/'}),
            mcp     = JSON.parse(findFile(files, '.kimi-code/mcp.json').content).mcpServers;

        expect(mcp['neo-mjs-memory-core'].args[1]).toBe('/canonical/ai/mcp/server/memory-core/mcp-server.mjs');
    });

    test('named throws: every required param is validated by name', () => {
        for (const key of ['canonicalRoot', 'seatEnvFile', 'workspaceRoot', 'kimiHome', 'memoryDir', 'nodeBinary']) {
            const params = {...PARAMS};
            delete params[key];
            expect(() => generateKimiSeatConfig(params), `missing '${key}' must throw`).toThrow(new RegExp(`'${key}'`));
        }
    });

    test('defaultModel override lands in config.toml', () => {
        const toml = findFile(generateKimiSeatConfig({...PARAMS, defaultModel: 'kimi-code/kimi-for-coding'}).files, 'config.toml').content;

        expect(toml).toContain('default_model           = "kimi-code/kimi-for-coding"');
    });
});
