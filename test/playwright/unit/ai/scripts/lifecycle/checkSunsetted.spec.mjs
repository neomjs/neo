import {setup} from '../../../../setup.mjs';

const appName = 'SunsetDetectionTest';
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
import fs             from 'fs/promises';
import {existsSync}   from 'fs';
import {fileURLToPath} from 'url';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import {getLockPath, writeInflightLock} from '../../../../../../ai/scripts/lifecycle/inflightLock.mjs';

/**
 * @summary Validation for Phase 1 Auto-Wakeup Substrate + #10673 detector contract.
 *
 * The detector emits a structured payload with `sunset` / `idle_out_candidate`
 * signals + an `evidence` object + `recommended_action` field. Backward-compat
 * legacy fields (`sunsetted`, `reason`, `originSessionId`, `abandonedCount`)
 * are also emitted for backward-compat with consumers that read the legacy
 * shape directly (e.g. `SwarmHeartbeatService.pulse()`'s sunset routing).
 *
 * Tests are arranged by detector-quadrant coverage matrix:
 *   - (sunset=T, idle_out=F): missing/disabled/degraded subscription
 *   - (sunset=F, idle_out=T): active subscription + stale memory > threshold
 *   - (sunset=F, idle_out=F): active subscription + fresh memory (no_action)
 *   - (sunset=T, idle_out=T): structurally impossible — invariant
 *
 * Plus lock-downgrade tests (in-flight lock causes either signal to drop to false).
 */
test.describe('ai/scripts/checkSunsetted', () => {
    test('checkSunsetted.mjs returns a valid JSON string even for unknown agents', async () => {
        const scriptPath = path.resolve(process.cwd(), 'ai/scripts/lifecycle/checkSunsetted.mjs');
        const output = execFileSync('node', [scriptPath, '@neo-unknown-agent'], { encoding: 'utf-8' });
        const parsed = JSON.parse(output);

        expect(parsed.identity).toBe('@neo-unknown-agent');
        expect(typeof parsed.sunsetted).toBe('boolean');
        expect(typeof parsed.reason).toBe('string');
        // Unknown agent with no subscription should be considered sunsetted
        expect(parsed.sunsetted).toBe(true);
        expect(parsed.reason).toContain('No active WAKE_SUBSCRIPTION');
        // Detector contract (#10673): structured signals + evidence
        expect(parsed.sunset).toBe(true);
        expect(parsed.idle_out_candidate).toBe(false);
        expect(parsed.evidence.subscription_active).toBe(false);
        expect(parsed.evidence.subscription_status).toBe('missing');
        expect(parsed.recommended_action).toBe('sunset_restart');
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
        const scriptPath = path.resolve(process.cwd(), 'ai/scripts/lifecycle/checkSunsetted.mjs');
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
        test.skip(skipCiSubstrateData, 'CI-skip: substrate data not seeded - bucket C (#10903)');

        const GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
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

        const scriptPath = path.resolve(process.cwd(), 'ai/scripts/lifecycle/checkSunsetted.mjs');
        const output     = execFileSync('node', [scriptPath, '@neo-legacy-test'], {
            encoding: 'utf-8',
            env: { ...process.env, NEO_UNIT_TEST_MODE: 'true' }
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

    test('checkSunsetted.mjs legacy-row-blocking-fresh-rows regression test (#10643)', async () => {
        test.skip(skipCiSubstrateData, 'CI-skip: substrate data not seeded - bucket C (#10903)');

        // Pre-fix: COALESCE(timestamp, name) sorted 'Memory: 2026-xx' (legacy) > '2026-xx' (fresh pure ISO string)
        // Post-fix: Bulk migration converts legacy rows to pure timestamps, allowing deterministic chronological sorting.
        const GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        await GraphService.initAsync();
        const db = GraphService.db.storage.db;

        const testIdentity = '@neo-blocking-test';

        // 1. Insert Legacy Row (Old)
        const legacyId = 'blocking-legacy-mem';
        const legacyTime = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
        const legacySession = '11111111-1111-1111-1111-111111111111';
        const legacyData = {
            id: legacyId, label: 'AGENT_MEMORY', type: 'AGENT_MEMORY',
            properties: {
                userId: testIdentity,
                name: `Memory: ${legacyTime}`,
                description: `Agent thought flow inside session ${legacySession}.`
            }
        };

        // 2. Insert Fresh Row (New)
        const freshId = 'blocking-fresh-mem';
        const freshTime = new Date().toISOString();
        const freshSession = '22222222-2222-2222-2222-222222222222';
        const freshData = {
            id: freshId, label: 'AGENT_MEMORY', type: 'AGENT_MEMORY',
            properties: {
                agentIdentity: testIdentity,
                timestamp: freshTime,
                sessionId: freshSession,
                name: `Memory: ${freshTime}`,
                description: `Agent thought flow inside session ${freshSession}.`
            }
        };

        const insertStmt = db.prepare(`INSERT INTO Nodes (id, user_id, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`);
        insertStmt.run(legacyId, testIdentity, JSON.stringify(legacyData));
        insertStmt.run(freshId, testIdentity, JSON.stringify(freshData));

        try {
            const scriptPath = path.resolve(process.cwd(), 'ai/scripts/lifecycle/checkSunsetted.mjs');
            const output     = execFileSync('node', [scriptPath, testIdentity], {
                encoding: 'utf-8',
                env     : { ...process.env, NEO_UNIT_TEST_MODE: 'true' }
            });
            const parsed     = JSON.parse(output);

            expect(parsed.identity).toBe(testIdentity);
            // The origin session ID should match the NEWER fresh row, not the legacy row.
            expect(parsed.originSessionId).toBe(freshSession);
        } finally {
            db.prepare('DELETE FROM Nodes WHERE id = ?').run(legacyId);
            db.prepare('DELETE FROM Nodes WHERE id = ?').run(freshId);
        }
    });

    test('checkSunsetted.mjs does NOT flag sunsetted when subscription exists and AGENT_MEMORY is stale (#10641, #10673)', async () => {
        test.skip(skipCiSubstrateData, 'CI-skip: substrate data not seeded - bucket C (#10903)');

        // Per issue #10641: removing the memory-staleness branch from the sunset predicate.
        // Pre-fix: a 24h-old AGENT_MEMORY would flip `sunsetted=true` even with an active
        // subscription, triggering orphan-session-spawn via `resumeHarness.mjs`.
        // Post-fix (#10641): subscription presence is the authoritative sunset signal; staleness ignored.
        // Post-fix (#10673): staleness re-emerges as `idle_out_candidate` — a lower-authority
        // "candidate in-place nudge" signal, NEVER as sunset.
        const GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        await GraphService.initAsync();

        const testIdentity   = '@neo-staleness-test';
        const staleMemId     = 'stale-memory-test-anchor';
        const subId          = 'sub-staleness-test';
        const staleTimestamp = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const memData = {
            id        : staleMemId,
            label     : 'AGENT_MEMORY',
            type      : 'AGENT_MEMORY',
            properties: {
                userId        : testIdentity,
                agentIdentity : testIdentity,
                timestamp     : staleTimestamp,
                sessionId     : '99999999-9999-9999-9999-999999999999',
                name          : `Memory: ${staleTimestamp}`,
                description   : 'Agent thought flow inside session 99999999-9999-9999-9999-999999999999.'
            }
        };

        const subData = {
            id        : subId,
            label     : 'WAKE_SUBSCRIPTION',
            type      : 'WAKE_SUBSCRIPTION',
            properties: {
                agentIdentity : testIdentity,
                harnessTarget : 'claude-desktop',
                status        : 'active'
            }
        };

        const db         = GraphService.db.storage.db;
        const insertStmt = db.prepare(`INSERT INTO Nodes (id, user_id, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`);
        insertStmt.run(staleMemId, testIdentity, JSON.stringify(memData));
        insertStmt.run(subId,      testIdentity, JSON.stringify(subData));

        try {
            const scriptPath = path.resolve(process.cwd(), 'ai/scripts/lifecycle/checkSunsetted.mjs');
            const output     = execFileSync('node', [scriptPath, testIdentity], {
                encoding: 'utf-8',
                env     : { ...process.env, NEO_UNIT_TEST_MODE: 'true' }
            });
            const parsed     = JSON.parse(output);

            // #10641 discipline preserved: subscription presence beats staleness for sunset
            expect(parsed.sunsetted).toBe(false);
            expect(parsed.sunset).toBe(false);
            expect(parsed.reason).toBe('');
            // #10673 contract: staleness surfaces as idle_out_candidate (lower-authority signal)
            expect(parsed.idle_out_candidate).toBe(true);
            expect(parsed.evidence.subscription_active).toBe(true);
            expect(parsed.evidence.subscription_status).toBe('active');
            expect(parsed.evidence.last_memory_age_min).toBeGreaterThan(10);  // 24h >> 10min threshold
            expect(parsed.recommended_action).toBe('idle_out_nudge');
        } finally {
            db.prepare('DELETE FROM Nodes WHERE id = ?').run(staleMemId);
            db.prepare('DELETE FROM Nodes WHERE id = ?').run(subId);
        }
    });

    test('detector contract: active subscription + fresh memory → no_action (#10673 4-quadrant: F,F)', async () => {
        test.skip(skipCiSubstrateData, 'CI-skip: substrate data not seeded - bucket C (#10903)');

        // Quadrant (sunset=false, idle_out_candidate=false): the no-op case.
        const GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        await GraphService.initAsync();
        const db = GraphService.db.storage.db;

        const testIdentity   = '@neo-no-action-test';
        const freshMemId     = 'fresh-memory-no-action-anchor';
        const subId          = 'sub-no-action-test';
        const freshTimestamp = new Date().toISOString();  // Just now

        const memData = {
            id: freshMemId, label: 'AGENT_MEMORY', type: 'AGENT_MEMORY',
            properties: {
                userId        : testIdentity,
                agentIdentity : testIdentity,
                timestamp     : freshTimestamp,
                sessionId     : '11111111-1111-1111-1111-111111111111',
                name          : `Memory: ${freshTimestamp}`,
                description   : 'Agent thought flow inside session 11111111-1111-1111-1111-111111111111.'
            }
        };
        const subData = {
            id: subId, label: 'WAKE_SUBSCRIPTION', type: 'WAKE_SUBSCRIPTION',
            properties: {agentIdentity: testIdentity, harnessTarget: 'claude-desktop', status: 'active'}
        };

        const insertStmt = db.prepare(`INSERT INTO Nodes (id, user_id, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`);
        insertStmt.run(freshMemId, testIdentity, JSON.stringify(memData));
        insertStmt.run(subId,      testIdentity, JSON.stringify(subData));

        try {
            const scriptPath = path.resolve(process.cwd(), 'ai/scripts/lifecycle/checkSunsetted.mjs');
            const output = execFileSync('node', [scriptPath, testIdentity], {encoding: 'utf-8'});
            const parsed = JSON.parse(output);

            expect(parsed.sunset).toBe(false);
            expect(parsed.idle_out_candidate).toBe(false);
            expect(parsed.evidence.subscription_active).toBe(true);
            expect(parsed.evidence.subscription_status).toBe('active');
            expect(parsed.evidence.last_memory_age_min).toBeLessThan(10);  // fresh
            expect(parsed.recommended_action).toBe('no_action');
        } finally {
            db.prepare('DELETE FROM Nodes WHERE id = ?').run(freshMemId);
            db.prepare('DELETE FROM Nodes WHERE id = ?').run(subId);
        }
    });

    test('detector contract: subscription_status disambiguation — disabled vs degraded vs missing (#10673 AC1)', async () => {
        test.skip(skipCiSubstrateData, 'CI-skip: substrate data not seeded - bucket C (#10903)');

        // The detector emits structured `subscription_status` with 4 values:
        // 'missing' (no rows) / 'active' / 'degraded' (status=degraded) / 'disabled' (harnessTarget=disabled).
        // Pre-#10673: the original query filtered out disabled+degraded, so all 3 mapped indistinguishably to "no active sub."
        // Post-#10673: the evidence object preserves the distinction so consumers can route appropriately.
        const GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        await GraphService.initAsync();
        const db = GraphService.db.storage.db;

        const testIdentity = '@neo-disabled-sub-test';
        const subId        = 'sub-disabled-test';
        const subData = {
            id: subId, label: 'WAKE_SUBSCRIPTION', type: 'WAKE_SUBSCRIPTION',
            properties: {agentIdentity: testIdentity, harnessTarget: 'disabled', status: 'active'}
        };

        const insertStmt = db.prepare(`INSERT INTO Nodes (id, user_id, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`);
        insertStmt.run(subId, testIdentity, JSON.stringify(subData));

        try {
            const scriptPath = path.resolve(process.cwd(), 'ai/scripts/lifecycle/checkSunsetted.mjs');
            const output = execFileSync('node', [scriptPath, testIdentity], {encoding: 'utf-8'});
            const parsed = JSON.parse(output);

            expect(parsed.sunset).toBe(true);  // disabled → sunset (subscription_active=false)
            expect(parsed.evidence.subscription_active).toBe(false);
            expect(parsed.evidence.subscription_status).toBe('disabled');
            expect(parsed.recommended_action).toBe('sunset_restart');
        } finally {
            db.prepare('DELETE FROM Nodes WHERE id = ?').run(subId);
        }
    });

    test('detector contract: in-flight sunset_restart lock downgrades sunset signal to false (#10673 AC2)', async () => {
        test.skip(skipCiSubstrateData, 'CI-skip: substrate data not seeded - bucket C (#10903)');

        // When a sunset_restart is already in flight (per inflightLock.mjs), the detector
        // MUST NOT recommend another sunset_restart action. The lock is the data-layer mutex
        // that prevents the runaway-spawn pattern documented in the forensic record.
        const GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        await GraphService.initAsync();

        const testIdentity = '@neo-locked-sunset-test';
        const lockPath     = getLockPath('sunset_restart', testIdentity);

        // Acquire an in-flight lock to simulate ongoing sunset_restart action.
        await writeInflightLock(testIdentity, 'sunset_restart', 0);

        try {
            const scriptPath = path.resolve(process.cwd(), 'ai/scripts/lifecycle/checkSunsetted.mjs');
            const output = execFileSync('node', [scriptPath, testIdentity], {encoding: 'utf-8'});
            const parsed = JSON.parse(output);

            // No subscription would normally → sunset=true; lock downgrades to no-action.
            expect(parsed.sunset).toBe(false);
            expect(parsed.idle_out_candidate).toBe(false);
            expect(parsed.recommended_action).toBe('no_action');
            expect(parsed.reason).toContain('in-flight');
        } finally {
            if (existsSync(lockPath)) await fs.unlink(lockPath);
        }
    });

    test('detector contract: backward-compat legacy fields preserved (#10673 AC5)', async () => {
        // Consumers read the legacy fields directly (e.g. `SwarmHeartbeatService.pulse()`).
        // The detector MUST continue emitting `sunsetted` / `reason` / `originSessionId` /
        // `abandonedCount` alongside the new structured shape.
        const scriptPath = path.resolve(process.cwd(), 'ai/scripts/lifecycle/checkSunsetted.mjs');
        const output = execFileSync('node', [scriptPath, '@neo-legacy-fields-test'], {encoding: 'utf-8'});
        const parsed = JSON.parse(output);

        // Every legacy field is present + correctly typed.
        expect(parsed).toHaveProperty('sunsetted');
        expect(parsed).toHaveProperty('reason');
        expect(parsed).toHaveProperty('originSessionId');
        expect(parsed).toHaveProperty('abandonedCount');
        expect(typeof parsed.sunsetted).toBe('boolean');
        expect(typeof parsed.reason).toBe('string');
        expect(typeof parsed.originSessionId).toBe('string');
        expect(typeof parsed.abandonedCount).toBe('number');

        // New detector-contract fields also present.
        expect(parsed).toHaveProperty('sunset');
        expect(parsed).toHaveProperty('idle_out_candidate');
        expect(parsed).toHaveProperty('evidence');
        expect(parsed).toHaveProperty('recommended_action');
        expect(parsed.evidence).toHaveProperty('subscription_active');
        expect(parsed.evidence).toHaveProperty('subscription_status');
        expect(parsed.evidence).toHaveProperty('last_memory_age_min');
        expect(parsed.evidence).toHaveProperty('last_sessionId');

        // Legacy `sunsetted` mirrors new `sunset` — single source of truth.
        expect(parsed.sunsetted).toBe(parsed.sunset);
        // Legacy `originSessionId` mirrors `evidence.last_sessionId`.
        expect(parsed.originSessionId).toBe(parsed.evidence.last_sessionId);
    });

    test('detector contract: (sunset=T, idle_out=T) is structurally impossible — invariant (#10673 AC4)', async () => {
        test.skip(skipCiSubstrateData, 'CI-skip: substrate data not seeded - bucket C (#10903)');

        // The two signals are mutually exclusive by construction:
        //   - sunset=true requires subscription_active=false
        //   - idle_out_candidate=true requires subscription_active=true
        // No detector input can produce both true simultaneously. This test documents the
        // invariant by exercising every plausible input shape and asserting NEVER both.
        const GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        await GraphService.initAsync();
        const db = GraphService.db.storage.db;

        const testIdentity = '@neo-invariant-test';
        const scriptPath   = path.resolve(process.cwd(), 'ai/scripts/lifecycle/checkSunsetted.mjs');
        const insertStmt   = db.prepare(`INSERT INTO Nodes (id, user_id, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`);
        const deleteStmt   = db.prepare('DELETE FROM Nodes WHERE id = ?');

        const scenarios = [
            {label: 'no sub + no memory',                   subStatus: null,        memAgeMin: null},
            {label: 'no sub + fresh memory',                 subStatus: null,        memAgeMin: 1},
            {label: 'no sub + stale memory',                 subStatus: null,        memAgeMin: 1440},
            {label: 'active sub + no memory',                subStatus: 'active',    memAgeMin: null},
            {label: 'active sub + fresh memory',             subStatus: 'active',    memAgeMin: 1},
            {label: 'active sub + stale memory',             subStatus: 'active',    memAgeMin: 1440},
            {label: 'disabled sub + fresh memory',           subStatus: 'disabled',  memAgeMin: 1},
            {label: 'degraded sub + stale memory',           subStatus: 'degraded',  memAgeMin: 1440}
        ];

        const subId = 'sub-invariant-test';
        const memId = 'mem-invariant-test';

        try {
            for (const scenario of scenarios) {
                deleteStmt.run(subId);
                deleteStmt.run(memId);

                if (scenario.subStatus) {
                    const subData = {
                        id: subId, label: 'WAKE_SUBSCRIPTION', type: 'WAKE_SUBSCRIPTION',
                        properties: {
                            agentIdentity: testIdentity,
                            harnessTarget: scenario.subStatus === 'disabled' ? 'disabled' : 'claude-desktop',
                            status       : scenario.subStatus === 'degraded' ? 'degraded' : 'active'
                        }
                    };
                    insertStmt.run(subId, testIdentity, JSON.stringify(subData));
                }

                if (scenario.memAgeMin !== null) {
                    const memTime = new Date(Date.now() - scenario.memAgeMin * 60000).toISOString();
                    const memData = {
                        id: memId, label: 'AGENT_MEMORY', type: 'AGENT_MEMORY',
                        properties: {
                            userId        : testIdentity,
                            agentIdentity : testIdentity,
                            timestamp     : memTime,
                            sessionId     : '22222222-2222-2222-2222-222222222222',
                            name          : `Memory: ${memTime}`,
                            description   : 'Agent thought flow inside session 22222222-2222-2222-2222-222222222222.'
                        }
                    };
                    insertStmt.run(memId, testIdentity, JSON.stringify(memData));
                }

                const output = execFileSync('node', [scriptPath, testIdentity], {encoding: 'utf-8'});
                const parsed = JSON.parse(output);

                // The invariant: never both true simultaneously.
                expect(parsed.sunset && parsed.idle_out_candidate, `[${scenario.label}] (T,T) violation`).toBe(false);
            }
        } finally {
            deleteStmt.run(subId);
            deleteStmt.run(memId);
        }
    });

    // Note (#11766): the former `swarm-heartbeat.sh integrates the sunset detection
    // properly before the bypass` test was removed with the bash script. The
    // sunset-detection-before-heartbeat-bypass ordering is now covered against the JS
    // lane in `test/playwright/unit/ai/daemons/SwarmHeartbeatService.spec.mjs`.
});
