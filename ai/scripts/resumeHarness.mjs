#!/usr/bin/env node
/**
 * @summary Phase 1/2 Harness Resume Adapter for Auto-Wakeup Substrate (Epic #10601).
 *
 * This script delivers a wake-up prompt to a specified agent identity's harness.
 * It encapsulates the `osascript` (macOS) and `tmux` delivery mechanisms,
 * implementing the `harnessResumeStrategy` for Phase 2 readiness.
 */
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function spawnAsync(cmd, args) {
    return new Promise((resolve, reject) => {
        const proc = spawn(cmd, args, { stdio: 'ignore' });
        proc.on('close', code => {
            if (code === 0) resolve();
            else reject(new Error(`${cmd} exited with code ${code}`));
        });
        proc.on('error', reject);
    });
}

async function resumeHarness(identity, reason) {
    // Blocker 1: Idempotency (cooldown file + 600s minimum re-fire window)
    // Fix: Resolve from __dirname instead of process.cwd() to support cron/launchd
    const cooldownDir = path.resolve(__dirname, '../../.neo-ai-data/wake-daemon');
    const cooldownFile = path.resolve(cooldownDir, `cooldown-${identity.replace(/[^a-zA-Z0-9_-]/g, '')}.txt`);

    try {
        await fs.mkdir(cooldownDir, { recursive: true });
        const stats = await fs.stat(cooldownFile);
        const ageMs = Date.now() - stats.mtimeMs;
        if (ageMs < 600 * 1000) {
            console.log(`Skipping resume for ${identity}: Cooldown active (${Math.round(ageMs/1000)}s / 600s)`);
            return;
        }
    } catch (e) {
        // File doesn't exist or other error, proceed
    }

    const payload = `Auto-Wakeup Substrate: Resuming sunsetted session. Reason: ${reason}`;

    // Harness Registry resolving the enum to specific executable paths/scripts
    const HARNESS_REGISTRY = {
        'antigravity-ide': { appName: 'Antigravity', adapter: 'osascript' },
        'claude-code-cli': { adapter: 'tmux', tmuxSession: 'claude-code' },
        'codex-desktop': { adapter: 'tmux', tmuxSession: 'codex' }
    };

    const identityMap = {
        '@neo-gemini-3-1-pro': 'antigravity-ide',
        '@neo-opus-4-7': 'claude-code-cli',
        '@neo-gpt': 'codex-desktop'
    };

    const targetId = identityMap[identity];
    const harnessTarget = targetId ? HARNESS_REGISTRY[targetId] : null;

    if (!harnessTarget) {
        console.error(`Unknown harness target for identity: ${identity}`);
        process.exit(1);
    }

    const adapter = process.platform === 'darwin' ? harnessTarget.adapter : 'tmux';

    try {
        if (adapter === 'osascript') {
            const { appName } = harnessTarget;
            // Uses the "Key Code 36 (Enter) Defense" established in bridge-daemon.mjs
            const osascriptArgs = [
                '-e', 'on run argv',
                '-e', '  set wakePayload to (item 1 of argv)',
                '-e', '  try',
                '-e', '    set savedClipboard to the clipboard as string',
                '-e', '  on error',
                '-e', '    set savedClipboard to ""',
                '-e', '  end try',
                '-e', `  tell application "${appName}" to activate`,
                '-e', '  delay 0.5',
                '-e', '  tell application "System Events"',
                '-e', '    set frontmostProcess to first application process whose frontmost is true',
                '-e', '    tell frontmostProcess',
                '-e', '      set the clipboard to ""',
                '-e', '      keystroke "a" using command down',
                '-e', '      delay 0.2',
                '-e', '      keystroke "x" using command down',
                '-e', '      delay 0.2',
                '-e', '    end tell',
                '-e', '  end tell',
                '-e', '  try',
                '-e', '    set userInput to the clipboard as string',
                '-e', '  on error',
                '-e', '    set userInput to ""',
                '-e', '  end try',
                '-e', '  set the clipboard to wakePayload',
                '-e', '  delay 0.2',
                '-e', '  tell application "System Events"',
                '-e', '    set frontmostProcess to first application process whose frontmost is true',
                '-e', '    tell frontmostProcess',
                '-e', '      keystroke "v" using command down',
                '-e', '      delay 0.5',
                '-e', '      key code 36',
                '-e', '      delay 1.0',
                '-e', '    end tell',
                '-e', '  end tell',
                '-e', '  if userInput is not "" then',
                '-e', '    set the clipboard to userInput',
                '-e', '    delay 0.2',
                '-e', '    tell application "System Events"',
                '-e', '      set frontmostProcess to first application process whose frontmost is true',
                '-e', '      tell frontmostProcess',
                '-e', '        keystroke "v" using command down',
                '-e', '      end tell',
                '-e', '    end tell',
                '-e', '  end if',
                '-e', '  delay 0.5',
                '-e', '  set the clipboard to savedClipboard',
                '-e', 'end run',
                payload
            ];

            await spawnAsync('osascript', osascriptArgs);
            console.log(`Successfully resumed ${identity} via osascript (${appName})`);
        } else if (adapter === 'tmux') {
            // Provide tmux fallback
            const tmuxSession = process.env.TMUX_SESSION || harnessTarget.tmuxSession || 'neo-agent';
            await spawnAsync('tmux', ['send-keys', '-t', tmuxSession, payload, 'C-m']);
            console.log(`Successfully resumed ${identity} via tmux (${tmuxSession})`);
        }

        // Write the cooldown file
        await fs.writeFile(cooldownFile, Date.now().toString());
    } catch (err) {
        console.error(`Failed to resume ${identity} via ${adapter}: ${err.message}`);
        process.exit(1);
    }
}

const identity = process.argv[2];
const reason = process.argv[3] || 'Scheduled interval recovery';

if (!identity) {
    console.error('Usage: resumeHarness.mjs <identity> [reason]');
    process.exit(1);
}

resumeHarness(identity, reason).catch(err => {
    console.error('Unexpected error:', err.message);
    process.exit(1);
});
