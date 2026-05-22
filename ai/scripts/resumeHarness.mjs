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
import { constants as fsConstants } from 'fs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { readGateState, hasOverride } from './wakeSafetyGate.mjs';
import { writeInflightLock, clearInflightLock } from './inflightLock.mjs';
import { recordHarnessProcess, terminatePreviousHarness } from './harnessLifecycle.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/**
 * @summary Spawn a child process and (optionally) record its PID for later harness cleanup.
 *
 * When `identity` is provided, the spawned PID is persisted via
 * `harnessLifecycle.recordHarnessProcess` immediately after `spawn()` returns,
 * BEFORE awaiting close. This captures the PID even if the spawned process is
 * a long-lived interactive harness (Claude Code CLI, Antigravity IDE) whose
 * `close` event never fires within the spawner's lifetime. Recording is best-
 * effort — failures are logged but do not abort the spawn. The close/error
 * settlement still waits for the bookkeeping promise, so fast-exiting mock
 * adapters cannot race process exit before lifecycle state is persisted.
 *
 * @param {string} cmd
 * @param {string[]} args
 * @param {?string} identity Agent identity for PID-record bookkeeping; pass `null` to skip.
 * @returns {Promise<void>}
 */
function spawnAsync(cmd, args, identity = null) {
    return new Promise((resolve, reject) => {
        const proc = spawn(cmd, args, { stdio: 'ignore' });
        let recordPromise = Promise.resolve();

        if (identity && proc.pid) {
            recordPromise = recordHarnessProcess(identity, proc.pid).catch(err => {
                console.warn(`[harnessLifecycle] Failed to record PID for ${identity}: ${err.message}`);
            });
        }

        proc.on('close', code => {
            recordPromise.then(() => {
                if (code === 0) resolve();
                else reject(new Error(`${cmd} exited with code ${code}`));
            });
        });
        proc.on('error', err => {
            recordPromise.then(() => reject(err));
        });
    });
}

/**
 * @summary Resolve the embedded Claude Code CLI binary path inside Claude Desktop.
 *
 * Claude Desktop ships the `claude` CLI under
 * `~/Library/Application Support/Claude/claude-code/<version>/claude.app/Contents/MacOS/claude`.
 * The version segment changes with auto-updates, so we resolve the LATEST version
 * dynamically rather than hardcoding a specific build (which would silently break
 * the substrate after every Claude Desktop update). Operator-override via
 * `CLAUDE_CLI_PATH` env var supports test-mock injection (per #10681 discipline)
 * and explicit pinning if needed.
 *
 * Substrate-truth anchor (#10677): the spawner passes NO `--session-id` flag.
 * `claude <prompt>` invocation creates a fresh process with a fresh MCP client
 * connection, which yields a fresh `currentSessionId` by construction. The
 * architectural goal of harness restart is precisely to eliminate spawner-side
 * sessionId management — fresh process = fresh server = fresh session.
 * `--session-id` is for *resuming* a specific session, the opposite of what
 * recovery needs.
 *
 * @returns {Promise<?string>} Absolute path to the Claude Code CLI, or `null`
 *   if neither the env-var override nor the dynamic resolution succeeds.
 */
async function resolveClaudeCliPath() {
    if (process.env.CLAUDE_CLI_PATH) return process.env.CLAUDE_CLI_PATH;
    const appSupport = path.join(os.homedir(), 'Library/Application Support/Claude/claude-code');
    try {
        const versions = await fs.readdir(appSupport);
        if (versions.length === 0) return null;
        // Numeric-aware sort so 2.1.121 ranks ABOVE 2.1.99 (lexicographic sort gets this wrong).
        const latest = versions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop();
        return path.join(appSupport, latest, 'claude.app/Contents/MacOS/claude');
    } catch (err) {
        return null;
    }
}

/**
 * @summary Resolve the Codex CLI binary used by the Codex Desktop app-server adapter.
 *
 * The default `codex` executable is intentionally overridable for tests via
 * `CODEX_CLI_PATH`. Specs pair the override with `CODEX_APP_SERVER_MOCK=1`
 * to capture the command shape without creating a real Codex Desktop thread.
 *
 * @returns {string} The Codex CLI command or test override path.
 */
function resolveCodexCliPath() {
    return process.env.CODEX_CLI_PATH || 'codex';
}

/**
 * @summary Check whether a candidate CLI path exists and is executable.
 *
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function fileIsExecutable(filePath) {
    try {
        await fs.access(filePath, fsConstants.X_OK);
        return true;
    } catch (err) {
        return false;
    }
}

/**
 * @summary Resolve the first executable match for a command on PATH.
 *
 * @param {string} command
 * @returns {Promise<?string>} Absolute executable path, or `null` when absent.
 */
async function findExecutableOnPath(command) {
    const pathEntries = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
    const extensions = process.platform === 'win32' && !path.extname(command)
        ? ['.cmd', '.exe', '.bat', '']
        : [''];

    for (const entry of pathEntries) {
        for (const extension of extensions) {
            const candidate = path.join(entry, `${command}${extension}`);
            if (await fileIsExecutable(candidate)) return candidate;
        }
    }

    return null;
}

/**
 * @summary Resolve the Antigravity CLI across host platforms.
 *
 * `ANTIGRAVITY_CLI_PATH` is the authoritative override for tests and unusual
 * installs. Otherwise, macOS uses the known app-bundle path, Windows tries the
 * common user-local install shape, and every platform falls back to PATH lookup.
 *
 * @returns {Promise<string>} Absolute path to an Antigravity CLI executable.
 */
async function resolveAntigravityCliPath() {
    if (process.env.ANTIGRAVITY_CLI_PATH) {
        if (await fileIsExecutable(process.env.ANTIGRAVITY_CLI_PATH)) return process.env.ANTIGRAVITY_CLI_PATH;
        throw new Error(`ANTIGRAVITY_CLI_PATH points to missing executable: ${process.env.ANTIGRAVITY_CLI_PATH}`);
    }

    const candidates = [];

    if (process.platform === 'darwin') {
        candidates.push('/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity');
    } else if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
        candidates.push(
            path.join(process.env.LOCALAPPDATA, 'Programs', 'Antigravity', 'bin', 'antigravity.cmd'),
            path.join(process.env.LOCALAPPDATA, 'Programs', 'Antigravity', 'resources', 'app', 'bin', 'antigravity.cmd')
        );
    }

    const pathCandidate = await findExecutableOnPath('antigravity');
    if (pathCandidate) candidates.push(pathCandidate);

    for (const candidate of candidates) {
        if (await fileIsExecutable(candidate)) return candidate;
    }

    throw new Error(
        `Antigravity CLI not found for platform ${process.platform}. ` +
        'Set ANTIGRAVITY_CLI_PATH to the executable path, or install `antigravity` on PATH.'
    );
}

/**
 * @summary Fail-closed guard for the live Codex Desktop app-server adapter.
 *
 * `codex debug app-server send-message-v2` creates/injects into a real Codex
 * Desktop thread. Per #10679 and #10682, live-host probes must require an
 * explicit operator opt-in. Unit tests satisfy this guard with
 * `CODEX_APP_SERVER_MOCK=1` plus `CODEX_CLI_PATH` pointing at a mock
 * executable, preserving always-on coverage without host side effects.
 */
function assertCodexAppServerAllowed() {
    const hasLiveOptIn = process.env.RUN_LIVE_CODEX_APP_SERVER === '1';
    const hasMockOptIn = process.env.CODEX_APP_SERVER_MOCK === '1' && Boolean(process.env.CODEX_CLI_PATH);

    if (!hasLiveOptIn && !hasMockOptIn) {
        throw new Error(
            'Codex app-server adapter is a live-host action. Set RUN_LIVE_CODEX_APP_SERVER=1 ' +
            'for an operator-controlled probe, or set CODEX_APP_SERVER_MOCK=1 with CODEX_CLI_PATH in tests.'
        );
    }
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

/**
 * @summary Resume a sunsetted agent by dispatching the configured fresh-session harness adapter.
 * @param {String} identity Agent identity to resume.
 * @param {String} reason Human-readable recovery reason.
 * @param {String} originSessionId Prior Memory Core session anchor, if known.
 * @param {Number} [abandonedCount=0] Prior abandoned wake action count for lock bookkeeping.
 * @returns {Promise<void>}
 */
export async function resumeHarness(identity, reason, originSessionId, abandonedCount = 0) {
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
    // 'antigravity-ide' utilizes its native CLI `chat -n` via the `antigravity-cli` adapter (#10678 / #10680).
    // 'claude-desktop' utilizes the embedded Claude Code CLI via the `claude-cli` adapter
    //   (#10677). Substrate-truth: spawner passes NO sessionId flag — fresh `claude <prompt>`
    //   process boots a fresh MCP client + fresh `currentSessionId` by construction. This is
    //   precisely what makes harness restart eliminate the spawner-side sessionId management
    //   that #10627's prompt-layer plumbing tried (and failed structurally) to achieve.
    // 'codex-desktop' utilizes Codex Desktop's app-server debug surface via
    //   `codex debug app-server send-message-v2` (#10679). This adapter is deliberately
    //   live-host-gated: normal tests use CODEX_APP_SERVER_MOCK=1 + CODEX_CLI_PATH
    //   mocks, while real probes require RUN_LIVE_CODEX_APP_SERVER=1 until target-thread
    //   Memory Core health + first-memory session identity proof has been captured.
    //
    // The legacy `osascript` adapter dispatch (Cmd+N keystroke into running Claude Desktop)
    // is preserved as a fallback for harnesses that may need it; no production identity
    // currently routes there. See the Q1b fresh-session-spawn references (#10611 PR-B) for
    // the historical context.
    const HARNESS_REGISTRY = {
        'antigravity-ide': { adapter: 'antigravity-cli' },
        'claude-desktop':  { adapter: 'claude-cli' },
        'codex-desktop':   { adapter: 'codex-app-server' }
    };

    const identityMap = {
        '@neo-gemini-3-1-pro': 'antigravity-ide',
        '@neo-gpt'           : 'codex-desktop',
        '@neo-opus-4-7'      : 'claude-desktop'
    };

    const targetId = identityMap[identity];
    const harnessTarget = targetId ? HARNESS_REGISTRY[targetId] : null;

    if (!harnessTarget) {
        throw new Error(`Unknown harness target for identity: ${identity}`);
    }

    const adapter = harnessTarget.adapter === 'antigravity-cli'
        ? harnessTarget.adapter
        : process.platform === 'darwin' ? harnessTarget.adapter : 'tmux';

    // Write the inflight lock BEFORE taking action to secure the boot ramp (Issue #10674)
    await writeInflightLock(identity, 'sunset_restart', abandonedCount);

    // Cross-adapter cleanup: terminate the previous harness process for this identity BEFORE
    // spawning the new one. Sunset-mode restart spawns fresh processes (claude-cli, antigravity-cli);
    // without cleanup, repeated sunsets accumulate stale processes and orphan windows. Applies to
    // CLI-spawning adapters; the legacy osascript Cmd+N adapter (which targeted the same app
    // instance, no leak surface) and Codex app-server adapter (which creates/injects a thread
    // through the already-running Codex Desktop app-server) are exempt. Per #10696 review point 2.
    // Explicitly scoped to 'sunset_restart' ONLY per @tobiu mandate.
    if (reason === 'sunset_restart' && adapter !== 'codex-app-server' && adapter !== 'osascript' && adapter !== 'tmux') {
        const cleanup = await terminatePreviousHarness(identity);
        if (cleanup.terminated) {
            const escalation = cleanup.escalated ? `, escalated to ${cleanup.escalated}` : '';
            console.log(`[harnessLifecycle] Terminated previous ${identity} process (PID=${cleanup.pid}${escalation})`);
        } else if (cleanup.reason !== 'no-prior-state' && cleanup.reason !== 'already-dead') {
            console.warn(`[harnessLifecycle] Could not terminate previous ${identity} process: ${cleanup.reason}`);
        }
    }

    try {
        if (adapter === 'antigravity-cli') {
            /**
             * @anchor antigravity-cli-path-resolution
             * @summary Cross-platform Antigravity CLI resolution for fresh-session spawn.
             */
            const cliPath = await resolveAntigravityCliPath();
            const args = ['chat', '-n', payload];
            await spawnAsync(cliPath, args, identity);
            console.log(`Successfully resumed ${identity} via antigravity-cli`);
        } else if (adapter === 'claude-cli') {
            /**
             * @anchor claude-cli-mac-specific
             * @summary Embedded Claude Code CLI inside Claude Desktop (`~/Library/Application Support/Claude/...`).
             *
             * Substrate-truth: invoking `claude <prompt>` with NO flags spawns a fresh process
             * which establishes a fresh MCP client connection, which means a fresh
             * `SessionService.currentSessionId` by construction. The whole point of harness
             * restart is to get fresh state for free — spawner-side sessionId enforcement
             * (`--session-id <uuid>`) would defeat the architectural goal by reintroducing
             * the same sessionId management that prompt-layer plumbing in #10627 tried.
             *
             * `--session-id` is for *resuming* a specific session, the opposite of what
             * recovery needs. Fresh process = fresh session, no flag required.
             *
             * Path resolves dynamically across Claude Desktop auto-updates via `resolveClaudeCliPath()`.
             * Operator override `CLAUDE_CLI_PATH` env var supports test-mock injection per #10681
             * `RUN_LIVE_OSASCRIPT` discipline parallel.
             *
             * @todo Abstract for cross-platform execution (Windows/Linux) — sibling concern to #10684.
             * @todo Empirically verify whether `claude <prompt>` lands as Claude Desktop Tab 3
             *   ("Code" tab) or a terminal-attached CLI session. Either satisfies the
             *   fresh-process / fresh-MCP / fresh-session substrate goal, but the operator
             *   surface differs. Document the observed shape post-verification.
             */
            const cliPath = await resolveClaudeCliPath();
            if (!cliPath) {
                throw new Error(
                    'Claude CLI not found. Set CLAUDE_CLI_PATH env var or install Claude Desktop ' +
                    '(expects ~/Library/Application Support/Claude/claude-code/<version>/claude.app/Contents/MacOS/claude)'
                );
            }
            const args = [payload];
            await spawnAsync(cliPath, args, identity);
            console.log(`Successfully resumed ${identity} via claude-cli`);
        } else if (adapter === 'codex-app-server') {
            /**
             * @anchor codex-app-server-live-host-gate
             * @summary Codex Desktop app-server thread injection via `send-message-v2`.
             *
             * `send-message-v2` is a prompt-injection primitive, not yet a complete
             * recovery proof. The earlier #10679 probe showed it can create a fresh
             * Codex Desktop thread and deliver the prompt, but target-thread Memory
             * Core startup failed. Until a live proof captures healthy post-spawn
             * Memory Core plus a first `add_memory` sessionId change, the adapter
             * remains fail-closed for real hosts via `RUN_LIVE_CODEX_APP_SERVER=1`.
             *
             * Tests use `CODEX_APP_SERVER_MOCK=1` plus `CODEX_CLI_PATH` to point at a
             * mock executable, verifying the command shape without creating real Codex
             * threads.
             */
            assertCodexAppServerAllowed();
            const cliPath = resolveCodexCliPath();
            const args = ['debug', 'app-server', 'send-message-v2', payload];
            await spawnAsync(cliPath, args);
            console.log(`Successfully resumed ${identity} via codex-app-server`);
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
        throw err;
    }
}

async function main() {
    const identity        = process.argv[2];
    const reason          = process.argv[3] || 'Scheduled interval recovery';
    const originSessionId = process.argv[4] || ''; // Optional; populated by checkSunsetted post-#10611
    const abandonedCount  = parseInt(process.argv[5], 10) || 0;

    if (!identity) {
        console.error('Usage: resumeHarness.mjs <identity> [reason] [originSessionId] [abandonedCount]');
        process.exit(1);
    }

    await resumeHarness(identity, reason, originSessionId, abandonedCount);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMain) {
    main().catch(err => {
        console.error('Unexpected error:', err.message);
        process.exit(1);
    });
}
