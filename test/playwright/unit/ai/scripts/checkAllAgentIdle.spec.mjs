import {setup} from '../../../setup.mjs';

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
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';

/**
 * @summary Validation for Phase 3 Substrate Primitive #10625: All-Agent-Idle Detection.
 */
test.describe('ai/scripts/checkAllAgentIdle', () => {
    const identitiesEnv = '@neo-test-agent-1,@neo-test-agent-2';

    test('checkAllAgentIdle.mjs emits positive signal when all configured agents are idle', async () => {
        test.skip(skipCiSubstrateData, 'CI-skip: substrate data not seeded - bucket C (#10903)');

        const GraphService = (await import('../../../../../ai/services/memory-core/GraphService.mjs')).default;
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
        const scriptPath = path.resolve(process.cwd(), 'ai/scripts/checkAllAgentIdle.mjs');
        const output = execFileSync('node', [scriptPath, '12345'], {
            encoding: 'utf-8',
            env: { 
                ...process.env, 
                NEO_UNIT_TEST_MODE: 'true',
                NEO_TRIO_IDENTITIES: identitiesEnv,
                IDLE_THRESHOLD_MS: '600000' // 10 minutes
            }
        });
        const parsed = JSON.parse(output);

        // 3. Assert positive signal
        expect(parsed.allIdle).toBe(true);
        expect(parsed.cycle_id).toBe('12345');
        expect(parsed.identities.length).toBe(2);
        expect(parsed.details['@neo-test-agent-1'].ageMs).toBeGreaterThan(600000);
        expect(parsed.details['@neo-test-agent-2'].ageMs).toBeGreaterThan(600000);
    });

    test('checkAllAgentIdle.mjs emits negative signal when at least one agent is active', async () => {
        test.skip(skipCiSubstrateData, 'CI-skip: substrate data not seeded - bucket C (#10903)');

        const GraphService = (await import('../../../../../ai/services/memory-core/GraphService.mjs')).default;
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
        const scriptPath = path.resolve(process.cwd(), 'ai/scripts/checkAllAgentIdle.mjs');
        const output = execFileSync('node', [scriptPath, '12346'], {
            encoding: 'utf-8',
            env: { 
                ...process.env, 
                NEO_UNIT_TEST_MODE: 'true',
                NEO_TRIO_IDENTITIES: identitiesEnv,
                IDLE_THRESHOLD_MS: '600000'
            }
        });
        const parsed = JSON.parse(output);

        // 3. Assert negative signal
        expect(parsed.allIdle).toBe(false);
        expect(parsed.details['@neo-test-agent-2'].ageMs).toBeLessThan(600000);
    });

    test('checkAllAgentIdle.mjs treats boundary condition (no AGENT_MEMORY rows) as fully idle', async () => {
        // Execute script with an entirely unknown identity set
        const scriptPath = path.resolve(process.cwd(), 'ai/scripts/checkAllAgentIdle.mjs');
        const output = execFileSync('node', [scriptPath, '12347'], {
            encoding: 'utf-8',
            env: { 
                ...process.env, 
                NEO_UNIT_TEST_MODE: 'true',
                NEO_TRIO_IDENTITIES: '@neo-ghost-agent-1',
                IDLE_THRESHOLD_MS: '600000'
            }
        });
        const parsed = JSON.parse(output);

        // Assert boundary signal
        expect(parsed.allIdle).toBe(true);
        expect(parsed.details['@neo-ghost-agent-1'].lastMemTime).toBeNull();
        expect(parsed.details['@neo-ghost-agent-1'].ageMs).toBe(null); // Infinity JSON encodes to null
    });

    test('swarm-heartbeat.sh integrates the all-agent-idle detection properly', async () => {
        const fs = await import('fs/promises');
        const script = await fs.readFile(path.resolve(process.cwd(), 'ai/scripts/swarm-heartbeat.sh'), 'utf-8');
        const allIdleIndex = script.indexOf('checkAllAgentIdle.mjs');
        
        expect(allIdleIndex).toBeGreaterThan(-1);
    });
});
