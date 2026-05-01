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

    test('Opus identity routes to tmux with claude-code session', async () => {
        try {
            execFileSync('node', [scriptPath, '@neo-opus-4-7', 'test'], { encoding: 'utf-8', stdio: 'pipe' });
        } catch (e) {
            // It might fail because tmux is not running or no session named 'claude-code'
            // We just want to check if it attempted to use tmux with claude-code
            const output = e.stderr + e.stdout;
            // Depending on if tmux is installed or not, the error could be "tmux exited with code X" or "ENOENT"
            expect(output).toContain('Failed to resume @neo-opus-4-7 via tmux:');
        }

        // Let's verify the script content as a static fallback check
        const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
        expect(scriptContent).toContain("'claude-code-cli': { adapter: 'tmux', tmuxSession: 'claude-code' }");
        expect(scriptContent).toContain("'@neo-opus-4-7': 'claude-code-cli'");
    });

    test('GPT identity routes to tmux with codex session', async () => {
        const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
        expect(scriptContent).toContain("'codex-desktop': { adapter: 'tmux', tmuxSession: 'codex' }");
        expect(scriptContent).toContain("'@neo-gpt': 'codex-desktop'");
    });

    test('TMUX_SESSION precedence honors harnessTarget.tmuxSession over process.env', async () => {
        // Read script statically to verify precedence logic
        const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
        expect(scriptContent).toContain("const tmuxSession = harnessTarget.tmuxSession || process.env.TMUX_SESSION || 'neo-agent';");
    });
});
