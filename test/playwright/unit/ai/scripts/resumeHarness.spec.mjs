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

import {test, expect} from '@playwright/test';
import {execFileSync} from 'child_process';
import path from 'path';
import fs from 'fs';

test.describe('ai/scripts/resumeHarness', () => {
    const scriptPath = path.resolve(process.cwd(), 'ai/scripts/resumeHarness.mjs');
    const cooldownDir = path.resolve(process.cwd(), '.neo-ai-data/wake-daemon');

    test.beforeEach(() => {
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

    test('Unknown identity exits with code 1 and unknown message', async () => {
        try {
            execFileSync('node', [scriptPath, '@neo-unknown', 'test'], { encoding: 'utf-8', stdio: 'pipe' });
            test.fail('Should have exited with error');
        } catch (e) {
            expect(e.status).toBe(1);
            expect(e.stderr).toContain('Unknown harness target for identity: @neo-unknown');
        }
    });

    test('Opus identity routes to osascript with claude-desktop, freshSessionShortcut n, and tabShortcut 3', async () => {
        try {
            execFileSync('node', [scriptPath, '@neo-opus-4-7', 'test'], { encoding: 'utf-8', stdio: 'pipe' });
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
