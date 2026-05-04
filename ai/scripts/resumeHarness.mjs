#!/usr/bin/env node
/**
 * @summary Fresh-Session-Spawn Harness Resume Adapter for Auto-Wakeup Substrate (Epic #10601, #10611 PR-B corrective).
 *
 * This script implements the **Q1b fresh-session-spawn** primitive per @tobiu's verbatim
 * operator-intent correction (2026-05-02): sunset is terminal for the old transcript;
 * recovery preserves trio coordination by opening a NEW chat session in the target
 * harness (Cmd+N or equivalent) and pasting a boot-grounding prompt instructing the
 * fresh agent to read AGENTS_STARTUP.md first.
 *
 * Per #10611 PR-B, this replaces the prior Q1a in-place wake injection (#10602/#10607)
 * which keystroke-injected a "resuming sunsetted session" prose payload into the SAME
 * chat that just executed sunset — empirically inverted from operator intent.
 *
 * @see ai/scripts/checkSunsetted.mjs (caller; supplies originSessionId)
 * @see ai/scripts/swarm-heartbeat.sh (orchestrator; routes Phase 1 Recovery)
 * @see AGENTS.md §14 PRE-DECISION SUNSET GATE (recovery-substrate cross-reference)
 * @see .agents/skills/session-sunset/references/session-sunset-workflow.md §1
 */
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { readGateState, hasOverride } from './wakeSafetyGate.mjs';
import { writeInflightLock, clearInflightLock } from './inflightLock.mjs';

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

/**
 * Build a boot-grounding prompt that instructs the fresh agent to read
 * AGENTS_STARTUP.md and pick up prior context via Memory Core + sandman_handoff.
 * @param {string} identity        Agent identity (e.g. '@neo-opus-4-7').
 * @param {string} reason          Human-readable sunset cause from checkSunsetted.
 * @param {string} originSessionId Memory Core session ID of the just-sunsetted run; falsy → omitted gracefully.
 * @returns {string} The full prompt body that will be pasted into the fresh chat.
 */
function buildBootGroundingPrompt(identity, reason, originSessionId) {
    const sessionAnchor = originSessionId
        ? `Origin Session ID: ${originSessionId}.`
        : 'Origin Session ID unavailable in recovery payload — pull most recent SUNSET-tagged memory for this identity instead.';
    return [
        `hi ${identity}, please read @AGENTS_STARTUP.md, then call add_memory once as a boot heartbeat, then proceed normally.`,
        `Recovery context: ${reason}.`,
        `${sessionAnchor} Read resources/content/sandman_handoff.md and your Memory Core context to resume trio coordination from the prior session anchor.`
    ].join(' ');
}

async function resumeHarness(identity, reason, originSessionId, abandonedCount = 0) {
    // Wake safety gate (#10648, child of #10647). Direct fresh-session-spawn
    // invocations must also fail-closed when the substrate is unsafe — the
    // gate is consulted alongside (and ahead of) the existing cooldown. The
    // operator override `WAKE_GATE_OVERRIDE=1` bypasses the gate; the
    // procedure for setting it lives in #10650 restart/incident protocol.
    if (hasOverride()) {
        console.error('[OVERRIDE] WAKE_GATE_OVERRIDE set; bypassing wake safety gate for resumeHarness.');
    } else {
        const gate = await readGateState();
        if (gate.state !== 'enabled') {
            console.error(`Skipping resume for ${identity}: Wake safety gate ${gate.state} (reason: ${gate.reason}). Set WAKE_GATE_OVERRIDE=1 to override.`);
            return;
        }
    }

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

    // Q1b boot-grounding prompt — replaces the Q1a "Resuming sunsetted session" prose
    // payload that #10607 Cycle 5 shipped. Per #10611, the fresh agent boots via
    // AGENTS_STARTUP.md and re-anchors prior context via Memory Core + sandman_handoff.
    const payload = buildBootGroundingPrompt(identity, reason, originSessionId);

    // Harness Registry: Maps identity IDs to their corresponding restart adapter.
    // 'antigravity-ide' utilizes its native CLI `chat -n` via the `antigravity-cli` adapter.
    // 'claude-desktop' utilizes `osascript` to inject Cmd+N (`freshSessionShortcut`) keystrokes.
    // Codex Desktop deferred until @neo-gpt confirms its restart primitive.
    const HARNESS_REGISTRY = {
        'antigravity-ide': { adapter: 'antigravity-cli' },
        'claude-desktop':  { appName: 'Claude',      adapter: 'osascript', freshSessionShortcut: 'n', tabShortcut: '3' }
    };

    const identityMap = {
        '@neo-gemini-3-1-pro': 'antigravity-ide',
        '@neo-opus-4-7': 'claude-desktop'
    };

    const targetId = identityMap[identity];
    const harnessTarget = targetId ? HARNESS_REGISTRY[targetId] : null;

    if (!harnessTarget) {
        console.error(`Unknown harness target for identity: ${identity}`);
        process.exit(1);
    }

    const adapter = process.platform === 'darwin' ? harnessTarget.adapter : 'tmux';

    // Write the inflight lock BEFORE taking action to secure the boot ramp (Issue #10674)
    await writeInflightLock(identity, 'sunset_restart', abandonedCount);

    try {
        if (adapter === 'antigravity-cli') {
            /**
             * @anchor antigravity-cli-mac-specific
             * @summary Hardcoded path relies on Mac OS Application Bundle structure.
             * @todo Abstract for cross-platform execution (Windows/Linux) per Issue #10684.
             */
            const cliPath = process.env.ANTIGRAVITY_CLI_PATH || '/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity';
            const args = ['chat', '-n', payload];
            await spawnAsync(cliPath, args);
            console.log(`Successfully resumed ${identity} via antigravity-cli`);
        } else if (adapter === 'osascript') {
            const { appName, tabShortcut, freshSessionShortcut } = harnessTarget;
            // Q1b fresh-session-spawn flow per #10611:
            //   1. Activate target app
            //   2. (Optional) Cmd+`tabShortcut` — get to the right tab (Code tab = Cmd+3 for Claude Desktop)
            //   3. Cmd+`freshSessionShortcut` — spawn a NEW chat session (Cmd+N for Antigravity + Claude Desktop).
            //      This is the primitive #10607 Cycle 5 removed and #10611 PR-B re-introduces.
            //   4. Save clipboard / cut input — focus-steal protection per #10422
            //   5. Paste boot-grounding prompt (now refers to AGENTS_STARTUP.md, not "resuming sunsetted session")
            //   6. Press Enter (Key Code 36) — established in bridge-daemon.mjs
            //   7. Restore user input + clipboard
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
                ...(tabShortcut ? [
                '-e', `      keystroke "${tabShortcut}" using command down`,
                '-e', '      delay 0.2'
                ] : []),
                ...(freshSessionShortcut ? [
                '-e', `      keystroke "${freshSessionShortcut}" using command down`,
                '-e', '      delay 0.5'
                ] : []),
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
            const tmuxSession = harnessTarget.tmuxSession || process.env.TMUX_SESSION || 'neo-agent';
            await spawnAsync('tmux', ['send-keys', '-t', tmuxSession, payload, 'C-m']);
            console.log(`Successfully resumed ${identity} via tmux (${tmuxSession})`);
        }

        // Write the cooldown file
        await fs.writeFile(cooldownFile, Date.now().toString());
    } catch (err) {
        console.error(`Failed to resume ${identity} via ${adapter}: ${err.message}`);
        await clearInflightLock(identity, 'sunset_restart');
        process.exit(1);
    }
}

const identity        = process.argv[2];
const reason          = process.argv[3] || 'Scheduled interval recovery';
const originSessionId = process.argv[4] || ''; // Optional; populated by checkSunsetted post-#10611
const abandonedCount  = parseInt(process.argv[5], 10) || 0;

if (!identity) {
    console.error('Usage: resumeHarness.mjs <identity> [reason] [originSessionId] [abandonedCount]');
    process.exit(1);
}

resumeHarness(identity, reason, originSessionId, abandonedCount).catch(err => {
    console.error('Unexpected error:', err.message);
    process.exit(1);
});
