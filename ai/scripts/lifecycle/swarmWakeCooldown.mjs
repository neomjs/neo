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

const COOLDOWN_STATE_PATH = '.neo-ai-data/wake-daemon/swarm-wake-cooldown.json';
const COOLDOWN_LOCK_PATH  = '.neo-ai-data/wake-daemon/swarm-wake-cooldown.lock';

/**
 * @summary Dispatch the cooldown-bounded swarm-wide wake for an all-agent-idle signal.
 * @param {Object} signal All-agent-idle detector signal.
 * @param {Object} options
 * @param {String} options.wakeDaemonDir Resolved wake-daemon data member.
 * @returns {Promise<Object|void>} Dispatch outcome when the heartbeat lock implementation returns it.
 */
export async function swarmWakeCooldown(signal, {wakeDaemonDir}={}) {
    if (!signal) {
        return {fired: false, reason: 'missing-signal'};
    }
    if (signal.allIdle !== true) {
        return {fired: false, reason: 'not-all-idle'};
    }

    return withHeartbeatLock(async () => {
        // Cooldown TTL resolved from the wake-policy leaf (env NEO_SWARM_WAKE_COOLDOWN_SECONDS, 600s default).
        const ttlSeconds = AiConfig.orchestrator.swarmHeartbeat.swarmWakeCooldownSeconds;
        const ttlMs      = ttlSeconds * 1000;
        const now        = Date.now();

        let state = {};
        if (await fs.pathExists(COOLDOWN_STATE_PATH)) {
            state = await fs.readJson(COOLDOWN_STATE_PATH).catch(() => ({}));
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

        await fs.ensureDir(path.dirname(COOLDOWN_STATE_PATH));
        await fs.writeJson(COOLDOWN_STATE_PATH, state, { spaces: 2 });

        return {fired: true, coordinator, cycle_id: signal.cycle_id};
    }, { lockPath: COOLDOWN_LOCK_PATH });
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
