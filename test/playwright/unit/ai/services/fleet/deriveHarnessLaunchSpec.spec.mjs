import {test, expect}            from '@playwright/test';
import {deriveHarnessLaunchSpec} from '../../../../../../ai/services/fleet/deriveHarnessLaunchSpec.mjs';

// Pure function — imported directly (no fs / spawn / env / Neo runtime), so the suite has no
// host-runtime side effects and each case is fully isolated. Mirrors deriveAgentRepoPath.spec.

test.describe('deriveHarnessLaunchSpec (per-family harness launch templates)', () => {
    test('codex: the binary + empty args + CODEX_HOME pinned to the instance home', () => {
        const spec = deriveHarnessLaunchSpec({harnessType: 'codex', instanceHome: '/srv/instances/a/codex', binaryPath: '/opt/codex'});

        expect(spec).toEqual({command: '/opt/codex', args: [], env: {CODEX_HOME: '/srv/instances/a/codex'}});
    });

    test('claude-code: the binary + empty args + CLAUDE_CONFIG_DIR pinned to the instance home', () => {
        const spec = deriveHarnessLaunchSpec({harnessType: 'claude-code', instanceHome: '/srv/instances/a/claude', binaryPath: '/usr/local/bin/claude'});

        expect(spec).toEqual({command: '/usr/local/bin/claude', args: [], env: {CLAUDE_CONFIG_DIR: '/srv/instances/a/claude'}});
    });

    test('env carries ONLY the family home var — the isolation contract, no ambient / extra keys', () => {
        const spec = deriveHarnessLaunchSpec({harnessType: 'codex', instanceHome: '/h', binaryPath: '/b'});

        expect(Object.keys(spec.env)).toEqual(['CODEX_HOME']);
    });

    test('returns a FRESH spec per call — callers append headless/daemon args (exec, app-server) without cross-call bleed', () => {
        const
            a = deriveHarnessLaunchSpec({harnessType: 'codex', instanceHome: '/h', binaryPath: '/b'}),
            b = deriveHarnessLaunchSpec({harnessType: 'codex', instanceHome: '/h', binaryPath: '/b'});

        a.args.push('exec');

        expect(b.args).toEqual([]);   // the template stayed pristine
        expect(a.env).not.toBe(b.env);
    });

    test('throws on an unknown harnessType, naming the supported set (classification, not a launcher)', () => {
        const call = () => deriveHarnessLaunchSpec({harnessType: 'gemini-cli', instanceHome: '/h', binaryPath: '/b'});

        expect(call).toThrow(/unsupported harnessType 'gemini-cli'/);
        expect(call).toThrow(/'claude-code'/);
        expect(call).toThrow(/'codex'/);
    });

    test('fails loud on contract violations (no silent default spec)', () => {
        // missing / empty / non-string required args
        expect(() => deriveHarnessLaunchSpec({harnessType: '',      instanceHome: '/h', binaryPath: '/b'})).toThrow(/harnessType/);
        expect(() => deriveHarnessLaunchSpec({harnessType: 'codex', instanceHome: '',   binaryPath: '/b'})).toThrow(/instanceHome/);
        expect(() => deriveHarnessLaunchSpec({harnessType: 'codex', instanceHome: '/h', binaryPath: ''  })).toThrow(/binaryPath/);
        expect(() => deriveHarnessLaunchSpec({harnessType: 'codex', instanceHome: 42,   binaryPath: '/b'})).toThrow(/instanceHome/);
        expect(() => deriveHarnessLaunchSpec({})).toThrow(/harnessType/);
    });
});
