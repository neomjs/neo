import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { exec } from 'child_process';
import util from 'util';

import Base from '../../src/core/Base.mjs';
import Neo from '../../src/Neo.mjs';
import GraphService from '../mcp/server/memory-core/services/GraphService.mjs';

import { sweepExpiredTasks } from '../scripts/sweepExpiredTasks.mjs';
import { checkSunsetted } from '../scripts/checkSunsetted.mjs';
import { checkAllAgentIdle } from '../scripts/checkAllAgentIdle.mjs';
import { resumeHarness } from '../scripts/resumeHarness.mjs';
import { idleOutNudge } from '../scripts/idleOutNudge.mjs';
import { trioWakeCooldown } from '../scripts/trioWakeCooldown.mjs';
import { isGateOpen, hasOverride, readGateState } from '../scripts/wakeSafetyGate.mjs';

const execAsync = util.promisify(exec);

const DB_PATH = path.resolve('.neo-ai-data/sqlite/memory-core-graph.sqlite');
const CONCURRENCY_LOCK = path.resolve('.neo-ai-data/heartbeat-concurrency.lock');
const HEARTBEAT_LOCK_TTL_SECONDS = parseInt(process.env.HEARTBEAT_LOCK_TTL_SECONDS, 10) || 600;

/**
 * @class Neo.ai.daemons.SwarmHeartbeatService
 * @extends Neo.core.Base
 * 
 * Centralized daemon for the Triad Swarm, replacing legacy bash-centric loops.
 * Manages recovery dispatching, task expiration, and wake-safety gate validation.
 */
class SwarmHeartbeatService extends Base {
    static config = {
        className: 'Neo.ai.daemons.SwarmHeartbeatService',
        singleton: true,
        pollIntervalMs: parseInt(process.env.POLL_INTERVAL, 10) * 1000 || 300000, // 5 min default
        identity: process.env.NEO_AGENT_IDENTITY || '@neo-gemini-3-1-pro',
        tmuxSession: process.env.TMUX_SESSION || 'neo-agent'
    };

    /**
     * Bootstraps the singleton and initiates the polling loop.
     * @returns {Promise<void>}
     */
    async initAsync() {
        if (this.initialized) return;
        this.initialized = true;

        await GraphService.initAsync();
        
        console.log(`[SwarmHeartbeatService] Initialized for ${this.identity}. Starting poll interval ${this.pollIntervalMs}ms.`);
        this.poll();
    }

    /**
     * Main polling loop.
     */
    async poll() {
        while (true) {
            try {
                await this.heartbeatPulse();
            } catch (err) {
                console.error('[SwarmHeartbeatService] Error in pulse:', err);
            }
            await new Promise(resolve => setTimeout(resolve, this.pollIntervalMs));
        }
    }

    /**
     * Checks if another heartbeat operation is in progress via lock file.
     * Clears stale locks if they exceed the TTL.
     * @returns {Promise<boolean>} True if locked, false otherwise.
     */
    async heartbeatLockActive() {
        try {
            const exists = await fs.pathExists(CONCURRENCY_LOCK);
            if (!exists) return false;

            const stat = await fs.stat(CONCURRENCY_LOCK);
            const mtime = stat.mtimeMs;
            const ageSeconds = (Date.now() - mtime) / 1000;

            if (ageSeconds > HEARTBEAT_LOCK_TTL_SECONDS) {
                console.error(`[heartbeat ${new Date().toISOString()}] clearing stale concurrency lock (${Math.round(ageSeconds)}s old)`);
                await fs.remove(CONCURRENCY_LOCK);
                return false;
            }
            return true;
        } catch (err) {
            console.error(`[heartbeat ${new Date().toISOString()}] concurrency lock unreadable; skipping pulse`);
            return true;
        }
    }

    /**
     * Retrieves unread message count for the current identity.
     * @returns {Promise<number>}
     */
    async getUnreadCount() {
        if (!await fs.pathExists(DB_PATH)) return 0;
        try {
            const db = GraphService.db.storage.db;
            const countRow = db.prepare(`
                SELECT count(DISTINCT n.id) as count 
                FROM Nodes n 
                JOIN Edges e ON n.id = e.source AND e.type = 'SENT_TO' 
                WHERE json_extract(n.data, '$.label') = 'MESSAGE' 
                  AND json_extract(n.data, '$.properties.readAt') IS NULL 
                  AND e.target IN (?, 'AGENT:*')
            `).get(this.identity);
            return countRow ? countRow.count : 0;
        } catch (e) {
            return 0;
        }
    }

    /**
     * Retrieves open issue count assigned to the current agent identity.
     * @returns {Promise<number>}
     */
    async getIssuesCount() {
        try {
            const { stdout } = await execAsync(`gh issue list --assignee "@me" --state open --json number`);
            const issues = JSON.parse(stdout);
            return issues.length;
        } catch (e) {
            return 0;
        }
    }

    /**
     * Queries the DB for active WAKE_SUBSCRIPTION records targeting push mechanisms.
     * @returns {Promise<string[]>}
     */
    async getPushCapableIdentities() {
        if (!await fs.pathExists(DB_PATH)) return [];
        try {
            const db = GraphService.db.storage.db;
            const rows = db.prepare(`
                SELECT json_extract(data, '$.properties.agentIdentity') as identity
                FROM Nodes
                WHERE json_extract(data, '$.label') = 'WAKE_SUBSCRIPTION'
                  AND json_extract(data, '$.properties.harnessTarget') IN ('mcp-notifications', 'a2a-webhook')
                  AND COALESCE(json_extract(data, '$.properties.status'), 'active') != 'degraded'
            `).all();
            return rows.map(r => r.identity);
        } catch (e) {
            return [];
        }
    }

    /**
     * Executes the heartbeat logic. This is the Node-native counterpart
     * to the legacy bash-centric heartbeat_pulse loop.
     */
    async heartbeatPulse() {
        if (await this.heartbeatLockActive()) {
            return;
        }

        let expired = 0;
        try {
            const sweepResult = await sweepExpiredTasks();
            expired = sweepResult.sweptCount || 0;
            if (expired > 0) {
                console.error(`[heartbeat ${new Date().toISOString()}] sweep: ${expired} task(s) transitioned to Expired`);
            }
        } catch (e) {
            console.error('[SwarmHeartbeatService] sweepExpiredTasks failed:', e);
        }

        try {
            const sunsetJson = await checkSunsetted(this.identity);
            const isSunsetted = sunsetJson.sunsetted || sunsetJson.sunset;
            const recommendedAction = sunsetJson.recommended_action || "no_action";
            const sunsetReason = sunsetJson.reason || '';
            const originSessionId = sunsetJson.originSessionId || sunsetJson.evidence?.last_sessionId || '';
            const abandonedCount = sunsetJson.abandonedCount || 0;

            if (isSunsetted) {
                if (!hasOverride() && !(await isGateOpen())) {
                    const gateReason = (await readGateState()).reason;
                    console.error(`[heartbeat ${new Date().toISOString()}] Wake safety gate closed; skipping fresh-session-spawn for ${this.identity}. Sunset reason: ${sunsetReason}. Gate reason: ${gateReason}`);
                } else {
                    console.error(`[heartbeat ${new Date().toISOString()}] Phase 1 Recovery Triggered for ${this.identity}. Reason: ${sunsetReason}`);
                    await resumeHarness(this.identity, sunsetReason, originSessionId, abandonedCount);
                }
                return;
            }

            if (recommendedAction === 'idle_out_nudge') {
                if (!hasOverride() && !(await isGateOpen())) {
                    const gateReason = (await readGateState()).reason;
                    console.error(`[heartbeat ${new Date().toISOString()}] Wake safety gate closed; skipping idle-out nudge for ${this.identity}. Gate reason: ${gateReason}`);
                } else {
                    console.error(`[heartbeat ${new Date().toISOString()}] Idle-out nudge triggered for ${this.identity}`);
                    await idleOutNudge(this.identity);
                }
                return;
            }
        } catch (e) {
            console.error('[SwarmHeartbeatService] Phase 1 recovery logic failed:', e);
        }

        try {
            const cycleId = Math.floor(Date.now() / 1000).toString();
            // Optional: configure NEO_TRIO_IDENTITIES in your environment.
            const allIdleJson = await checkAllAgentIdle(cycleId, process.env.NEO_TRIO_IDENTITIES);
            
            if (allIdleJson && allIdleJson.allIdle === true) {
                console.error(`[heartbeat ${new Date().toISOString()}] AllAgentIdle detected: ${JSON.stringify(allIdleJson)}`);
                if (!hasOverride() && !(await isGateOpen())) {
                    const gateReason = (await readGateState()).reason;
                    console.error(`[heartbeat ${new Date().toISOString()}] Wake safety gate closed; skipping trio wake dispatch. Gate reason: ${gateReason}`);
                } else {
                    await trioWakeCooldown(JSON.stringify(allIdleJson));
                }
            }
        } catch (e) {
            console.error('[SwarmHeartbeatService] Phase 3/4 logic failed:', e);
        }

        try {
            const pushIdentities = await this.getPushCapableIdentities();
            if (pushIdentities.includes(this.identity)) {
                return;
            }

            const unread = await this.getUnreadCount();
            const issues = await this.getIssuesCount();

            if (unread === 0 && issues === 0) {
                return;
            }

            let prompt = `[SYSTEM HEARTBEAT] Last wake: T-5min. Mailbox unread: ${unread}. Open issues assigned: ${issues}.`;
            if (expired > 0) {
                prompt += ` Tasks expired this cycle: ${expired}.`;
            }

            try {
                await execAsync(`tmux has-session -t "${this.tmuxSession}"`);
                await execAsync(`tmux send-keys -t "${this.tmuxSession}" "${prompt}" C-m`);
            } catch (e) {
                // Ignore tmux errors (session missing, etc.)
            }
        } catch (e) {
            console.error('[SwarmHeartbeatService] Heartbeat bypass / token economy logic failed:', e);
        }
    }
}

const instance = Neo.applyClassConfig(SwarmHeartbeatService);
export default instance;

// Allow direct execution for launchd/systemd or standalone testing.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
    instance.initAsync().catch(err => {
        console.error('[SwarmHeartbeatService] Initialization crashed:', err);
        process.exit(1);
    });
}
