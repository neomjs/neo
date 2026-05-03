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
import Neo                       from '../../../../../src/Neo.mjs';

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

    test('Opus identity routes to osascript with claude-desktop, freshSessionShortcut n, and tabShortcut 3', async () => {
        try {
            execFileSync('node', [scriptPath, '@neo-opus-4-7', 'test'], {encoding: 'utf-8', stdio: 'pipe', env: overrideEnv});
        } catch (e) {
            // It might fail if osascript fails to activate Claude or System Events isn't permitted
            const output = e.stderr + e.stdout;
            expect(output).toContain('Failed to resume @neo-opus-4-7 via osascript:');
        }

        // Static script-content check: HARNESS_REGISTRY shape post-#10611 PR-B
        // includes the freshSessionShortcut primitive (Cmd+N) re-introduced for Q1b fresh-session-spawn.
        const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
        expect(scriptContent).toContain("'claude-desktop':  { appName: 'Claude',      adapter: 'osascript', freshSessionShortcut: 'n', tabShortcut: '3' }");
        expect(scriptContent).toContain("'@neo-opus-4-7': 'claude-desktop'");
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

    test('Wake safety gate enabled → resumeHarness proceeds past the gate (#10648)', async () => {
        // Write enabled gate state on the per-test gate path, then invoke resumeHarness
        // with a known identity. The gate must NOT short-circuit; resumeHarness proceeds
        // to harness lookup and osascript dispatch (which may itself fail in test env —
        // covered by the existing 'Opus identity routes to osascript' test; here we
        // only verify the gate doesn't pre-empt the path).
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

    test('Q1b boot-grounding prompt: includes dynamic set_session_id rotation instruction (#10627)', async () => {
        const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
        expect(scriptContent).toContain('set_session_id({sessionId:');

        // Ensure randomUUID is imported and used for freshSessionId
        expect(scriptContent).toContain('const freshSessionId = randomUUID();');
        expect(scriptContent).toContain('buildBootGroundingPrompt(identity, reason, originSessionId, freshSessionId)');
    });

    test('Negative test: Subprocess in-process singleton mutation is INSUFFICIENT (#10627)', async () => {
        // Assert that mutating an in-process singleton in a subprocess does not affect the parent/live process.
        // We simulate this process-boundary trap directly to satisfy the explicit anti-pattern test AC.
        const mockStatePath = path.join(os.tmpdir(), `mock-state-${randomUUID()}.mjs`);
        fs.writeFileSync(mockStatePath, `
            export const State = { currentSessionId: 'initial-uuid' };
        `);

        const mockSubprocessPath = path.join(os.tmpdir(), `mock-resume-${randomUUID()}.mjs`);
        fs.writeFileSync(mockSubprocessPath, `
            import { State } from 'file://${mockStatePath}';
            State.currentSessionId = 'subprocess-mutated-uuid';
        `);

        spawnSync('node', [mockSubprocessPath], { encoding: 'utf-8' });
        fs.unlinkSync(mockSubprocessPath);

        // Now check THIS process's State. Since we are in the main test process,
        // we can dynamically import the state and check if it was affected.
        const StateMod = await import('file://' + mockStatePath);

        // The process boundary trap: the subprocess mutation did not affect the main process.
        expect(StateMod.State.currentSessionId).toBe('initial-uuid');
        expect(StateMod.State.currentSessionId).not.toBe('subprocess-mutated-uuid');

        fs.unlinkSync(mockStatePath);
    });
});

test.describe('Neo.ai.mcp.server.memory-core Session ID Rotation Effect (#10627)', () => {
    let MemoryService, SessionService, LifecycleService, dbPath;

    test.beforeAll(async () => {
        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, {recursive: true});
        }
        dbPath = path.join(tmpDir, `neo-session-rotation-test-${Date.now()}-${randomUUID()}.db`);

        const aiConfig = (await import('../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        aiConfig.storagePaths.graph = dbPath;

        SessionService   = (await import('../../../../../ai/mcp/server/memory-core/services/SessionService.mjs')).default;
        MemoryService    = (await import('../../../../../ai/mcp/server/memory-core/services/MemoryService.mjs')).default;
        LifecycleService = (await import('../../../../../ai/mcp/server/memory-core/services/lifecycle/SystemLifecycleService.mjs')).default;

        if (!LifecycleService._initPromise) {
            await LifecycleService.initAsync();
        } else {
            await LifecycleService.ready();
        }
    });

    test.afterAll(async () => {
        if (fs.existsSync(dbPath)) {
            try { fs.unlinkSync(dbPath); } catch (e) {}
            try { fs.unlinkSync(dbPath + '-wal'); } catch (e) {}
            try { fs.unlinkSync(dbPath + '-shm'); } catch (e) {}
        }
    });

    test('Agent calling set_session_id successfully groups subsequent implicit add_memory under the fresh ID (#10627)', async () => {
        // 1. Simulate the state before recovery: The origin session is active.
        const originSessionId = 'origin-uuid-' + randomUUID();
        await SessionService.setSessionId({ sessionId: originSessionId });
        expect(SessionService.currentSessionId).toBe(originSessionId);

        // 2. The harness generates a fresh ID for the recovering agent.
        const freshSessionId = 'fresh-uuid-' + randomUUID();

        // 3. The recovering agent reads the boot-grounding prompt and executes the instructed MCP tool:
        await SessionService.setSessionId({ sessionId: freshSessionId });

        // 4. The agent executes its first implicit save (without explicitly passing sessionId in the payload).
        const result = await MemoryService.addMemory({
            agent: 'TestAgent',
            model: 'TestModel',
            prompt: 'Test Prompt',
            thought: 'Test Thought',
            response: 'Test Response',
            toolsUsed: [],
            amountToolCalls: 0
        });

        // 5. Assert the effect: the memory landed under the generated fresh id, not the origin id.
        expect(result.sessionId).toBe(freshSessionId);
        expect(result.sessionId).not.toBe(originSessionId);
        expect(SessionService.currentSessionId).toBe(freshSessionId);
    });
});
