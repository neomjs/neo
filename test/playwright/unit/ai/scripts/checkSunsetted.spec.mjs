import {setup} from '../../../setup.mjs';

const appName = 'SunsetDetectionTest';

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
 * @summary Validation for Phase 1 Auto-Wakeup Substrate.
 */
test.describe('ai/scripts/checkSunsetted', () => {
    test('checkSunsetted.mjs returns a valid JSON string even for unknown agents', async () => {
        const scriptPath = path.resolve(process.cwd(), 'ai/scripts/checkSunsetted.mjs');
        const output = execFileSync('node', [scriptPath, '@neo-unknown-agent'], { encoding: 'utf-8' });
        const parsed = JSON.parse(output);
        
        expect(parsed.identity).toBe('@neo-unknown-agent');
        expect(typeof parsed.sunsetted).toBe('boolean');
        expect(typeof parsed.reason).toBe('string');
        // Unknown agent with no subscription should be considered sunsetted
        expect(parsed.sunsetted).toBe(true);
        expect(parsed.reason).toContain('No active WAKE_SUBSCRIPTION');
    });

    test('checkSunsetted.mjs extracts originSessionId from AGENT_MEMORY for a known identity', async () => {
        // Cycle 2 RA per @neo-gpt: live Memory Core graph rows are AGENT_MEMORY (not MEMORY)
        // and expose neither `properties.sessionId` nor `properties.agent` as structured
        // fields. The sessionId is embedded in `properties.description` ("Agent thought
        // flow inside session <UUID>.") and identity tracks via `properties.userId`. This
        // test exercises the post-query regex extraction path that the pre-Cycle-2 query
        // path could not reach. Using `@neo-opus-4-7` because its identityMap entry shipped
        // in #10607 (2026-05-02) and a fresh-session boot of this same PR has been writing
        // AGENT_MEMORY rows under that userId. If the DB has no rows for the identity (clean
        // bootstrap, fresh fork), originSessionId stays empty — that branch is also valid.
        const scriptPath = path.resolve(process.cwd(), 'ai/scripts/checkSunsetted.mjs');
        const output     = execFileSync('node', [scriptPath, '@neo-opus-4-7'], {
            encoding: 'utf-8',
            env: { ...process.env, NEO_UNIT_TEST_MODE: 'true' }
        });
        const parsed     = JSON.parse(output);

        expect(typeof parsed.originSessionId).toBe('string');
        if (parsed.originSessionId) {
            // UUID v4 format: 8-4-4-4-12 hex characters with hyphens.
            expect(parsed.originSessionId).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
        }
    });

    test('checkSunsetted.mjs update-on-read legacy row migration actually migrates legacy structure', async () => {
        const GraphService = (await import('../../../../../ai/mcp/server/memory-core/services/GraphService.mjs')).default;
        await GraphService.initAsync();

        const legacyId = 'legacy-memory-12345';
        const legacyTime = new Date().toISOString();
        const legacySession = '12345678-1234-1234-1234-123456789012';

        // Directly insert legacy JSON into SQLite to bypass Node object structuring
        const dataObj = {
            id: legacyId,
            label: 'AGENT_MEMORY',
            type: 'AGENT_MEMORY',
            properties: {
                userId: '@neo-legacy-test',
                name: `Memory: ${legacyTime}`,
                description: `Agent thought flow inside session ${legacySession}.`
            }
        };

        const insertStmt = GraphService.db.storage.db.prepare(`
            INSERT INTO Nodes (id, user_id, data) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data
        `);
        insertStmt.run(legacyId, '@neo-legacy-test', JSON.stringify(dataObj));

        const scriptPath = path.resolve(process.cwd(), 'ai/scripts/checkSunsetted.mjs');
        const output     = execFileSync('node', [scriptPath, '@neo-legacy-test'], {
            encoding: 'utf-8',
            env: { ...process.env, NEO_UNIT_TEST_MODE: 'true', SUNSET_THRESHOLD_MS: '600000' }
        });
        const parsed     = JSON.parse(output);

        expect(parsed.identity).toBe('@neo-legacy-test');

        // Verify migration in database
        const row = GraphService.db.storage.db.prepare('SELECT data FROM Nodes WHERE id = ?').get(legacyId);
        const migratedData = JSON.parse(row.data);
        expect(migratedData.properties.timestamp).toBe(legacyTime);
        expect(migratedData.properties.sessionId).toBe(legacySession);
        expect(migratedData.properties.agentIdentity).toBe('@neo-legacy-test');
    });

    test('swarm-heartbeat.sh integrates the sunset detection properly before the bypass', async () => {
        const fs = await import('fs/promises');
        const script = await fs.readFile(path.resolve(process.cwd(), 'ai/scripts/swarm-heartbeat.sh'), 'utf-8');
        const checkIndex = script.indexOf('Check Sunsetted State');
        const bypassIndex = script.indexOf('Heartbeat-Bypass Detection', script.indexOf('heartbeat_pulse() {'));

        expect(checkIndex).toBeGreaterThan(-1);
        expect(bypassIndex).toBeGreaterThan(-1);
        // Ensure the sunset check happens BEFORE the bypass
        expect(checkIndex).toBeLessThan(bypassIndex);
    });
});
