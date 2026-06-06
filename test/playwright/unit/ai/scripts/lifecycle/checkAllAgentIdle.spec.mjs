import {setup} from '../../../../setup.mjs';

const appName = 'AllAgentIdleDetectionTest';
const skipCiSubstrateData = !!process.env.NEO_TEST_SKIP_CI;

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
import path           from 'path';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import {deriveAllAgentIdleCycleId, checkAllAgentIdle} from '../../../../../../ai/scripts/lifecycle/checkAllAgentIdle.mjs';
import {resolveTargets}            from '../../../../../../ai/daemons/orchestrator/scheduling/swarmHeartbeat.mjs';
import AiConfig                    from '../../../../../../ai/config.mjs';

/**
 * @summary Validation for the Phase 3 Substrate Primitive: All-Agent-Idle Detection.
 */
test.describe('ai/scripts/checkAllAgentIdle', () => {
    const identitiesEnv = '@neo-test-agent-1,@neo-test-agent-2';

    test('checkAllAgentIdle.mjs emits positive signal when all configured agents are idle', async () => {
        test.skip(skipCiSubstrateData, 'CI-skip: substrate data not seeded - bucket C (#10903)');

        const GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        await GraphService.initAsync();

        // 1. Setup mock memory rows for both agents that are OLDER than threshold
        const oldTime = new Date(Date.now() - 20 * 60 * 1000).toISOString(); // 20 mins ago

        const insertStmt = GraphService.db.storage.db.prepare(`
            INSERT INTO Nodes (id, user_id, data) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data
        `);

        ['@neo-test-agent-1', '@neo-test-agent-2'].forEach(id => {
            const dataObj = {
                id: `memory-${id}`,
                label: 'AGENT_MEMORY',
                type: 'AGENT_MEMORY',
                properties: {
                    agentIdentity: id,
                    timestamp: oldTime
                }
            };
            insertStmt.run(`memory-${id}`, id, JSON.stringify(dataObj));
        });

        // 2. Execute script
        const scriptPath = path.resolve(process.cwd(), 'ai/scripts/lifecycle/checkAllAgentIdle.mjs');
        const output = execFileSync('node', [scriptPath], {
            encoding: 'utf-8',
            env: {
                ...process.env,
                NEO_UNIT_TEST_MODE: 'true',
                NEO_SWARM_IDENTITIES: identitiesEnv,
                NEO_IDLE_THRESHOLD_MS: '600000' // 10 minutes
            }
        });
        const parsed = JSON.parse(output);

        // 3. Assert positive signal
        expect(parsed.allIdle).toBe(true);
        expect(parsed.cycle_id).toBe(deriveAllAgentIdleCycleId(
            ['@neo-test-agent-1', '@neo-test-agent-2'],
            {
                '@neo-test-agent-1': {
                    lastMemTime   : oldTime,
                    inFlightNudge : false
                },
                '@neo-test-agent-2': {
                    lastMemTime   : oldTime,
                    inFlightNudge : false
                }
            }
        ));
        expect(parsed.identities.length).toBe(2);
        expect(parsed.details['@neo-test-agent-1'].ageMs).toBeGreaterThan(600000);
        expect(parsed.details['@neo-test-agent-2'].ageMs).toBeGreaterThan(600000);
    });

    test('checkAllAgentIdle.mjs emits negative signal when at least one agent is active', async () => {
        test.skip(skipCiSubstrateData, 'CI-skip: substrate data not seeded - bucket C (#10903)');

        const GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        await GraphService.initAsync();

        // 1. Setup mock memory rows. Agent 1 is old, Agent 2 is new
        const oldTime = new Date(Date.now() - 20 * 60 * 1000).toISOString(); // 20 mins ago
        const newTime = new Date(Date.now() - 2 * 60 * 1000).toISOString();  // 2 mins ago

        const insertStmt = GraphService.db.storage.db.prepare(`
            INSERT INTO Nodes (id, user_id, data) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data
        `);

        [
            { id: '@neo-test-agent-1', time: oldTime },
            { id: '@neo-test-agent-2', time: newTime }
        ].forEach(item => {
            const dataObj = {
                id: `memory-active-${item.id}`,
                label: 'AGENT_MEMORY',
                type: 'AGENT_MEMORY',
                properties: {
                    agentIdentity: item.id,
                    timestamp: item.time
                }
            };
            insertStmt.run(`memory-active-${item.id}`, item.id, JSON.stringify(dataObj));
        });

        // 2. Execute script
        const scriptPath = path.resolve(process.cwd(), 'ai/scripts/lifecycle/checkAllAgentIdle.mjs');
        const output = execFileSync('node', [scriptPath], {
            encoding: 'utf-8',
            env: {
                ...process.env,
                NEO_UNIT_TEST_MODE: 'true',
                NEO_SWARM_IDENTITIES: identitiesEnv,
                NEO_IDLE_THRESHOLD_MS: '600000'
            }
        });
        const parsed = JSON.parse(output);

        // 3. Assert negative signal
        expect(parsed.allIdle).toBe(false);
        expect(parsed.details['@neo-test-agent-2'].ageMs).toBeLessThan(600000);
    });

    test('checkAllAgentIdle.mjs treats boundary condition (no AGENT_MEMORY rows) as fully idle', async () => {
        // Execute script with an entirely unknown identity set
        const scriptPath = path.resolve(process.cwd(), 'ai/scripts/lifecycle/checkAllAgentIdle.mjs');
        const output = execFileSync('node', [scriptPath], {
            encoding: 'utf-8',
            env: {
                ...process.env,
                NEO_UNIT_TEST_MODE: 'true',
                NEO_SWARM_IDENTITIES: '@neo-ghost-agent-1',
                NEO_IDLE_THRESHOLD_MS: '600000'
            }
        });
        const parsed = JSON.parse(output);

        // Assert boundary signal
        expect(parsed.allIdle).toBe(true);
        expect(parsed.cycle_id).toBe(deriveAllAgentIdleCycleId(
            ['@neo-ghost-agent-1'],
            {
                '@neo-ghost-agent-1': {
                    lastMemTime   : null,
                    inFlightNudge : false
                }
            }
        ));
        expect(parsed.details['@neo-ghost-agent-1'].lastMemTime).toBeNull();
        expect(parsed.details['@neo-ghost-agent-1'].ageMs).toBe(null); // Infinity JSON encodes to null
    });

    test('checkAllAgentIdle.mjs default identity set resolves via active-local-team (no hardcoded roster)', async () => {
        // With NEO_SWARM_IDENTITIES UNSET, the all-idle check set must come from the
        // resolveTargets({targetSource:'active-local-team'}) registry path — deployment-portable,
        // NOT the retired hardcoded `@neo-gemini-pro,@neo-opus-ada,@neo-gpt` fallback.
        const expected = await resolveTargets({targetSource: 'active-local-team'});
        expect(expected.length).toBeGreaterThan(0);

        const scriptPath = path.resolve(process.cwd(), 'ai/scripts/lifecycle/checkAllAgentIdle.mjs');
        const output = execFileSync('node', [scriptPath], {
            encoding: 'utf-8',
            env: {
                ...process.env,
                NEO_UNIT_TEST_MODE: 'true',
                NEO_IDLE_THRESHOLD_MS : '600000'
                // NEO_SWARM_IDENTITIES intentionally UNSET → exercises the active-local-team default.
            }
        });
        const parsed = JSON.parse(output);

        // The script's default set equals the resolver's active-local-team, and is NOT the old hardcoded roster.
        expect(parsed.identities).toEqual(expected);
        expect(parsed.identities).not.toEqual(['@neo-gemini-pro', '@neo-opus-ada', '@neo-gpt']);
    });

    test('honors a non-default NEO_IDLE_THRESHOLD_MS through the AiConfig leaf', async () => {
        // Proves a non-default NEO_IDLE_THRESHOLD_MS reaches the entrypoint via
        // AiConfig.orchestrator.swarmHeartbeat.idleThresholdMs — fails if the env name is misspelled
        // or the entrypoint silently uses the 600000 default. Run in-process so the seeded memory is
        // visible (the subprocess substrate path is bucket-C gated / skipped).
        const GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        await GraphService.initAsync();

        // Seed one active-local-team member with 5s-old memory; the rest have none (Infinity age → idle),
        // so all-idle hinges solely on whether THIS member's 5s age clears the threshold.
        const team = await resolveTargets({targetSource: 'active-local-team'});
        expect(team.length).toBeGreaterThan(0);
        const fiveSecondsAgo = new Date(Date.now() - 5000).toISOString();
        GraphService.db.storage.db.prepare(
            `INSERT INTO Nodes (id, user_id, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`
        ).run('memory-threshold-probe', team[0], JSON.stringify({
            id: 'memory-threshold-probe', label: 'AGENT_MEMORY', type: 'AGENT_MEMORY',
            properties: {agentIdentity: team[0], timestamp: fiveSecondsAgo}
        }));

        // `setEnvOverride` takes the DECODED leaf type (a Number here, not the raw env string).
        const originalThreshold = AiConfig.orchestrator.swarmHeartbeat.idleThresholdMs;
        try {
            AiConfig.setEnvOverride('NEO_IDLE_THRESHOLD_MS', 1000);    // 5s > 1s → member idle → all idle
            expect((await checkAllAgentIdle()).allIdle).toBe(true);

            // Same memory, but the 10-min default makes the member active → not all-idle. This flip is
            // impossible unless the entrypoint actually reads the non-default value via the leaf.
            AiConfig.setEnvOverride('NEO_IDLE_THRESHOLD_MS', 600000);
            expect((await checkAllAgentIdle()).allIdle).toBe(false);
        } finally {
            AiConfig.setEnvOverride('NEO_IDLE_THRESHOLD_MS', originalThreshold);
        }
    });

    test('deriveAllAgentIdleCycleId is stable for the same observed all-idle state', () => {
        const details = {
            '@neo-test-agent-1': {lastMemTime: '2026-05-22T10:00:00.000Z', inFlightNudge: false},
            '@neo-test-agent-2': {lastMemTime: '2026-05-22T10:05:00.000Z', inFlightNudge: false}
        };

        const firstCycleId  = deriveAllAgentIdleCycleId(['@neo-test-agent-2', '@neo-test-agent-1'], details);
        const secondCycleId = deriveAllAgentIdleCycleId(['@neo-test-agent-1', '@neo-test-agent-2'], details);

        expect(firstCycleId).toBe(secondCycleId);
    });

    test('deriveAllAgentIdleCycleId rotates when an identity timestamp changes', () => {
        const initialDetails = {
            '@neo-test-agent-1': {lastMemTime: '2026-05-22T10:00:00.000Z', inFlightNudge: false},
            '@neo-test-agent-2': {lastMemTime: '2026-05-22T10:05:00.000Z', inFlightNudge: false}
        };
        const updatedDetails = {
            ...initialDetails,
            '@neo-test-agent-2': {lastMemTime: '2026-05-22T10:08:00.000Z', inFlightNudge: false}
        };

        expect(deriveAllAgentIdleCycleId(['@neo-test-agent-1', '@neo-test-agent-2'], initialDetails))
            .not.toBe(deriveAllAgentIdleCycleId(['@neo-test-agent-1', '@neo-test-agent-2'], updatedDetails));
    });

    // Note: the former `swarm-heartbeat.sh integrates the all-agent-idle
    // detection properly` test was removed with the bash script. The all-agent-idle
    // detection routing is now covered against the JS lane in
    // `test/playwright/unit/ai/daemons/SwarmHeartbeatService.spec.mjs`.
});
