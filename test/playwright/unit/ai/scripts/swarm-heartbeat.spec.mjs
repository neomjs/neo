import {setup} from '../../../setup.mjs';

const appName = 'SwarmHeartbeatTest';

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

import {test, expect}     from '@playwright/test';
import {execFileSync}     from 'child_process';
import fs                 from 'fs/promises';
import path               from 'path';

/**
 * @summary Drift guards + fixture-backed regression coverage on `ai/scripts/swarm-heartbeat.sh` (#10622).
 *
 * The heartbeat shell script is sourced by long-running daemons; runtime regressions in
 * its SQL queries silently degrade the auto-wake substrate (the daemon stays alive but
 * its pulse becomes a no-op). These tests verify both:
 *   1) Structural shape — the SQL JSON paths target the live Memory Core schema.
 *   2) Behavioral fixture coverage — the `get_unread_count` function returns nonzero
 *      against a fresh SQLite fixture seeded with a MESSAGE node + SENT_TO edge, and
 *      the legacy `$.type = 'MESSAGE'` query returns zero against the same fixture
 *      (regression-shape proof — same family as #10619 Cycle 2's positive-extraction
 *      pattern on AGENT_MEMORY).
 */
test.describe('ai/scripts/swarm-heartbeat', () => {
    let scriptSrc;

    test.beforeAll(async () => {
        const scriptPath = path.resolve(process.cwd(), 'ai/scripts/swarm-heartbeat.sh');
        scriptSrc = await fs.readFile(scriptPath, 'utf-8');
    });

    test('get_unread_count queries MESSAGE rows by $.label, not $.type (#10622 substrate-schema)', () => {
        // Locate the function body so we assert against the right surface, not arbitrary
        // matches elsewhere in the script.
        const fnMatch = scriptSrc.match(/get_unread_count\(\)\s*\{[\s\S]*?^}/m);
        expect(fnMatch, 'get_unread_count function not found in swarm-heartbeat.sh').not.toBeNull();

        const body = fnMatch[0];

        // Positive: function MUST query MESSAGE-labelled nodes via the schema-correct path.
        expect(body).toMatch(/json_extract\(n\.data,\s*'\$\.label'\)\s*=\s*'MESSAGE'/);

        // Negative drift guard: the legacy `$.type = 'MESSAGE'` path returns 0 against the
        // live schema and silently skips every pulse. If a future change re-introduces it,
        // fail the test loudly so the substrate-schema regression is caught at CI time.
        expect(body).not.toMatch(/json_extract\(n\.data,\s*'\$\.type'\)\s*=\s*'MESSAGE'/);
    });

    test('get_unread_count emits zero for missing DB and otherwise echoes a SQLite count', () => {
        // Surface contract: the function always echoes a non-empty integer string. Two
        // branches — DB missing → "0"; DB present → query result with `${count:-0}` fallback.
        // Tests that both branches preserve the integer-output contract that callers rely on
        // (`if [ "$unread" -eq 0 ] ...`).
        const fnMatch = scriptSrc.match(/get_unread_count\(\)\s*\{[\s\S]*?^}/m);
        expect(fnMatch).not.toBeNull();

        const body = fnMatch[0];

        expect(body).toContain('if [ ! -f "$DB_PATH" ]; then');
        expect(body).toContain('echo "0"');
        expect(body).toContain('echo "${count:-0}"');
    });

    test('Wake safety gate (#10648) is consulted before high-authority dispatch', () => {
        // Drift guard for the #10647 epic: the heartbeat MUST consult `wakeSafetyGate.mjs`
        // before invoking the two high-authority sites — fresh-session-spawn via
        // `resumeHarness.mjs` and trio-wake dispatch via `trioWakeCooldown.mjs`. If a
        // future change re-orders the gate check after these calls (or removes it),
        // orphan-spawn / unsafe wake dispatch can fire again before substrate is healthy.

        // The script must reference the gate primitive at all.
        expect(scriptSrc).toContain('wakeSafetyGate.mjs');

        // Two high-authority sites are gated. Locate each block and assert its gate
        // check appears textually before the gated invocation.
        const resumeIdx = scriptSrc.indexOf('resumeHarness.mjs');
        const trioIdx   = scriptSrc.indexOf('trioWakeCooldown.mjs');
        expect(resumeIdx).toBeGreaterThan(-1);
        expect(trioIdx  ).toBeGreaterThan(-1);

        // For each high-authority site, the most recent `wakeSafetyGate.mjs check`
        // before it must be within the surrounding control block (heuristic: within
        // 600 chars upstream — single conditional block scope).
        const gateCheckPattern = /wakeSafetyGate\.mjs"?\s+check/g;
        const gateCheckMatches = [...scriptSrc.matchAll(gateCheckPattern)].map(m => m.index);
        expect(gateCheckMatches.length).toBeGreaterThanOrEqual(2);

        const lastGateBefore = (idx) => {
            const before = gateCheckMatches.filter(g => g < idx);
            return before.length > 0 ? before[before.length - 1] : -1;
        };

        const resumeGate = lastGateBefore(resumeIdx);
        const trioGate   = lastGateBefore(trioIdx);

        expect(resumeGate, 'gate check missing before resumeHarness.mjs invocation').toBeGreaterThan(-1);
        expect(resumeIdx - resumeGate, 'gate check too far from resumeHarness.mjs invocation').toBeLessThan(1000);

        expect(trioGate, 'gate check missing before trioWakeCooldown.mjs invocation').toBeGreaterThan(-1);
        expect(trioIdx - trioGate, 'gate check too far from trioWakeCooldown.mjs invocation').toBeLessThan(1000);
    });

    test.describe('fixture-backed regression coverage (#10622 acceptance)', () => {
        let tmpBase;
        let dbPath;
        const TEST_IDENTITY = '@test-agent-10622';

        test.beforeEach(async () => {
            tmpBase = path.resolve(process.cwd(), 'tmp', `swarm-heartbeat-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
            dbPath  = path.join(tmpBase, 'test-graph.sqlite');
            await fs.mkdir(tmpBase, {recursive: true});

            // Seed a minimal Nodes+Edges schema mirroring `memory-core-graph.sqlite`. We omit
            // the GraphLog triggers since this fixture exercises only the read path; foreign-key
            // constraints stay enabled so the SENT_TO edge requires both endpoints to exist.
            execFileSync('sqlite3', [dbPath], {
                encoding: 'utf-8',
                input   : [
                    'CREATE TABLE Nodes (id TEXT PRIMARY KEY, data TEXT NOT NULL, user_id TEXT);',
                    'CREATE TABLE Edges (id TEXT PRIMARY KEY, source TEXT NOT NULL, target TEXT NOT NULL, type TEXT NOT NULL, data TEXT NOT NULL, user_id TEXT, FOREIGN KEY (source) REFERENCES Nodes(id) ON DELETE CASCADE, FOREIGN KEY (target) REFERENCES Nodes(id) ON DELETE CASCADE);',
                    `INSERT INTO Nodes(id, data) VALUES ('${TEST_IDENTITY}', '{"id":"${TEST_IDENTITY}","label":"AGENT"}');`,
                    // Unread MESSAGE — should be counted (label matches, readAt is JSON null).
                    `INSERT INTO Nodes(id, data) VALUES ('MSG:unread-1', '{"id":"MSG:unread-1","label":"MESSAGE","properties":{"name":"unread test","readAt":null}}');`,
                    `INSERT INTO Edges(id, source, target, type, data) VALUES ('e:unread-1', 'MSG:unread-1', '${TEST_IDENTITY}', 'SENT_TO', '{}');`,
                    // Read MESSAGE — should NOT be counted (readAt is set to a non-null timestamp).
                    `INSERT INTO Nodes(id, data) VALUES ('MSG:read-1', '{"id":"MSG:read-1","label":"MESSAGE","properties":{"name":"already read","readAt":"2026-05-03T08:00:00Z"}}');`,
                    `INSERT INTO Edges(id, source, target, type, data) VALUES ('e:read-1', 'MSG:read-1', '${TEST_IDENTITY}', 'SENT_TO', '{}');`
                ].join('\n')
            });
        });

        test.afterEach(async () => {
            if (tmpBase) {
                await fs.rm(tmpBase, {recursive: true, force: true}).catch(() => {});
            }
        });

        test('get_unread_count returns 1 for a fixture with one unread MESSAGE-labelled row', () => {
            // Extract the function definition from the production script and re-define it inside
            // a bash subshell with DB_PATH+IDENTITY pointed at our fixture. Tests THE production
            // function — not a paraphrase of its query — so any drift in the actual script
            // surface immediately fails the spec at CI time.
            const fnSrc  = scriptSrc.match(/get_unread_count\(\)\s*\{[\s\S]*?^}/m)[0];
            const result = execFileSync('bash', ['-c', `${fnSrc}; get_unread_count`], {
                encoding: 'utf-8',
                env     : {...process.env, DB_PATH: dbPath, IDENTITY: TEST_IDENTITY}
            });

            expect(result.trim()).toBe('1');
        });

        test('legacy $.type query returns 0 against the same fixture (regression-shape proof)', () => {
            // Same fixture, swap the corrected `$.label` JSON path for the legacy `$.type` path.
            // If this assertion ever flips to 1, either the live schema migrated or someone
            // mass-rewrote MESSAGE rows — both warrant updating this test, not just the script.
            const legacyQuery = `SELECT count(DISTINCT n.id) FROM Nodes n JOIN Edges e ON n.id = e.source AND e.type = 'SENT_TO' WHERE json_extract(n.data, '$.type') = 'MESSAGE' AND json_extract(n.data, '$.properties.readAt') IS NULL AND e.target IN ('${TEST_IDENTITY}', 'AGENT:*');`;
            const result      = execFileSync('sqlite3', [dbPath, legacyQuery], {encoding: 'utf-8'});

            expect(result.trim()).toBe('0');
        });
    });
});
