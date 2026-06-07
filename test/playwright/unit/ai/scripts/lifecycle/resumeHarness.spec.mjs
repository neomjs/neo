import {setup} from '../../../../setup.mjs';

const appName = 'ResumeHarnessTest';
const skipCiSubstrateData = !!process.env.NEO_TEST_SKIP_CI;

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}            from '@playwright/test';
import {execFileSync, spawnSync} from 'child_process';
import {randomUUID}              from 'crypto';
import os                        from 'os';
import path                      from 'path';
import fs                        from 'fs';
import Neo                       from '../../../../../../src/Neo.mjs';
import * as core                 from '../../../../../../src/core/_export.mjs';
import {
    applyHarnessMetadataDefaults,
    resolveHarnessTargetForIdentity
} from '../../../../../../ai/scripts/lifecycle/harnessRouting.mjs';
import {
    resolveResumeHarnessInstanceAddress,
    resolveResumeHarnessInstancePid
} from '../../../../../../ai/scripts/lifecycle/resumeHarness.mjs';

test.describe('ai/scripts/resumeHarness', () => {
    test.describe.configure({mode: 'serial'});

    const scriptPath = path.resolve(process.cwd(), 'ai/scripts/lifecycle/resumeHarness.mjs');
    const cooldownDir = path.resolve(process.cwd(), '.neo-ai-data/wake-daemon');

    /**
     * Per-test gate-file path via the `WAKE_GATE_FILE_PATH` env-var override
     * (production unset, tests set explicitly). Avoids the singleton-on-disk
     * collision when this spec runs in parallel with `wakeSafetyGate.spec.mjs`.
     *
     * `overrideEnv` — for tests that just need to exercise
     * the unknown-identity / cooldown / osascript surfaces without the gate
     * blocking. Sets both an isolated gate path AND `WAKE_GATE_OVERRIDE=1`.
     *
     * `gateOnlyEnv()` — for tests targeting the gate behavior itself; isolates
     * the gate path but leaves `WAKE_GATE_OVERRIDE` unset so the default-tripped
     * / explicitly-enabled paths can be exercised.
     *
     * Live-host opt-in: tests that fire the REAL `osascript` paste path
     * (vs. tests that mock or skip osascript) MUST be gated behind
     * `RUN_LIVE_OSASCRIPT=1` env-var opt-in via `test.skip(!process.env.RUN_LIVE_OSASCRIPT, ...)`
     * as the FIRST statement of the test body. Default behavior (env var unset)
     * is `[skipped]` — preventing the host-environment side effect of pasting
     * the boot-grounding prompt into a live Claude Desktop session and spawning
     * a real Claude Code session. Empirical anchor: 2026-05-04 09:03Z runaway
     * spawn caused by running this spec on a host with Claude Desktop +
     * accessibility permission granted, prior to this discipline. The reference
     * architecture for safe live-substrate testing is `bridge-daemon.spec.mjs`,
     * which uses either the `test` adapter (test stream delivery) or a mock
     * `osascript` binary on PATH that captures argv without executing AppleScript.
     *
     * Codex live-host opt-in: `codex debug app-server send-message-v2`
     * creates/injects into a real Codex Desktop thread. Default tests MUST use
     * `CODEX_APP_SERVER_MOCK=1` plus a `CODEX_CLI_PATH` mock. Real probes require
     * `RUN_LIVE_CODEX_APP_SERVER=1`.
     */
    let gatePath, overrideEnv;
    const gateOnlyEnv = () => ({...process.env, WAKE_GATE_FILE_PATH: gatePath});

    test.beforeEach(() => {
        gatePath    = path.join(os.tmpdir(), `wake-gate-resumeharness-${randomUUID()}.json`);
        overrideEnv = {...process.env, WAKE_GATE_FILE_PATH: gatePath, WAKE_GATE_OVERRIDE: '1'};

        // Clear cooldown files before each test so they don't skip
        if (fs.existsSync(cooldownDir)) {
            const files = fs.readdirSync(cooldownDir);
            for (const file of files) {
                if (file.startsWith('cooldown-')) {
                    try {
                        fs.unlinkSync(path.join(cooldownDir, file));
                    } catch(e) {}
                }
            }
        }
    });

    test.afterEach(() => {
        if (fs.existsSync(gatePath)) fs.unlinkSync(gatePath);
    });

    test('Unknown identity exits with code 1 and unknown message', async () => {
        try {
            execFileSync('node', [scriptPath, '@neo-unknown', 'test'], {encoding: 'utf-8', stdio: 'pipe', env: overrideEnv});
            test.fail('Should have exited with error');
        } catch (e) {
            expect(e.status).toBe(1);
            expect(e.stderr).toContain('Unknown harness target for identity: @neo-unknown');
        }
    });

    test('Claude identities derive osascript Tab-3 routing from identityRoots modelFamily (#12434)', async () => {
        // Static source check plus helper-level behavior: resumeHarness no longer mirrors Neo's
        // identity roster. Claude-family identities derive the same Claude Desktop Tab-3 fresh
        // session target from identityRoots, including active identities without a
        // subscriptionTemplate.
        const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
        expect(scriptContent).not.toContain('const identityMap =');
        expect(scriptContent).toContain('resolveHarnessTargetForIdentity(identity)');

        expect(resolveHarnessTargetForIdentity('@neo-opus-ada')).toMatchObject({
            adapter             : 'osascript',
            appName             : 'Claude',
            tabShortcut         : '3',
            freshSessionShortcut: 'n'
        });
        expect(resolveHarnessTargetForIdentity('@neo-claude-opus')).toMatchObject({
            adapter             : 'osascript',
            appName             : 'Claude',
            tabShortcut         : '3',
            freshSessionShortcut: 'n'
        });
        expect(resolveHarnessTargetForIdentity('@neo-opus-vega')).toMatchObject({
            adapter             : 'osascript',
            appName             : 'Claude',
            tabShortcut         : '3',
            freshSessionShortcut: 'n'
        });
    });

    test('resumeHarness resolves addressed Claude instance metadata without hardcoded paths (#12536)', async () => {
        expect(resolveResumeHarnessInstanceAddress({
            metadata: {
                appName        : 'Claude',
                instanceAddress: '/Users/example/.claude-instances/neo-opus-vega',
                addressType    : 'userDataDir'
            },
            env: {}
        })).toEqual({
            instanceAddress: '/Users/example/.claude-instances/neo-opus-vega',
            addressType    : 'userDataDir'
        });

        expect(resolveResumeHarnessInstanceAddress({
            metadata: {
                appName    : 'Claude',
                userDataDir: '/Users/example/.claude-instances/legacy'
            },
            env: {}
        })).toEqual({
            instanceAddress: '/Users/example/.claude-instances/legacy',
            addressType    : 'userDataDir'
        });

        expect(resolveResumeHarnessInstanceAddress({
            metadata: {},
            env: {
                NEO_HARNESS_INSTANCE_ADDRESS     : '  4242  ',
                NEO_HARNESS_INSTANCE_ADDRESS_TYPE: '  pid  '
            }
        })).toEqual({
            instanceAddress: '4242',
            addressType    : 'pid'
        });

        expect(() => resolveResumeHarnessInstanceAddress({
            metadata: {
                appName    : 'Claude',
                addressType: 'userDataDir'
            },
            env: {
                NEO_HARNESS_INSTANCE_ADDRESS     : '/env/must-not-mask-partial-metadata',
                NEO_HARNESS_INSTANCE_ADDRESS_TYPE: 'userDataDir'
            }
        })).toThrow(/Partial resumeHarness instance address/);

        expect(() => resolveResumeHarnessInstanceAddress({
            metadata: {},
            env: {
                NEO_HARNESS_INSTANCE_ADDRESS     : '/tmp/vega',
                NEO_HARNESS_INSTANCE_ADDRESS_TYPE: 'tmuxSession'
            }
        })).toThrow(/Unsupported resumeHarness instance addressType/);
    });

    test('resumeHarness resolves instance PID and fails closed on stale addressed routes (#12536)', async () => {
        expect(await resolveResumeHarnessInstancePid({
            addressType    : 'pid',
            instanceAddress: '12345',
            deploymentMode : 'local'
        })).toBe(12345);

        expect(await resolveResumeHarnessInstancePid({
            addressType      : 'userDataDir',
            instanceAddress  : '/Users/example/.claude-instances/neo-opus-vega',
            deploymentMode   : 'local',
            getInstancePidFn : async ({userDataDir}) =>
                userDataDir === '/Users/example/.claude-instances/neo-opus-vega' ? 24680 : null
        })).toBe(24680);

        await expect(resolveResumeHarnessInstancePid({
            addressType      : 'userDataDir',
            instanceAddress  : '/Users/example/.claude-instances/missing',
            deploymentMode   : 'local',
            getInstancePidFn : async () => null
        })).rejects.toThrow(/No running Claude instance found/);

        await expect(resolveResumeHarnessInstancePid({
            addressType    : 'pid',
            instanceAddress: 'not-a-pid',
            deploymentMode : 'local'
        })).rejects.toThrow(/Invalid resumeHarness pid/);

        await expect(resolveResumeHarnessInstancePid({
            addressType    : 'pid',
            instanceAddress: '12345'
        })).rejects.toThrow(/deploymentMode='unset'/);

        await expect(resolveResumeHarnessInstancePid({
            addressType    : 'pid',
            instanceAddress: '12345',
            deploymentMode : 'cloud'
        })).rejects.toThrow(/instance targeting requires local deployment/);
    });

    test('normalizes GitHub-login identity form before harness dispatch (#11797)', async () => {
        const {normalizeAgentIdentityNodeId} = await import('../../../../../../ai/scripts/lifecycle/resumeHarness.mjs');

        expect(normalizeAgentIdentityNodeId('neo-opus-ada')).toBe('@neo-opus-ada');
        expect(normalizeAgentIdentityNodeId('@neo-gpt')).toBe('@neo-gpt');
        expect(normalizeAgentIdentityNodeId('  neo-gemini-pro  ')).toBe('@neo-gemini-pro');
    });

    test('future identityRoots activation does not require resumeHarness identityMap edits (#12434)', () => {
        const identities = [{
            id        : '@neo-future-claude',
            type      : 'AgentIdentity',
            properties: {
                modelFamily: 'claude',
                accountType: 'agent'
            }
        }, {
            id        : '@neo-future-gpt',
            type      : 'AgentIdentity',
            properties: {
                modelFamily: 'gpt',
                accountType: 'agent'
            }
        }];

        expect(resolveHarnessTargetForIdentity('neo-future-claude', {identities})).toMatchObject({
            adapter             : 'osascript',
            appName             : 'Claude',
            tabShortcut         : '3',
            freshSessionShortcut: 'n'
        });
        expect(resolveHarnessTargetForIdentity('@neo-future-gpt', {identities})).toMatchObject({
            adapter: 'codex-app-server'
        });
    });

    test('host app defaults are shared and preserve explicit null opt-outs (#12434)', () => {
        expect(applyHarnessMetadataDefaults({appName: 'Claude'})).toMatchObject({
            appName          : 'Claude',
            tabShortcut      : '3',
            focusSeedSequence: 'r-undo'
        });
        expect(applyHarnessMetadataDefaults({appName: 'Antigravity'})).toMatchObject({
            appName     : 'Antigravity',
            tabShortcut : 'shift+i'
        });
        expect(applyHarnessMetadataDefaults({appName: 'Antigravity', tabShortcut: null})).toMatchObject({
            appName     : 'Antigravity',
            tabShortcut : null
        });
        expect(applyHarnessMetadataDefaults({appName: 'Claude', focusSeedKey: 'space'})).not.toHaveProperty('focusSeedSequence');
    });

    test('Opus identity osascript runtime dispatch (live host — RUN_LIVE_OSASCRIPT=1 required, #10681)', async () => {
        // Live-host integration: invokes real `osascript` which on hosts with Claude Desktop
        // + System Events accessibility granted will paste the boot-grounding prompt into the
        // live app and spawn a real Claude Code session. Skipped by default to prevent the
        // 2026-05-04 09:03Z runaway-spawn pattern (forensic record).
        test.skip(!process.env.RUN_LIVE_OSASCRIPT, 'Live osascript test — paste-spawns real Claude sessions on hosts with accessibility granted; set RUN_LIVE_OSASCRIPT=1 to run (#10681)');
        try {
            execFileSync('node', [scriptPath, '@neo-opus-ada', 'test'], {encoding: 'utf-8', stdio: 'pipe', env: overrideEnv});
        } catch (e) {
            // It might fail if osascript fails to activate Claude or System Events isn't permitted
            const output = e.stderr + e.stdout;
            expect(output).toContain('Failed to resume @neo-opus-ada via osascript:');
        }
    });

    test('Wake safety gate tripped + no override → resumeHarness skips with explicit stderr (#10648)', async () => {
        // Default-tripped state (no gate file → deny-by-default per wakeSafetyGate.mjs).
        // resumeHarness must skip BEFORE any cooldown / harness lookup / osascript work,
        // and emit a stderr message naming the gate state and the override env-var.
        // spawnSync (vs execFileSync) captures stderr on success-exit too — gate-skip
        // is exit 0 (defensive no-op, not an error).
        const result = spawnSync('node', [scriptPath, '@neo-opus-ada', 'test'], {
            encoding: 'utf-8',
            env     : gateOnlyEnv()  // No WAKE_GATE_OVERRIDE — exercising default-tripped path on isolated gate file
        });
        expect(result.status).toBe(0);
        expect(result.stderr).toContain('Skipping resume for @neo-opus-ada');
        expect(result.stderr).toContain('Wake safety gate tripped');
        expect(result.stderr).toContain('WAKE_GATE_OVERRIDE=1');
    });

    test('Wake safety gate enabled + unknown identity → gate passes; identity check exits without osascript (#10648, #10681)', async () => {
        // Always-on coverage of gate-pass logic, addressing @neo-gemini-pro's review
        // cycle 1 challenge re: the coverage gap left by skipping the live-host gate-pass test.
        // resumeHarness.mjs sequences gate check (lines 67-71) BEFORE identity lookup (lines
        // 110-116). Pairing an enabled gate with an unknown identity proves the gate let
        // execution through (no skip message) and the script then exits cleanly via the
        // unknown-identity branch — neither path reaches the osascript dispatch, so no
        // host-environment side effects.
        fs.mkdirSync(path.dirname(gatePath), {recursive: true});
        fs.writeFileSync(gatePath, JSON.stringify({state: 'enabled', reason: '', trippedAt: null, trippedBy: null}), 'utf-8');

        const result = spawnSync('node', [scriptPath, '@neo-unknown-coverage', 'test'], {
            encoding: 'utf-8',
            env     : gateOnlyEnv()
        });
        const stderrAndStdout = (result.stderr ?? '') + (result.stdout ?? '');

        // Positive assertion: gate-pass let execution through to the identity check, which
        // exits with the expected unknown-identity error (resumeHarness.mjs:114-116).
        expect(result.status).toBe(1);
        expect(stderrAndStdout).toContain('Unknown harness target for identity: @neo-unknown-coverage');
        // Negative assertion: gate didn't short-circuit the call.
        expect(stderrAndStdout).not.toContain('Wake safety gate tripped');
        expect(stderrAndStdout).not.toContain('Wake safety gate disabled');
    });

    test('Wake safety gate enabled → resumeHarness proceeds past the gate (live host — RUN_LIVE_OSASCRIPT=1 required, #10648, #10681)', async () => {
        // Live-host integration: writes enabled gate state, invokes resumeHarness with a
        // known identity, and confirms the gate doesn't short-circuit. Because the gate
        // is enabled and the identity is known, resumeHarness reaches osascript dispatch
        // — which on hosts with Claude Desktop + accessibility granted will paste the
        // boot-grounding prompt into the live app. Skipped by default to prevent the
        // 2026-05-04 09:03Z runaway-spawn pattern (forensic record).
        test.skip(!process.env.RUN_LIVE_OSASCRIPT, 'Live osascript test — paste-spawns real Claude sessions when gate is enabled; set RUN_LIVE_OSASCRIPT=1 to run (#10681)');
        fs.mkdirSync(path.dirname(gatePath), {recursive: true});
        fs.writeFileSync(gatePath, JSON.stringify({state: 'enabled', reason: '', trippedAt: null, trippedBy: null}), 'utf-8');

        const result = spawnSync('node', [scriptPath, '@neo-opus-ada', 'test'], {
            encoding: 'utf-8',
            env     : gateOnlyEnv()
        });
        const stderrAndStdout = (result.stderr ?? '') + (result.stdout ?? '');

        // Negative assertion: no gate-skip message — the gate let the call through.
        expect(stderrAndStdout).not.toContain('Wake safety gate tripped');
        expect(stderrAndStdout).not.toContain('Wake safety gate disabled');
    });

    test('Q1b fresh-session-spawn: model-family routes use safe adapters (#10611 PR-B AC1)', async () => {
        // Each model family routes to its substrate-correct fresh-session adapter. Antigravity uses
        // `antigravity chat -n`; Claude Desktop uses the osascript Cmd+3 -> Tab 3 + Cmd+N path;
        // Codex Desktop uses the live-host-gated app-server adapter. All avoid the rejected
        // prompt-layer sessionId plumbing.
        expect(resolveHarnessTargetForIdentity('@neo-gemini-pro')).toMatchObject({
            adapter: 'antigravity-cli'
        });
        expect(resolveHarnessTargetForIdentity('@neo-opus-ada')).toMatchObject({
            adapter             : 'osascript',
            appName             : 'Claude',
            tabShortcut         : '3',
            freshSessionShortcut: 'n'
        });
        expect(resolveHarnessTargetForIdentity('@neo-gpt')).toMatchObject({
            adapter: 'codex-app-server'
        });
    });

    test('Q1b fresh-session-spawn: osascript flow injects freshSessionShortcut keystroke before paste (#10611 PR-B AC1)', async () => {
        // The conditional keystroke spread injects Cmd+freshSessionShortcut after tabShortcut
        // and before the clipboard save/cut sequence — the fresh chat must exist before any
        // input-cut + paste-payload work happens.
        const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
        expect(scriptContent).toContain('...(freshSessionShortcut ? [');
        expect(scriptContent).toContain('keystroke "${freshSessionShortcut}" using command down');
    });

    test('Q1b boot-grounding prompt: payload refers to AGENTS_STARTUP.md and sandman_handoff.md (#10611 PR-B AC2)', async () => {
        // The wake payload is a boot-grounding prompt instructing the fresh
        // agent to read AGENTS_STARTUP.md + sandman_handoff.md, NOT a "Resuming sunsetted session"
        // prose payload. Static-read the prompt builder to verify the shape.
        const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
        expect(scriptContent).toContain('@AGENTS_STARTUP.md');
        expect(scriptContent).toContain('resources/content/sandman_handoff.md');
        expect(scriptContent).toContain('Origin Session ID');
        // Negative assertion: the old Q1a prose payload must be gone
        expect(scriptContent).not.toContain('Auto-Wakeup Substrate: Resuming sunsetted session.');
    });

    test('Claude recovery: osascript adapter sends Cmd+3 (Tab 3) then Cmd+N (fresh chat) before paste', async () => {
        // Locked-target shape for Claude recovery: the osascript adapter activates Claude, sends
        // Cmd+`tabShortcut` (Cmd+3 -> Code tab / Tab 3) then Cmd+`freshSessionShortcut` (Cmd+N ->
        // fresh chat) before the clipboard cut/paste of the boot-grounding prompt. The fresh chat
        // is what yields a fresh currentSessionId + transcript. Static-content verification; the
        // live runtime osascript dispatch is RUN_LIVE_OSASCRIPT-gated in the test above.
        expect(resolveHarnessTargetForIdentity('@neo-opus-ada')).toMatchObject({
            adapter             : 'osascript',
            appName             : 'Claude',
            tabShortcut         : '3',
            freshSessionShortcut: 'n'
        });
        const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
        expect(scriptContent).toContain('keystroke "${tabShortcut}" using command down');
        expect(scriptContent).toContain('keystroke "${freshSessionShortcut}" using command down');
    });

    test('wake daemon consumes shared host app defaults instead of duplicating shortcut literals (#12434)', async () => {
        const bridgePath = path.resolve(process.cwd(), 'ai/daemons/wake/daemon.mjs');
        const bridgeContent = fs.readFileSync(bridgePath, 'utf-8');

        expect(bridgeContent).toContain('applyHarnessMetadataDefaults(meta)');
        expect(bridgeContent).not.toContain("if (appName === 'Claude') tabShortcut = '3'");
        expect(bridgeContent).not.toContain("else if (appName === 'Antigravity') tabShortcut = 'shift+i'");
    });

    test('harness lifecycle: CLI-adapter spawn records PID in state-file (antigravity-cli)', async () => {
        test.skip(skipCiSubstrateData, 'CI-skip: substrate data not seeded - bucket C (#10903)');

        // Verify the cross-adapter cleanup primitive via a still-process-tracked CLI adapter
        // (antigravity-cli; Claude now routes to the process-exempt osascript adapter). After a
        // successful CLI dispatch, resumeHarness records the spawned process's PID via
        // harnessLifecycle.recordHarnessProcess — the PID the NEXT invocation SIGTERMs during cleanup.
        const harnessLifecycle = await import('../../../../../../ai/scripts/lifecycle/harnessLifecycle.mjs');
        const stateFile = harnessLifecycle.getStateFilePath('@neo-gemini-pro');
        if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);

        const mockPath = path.join(os.tmpdir(), `mock-ag-record-${randomUUID()}`);
        fs.writeFileSync(mockPath, `#!/usr/bin/env node\nprocess.exit(0);\n`, { mode: 0o755 });

        try {
            const env = { ...overrideEnv, ANTIGRAVITY_CLI_PATH: mockPath };
            execFileSync('node', [scriptPath, '@neo-gemini-pro', 'testReason'], { encoding: 'utf-8', stdio: 'pipe', env });

            // State file MUST exist post-spawn with a recorded PID.
            expect(fs.existsSync(stateFile)).toBe(true);
            const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
            expect(state.pid).toBeGreaterThan(0);
            expect(state.spawnedAt).toBeGreaterThan(0);
        } finally {
            if (fs.existsSync(mockPath)) fs.unlinkSync(mockPath);
            if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);
        }
    });

    test('harness lifecycle: stale dead PID in state-file is reaped before fresh spawn (antigravity-cli)', async () => {
        test.skip(skipCiSubstrateData, 'CI-skip: substrate data not seeded - bucket C (#10903)');

        // Pre-populate the state file with a clearly-dead PID (well above pid_max), then run
        // resumeHarness via a process-tracked CLI adapter (antigravity-cli). The cleanup primitive
        // should detect ESRCH and proceed with a fresh spawn — cleanup never blocks fresh-spawn on
        // missing/dead PIDs.
        const harnessLifecycle = await import('../../../../../../ai/scripts/lifecycle/harnessLifecycle.mjs');
        const stateFile = harnessLifecycle.getStateFilePath('@neo-gemini-pro');
        const stalePid = 999999; // way above typical pid_max
        await import('fs/promises').then(({writeFile, mkdir}) => mkdir(path.dirname(stateFile), {recursive: true})
            .then(() => writeFile(stateFile, JSON.stringify({pid: stalePid, spawnedAt: Date.now() - 60000}))));

        const mockPath = path.join(os.tmpdir(), `mock-ag-stale-${randomUUID()}`);
        const outPath = path.join(os.tmpdir(), `out-ag-stale-${randomUUID()}`);
        fs.writeFileSync(mockPath, `#!/usr/bin/env node\nconst fs = require('fs');\nfs.writeFileSync('${outPath}', JSON.stringify(process.argv.slice(2)));\n`, { mode: 0o755 });

        try {
            const env = { ...overrideEnv, ANTIGRAVITY_CLI_PATH: mockPath };
            execFileSync('node', [scriptPath, '@neo-gemini-pro', 'testReason'], { encoding: 'utf-8', stdio: 'pipe', env });

            // Spawn proceeded — output file written.
            expect(fs.existsSync(outPath)).toBe(true);
            // State-file was overwritten with the new spawn's PID (not the stale 999999).
            expect(fs.existsSync(stateFile)).toBe(true);
            const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
            expect(state.pid).not.toBe(stalePid);
            expect(state.pid).toBeGreaterThan(0);
        } finally {
            if (fs.existsSync(mockPath)) fs.unlinkSync(mockPath);
            if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
            if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);
        }
    });

    test('Antigravity CLI: adapter executes chat -n <payload> via ANTIGRAVITY_CLI_PATH (#10680)', async () => {
        test.skip(skipCiSubstrateData, 'CI-skip: substrate data not seeded - bucket C (#10903)');

        // Create a mock executable to capture the command shape without launching the real IDE.
        // The env override exercises the cross-platform adapter path without depending on
        // host-specific Antigravity installs.
        const mockPath = path.join(os.tmpdir(), `mock-ag-${randomUUID()}`);
        const outPath = path.join(os.tmpdir(), `out-ag-${randomUUID()}`);
        fs.writeFileSync(mockPath, `#!/usr/bin/env node\nconst fs = require('fs');\nfs.writeFileSync('${outPath}', JSON.stringify(process.argv.slice(2)));\n`, { mode: 0o755 });

        try {
            const env = { ...overrideEnv, ANTIGRAVITY_CLI_PATH: mockPath };
            execFileSync('node', [scriptPath, '@neo-gemini-pro', 'testReason'], { encoding: 'utf-8', stdio: 'pipe', env });

            expect(fs.existsSync(outPath)).toBe(true);
            const args = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
            expect(args[0]).toBe('chat');
            expect(args[1]).toBe('-n');
            expect(args[2]).toContain('@AGENTS_STARTUP.md');
            expect(args[2]).toContain('testReason');
        } finally {
            if (fs.existsSync(mockPath)) fs.unlinkSync(mockPath);
            if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
        }
    });

    test('Antigravity CLI: win32 uses native adapter after .cmd execution support (#11767)', async () => {
        const { selectHarnessAdapter } = await import('../../../../../../ai/scripts/lifecycle/resumeHarness.mjs');

        expect(selectHarnessAdapter({ adapter: 'antigravity-cli' }, 'linux')).toBe('antigravity-cli');
        expect(selectHarnessAdapter({ adapter: 'antigravity-cli' }, 'darwin')).toBe('antigravity-cli');
        expect(selectHarnessAdapter({ adapter: 'antigravity-cli' }, 'win32')).toBe('antigravity-cli');
        expect(selectHarnessAdapter({ adapter: 'claude-cli' }, 'linux')).toBe('tmux');
        expect(selectHarnessAdapter({ adapter: 'claude-cli' }, 'darwin')).toBe('claude-cli');
    });

    test('Antigravity CLI: Windows .cmd dispatch uses cmd.exe with escaped payload data (#11767)', async () => {
        const {
            buildWindowsBatchCommandLine,
            createSpawnRequest,
            quoteWindowsBatchArgument
        } = await import('../../../../../../ai/scripts/lifecycle/windowsBatchSpawn.mjs');

        const cmd  = 'C:\\Program Files\\Antigravity\\bin\\antigravity.cmd',
              args = ['chat', '-n', 'payload \\path & %PATH% | < > ^ ! "quoted"\r\nnext'];

        const request = createSpawnRequest(
            cmd,
            args,
            'win32'
        );

        expect(request.cmd).toMatch(/(?:cmd\.exe|cmd)$/i);
        expect(request.args).toEqual([
            '/d',
            '/s',
            '/v:off',
            '/c',
            buildWindowsBatchCommandLine(cmd, args)
        ]);
        expect(request.options).toEqual({stdio: 'ignore'});
        expect(request.options).not.toHaveProperty('shell');
        expect(request.options).not.toHaveProperty('windowsVerbatimArguments');
        expect(quoteWindowsBatchArgument(args[2])).toBe('"payload \\path ^& ^%PATH^% ^| ^< ^> ^^ ^! ^"quoted^"  next"');
    });

    test('Antigravity CLI: non-batch spawn requests keep direct dispatch (#11775)', async () => {
        const { createSpawnRequest } = await import('../../../../../../ai/scripts/lifecycle/windowsBatchSpawn.mjs');

        expect(createSpawnRequest('/usr/local/bin/antigravity', ['chat'], 'linux')).toEqual({
            cmd    : '/usr/local/bin/antigravity',
            args   : ['chat'],
            options: {stdio: 'ignore'}
        });
        expect(createSpawnRequest('C:\\Program Files\\Antigravity\\bin\\antigravity.exe', ['chat'], 'win32')).toEqual({
            cmd    : 'C:\\Program Files\\Antigravity\\bin\\antigravity.exe',
            args   : ['chat'],
            options: {stdio: 'ignore'}
        });
    });

    test('Antigravity CLI: missing executable reports actionable path diagnostic (#10684)', async () => {
        test.skip(skipCiSubstrateData, 'CI-skip: substrate data not seeded - bucket C (#10903)');

        const missingPath = path.join(os.tmpdir(), `missing-ag-${randomUUID()}`);

        try {
            const env = { ...overrideEnv, ANTIGRAVITY_CLI_PATH: missingPath };
            execFileSync('node', [scriptPath, '@neo-gemini-pro', 'testReason'], { encoding: 'utf-8', stdio: 'pipe', env });
            test.fail('Should have exited with a missing Antigravity CLI diagnostic');
        } catch (e) {
            expect(e.status).toBe(1);
            const stderr = e.stderr.toString();
            expect(stderr).toContain('Failed to resume @neo-gemini-pro via antigravity-cli');
            expect(stderr).toContain('ANTIGRAVITY_CLI_PATH points to missing executable');
            expect(stderr).toContain(missingPath);
        }
    });

    test('Codex app-server: default live-host path fails closed without opt-in or mock (#10679)', async () => {
        test.skip(process.platform !== 'darwin', 'Codex Desktop app-server adapter is currently mac-specific');
        test.skip(skipCiSubstrateData, 'CI-skip: substrate data not seeded - bucket C (#10903)');

        const { getLockPath } = await import('../../../../../../ai/scripts/lifecycle/inflightLock.mjs');
        const lockPath = getLockPath('sunset_restart', '@neo-gpt');
        if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);

        try {
            execFileSync('node', [scriptPath, '@neo-gpt', 'testReason'], {encoding: 'utf-8', stdio: 'pipe', env: overrideEnv});
            test.fail('Should have exited with error');
        } catch (e) {
            expect(e.status).toBe(1);
            expect(e.stderr).toContain('Failed to resume @neo-gpt via codex-app-server');
            expect(e.stderr).toContain('RUN_LIVE_CODEX_APP_SERVER=1');

            // The adapter writes the inflight lock before action, then clears it on fail-closed exit.
            expect(fs.existsSync(lockPath)).toBe(false);
        } finally {
            if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
        }
    });

    test('Codex app-server: adapter executes send-message-v2 <payload> via CODEX_CLI_PATH mock (#10679)', async () => {
        test.skip(process.platform !== 'darwin', 'Codex Desktop app-server adapter is currently mac-specific');
        test.skip(skipCiSubstrateData, 'CI-skip: substrate data not seeded - bucket C (#10903)');

        const mockPath = path.join(os.tmpdir(), `mock-codex-${randomUUID()}`);
        const outPath = path.join(os.tmpdir(), `out-codex-${randomUUID()}`);
        fs.writeFileSync(mockPath, `#!/usr/bin/env node\nconst fs = require('fs');\nfs.writeFileSync('${outPath}', JSON.stringify(process.argv.slice(2)));\n`, { mode: 0o755 });

        try {
            const env = { ...overrideEnv, CODEX_APP_SERVER_MOCK: '1', CODEX_CLI_PATH: mockPath };
            execFileSync('node', [scriptPath, '@neo-gpt', 'testReason'], { encoding: 'utf-8', stdio: 'pipe', env });

            expect(fs.existsSync(outPath)).toBe(true);
            const args = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
            expect(args[0]).toBe('debug');
            expect(args[1]).toBe('app-server');
            expect(args[2]).toBe('send-message-v2');
            expect(args[3]).toContain('@AGENTS_STARTUP.md');
            expect(args[3]).toContain('testReason');
        } finally {
            if (fs.existsSync(mockPath)) fs.unlinkSync(mockPath);
            if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
        }
    });

    test('TMUX_SESSION precedence honors harnessTarget.tmuxSession over process.env', async () => {
        // Read script statically to verify precedence logic
        const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
        expect(scriptContent).toContain("const tmuxSession = harnessTarget.tmuxSession || process.env.TMUX_SESSION || 'neo-agent';");
    });

    test('adapter failure clears the inflight lock (antigravity-cli failure path)', async () => {
        test.skip(skipCiSubstrateData, 'CI-skip: substrate data not seeded - bucket C (#10903)');

        // Substrate-correct lock-clear-on-failure invariant, exercised via a process-tracked CLI
        // adapter (antigravity-cli; Claude now routes to osascript). A missing antigravity binary
        // makes the adapter throw AFTER the in-flight lock is written -> resumeHarness catch block
        // clears the lock -> the next interval can retry without waiting for BOOT_TIMEOUT_MS.
        const missingAgCli = path.join(os.tmpdir(), `missing-ag-fail-${randomUUID()}`);

        const { getLockPath } = await import('../../../../../../ai/scripts/lifecycle/inflightLock.mjs');
        const lockPath = getLockPath('sunset_restart', '@neo-gemini-pro');
        if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);

        const env = { ...overrideEnv, ANTIGRAVITY_CLI_PATH: missingAgCli };
        try {
            execFileSync('node', [scriptPath, '@neo-gemini-pro', 'test'], {encoding: 'utf-8', stdio: 'pipe', env});
            test.fail('Should have exited with error');
        } catch (e) {
            expect(e.status).toBe(1);
            expect(e.stderr).toMatch(/Failed to resume @neo-gemini-pro via antigravity-cli/);

            // Lock cleared per lock-clear-on-failure invariant.
            expect(fs.existsSync(lockPath)).toBe(false);
        } finally {
            if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
        }
    });

    test('Verify-effect spec test: pre-restart sessionId X; post-restart first add_memory carries sessionId Y where X !== Y (#10676)', async () => {
        // This spec test enforces the verification that a fresh session MUST generate
        // a completely new session ID natively via the MCP client boot sequence.
        // It validates that the grounding prompt omits `set_session_id(...)` logic,
        // which forces the new agent to naturally generate Session Y !== Session X.
        // The substring match is anchored to the call shape `set_session_id(` rather
        // than the bare term — JSDoc references that explain WHY we avoid the call
        // (e.g., substrate-correct framing) are permitted.
        const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
        expect(scriptContent).not.toContain('set_session_id(');
        expect(scriptContent).toContain('Origin Session ID');
    });

    test('Negative test: subprocess in-process singleton mutation alone is INSUFFICIENT (#10676)', async () => {
        // Explicit anti-pattern test carrying forward the substrate-truth.
        // Modifying a session singleton inside this script would only affect the temporary
        // checkSunsetted/resumeHarness heartbeat node process, NOT the actual
        // long-lived IDE MCP client process.
        // Therefore we strictly delegate to out-of-process harness adapters and ensure
        // no in-process session mutation exists.
        const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
        expect(scriptContent).toContain('resolveHarnessTargetForIdentity(identity)');
        expect(scriptContent).not.toMatch(/currentSessionId\s*=/);
    });
});
