#!/usr/bin/env node
/**
 * @summary Phase 1/2 Harness Resume Adapter for Auto-Wakeup Substrate (Epic #10601).
 *
 * This script delivers a wake-up prompt to a specified agent identity's harness.
 * It encapsulates the `osascript` (macOS) and `tmux` delivery mechanisms,
 * implementing the `harnessResumeStrategy` for Phase 2 readiness.
 */
import { spawn } from 'child_process';
import aiConfig from '../mcp/server/memory-core/config.mjs';

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
    const payload = `Auto-Wakeup Substrate: Resuming sunsetted session. Reason: ${reason}`;
    
    // For Phase 1, we map identities to their known harness targets.
    // In Phase 2, this will be dynamically retrieved from the Memory Core 
    // AgentIdentity nodes or configuration.
    const identityMap = {
        '@neo-gemini-3-1-pro': { appName: 'Antigravity', adapter: 'osascript' },
        '@neo-opus-4-7': { appName: 'Claude', adapter: 'osascript' },
        '@neo-gpt': { appName: 'Codex', adapter: 'osascript' }
    };
    
    const harnessTarget = identityMap[identity];
    
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
            const tmuxSession = process.env.TMUX_SESSION || 'neo-agent';
            await spawnAsync('tmux', ['send-keys', '-t', tmuxSession, payload, 'C-m']);
            console.log(`Successfully resumed ${identity} via tmux (${tmuxSession})`);
        }
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
