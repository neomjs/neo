#!/usr/bin/env node
/**
 * @summary Fresh-session harness resume adapter for the auto-wakeup substrate.
 *
 * This script implements the fresh-session-spawn primitive: a sunsetted transcript
 * is terminal, so recovery preserves swarm coordination by opening a new chat session
 * in the target harness and pasting a boot-grounding prompt that starts from
 * AGENTS_STARTUP.md.
 *
 * @see ai/scripts/lifecycle/checkSunsetted.mjs (caller; supplies originSessionId)
 * @see ai/daemons/SwarmHeartbeatService.mjs
 * @see .agents/skills/session-sunset/references/session-sunset-workflow.md §1
 * @plane host
 */
import Neo                                                from '../../../src/Neo.mjs';
import * as core                                          from '../../../src/core/_export.mjs';
import AiConfig                                           from '../../config.mjs';
import { spawn }                                          from 'child_process';
import { constants as fsConstants }                       from 'fs';
import fs                                                 from 'fs/promises';
import os                                                 from 'os';
import path                                               from 'path';
import { fileURLToPath }                                  from 'url';
import { readGateState, hasOverride }                     from './wakeSafetyGate.mjs';
import { writeInflightLock, clearInflightLock }           from './inflightLock.mjs';
import { recordHarnessProcess, terminatePreviousHarness } from './harnessLifecycle.mjs';
import { createSpawnRequest }                             from './windowsBatchSpawn.mjs';
import {
    resolveGuiInstanceAddress,
    resolveGuiInstancePid
} from '../../daemons/wake/instanceResolver.mjs';
import {
    resolveHarnessTargetForIdentity
} from './harnessRouting.mjs';
import {normalizeAgentIdentityNodeId} from '../../graph/normalizeAgentIdentityNodeId.mjs';

export {normalizeAgentIdentityNodeId};

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
 * @param {string} [hostPlatform=process.platform]
 * @returns {Promise<void>}
 */
function spawnAsync(cmd, args, identity = null, hostPlatform = process.platform) {
    return new Promise((resolve, reject) => {
        const spawnRequest  = createSpawnRequest(cmd, args, hostPlatform);
        const proc          = spawn(spawnRequest.cmd, spawnRequest.args, spawnRequest.options);
        let   recordPromise = Promise.resolve();

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
 * NOTE: retained as a non-routed fallback — Claude recovery routes to the `osascript`
 * adapter (Claude Desktop Tab 3 / Code tab); see the harness routing note in `resumeHarness`.
 *
 * Claude Desktop ships the `claude` CLI under
 * `~/Library/Application Support/Claude/claude-code/<version>/claude.app/Contents/MacOS/claude`.
 * The version segment changes with auto-updates, so we resolve the LATEST version
 * dynamically rather than hardcoding a specific build (which would silently break
 * the substrate after every Claude Desktop update). Operator-override via
 * `CLAUDE_CLI_PATH` env var supports test-mock injection
 * and explicit pinning if needed.
 *
 * The spawner passes no `--session-id` flag.
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
    const extensions  = process.platform === 'win32' && !path.extname(command)
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
 * @summary Select the runtime harness adapter for the current host platform.
 *
 * Antigravity keeps its native CLI path across host platforms; Windows batch
 * wrappers are handled by `createSpawnRequest()`.
 *
 * @param {Object} harnessTarget
 * @param {string} harnessTarget.adapter
 * @param {string} [hostPlatform=process.platform]
 * @returns {string}
 */
export function selectHarnessAdapter(harnessTarget, hostPlatform = process.platform) {
    if (harnessTarget.adapter === 'antigravity-cli') {
        return harnessTarget.adapter;
    }

    return hostPlatform === 'darwin' ? harnessTarget.adapter : 'tmux';
}

/**
 * @summary Fail-closed guard for the live Codex Desktop app-server adapter.
 *
 * `codex debug app-server send-message-v2` creates/injects into a real Codex
 * Desktop thread. Live-host probes must require an explicit operator opt-in.
 * Unit tests satisfy this guard with `CODEX_APP_SERVER_MOCK=1` plus the canonical
 * `NEO_FLEET_CODEX_BIN` config-leaf override pointing at a mock executable, preserving always-on
 * coverage without host side effects.
 */
function assertCodexAppServerAllowed() {
    const hasLiveOptIn = process.env.RUN_LIVE_CODEX_APP_SERVER === '1';
    const hasMockOptIn = process.env.CODEX_APP_SERVER_MOCK === '1' &&
        Boolean(process.env.NEO_FLEET_CODEX_BIN);

    if (!hasLiveOptIn && !hasMockOptIn) {
        throw new Error(
            'Codex app-server adapter is a live-host action. Set RUN_LIVE_CODEX_APP_SERVER=1 ' +
            'for an operator-controlled probe, or set CODEX_APP_SERVER_MOCK=1 with ' +
            'NEO_FLEET_CODEX_BIN in tests.'
        );
    }
}

/**
 * @summary Resolve the instance-address tuple for an osascript resume.
 *
 * Caller-provided wake-subscription metadata wins over the CLI/manual environment envelope. This
 * keeps the central heartbeat path identity-specific while preserving the existing direct-script
 * escape hatch for operator probes.
 *
 * @param {Object} [options]
 * @param {Object} [options.metadata={}] Wake route metadata (`instanceAddress` + `addressType`,
 *     or legacy `userDataDir`).
 * @param {Object} [options.env=process.env] Environment map for direct CLI invocations.
 * @returns {{instanceAddress:String,addressType:String}|null}
 */
export function resolveResumeHarnessInstanceAddress({metadata = {}, env = process.env} = {}) {
    return resolveGuiInstanceAddress({metadata, env, target: 'resumeHarness'});
}

/**
 * @summary Resolve an osascript-addressable process id for a configured resume instance.
 *
 * An explicit instance address is a safety boundary: missing/stale processes throw instead of
 * falling back to app activation, because app activation is ambiguous across same-bundle Claude
 * instances.
 *
 * @param {Object} options
 * @param {String} options.instanceAddress
 * @param {String} options.addressType `userDataDir` or `pid`.
 * @param {Function} [options.getInstancePidFn=getInstancePid] Injectable resolver for tests.
 * @returns {Promise<Number>}
 */
export async function resolveResumeHarnessInstancePid({
    instanceAddress,
    addressType,
    deploymentMode,
    getInstancePidFn
} = {}) {
    return resolveGuiInstancePid({
        instanceAddress,
        addressType,
        deploymentMode,
        getInstancePidFn,
        target : 'resumeHarness',
        appName: 'Claude'
    });
}

/**
 * @summary Builds the fresh-session boot prompt used by resume recovery.
 *
 * Instructs the fresh agent to read AGENTS_STARTUP.md, persist a meaningful
 * non-empty boot heartbeat, and pick up prior context via Memory Core + sandman_handoff.
 * @param {string} identity        Agent identity (e.g. '@neo-opus-ada').
 * @param {string} reason          Human-readable sunset cause from checkSunsetted.
 * @param {string} originSessionId Memory Core session ID of the just-sunsetted run; falsy → omitted gracefully.
 * @returns {string} The full prompt body that will be pasted into the fresh chat.
 */
function buildBootGroundingPrompt(identity, reason, originSessionId) {
    const sessionAnchor = originSessionId
        ? `Origin Session ID: ${originSessionId}.`
        : 'Origin Session ID unavailable in recovery payload — pull most recent SUNSET-tagged memory for this identity instead.';
    return [
        `hi ${identity}, please read @AGENTS_STARTUP.md, then call add_memory once as a boot heartbeat with explicit non-empty prompt/thought/response fields (for example: prompt="Boot heartbeat for ${identity}", thought="Fresh recovery boot after AGENTS_STARTUP.md read; Memory Core write-path health check.", response="Boot heartbeat saved; continuing recovery."), then proceed normally.`,
        `Recovery context: ${reason}.`,
        `${sessionAnchor} Read resources/content/sandman_handoff.md and your Memory Core context to resume swarm coordination from the prior session anchor.`
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
export async function resumeHarness(identity, reason, originSessionId, abandonedCount = 0, {
    deploymentMode,
    env                   = process.env,
    harnessTargetMetadata = {}
} = {}) {
    identity = normalizeAgentIdentityNodeId(identity);

    // Direct fresh-session-spawn invocations must fail closed when the wake
    // substrate is unsafe. The gate is consulted alongside and ahead of the
    // cooldown. The operator override bypasses the gate for controlled recovery.
    if (hasOverride()) {
        console.error('[OVERRIDE] WAKE_GATE_OVERRIDE set; bypassing wake safety gate for resumeHarness.');
    } else {
        const gate = await readGateState();
        if (gate.state !== 'enabled') {
            console.error(`Skipping resume for ${identity}: Wake safety gate ${gate.state} (reason: ${gate.reason}). Set WAKE_GATE_OVERRIDE=1 to override.`);
            return;
        }
    }

    // Idempotency: resolve the cooldown beside this script so cron/launchd callers
    // share the same 600s re-fire window regardless of their current working directory.
    const cooldownDir  = path.resolve(__dirname, '../../../.neo-ai-data/wake-daemon');
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

    // Boot-grounding prompt for a fresh transcript. The fresh agent starts from
    // AGENTS_STARTUP.md and re-anchors prior context via Memory Core + sandman_handoff.
    const payload = buildBootGroundingPrompt(identity, reason, originSessionId);

    // Harness routing derives identity IDs from `identityRoots.mjs` via `harnessRouting.mjs`.
    // - antigravity-ide: native CLI `chat -n` through the `antigravity-cli` adapter.
    // - claude-desktop: Claude Desktop GUI through the `osascript` adapter — activate
    //   Claude, Cmd+3 to the Code tab (Tab 3), Cmd+N for a fresh chat, then paste the
    //   boot-grounding prompt. Locks the recovery target to Claude Desktop Tab 3 per
    //   the operator calibration ("Claude Desktop in 2026, third tab = Claude Code;
    //   that is the target, not terminal-attached CLI"). The fresh chat yields a fresh
    //   `SessionService.currentSessionId` + transcript (the load-bearing recovery goal);
    //   it reuses the running Claude Desktop app + its MCP server rather than spawning a
    //   fresh OS process — the accepted trade-off for deterministic Tab-3 targeting. The
    //   same osascript Cmd+3 path is empirically proven by live bridge-daemon wake delivery.
    // - codex-desktop: Codex Desktop app-server debug surface through
    //   `codex debug app-server send-message-v2`; live dispatch remains explicitly
    //   gated, while tests use CODEX_APP_SERVER_MOCK=1 + NEO_FLEET_CODEX_BIN.
    // The `claude-cli` adapter (embedded `claude <prompt>` CLI) is retained as a
    // non-routed fallback; no production identity routes there after the Tab-3 remap.
    const harnessTarget = resolveHarnessTargetForIdentity(identity);

    if (!harnessTarget) {
        throw new Error(`Unknown harness target for identity: ${identity}`);
    }

    const adapter = selectHarnessAdapter(harnessTarget);

    // Write the inflight lock before taking action to secure the boot ramp.
    await writeInflightLock(identity, 'sunset_restart', abandonedCount);

    // Cross-adapter cleanup: sunset_restart replaces the previous CLI-spawned
    // harness process before starting a fresh one, preventing stale processes and
    // orphan windows. UI-keystroke and app-server adapters are exempt because they
    // reuse an already-running host application instead of creating a tracked child
    // process.
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
            const args    = ['chat', '-n', payload];
            await spawnAsync(cliPath, args, identity);
            console.log(`Successfully resumed ${identity} via antigravity-cli`);
        } else if (adapter === 'claude-cli') {
            /**
             * @anchor claude-cli-mac-specific
             * @summary Embedded Claude Code CLI inside Claude Desktop (`~/Library/Application Support/Claude/...`).
             *
             * Invoking `claude <prompt>` with no flags spawns a fresh process, which
             * establishes a fresh MCP client connection and therefore a fresh
             * `SessionService.currentSessionId`. Spawner-side sessionId enforcement
             * (`--session-id <uuid>`) would defeat the restart contract by reusing a
             * prior transcript.
             *
             * `--session-id` is for *resuming* a specific session, the opposite of what
             * recovery needs. Fresh process = fresh session, no flag required.
             *
             * Path resolves dynamically across Claude Desktop auto-updates via `resolveClaudeCliPath()`.
             * Operator override `CLAUDE_CLI_PATH` env var supports test-mock injection.
             *
             * @todo Abstract for cross-platform execution (Windows/Linux).
             *
             * NOTE: the Tab-3-vs-terminal ambiguity this branch once carried is resolved.
             * `claude-desktop` now routes to the `osascript` adapter, which deterministically
             * targets Claude Desktop Tab 3 (Code tab) via Cmd+3 — see the Harness Registry
             * note above. This `claude-cli` branch is retained only as a non-routed fallback;
             * no identity maps to it.
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
             * `send-message-v2` can create a fresh Codex Desktop thread and deliver
             * the boot prompt. Live dispatch remains fail-closed until the target
             * thread proves healthy Memory Core startup plus a first `add_memory`
             * sessionId change.
             *
             * Tests use `CODEX_APP_SERVER_MOCK=1` plus a mock `NEO_FLEET_CODEX_BIN`,
             * verifying the command shape without creating real Codex threads.
             */
            assertCodexAppServerAllowed();
            const cliPath = AiConfig.fleet.harnessBinaries.codex;
            const args    = ['debug', 'app-server', 'send-message-v2', payload];
            await spawnAsync(cliPath, args);
            console.log(`Successfully resumed ${identity} via codex-app-server`);
        } else if (adapter === 'osascript') {
            const { appName, tabShortcut, freshSessionShortcut } = harnessTarget;
            const instanceAddress                                = resolveResumeHarnessInstanceAddress({metadata: harnessTargetMetadata, env});
            const instancePid                                    = instanceAddress
                ? await resolveResumeHarnessInstancePid({
                    ...instanceAddress,
                    deploymentMode
                })
                : null;
            // Fresh-session spawn flow:
            //   1. Activate target app
            //      - With an explicit instance address, raise the resolved PID before any keystrokes.
            //   2. (Optional) Cmd+`tabShortcut` — get to the right tab (Code tab = Cmd+3 for Claude Desktop)
            //   3. Cmd+`freshSessionShortcut` — spawn a NEW chat session (Cmd+N for Antigravity + Claude Desktop).
            //      This creates a new chat instead of writing into the sunsetted one.
            //   4. Save clipboard / cut input — focus-steal protection
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
                ...(instancePid ? [
                '-e', '  delay 0.2',
                '-e', `  tell application "System Events" to set frontmost of (first process whose unix id is ${instancePid}) to true`
                ] : []),
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
            console.log(`Successfully resumed ${identity} via osascript (${appName}${instancePid ? ` pid=${instancePid}` : ''})`);
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
    const originSessionId = process.argv[4] || ''; // Optional; populated by checkSunsetted.
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
