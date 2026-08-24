#!/usr/bin/env node
/**
 * @summary Cooldown-bounded idempotent swarm wake (binds to all-agent-idle detector contract).
 *
 * Prevents swarm heartbeat from spamming wake events by enforcing a 10-minute cooldown
 * TTL between WAKE messages.
 */
import fs                                       from 'fs-extra';
import path                                     from 'path';
import {fileURLToPath}                          from 'url';
import Neo                                      from '../../../src/Neo.mjs';
import * as core                                from '../../../src/core/_export.mjs';
import { withHeartbeatLock }                    from './heartbeatLock.mjs';
import RequestContextService                    from '../../mcp/server/shared/services/RequestContextService.mjs';
import LifecycleService                         from '../../services/memory-core/lifecycle/SystemLifecycleService.mjs';
import GraphService                             from '../../services/memory-core/GraphService.mjs';
import MailboxService                           from '../../services/memory-core/MailboxService.mjs';
import AiConfig                                 from '../../config.mjs';
import memoryCoreConfig                         from '../../mcp/server/memory-core/config.mjs';
import { writeInflightLock, clearInflightLock } from './inflightLock.mjs';

const COOLDOWN_STATE_FILE = 'swarm-wake-cooldown.json';
const COOLDOWN_LOCK_FILE  = 'swarm-wake-cooldown.lock';

/**
 * @summary Dispatch the cooldown-bounded swarm-wide wake for an all-agent-idle signal.
 *
 * `wakeDaemonDir` is required. A swarm-wide cooldown is shared state by definition, so the two
 * files below must land in the resolved wake-daemon member and nowhere else: the previous
 * cwd-relative literals gave every launch directory its own cooldown record, which does not
 * enforce a cooldown — it enforces one per invocation site, and the suppression the TTL exists to
 * produce silently stops happening.
 *
 * @param {Object} signal All-agent-idle detector signal.
 * @param {Object} options
 * @param {String} options.wakeDaemonDir Resolved wake-daemon data member. Required.
 * @returns {Promise<Object|void>} Dispatch outcome when the heartbeat lock implementation returns it.
 * @throws {Error} When `wakeDaemonDir` is absent — before any filesystem access.
 */
export async function swarmWakeCooldown(signal, {wakeDaemonDir}={}) {
    // Ahead of the signal guards deliberately: a missing injection is a composition error, and one
    // that only surfaces on the rare all-idle branch would stay invisible through every ordinary
    // call — the same "silently wrong until it matters" shape the cwd-relative literals had.
    if (!wakeDaemonDir) {
        throw new Error('swarmWakeCooldown: wake-daemon directory must be injected by the composing entrypoint')
    }

    if (!signal) {
        return {fired: false, reason: 'missing-signal'};
    }
    if (signal.allIdle !== true) {
        return {fired: false, reason: 'not-all-idle'};
    }

    const cooldownStatePath = path.join(wakeDaemonDir, COOLDOWN_STATE_FILE),
          cooldownLockPath  = path.join(wakeDaemonDir, COOLDOWN_LOCK_FILE);

    return withHeartbeatLock(async () => {
        // Cooldown TTL resolved from the wake-policy leaf (env NEO_SWARM_WAKE_COOLDOWN_SECONDS, 600s default).
        const ttlSeconds = AiConfig.orchestrator.swarmHeartbeat.swarmWakeCooldownSeconds;
        const ttlMs      = ttlSeconds * 1000;
        const now        = Date.now();

        let state = {};
        if (await fs.pathExists(cooldownStatePath)) {
            state = await fs.readJson(cooldownStatePath).catch(() => ({}));
        }

        const lastFireAt        = state.last_fire_at_iso ? new Date(state.last_fire_at_iso).getTime() : 0;
        const timeSinceLastFire = now - lastFireAt;

        // If we are within the TTL window, suppress the wake
        if (timeSinceLastFire < ttlMs) {
            console.error(`[swarmWakeCooldown] Suppressed: within TTL window (${ttlSeconds}s) since last wake.`);
            return {fired: false, reason: 'cooldown', ttlSeconds};
        }

        console.error(`[swarmWakeCooldown] Firing SYSTEM WAKE for cycle ${signal.cycle_id} to ${signal.coordinator_recommendation}`);

        // Await service readiness to send an A2A message (construct auto-fires init; never call initAsync externally)
        await LifecycleService.ready();
        await GraphService.ready();

        const coordinator    = signal.coordinator_recommendation || '@neo-gemini-pro';
        const sender         = process.env.NEO_AGENT_IDENTITY || '@system';
        const abandonedCount = signal.details?.[coordinator]?.abandonedCount || 0;

        // Secure the nudge boot ramp before taking the wake action.
        await writeInflightLock(coordinator, 'idle_out_nudge', abandonedCount, {wakeDaemonDir});

        try {
            await RequestContextService.run({ agentIdentityNodeId: sender }, async () => {
                await MailboxService.addMessage({
                    to      : coordinator,
                    subject : 'Intent-First Wakeup: All-Agent-Idle Detected',
                    body    : `The swarm heartbeat has detected that all configured agents are idle.\n\nDetector Signal:\n\`\`\`json\n${JSON.stringify(signal, null, 2)}\n\`\`\`\n\nYou are the recommended coordinator. Please pick up a high-ROI ticket and drive the swarm forward per D1/D2 policies.`,
                    priority: 'high'
                    // We omit `from` since it's a system message.
                });
            });
        } catch (err) {
            console.error(`[swarmWakeCooldown] Failed to send wake message to ${coordinator}:`, err.message);
            await clearInflightLock(coordinator, 'idle_out_nudge', {wakeDaemonDir});
            throw err;
        }

        state = {
            last_fire_cycle_id: signal.cycle_id,
            last_fire_at_iso  : new Date(now).toISOString(),
            ttl_seconds       : ttlSeconds
        };

        await fs.ensureDir(path.dirname(cooldownStatePath));
        await fs.writeJson(cooldownStatePath, state, { spaces: 2 });

        return {fired: true, coordinator, cycle_id: signal.cycle_id};
    }, { lockPath: cooldownLockPath });
}

async function main() {
    const rawSignal = process.argv[2];
    if (!rawSignal) return;

    let signal;
    try {
        signal = JSON.parse(rawSignal);
    } catch (err) {
        console.error('swarmWakeCooldown: Failed to parse signal:', err.message);
        process.exit(1);
    }

    await swarmWakeCooldown(signal, {wakeDaemonDir: memoryCoreConfig.wakeDaemon.dataDir});
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
    main().catch(err => {
        console.error('swarmWakeCooldown failed:', err.stack);
        process.exit(1);
    });
}
