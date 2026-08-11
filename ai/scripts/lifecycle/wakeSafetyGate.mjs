#!/usr/bin/env node
/**
 * @summary Wake safety gate / circuit breaker.
 *
 * Fail-closed coordination primitive that scheduler/recovery paths
 * (the Orchestrator swarm-heartbeat lane, `resumeHarness.mjs`) MUST consult before taking any
 * high-authority action (fresh-session-spawn, swarm wake dispatch, heartbeat-pulse
 * delivery to a harness UI). When wake delivery is unsafe or unverified, the
 * scheduler MUST no-op and report — not spawn, steer, or paste.
 *
 * The wake substrate has multiple layers: A2A storage, unread/list, bootstrap,
 * coalescing, bridge adapter, prompt landing, fresh-session recovery, and
 * heartbeat. Validating one layer in isolation does not prove the loop is
 * healthy. This gate is the cross-layer envelope that stops the scheduler from
 * acting while any high-authority delivery layer is unsafe or unverified.
 *
 * The gate state lives in a JSON file under `.neo-ai-data/wake-daemon/` so
 * operators can inspect / toggle it without running JS. States:
 *
 *   - `enabled`  — substrate validated; high-authority actions permitted
 *   - `disabled` — substrate intentionally taken offline (e.g. operator
 *                  pause for maintenance); actions denied without override
 *   - `tripped`  — unsafe signal observed (e.g. orphan spawn, payload
 *                  landed in editor file, subscription bootstrap stale);
 *                  actions denied without override; reason recorded
 *
 * **Default state when the file is absent: `tripped`** with the
 * post-incident reason. This honors the deny-by-default discipline:
 * forgetting to create the file MUST NOT be interpreted as permission
 * to act. Operators must explicitly write `enabled` after validating
 * the cross-harness prompt-landing matrix or providing an accepted-risk
 * operator override through the restart/incident protocol.
 *
 * **Operator override** lives in the `WAKE_GATE_OVERRIDE` environment
 * variable. When set to `1` (or any truthy non-empty value), consumer
 * code bypasses the gate check. This is operator-only.
 *
 * @see ai/daemons/SwarmHeartbeatService.mjs — gate consumer for heartbeat high-authority dispatch
 * @see ai/scripts/lifecycle/resumeHarness.mjs     — gate consumer (direct fresh-session-spawn)
 * @see ai/scripts/lifecycle/checkSunsetted.mjs    — companion predicate
 * @see test/playwright/unit/ai/scripts/wakeSafetyGate.spec.mjs
 * @plane in-plane
 */
import fs                from 'fs/promises';
import path              from 'path';
import { fileURLToPath } from 'url';
import {writeFileAtomic} from '../../services/shared/atomicFileWrite.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the canonical state-file path under the wake-daemon data directory.
 * Resolved from `__dirname` rather than `process.cwd()` so the path is stable
 * under cron / launchd / sub-process invocations that don't inherit the
 * working directory of the operator's shell.
 *
 * Tests may override the path via the `WAKE_GATE_FILE_PATH` environment
 * variable so parallel specs don't collide on the singleton on-disk state.
 * Production deployments leave this unset; the canonical path applies.
 *
 * @returns {string} Absolute path to the gate state file.
 */
export function gateFilePath() {
    return process.env.WAKE_GATE_FILE_PATH || path.resolve(__dirname, '../../../.neo-ai-data/wake-daemon/wake-safety-gate.json');
}

/**
 * Default-tripped state returned when the gate file is absent. Deny-by-default
 * is load-bearing — see file-level Anchor & Echo above.
 */
const DEFAULT_TRIPPED = {
    state    : 'tripped',
    reason   : 'No gate state file present; defaulting to tripped per deny-by-default discipline. Operator must explicitly enable after validating substrate.',
    trippedAt: null,
    trippedBy: 'default-on-missing-file'
};

/**
 * Read the gate state. Returns the default-tripped state if the file is
 * missing or unreadable — the deny-by-default discipline echoes the file-level
 * Anchor & Echo: forgetting to create the file MUST NOT be interpreted as
 * permission to act.
 * @returns {Promise<{state: string, reason: string, trippedAt: ?string, trippedBy: ?string}>}
 */
export async function readGateState() {
    try {
        const raw    = await fs.readFile(gateFilePath(), 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || typeof parsed.state !== 'string') {
            return {
                ...DEFAULT_TRIPPED,
                reason   : 'Gate file present but malformed; treating as tripped.',
                trippedBy: 'malformed-state-file'
            };
        }
        return {
            state    : parsed.state,
            reason   : parsed.reason ?? '',
            trippedAt: parsed.trippedAt ?? null,
            trippedBy: parsed.trippedBy ?? null
        };
    } catch (err) {
        if (err.code === 'ENOENT') return {...DEFAULT_TRIPPED};
        return {
            ...DEFAULT_TRIPPED,
            reason   : `Gate file read error: ${err.message}; treating as tripped.`,
            trippedBy: 'read-error'
        };
    }
}

/**
 * Atomic write of the gate state. Writes to a temp file then rename to avoid
 * scheduler readers seeing a partial write under concurrent operator updates.
 * @param {{state: string, reason: string, trippedBy: string|undefined}} payload
 * @returns {Promise<void>}
 */
export async function writeGateState(payload) {
    const filePath = gateFilePath();
    await fs.mkdir(path.dirname(filePath), {recursive: true});
    const body = {
        state    : payload.state,
        reason   : payload.reason ?? '',
        trippedAt: payload.state === 'enabled' ? null : new Date().toISOString(),
        trippedBy: payload.trippedBy ?? null
    };
    await writeFileAtomic(filePath, JSON.stringify(body, null, 2) + '\n');
}

/**
 * Operator override check. The `WAKE_GATE_OVERRIDE` environment variable
 * bypasses the gate when set to a truthy non-empty value. Documented as
 * operator-only.
 * @returns {boolean}
 */
export function hasOverride() {
    const v = process.env.WAKE_GATE_OVERRIDE;
    return Boolean(v) && v !== '0' && v !== 'false';
}

/**
 * Convenience: is the gate open for high-authority actions? `true` only when
 * state is explicitly `enabled` OR the operator override is set. All other
 * states (`disabled`, `tripped`, malformed, missing) return `false`.
 * @returns {Promise<boolean>}
 */
export async function isGateOpen() {
    if (hasOverride()) return true;
    const state = await readGateState();
    return state.state === 'enabled';
}

// CLI: `node wakeSafetyGate.mjs <command>`
//
// Commands:
//   check    — exit 0 if gate is open (enabled or override), 1 otherwise.
//              Shell-guard form for manual use; the Orchestrator swarm-heartbeat lane
//              consults the gate via the `isGateOpen` direct import instead.
//   reason   — print the current gate-state reason to stdout (single line).
//   show     — print the full gate state as JSON.
//   trip     — write tripped state. Reason from --reason= flag or stdin.
//   disable  — write disabled state. Reason from --reason= flag.
//   enable   — write enabled state. No reason required (cleared on enable).
async function main() {
    const argv = process.argv.slice(2);
    const cmd  = argv[0];

    const flag = name => {
        const prefix = `--${name}=`;
        const arg    = argv.find(a => a.startsWith(prefix));
        return arg ? arg.slice(prefix.length) : null;
    };

    if (cmd === 'check') {
        const open = await isGateOpen();
        process.exit(open ? 0 : 1);
    }
    if (cmd === 'reason') {
        const state = await readGateState();
        process.stdout.write(state.reason + '\n');
        process.exit(0);
    }
    if (cmd === 'show') {
        const state = await readGateState();
        process.stdout.write(JSON.stringify(state, null, 2) + '\n');
        process.exit(0);
    }
    if (cmd === 'trip' || cmd === 'disable') {
        const reason    = flag('reason') ?? '';
        const trippedBy = flag('by') ?? 'cli';
        await writeGateState({state: cmd === 'trip' ? 'tripped' : 'disabled', reason, trippedBy});
        process.exit(0);
    }
    if (cmd === 'enable') {
        await writeGateState({state: 'enabled', reason: ''});
        process.exit(0);
    }
    console.error('Usage: wakeSafetyGate.mjs <check|reason|show|trip|disable|enable> [--reason=...] [--by=...]');
    process.exit(2);
}

// Only run CLI when invoked as a script, not when imported.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    main().catch(err => {
        console.error('wakeSafetyGate failed:', err.message);
        process.exit(2);
    });
}
