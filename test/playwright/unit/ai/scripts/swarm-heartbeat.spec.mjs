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

import {test, expect} from '@playwright/test';
import fs             from 'fs/promises';
import path           from 'path';

/**
 * @summary Drift guards on `ai/scripts/swarm-heartbeat.sh` — substrate-schema parity (#10622).
 *
 * The heartbeat shell script is sourced by long-running daemons; runtime regressions in
 * its SQL queries silently degrade the auto-wake substrate (the daemon stays alive but
 * its pulse becomes a no-op). The tests below structurally verify the SQL JSON paths
 * against the live Memory Core graph schema. Pattern parity with #10619 Cycle 2's
 * positive-extraction discipline: a previous version of `get_unread_count` queried
 * `$.type = 'MESSAGE'` while MESSAGE nodes use `$.label`, returning 0 unread regardless
 * of mailbox state and silently skipping every pulse via the token-economy gate.
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
});
