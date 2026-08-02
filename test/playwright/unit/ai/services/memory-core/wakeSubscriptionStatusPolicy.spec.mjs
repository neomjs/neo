import {setup} from '../../../../setup.mjs';

const appName = 'WakeSubscriptionStatusPolicyTest';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {name: appName, isMounted: () => true, vnodeInitialising: false}
});

import {test, expect} from '@playwright/test';
import Database       from 'better-sqlite3';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

import {
    activeWakeSubscriptionStatusSql,
    isActiveWakeSubscriptionStatus,
    resolvedWakeSubscriptionStatusSql,
    WAKE_SUBSCRIPTION_DEFAULT_STATUS
} from '../../../../../../ai/services/memory-core/wakeSubscriptionStatusPolicy.mjs';

/**
 * @summary Pins the one question the policy owns: what an absent `status` means, and what it does
 * NOT extend to.
 *
 * The JS predicate and the SQL predicate must agree for every input, because the split this module
 * removed was exactly a SQL reader and a JS reader disagreeing about the same row.
 */
test.describe('Neo.ai.services.memory-core.wakeSubscriptionStatusPolicy (#16331)', () => {
    /**
     * Runs the shipped SQL predicate against a one-row table whose `status` is whatever the caller
     * supplies — `ABSENT` removes the property entirely, which is the specimen the whole ticket is
     * about and the one a hand-built fixture usually fails to produce.
     */
    function sqlAdmits(status) {
        const db = new Database(':memory:');
        db.exec('CREATE TABLE Nodes (id TEXT, data TEXT)');

        const properties = {agentIdentity: '@spec', harnessTarget: 'a2a-webhook'};
        if (status !== 'ABSENT') properties.status = status;

        db.prepare('INSERT INTO Nodes VALUES (?, ?)')
            .run('WAKE_SUB:spec', JSON.stringify({id: 'WAKE_SUB:spec', label: 'WAKE_SUBSCRIPTION', properties}));

        const count = db.prepare(`SELECT COUNT(*) c FROM Nodes WHERE ${activeWakeSubscriptionStatusSql()}`).get().c;
        db.close();
        return count === 1
    }

    test('absent status is active — in JS and in SQL, and the two agree', () => {
        expect(isActiveWakeSubscriptionStatus(undefined)).toBe(true);
        expect(isActiveWakeSubscriptionStatus(null)).toBe(true);

        // POSITIVE CONTROL for the SQL harness itself: an explicitly-active row must be admitted, or
        // a `true` below would prove only that the query matches everything.
        expect(sqlAdmits('active')).toBe(true);
        expect(sqlAdmits('ABSENT')).toBe(true);
    });

    test('explicit terminal and unknown states fail closed — absence is the ONLY defaulted case', () => {
        // The `|| 'active'` spelling that survived three sweeps coerced every falsy value to active.
        // These values show the widened set it silently admitted and why the policy uses `??`.
        for (const unknown of ['retired', 'degraded', '', false, 0, 'unrecognised-future-state']) {
            expect(isActiveWakeSubscriptionStatus(unknown)).toBe(false);
            expect(sqlAdmits(unknown)).toBe(false);
        }
    });

    test('the SQL resolver yields the effective status for readers asking a different question', () => {
        // `SwarmHeartbeatService` needs "not degraded", not "is active". It composes the resolver so
        // the absent-case answer stays shared even when the comparison differs — re-typing the
        // default literal there is how the original split began.
        const db = new Database(':memory:');
        db.exec('CREATE TABLE Nodes (id TEXT, data TEXT)');
        db.prepare('INSERT INTO Nodes VALUES (?, ?)')
            .run('WAKE_SUB:noStatus', JSON.stringify({properties: {agentIdentity: '@spec'}}));

        const resolved = db.prepare(`SELECT ${resolvedWakeSubscriptionStatusSql()} AS s FROM Nodes`).get().s;
        db.close();

        expect(resolved).toBe(WAKE_SUBSCRIPTION_DEFAULT_STATUS);
        expect(resolved).toBe('active');
    });

    test('the SessionService exclusion predicate admits an absent-status row (#16331)', () => {
        // `getExternallyActiveSessionIds` required raw `status = 'active'` and therefore dropped a
        // legacy row while the rest of the substrate counted it. Its query aliases the subscription
        // table, so the column-qualified form is what actually ships — asserted here rather than
        // assumed to behave like the unqualified one.
        const db = new Database(':memory:');
        db.exec('CREATE TABLE Nodes (id TEXT, data TEXT)');
        db.prepare('INSERT INTO Nodes VALUES (?, ?)')
            .run('WAKE_SUB:legacy', JSON.stringify({
                label     : 'WAKE_SUBSCRIPTION',
                properties: {agentIdentity: '@spec', harnessTarget: 'a2a-webhook'}
            }));

        const shipped = db.prepare(
            `SELECT COUNT(*) c FROM Nodes subscription WHERE ${activeWakeSubscriptionStatusSql('subscription.data')}`
        ).get().c;

        // The pre-fix form, run side by side so the difference is demonstrated rather than described.
        const strict = db.prepare(
            `SELECT COUNT(*) c FROM Nodes subscription WHERE json_extract(subscription.data, '$.properties.status') = 'active'`
        ).get().c;

        db.close();

        expect(strict).toBe(0);
        expect(shipped).toBe(1);
    });
});
