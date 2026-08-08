import {test, expect}                                                          from '@playwright/test';
import {HARNESS_TYPES}                                                         from '../../../../../../ai/services/fleet/harnessTypes.mjs';
import {LAUNCHABLE_HARNESS_TYPES, deriveHarnessLaunchSpec, getHarnessAuthMode} from '../../../../../../ai/services/fleet/deriveHarnessLaunchSpec.mjs';

// Pure function — imported directly (no fs / spawn / env / Neo runtime), so the suite has no
// host-runtime side effects and each case is fully isolated. Mirrors deriveAgentRepoPath.spec.

test.describe('deriveHarnessLaunchSpec (per-family harness launch templates)', () => {
    test('codex: the binary + the app-server long-lived mode + CODEX_HOME pinned to the instance home', () => {
        const spec = deriveHarnessLaunchSpec({harnessType: 'codex', instanceHome: '/srv/instances/a/codex', binaryPath: '/opt/codex'});

        // `app-server` is the LIVENESS half of the tuple: a bare codex launch exits immediately on a
        // non-TTY stdin (probed on the exact binary), so the mode arg is template-owned, never a
        // caller afterthought.
        expect(spec).toEqual({
            command         : '/opt/codex',
            args            : ['app-server'],
            env             : {CODEX_HOME: '/srv/instances/a/codex'},
            versionProbeArgs: ['--version']
        });
    });

    test('codex-desktop: direct packaged main + dual homes + exact provisioned project + updater disabled', () => {
        const spec = deriveHarnessLaunchSpec({
            harnessType : 'codex-desktop',
            instanceHome: '/srv/instances/a/codex-desktop',
            binaryPath  : '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT',
            cwd         : '/srv/checkouts/a/neomjs/neo'
        });

        expect(spec).toEqual({
            command: '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT',
            args   : [
                '--user-data-dir=/srv/instances/a/codex-desktop/electron-profile',
                '--open-project=/srv/checkouts/a/neomjs/neo'
            ],
            env: {
                CODEX_HOME                   : '/srv/instances/a/codex-desktop/codex-home',
                CODEX_ELECTRON_USER_DATA_PATH: '/srv/instances/a/codex-desktop/electron-profile',
                CODEX_SPARKLE_ENABLED        : 'false'
            },
            versionProbeArgs: null,
            authHome        : '/srv/instances/a/codex-desktop/codex-home',
            electronProfile : '/srv/instances/a/codex-desktop/electron-profile'
        });
    });

    test('claude-code: strict per-home MCP config + stream-json mode + isolated CLAUDE_CONFIG_DIR', () => {
        const spec = deriveHarnessLaunchSpec({harnessType: 'claude-code', instanceHome: '/srv/instances/a/claude', binaryPath: '/usr/local/bin/claude'});

        expect(spec).toEqual({
            command: '/usr/local/bin/claude',
            args   : [
                '--mcp-config', '/srv/instances/a/claude/mcp-config.json',
                '--strict-mcp-config',
                '--input-format', 'stream-json',
                '--output-format', 'stream-json',
                '--print',
                '--verbose'
            ],
            env             : {CLAUDE_CONFIG_DIR: '/srv/instances/a/claude'},
            versionProbeArgs: ['--version']
        });
    });

    test('claude-desktop: argv isolation + exact contained CLAUDE_USER_DATA_DIR authority', () => {
        const spec = deriveHarnessLaunchSpec({harnessType: 'claude-desktop', instanceHome: '/srv/instances/a/claude-desktop', binaryPath: '/Applications/Claude.app/Contents/MacOS/Claude'});

        // The profile switch is BOTH halves at once for an Electron app: it relocates the config
        // home AND the single-instance lock (probed: two instances on distinct homes coexist,
        // SIGTERM-clean). The version probe carries the SAME flag so the probe subprocess
        // can never land inside another profile's single-instance scope.
        expect(spec).toEqual({
            command         : '/Applications/Claude.app/Contents/MacOS/Claude',
            args            : ['--user-data-dir=/srv/instances/a/claude-desktop'],
            env             : {CLAUDE_USER_DATA_DIR: '/srv/instances/a/claude-desktop'},
            versionProbeArgs: ['--user-data-dir=/srv/instances/a/claude-desktop', '--version']
        });
    });

    test('antigravity: same argv isolation contract; the version probe derives NULL (the binary boots the app instead of answering)', () => {
        const spec = deriveHarnessLaunchSpec({harnessType: 'antigravity', instanceHome: '/srv/instances/a/antigravity', binaryPath: '/Applications/Antigravity.app/Contents/MacOS/Antigravity'});

        expect(spec).toEqual({
            command         : '/Applications/Antigravity.app/Contents/MacOS/Antigravity',
            args            : ['--user-data-dir=/srv/instances/a/antigravity'],
            env             : {},
            versionProbeArgs: null   // skip-the-probe marker: binaryVersion stays honestly null
        });
    });

    test('env carries ONLY the family home var — the isolation contract, no ambient / extra keys', () => {
        const spec = deriveHarnessLaunchSpec({harnessType: 'codex', instanceHome: '/h', binaryPath: '/b'});

        expect(Object.keys(spec.env)).toEqual(['CODEX_HOME']);
    });

    test('returns a FRESH spec per call — a caller mutating args/env/probe-args never bleeds into the template or later calls', () => {
        const
            a = deriveHarnessLaunchSpec({harnessType: 'codex', instanceHome: '/h', binaryPath: '/b'}),
            b = deriveHarnessLaunchSpec({harnessType: 'codex', instanceHome: '/h', binaryPath: '/b'});

        a.args.push('--extra');
        a.versionProbeArgs.push('--extra');

        expect(b.args).toEqual(['app-server']);            // the template stayed pristine
        expect(b.versionProbeArgs).toEqual(['--version']);
        expect(a.env).not.toBe(b.env);
    });

    test('LAUNCHABLE_HARNESS_TYPES is the frozen alphabetical template subset AND every entry is a registered harness type', () => {
        expect(LAUNCHABLE_HARNESS_TYPES).toEqual(['antigravity', 'claude-code', 'claude-desktop', 'codex', 'codex-desktop', 'kimi-code', 'opencode']);
        expect(Object.isFrozen(LAUNCHABLE_HARNESS_TYPES)).toBe(true);

        // The lockstep invariant the module also guards at import: launch vocabulary ⊆ the shared
        // registry authority. `native-neo` stays registered-but-unlaunchable by design.
        const registered = new Set(HARNESS_TYPES.map(entry => entry.type));

        expect(registered.size).toBe(HARNESS_TYPES.length);
        expect(HARNESS_TYPES.filter(entry => entry.type === 'codex-desktop')).toHaveLength(1);
        for (const type of LAUNCHABLE_HARNESS_TYPES) {
            expect(registered.has(type), `'${type}' must be registered in ai/services/fleet/harnessTypes.mjs`).toBe(true);
        }
        expect(registered.has('native-neo')).toBe(true);
        expect(LAUNCHABLE_HARNESS_TYPES).not.toContain('native-neo');
    });

    test('getHarnessAuthMode: marker for the CLI families, in-app for the app bundles, env-key for the key-riding family, null fail-closed for everything else', () => {
        expect(getHarnessAuthMode('codex')).toBe('marker');
        expect(getHarnessAuthMode('codex-desktop')).toBe('marker');
        expect(getHarnessAuthMode('claude-code')).toBe('marker');
        expect(getHarnessAuthMode('claude-desktop')).toBe('in-app');
        expect(getHarnessAuthMode('antigravity')).toBe('in-app');
        expect(getHarnessAuthMode('opencode')).toBe('env-key');
        expect(getHarnessAuthMode('kimi-code')).toBe('env-key');
        expect(getHarnessAuthMode('native-neo')).toBeNull();
        expect(getHarnessAuthMode(undefined)).toBeNull();
    });

    test('throws on an unknown harnessType, naming the supported set (classification, not a launcher)', () => {
        const call = () => deriveHarnessLaunchSpec({harnessType: 'gemini-cli', instanceHome: '/h', binaryPath: '/b'});

        expect(call).toThrow(/unsupported harnessType 'gemini-cli'/);
        expect(call).toThrow(/'claude-code'/);
        expect(call).toThrow(/'codex'/);
        expect(call).toThrow(/'codex-desktop'/);
        expect(call).toThrow(/'claude-desktop'/);
        expect(call).toThrow(/'antigravity'/);
    });

    test('opencode: the headless serve template with the unified two-var XDG home (config + state under <instanceHome>/opencode)', () => {
        const spec = deriveHarnessLaunchSpec({harnessType: 'opencode', instanceHome: '/srv/instances/p/oc', binaryPath: '/usr/local/bin/opencode'});

        expect(spec).toEqual({
            command: '/usr/local/bin/opencode',
            args   : ['serve', '--hostname', '127.0.0.1', '--port', '0'],
            env    : {
                XDG_CONFIG_HOME: '/srv/instances/p/oc',
                XDG_DATA_HOME  : '/srv/instances/p/oc',
                XDG_CACHE_HOME : '/srv/instances/p/oc/cache'
            },
            versionProbeArgs: ['--version']
        });

        // fresh spec per call — a mutating caller never bleeds into the template
        const other = deriveHarnessLaunchSpec({harnessType: 'opencode', instanceHome: '/srv/instances/p/oc', binaryPath: '/usr/local/bin/opencode'});
        spec.args.push('--extra');
        expect(other.args).toEqual(['serve', '--hostname', '127.0.0.1', '--port', '0']);
        expect(spec.env).not.toBe(other.env);
    });

    test('kimi-code: the resident web-server template with the single-var KIMI_CODE_HOME isolation (#15612)', () => {
        const spec = deriveHarnessLaunchSpec({harnessType: 'kimi-code', instanceHome: '/srv/instances/p/kimi', binaryPath: '/usr/local/bin/kimi'});

        expect(spec).toEqual({
            command         : '/usr/local/bin/kimi',
            args            : ['web', '--no-open', '--port', '0'],
            env             : {KIMI_CODE_HOME: '/srv/instances/p/kimi'},
            versionProbeArgs: ['--version']
        });

        // fresh spec per call — a mutating caller never bleeds into the template
        const other = deriveHarnessLaunchSpec({harnessType: 'kimi-code', instanceHome: '/srv/instances/p/kimi', binaryPath: '/usr/local/bin/kimi'});
        spec.args.push('--extra');
        expect(other.args).toEqual(['web', '--no-open', '--port', '0']);
        expect(spec.env).not.toBe(other.env);
    });

    test('fails loud on contract violations (no silent default spec)', () => {
        // missing / empty / non-string required args
        expect(() => deriveHarnessLaunchSpec({harnessType: '',      instanceHome: '/h', binaryPath: '/b'})).toThrow(/harnessType/);
        expect(() => deriveHarnessLaunchSpec({harnessType: 'codex', instanceHome: '',   binaryPath: '/b'})).toThrow(/instanceHome/);
        expect(() => deriveHarnessLaunchSpec({harnessType: 'codex', instanceHome: '/h', binaryPath: ''  })).toThrow(/binaryPath/);
        expect(() => deriveHarnessLaunchSpec({harnessType: 'codex', instanceHome: 42,   binaryPath: '/b'})).toThrow(/instanceHome/);
        expect(() => deriveHarnessLaunchSpec({})).toThrow(/harnessType/);
        expect(() => deriveHarnessLaunchSpec({harnessType: 'codex-desktop', instanceHome: '/h', binaryPath: '/b'})).toThrow(/cwd/);
        expect(() => deriveHarnessLaunchSpec({harnessType: 'codex-desktop', instanceHome: '/h', binaryPath: '/b', cwd: 'relative'})).toThrow(/cwd/);
    });
});
