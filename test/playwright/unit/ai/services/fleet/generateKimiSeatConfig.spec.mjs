import {expect, test}                              from '@playwright/test';
import {spawnSync}                                 from 'node:child_process';
import {createHash}                                from 'node:crypto';
import fs                                          from 'node:fs';
import os                                          from 'node:os';
import path                                        from 'node:path';
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

        // The harness FACT (living reference: a production kimi seat's hand-built config.toml,
        // daily-driven since 2026-07-19): tool ids keep server names VERBATIM, hyphens and all.
        // Asserting the literal hyphenated form — not a transform — so the tautology cannot regrow.
        expect(toml).toContain('pattern  = "mcp__neo-mjs-memory-core__*"');
        expect(toml).toContain('pattern  = "mcp__neo-mjs-github-workflow__*"');
        expect(toml).toContain('pattern  = "mcp__neo-mjs-knowledge-base__*"');
        expect(toml).toContain('pattern  = "mcp__neo-mjs-neural-link__*"');
        expect(toml).not.toContain('mcp__neo_mjs_');

        // The wake-envelope SessionStart hook: git-tracked, KIMI_CODE_HOME-aware.
        expect(toml).toContain('event   = "SessionStart"');
        expect(toml).toContain('command = "node .kimi-code/hooks/wakeEnvelopeHook.mjs"');
    });

    test('golden shape: config.toml emits the five turn-presence hooks on the --env-file boundary (#15658)', () => {
        const toml = findFile(generateKimiSeatConfig(PARAMS).files, 'config.toml').content;

        // The seat's identity reaches the hook process from the SAME canonical source as the MCP
        // servers: Node's own --env-file against the seat's .env — never an identity literal.
        for (const event of ['UserPromptSubmit', 'PostToolUse', 'Stop', 'StopFailure', 'Interrupt']) {
            expect(toml).toContain(`event   = "${event}"`);
        }

        const hookBlocks = toml.split('[[hooks]]').slice(1);
        expect(hookBlocks).toHaveLength(8); // SessionStart + 2 identity-anchor + the five turn-presence events

        const turnPresenceBlocks = hookBlocks.filter(block => block.includes('turnPresenceHook.mjs'));
        expect(turnPresenceBlocks).toHaveLength(5);
        turnPresenceBlocks.forEach(block => {
            expect(block).toContain(`command = '"/usr/local/bin/node" --env-file="/seat/checkout/.env" .kimi-code/hooks/turnPresenceHook.mjs'`);
            expect(block).toContain('timeout = 5');
            expect(block).not.toMatch(/@neo-/)
        });
    });

    test('golden shape: config.toml wires the identity-anchor hook pair against the emitted script (#15697)', () => {
        const
            toml         = findFile(generateKimiSeatConfig(PARAMS).files, 'config.toml').content,
            anchorBlocks = toml.split('[[hooks]]').slice(1).filter(block => block.includes('"/fleet/instances/p/kimi/hooks/identityAnchorHook.mjs"'));

        // The memory layer loads at the two moments identity dies: session boot (first prompt)
        // and post-compaction. Both blocks pin the node binary + the absolute emitted-hook path
        // (the script lives in the harness home, not the checkout — the memoryDir is baked in).
        expect(anchorBlocks.map(block => block.match(/event\s+= "(\w+)"/)[1])).toEqual(['UserPromptSubmit', 'PostCompact']);
        anchorBlocks.forEach(block => {
            expect(block).toContain(`command = '"/usr/local/bin/node" "/fleet/instances/p/kimi/hooks/identityAnchorHook.mjs"'`);
            expect(block).toContain('timeout = 5');
            expect(block).not.toContain('--env-file'); // the loader reads no identity env
        });
    });

    test('emission list: seven files across both roots + the memory dir', () => {
        const paths = generateKimiSeatConfig(PARAMS).files.map(file => file.path);

        expect(paths).toEqual([
            '/fleet/instances/p/kimi/config.toml',
            '/seat/checkout/.kimi-code/mcp.json',
            '/seat/memory/MEMORY.md',
            '/seat/memory/seat-pointers.md',
            '/seat/memory/identity.md',
            '/seat/memory/about-this-layer.md',
            '/fleet/instances/p/kimi/hooks/identityAnchorHook.mjs'
        ]);
    });

    test('memory scaffold: MEMORY.md is the capped hot index (Grace-pattern), weak-spots empty at birth', () => {
        const memory = findFile(generateKimiSeatConfig(PARAMS).files, 'MEMORY.md').content;

        // The cap discipline travels with the file it governs: thresholds, measurement, levers.
        expect(memory).toContain('<17KB');
        expect(memory).toContain('24.6KB');
        expect(memory).toContain('wc -c');
        expect(memory).toContain('move-to-ARCHIVE');
        // The weak-spots section exists but starts EMPTY — another seat's mistakes are not this
        // seat's content; the index accretes from the seat's own public record.
        expect(memory).toContain('Weak-spots');
        expect(memory).toContain('Empty at birth');
        // The load-mechanism line names the identity-anchor hook (persistence without reload is
        // a no-op — the mechanism, not a checklist, is the answer).
        expect(memory).toContain('identityAnchorHook.mjs');
        expect(memory).toContain('Memory Core');
        // Story-sovereignty: identity.md stays a near-empty template.
        const identity = findFile(generateKimiSeatConfig(PARAMS).files, 'identity.md').content;
        expect(identity).toContain('nobody');
        expect(identity.length).toBeLessThan(600);
    });

    test('memory scaffold: about-this-layer.md documents the kimi load mechanism + the discipline', () => {
        const about = findFile(generateKimiSeatConfig(PARAMS).files, 'about-this-layer.md').content;

        expect(about).toContain('Grace-pattern');
        expect(about).toContain('UserPromptSubmit');
        expect(about).toContain('PostCompact');
        expect(about).toContain('persistence without reload is a no-op');
        expect(about).toContain('story-sovereignty');
    });

    test('identity-anchor hook: standalone (no repo imports), memoryDir baked in, fail-open', () => {
        const hook = findFile(generateKimiSeatConfig(PARAMS).files, 'identityAnchorHook.mjs').content;

        expect(hook).toContain('GENERATED by ai/services/fleet/generateKimiSeatConfig.mjs');
        expect(hook).toContain('const MEMORY_DIR  = "/seat/memory";');
        expect(hook).toContain('const BOOT_FILES  = ["MEMORY.md","identity.md"];');
        // State rides KIMI_CODE_HOME (fleet seats keep their own home) with a homedir fallback.
        expect(hook).toContain('process.env.KIMI_CODE_HOME');
        // The sentinel contract: PostCompact arms, UserPromptSubmit fires once then goes silent.
        expect(hook).toContain('.compacted');
        expect(hook).toContain('.done');
        expect(hook).toContain('process.exit(0); // fail-open, silent');
        expect(hook).not.toMatch(/import .* from '(?!node:)/); // no non-node imports (C1-clean)
    });

    test('purity: identical params emit byte-identical files (deterministic, no hidden inputs)', () => {
        expect(generateKimiSeatConfig(PARAMS)).toEqual(generateKimiSeatConfig(PARAMS));
        expect(generateKimiSeatConfig(PARAMS)).toEqual(generateKimiSeatConfig({...PARAMS, remoteServers: {}}))
    });

    test('no remote intent stays byte-identical to the origin/dev stdio artifact set', () => {
        const digest = createHash('sha256')
            .update(JSON.stringify(generateKimiSeatConfig(PARAMS).files))
            .digest('hex');

        // Live-frozen from the pre-change origin/dev artifact. This is deliberately not current-vs-current:
        // an unconditional remote credential echo in any generated file changes the digest.
        // Bumped 2026-08-15: the seat-layer rules gained the defect-note anti-pattern line.
        expect(digest).toBe('2652a60b456146fd4906c7151347b4c7bc1f329ec9a606d777d57b507704f5d6')
    });

    test('remote map replaces only selected servers with the exact Kimi HTTP adapter grammar', () => {
        const
            remoteServers = {
                'neo-mjs-memory-core': {
                    url: 'https://tenant.example.com/mc/mcp', credentialEnvVar: 'NEO_MCP_REMOTE_TOKEN'
                },
                'neo-mjs-knowledge-base': {
                    url: 'https://tenant.example.com/kb/mcp', credentialEnvVar: 'NEO_MCP_REMOTE_TOKEN'
                }
            },
            mcp = JSON.parse(findFile(
                generateKimiSeatConfig({...PARAMS, remoteServers}).files,
                '.kimi-code/mcp.json'
            ).content).mcpServers;

        expect(mcp['neo-mjs-memory-core']).toEqual({
            url              : 'https://tenant.example.com/mc/mcp',
            bearerTokenEnvVar: 'NEO_MCP_REMOTE_TOKEN',
            enabled          : true
        });
        expect(mcp['neo-mjs-knowledge-base']).toEqual({
            url              : 'https://tenant.example.com/kb/mcp',
            bearerTokenEnvVar: 'NEO_MCP_REMOTE_TOKEN',
            enabled          : true
        });
        expect(mcp['neo-mjs-github-workflow'].command).toBe(PARAMS.nodeBinary);
        expect(mcp['neo-mjs-neural-link'].command).toBe(PARAMS.nodeBinary);
        expect(JSON.stringify(mcp)).not.toContain('Bearer ')
    });

    test('remote map rejects unknown servers and every secret/header/env-bearing carrier', () => {
        const malformed = [{
            unknown: {url: 'https://tenant.example.com/mc/mcp', credentialEnvVar: 'NEO_MCP_REMOTE_TOKEN'}
        }, {
            'neo-mjs-memory-core': {
                url             : 'https://tenant.example.com/mc/mcp',
                credentialEnvVar: 'NEO_MCP_REMOTE_TOKEN',
                token           : 'secret'
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
                credentialEnvVar: 'NOT VALID'
            }
        }, []];

        malformed.forEach(remoteServers => {
            expect(() => generateKimiSeatConfig({...PARAMS, remoteServers}))
                .toThrow(/remoteServers|remote server/)
        })
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

    test('generated config parses structurally: every [[hooks]] block carries event + command + timeout', () => {
        const
            toml   = findFile(generateKimiSeatConfig(PARAMS).files, 'config.toml').content,
            blocks = toml.split('[[hooks]]').slice(1).map(block => ({
                event  : block.match(/event\s+= "([^"]+)"/)?.[1],
                command: block.match(/command = (.+)/)?.[1],
                timeout: block.match(/timeout = (\d+)/)?.[1]
            }));

        expect(blocks).toHaveLength(8);
        blocks.forEach(block => {
            expect(block.event, 'every hook block names its event').toBeTruthy();
            expect(block.command, 'every hook block names its command').toBeTruthy();
            expect(block.timeout).toBe('5');
        });
        // The load contract as a STRUCTURE: exactly these events, each wired to a real hook surface.
        expect(blocks.map(block => block.event)).toEqual([
            'SessionStart', 'UserPromptSubmit', 'PostCompact', 'UserPromptSubmit', 'PostToolUse', 'Stop', 'StopFailure', 'Interrupt'
        ]);
    });

    test('identity-anchor hook: the EMITTED artifact executes the boundary contract (boot / ordinary / compact / garbage)', () => {
        const
            seat      = fs.mkdtempSync(path.join(os.tmpdir(), 'kimi-seat-emission-')),
            memoryDir = path.join(seat, 'memory'),
            kimiHome  = path.join(seat, 'kimi-home'),
            {files}   = generateKimiSeatConfig({...PARAMS, memoryDir, kimiHome}),
            hookPath  = path.join(seat, 'identityAnchorHook.mjs'),
            run       = payload => spawnSync(process.execPath, [hookPath], {
                encoding: 'utf8',
                env     : {...process.env, KIMI_CODE_HOME: kimiHome},
                input   : typeof payload === 'string' ? payload : JSON.stringify(payload),
                timeout : 5000
            });

        // Materialize the seat: the emitted layer files + the emitted hook, exactly as the birth path would.
        fs.mkdirSync(memoryDir, {recursive: true});
        for (const file of files) {
            if (file.path.startsWith(memoryDir)) fs.writeFileSync(file.path, file.content);
        }
        fs.writeFileSync(hookPath, findFile(files, 'identityAnchorHook.mjs').content);

        const
            boot        = run({hook_event_name: 'UserPromptSubmit', session_id: 's1', cwd: '/seat/checkout'}),
            ordinary    = run({hook_event_name: 'UserPromptSubmit', session_id: 's1', cwd: '/seat/checkout'}),
            arm         = run({hook_event_name: 'PostCompact',      session_id: 's1', cwd: '/seat/checkout'}),
            reload      = run({hook_event_name: 'UserPromptSubmit', session_id: 's1', cwd: '/seat/checkout'}),
            afterReload = run({hook_event_name: 'UserPromptSubmit', session_id: 's1', cwd: '/seat/checkout'}),
            garbage     = run('not json'),
            unrelated   = run({hook_event_name: 'Stop',             session_id: 's1', cwd: '/seat/checkout'});

        // Boot: the layer enters context, wrapped and trigger-stamped, including the bearer template.
        expect(boot.status).toBe(0);
        expect(boot.stdout).toContain('<seat-memory-layer source="' + memoryDir + '" trigger="session-boot">');
        expect(boot.stdout).toContain('Seat memory index');
        expect(boot.stdout).toContain('Identity — unwritten');

        // Ordinary prompts are byte-silent; PostCompact arms without emitting; the reload fires
        // EXACTLY once, then the boundary goes silent again.
        expect(ordinary.stdout).toBe('');
        expect(arm.stdout).toBe('');
        expect(reload.stdout).toContain('trigger="post-compact-reload"');
        expect(afterReload.stdout).toBe('');

        // Fail-open: garbage and unrelated events exit 0 with zero output, never blocking a turn.
        expect(garbage.status).toBe(0);
        expect(garbage.stdout).toBe('');
        expect(unrelated.status).toBe(0);
        expect(unrelated.stdout).toBe('');
    });
});
