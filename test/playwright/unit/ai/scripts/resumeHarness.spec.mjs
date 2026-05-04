import {setup} from '../../../setup.mjs';

const appName = 'ResumeHarnessTest';

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

test.describe('ai/scripts/resumeHarness', () => {
    const scriptPath = path.resolve(process.cwd(), 'ai/scripts/resumeHarness.mjs');
    const cooldownDir = path.resolve(process.cwd(), '.neo-ai-data/wake-daemon');

    /**
     * Per-test gate-file path via the `WAKE_GATE_FILE_PATH` env-var override
     * (production unset, tests set explicitly). Avoids the singleton-on-disk
     * collision when this spec runs in parallel with `wakeSafetyGate.spec.mjs`.
     *
     * `overrideEnv` — for tests that pre-date #10648 and just need to exercise
     * the unknown-identity / cooldown / osascript surfaces without the gate
     * blocking. Sets both an isolated gate path AND `WAKE_GATE_OVERRIDE=1`.
     *
     * `gateOnlyEnv()` — for tests targeting the gate behavior itself; isolates
     * the gate path but leaves `WAKE_GATE_OVERRIDE` unset so the default-tripped
     * / explicitly-enabled paths can be exercised.
     *
     * Live-host opt-in (#10681): tests that fire the REAL `osascript` paste path
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
                    fs.unlinkSync(path.join(cooldownDir, file));
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

    test('Opus identity routes to claude-desktop adapter via HARNESS_REGISTRY (config check)', async () => {
        // Static script-content check: HARNESS_REGISTRY shape post-#10611 PR-B
        // includes the freshSessionShortcut primitive (Cmd+N) re-introduced for Q1b fresh-session-spawn.
        // Always-on coverage — no host side effects. Live runtime exec sibling
        // ('Opus identity osascript runtime dispatch') is gated behind RUN_LIVE_OSASCRIPT=1.
        const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
        expect(scriptContent).toContain("'claude-desktop':  { appName: 'Claude',      adapter: 'osascript', freshSessionShortcut: 'n', tabShortcut: '3' }");
        expect(scriptContent).toContain("'@neo-opus-4-7': 'claude-desktop'");
    });

    test('Opus identity osascript runtime dispatch (live host — RUN_LIVE_OSASCRIPT=1 required, #10681)', async () => {
        // Live-host integration: invokes real `osascript` which on hosts with Claude Desktop
        // + System Events accessibility granted will paste the boot-grounding prompt into the
        // live app and spawn a real Claude Code session. Skipped by default to prevent the
        // 2026-05-04 09:03Z runaway-spawn pattern (see #10681 forensic record).
        test.skip(!process.env.RUN_LIVE_OSASCRIPT, 'Live osascript test — paste-spawns real Claude sessions on hosts with accessibility granted; set RUN_LIVE_OSASCRIPT=1 to run (#10681)');
        try {
            execFileSync('node', [scriptPath, '@neo-opus-4-7', 'test'], {encoding: 'utf-8', stdio: 'pipe', env: overrideEnv});
        } catch (e) {
            // It might fail if osascript fails to activate Claude or System Events isn't permitted
            const output = e.stderr + e.stdout;
            expect(output).toContain('Failed to resume @neo-opus-4-7 via osascript:');
        }
    });

    test('Wake safety gate tripped + no override → resumeHarness skips with explicit stderr (#10648)', async () => {
        // Default-tripped state (no gate file → deny-by-default per wakeSafetyGate.mjs).
        // resumeHarness must skip BEFORE any cooldown / harness lookup / osascript work,
        // and emit a stderr message naming the gate state and the override env-var.
        // spawnSync (vs execFileSync) captures stderr on success-exit too — gate-skip
        // is exit 0 (defensive no-op, not an error).
        const result = spawnSync('node', [scriptPath, '@neo-opus-4-7', 'test'], {
            encoding: 'utf-8',
            env     : gateOnlyEnv()  // No WAKE_GATE_OVERRIDE — exercising default-tripped path on isolated gate file
        });
        expect(result.status).toBe(0);
        expect(result.stderr).toContain('Skipping resume for @neo-opus-4-7');
        expect(result.stderr).toContain('Wake safety gate tripped');
        expect(result.stderr).toContain('WAKE_GATE_OVERRIDE=1');
    });

    test('Wake safety gate enabled + unknown identity → gate passes; identity check exits without osascript (#10648, #10681)', async () => {
        // Always-on coverage of gate-pass logic, addressing @neo-gemini-3-1-pro's PR #10682
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
        // 2026-05-04 09:03Z runaway-spawn pattern (see #10681 forensic record).
        test.skip(!process.env.RUN_LIVE_OSASCRIPT, 'Live osascript test — paste-spawns real Claude sessions when gate is enabled; set RUN_LIVE_OSASCRIPT=1 to run (#10681)');
        fs.mkdirSync(path.dirname(gatePath), {recursive: true});
        fs.writeFileSync(gatePath, JSON.stringify({state: 'enabled', reason: '', trippedAt: null, trippedBy: null}), 'utf-8');

        const result = spawnSync('node', [scriptPath, '@neo-opus-4-7', 'test'], {
            encoding: 'utf-8',
            env     : gateOnlyEnv()
        });
        const stderrAndStdout = (result.stderr ?? '') + (result.stdout ?? '');

        // Negative assertion: no gate-skip message — the gate let the call through.
        expect(stderrAndStdout).not.toContain('Wake safety gate tripped');
        expect(stderrAndStdout).not.toContain('Wake safety gate disabled');
    });

    test('Q1b fresh-session-spawn: HARNESS_REGISTRY entries include freshSessionShortcut (#10611 PR-B AC1)', async () => {
        // Re-introduces the Cmd+N primitive that #10607 Cycle 5 removed. Both Antigravity
        // and Claude Desktop entries must carry freshSessionShortcut for the corrected substrate.
        const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
        expect(scriptContent).toContain("'antigravity-ide': { appName: 'Antigravity', adapter: 'osascript', freshSessionShortcut: 'n' }");
        expect(scriptContent).toMatch(/'claude-desktop':\s+\{[^}]*freshSessionShortcut: 'n'/);
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
        // Per #10611 PR-B, the wake payload is a boot-grounding prompt instructing the fresh
        // agent to read AGENTS_STARTUP.md + sandman_handoff.md, NOT a "Resuming sunsetted session"
        // prose payload. Static-read the prompt builder to verify the shape.
        const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
        expect(scriptContent).toContain('@AGENTS_STARTUP.md');
        expect(scriptContent).toContain('resources/content/sandman_handoff.md');
        expect(scriptContent).toContain('Origin Session ID');
        // Negative assertion: the old Q1a prose payload must be gone
        expect(scriptContent).not.toContain('Auto-Wakeup Substrate: Resuming sunsetted session.');
    });

    test('TMUX_SESSION precedence honors harnessTarget.tmuxSession over process.env', async () => {
        // Read script statically to verify precedence logic
        const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
        expect(scriptContent).toContain("const tmuxSession = harnessTarget.tmuxSession || process.env.TMUX_SESSION || 'neo-agent';");
    });
});
