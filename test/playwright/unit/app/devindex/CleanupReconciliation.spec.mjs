import {setup} from '../../../setup.mjs';

const appName = 'DevIndexCleanupReconciliationTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Cleanup        from '../../../../../apps/devindex/services/Cleanup.mjs';
import GitHub         from '../../../../../apps/devindex/services/GitHub.mjs';

test.describe('DevIndex Cleanup rich-user tracker reconciliation', () => {
    let originalGetLoginByDatabaseId;

    test.beforeEach(() => {
        originalGetLoginByDatabaseId = GitHub.getLoginByDatabaseId;
    });

    test.afterEach(() => {
        GitHub.getLoginByDatabaseId = originalGetLoginByDatabaseId;
    });

    test('restores same-login rich-user orphans to the tracker', async () => {
        const users = [{
            l : 'SameLogin',
            i : 12345,
            lu: '2026-05-17T10:00:00.000Z',
            tc: 5000
        }];

        const tracker = [];
        const failed  = new Map([['samelogin', '2026-05-16T10:00:00.000Z']]);

        GitHub.getLoginByDatabaseId = async () => 'SameLogin';

        const stats = await Cleanup.reconcileRichUsersWithTracker({
            users,
            tracker,
            failed,
            blocklist: new Set()
        });

        expect(stats).toMatchObject({
            richOrphans      : 1,
            restored         : 1,
            renamed          : 0,
            prunedMissingUser: 0,
            prunedConflicts  : 0
        });
        expect(stats.users).toEqual(users);
        expect(tracker).toEqual([{login: 'SameLogin', lastUpdate: users[0].lu}]);
        expect(failed.has('samelogin')).toBe(false);
    });

    test('migrates renamed rich-user orphans without requeueing stale logins', async () => {
        const users = [{
            l : '0xBigBoss',
            i : 95193764,
            lu: '2026-05-08T15:18:19.485Z',
            tc: 17244
        }];

        const tracker = [];
        const failed  = new Map();

        GitHub.getLoginByDatabaseId = async () => 'alleneubank';

        const stats = await Cleanup.reconcileRichUsersWithTracker({
            users,
            tracker,
            failed,
            blocklist: new Set()
        });

        expect(stats).toMatchObject({
            richOrphans      : 1,
            restored         : 0,
            renamed          : 1,
            prunedMissingUser: 0,
            prunedConflicts  : 0
        });
        expect(stats.users).toHaveLength(1);
        expect(stats.users[0]).toMatchObject({
            l : 'alleneubank',
            i : 95193764,
            lu: '2026-05-08T15:18:19.485Z'
        });
        expect(tracker).toEqual([{login: 'alleneubank', lastUpdate: users[0].lu}]);
        expect(tracker.some(entry => entry.login === '0xBigBoss')).toBe(false);
    });

    test('prunes rich-user orphans whose stored GitHub id no longer resolves', async () => {
        const users = [{
            l : 'DeletedUser',
            i : 67890,
            lu: '2026-05-01T10:00:00.000Z',
            tc: 4000
        }];

        const tracker = [];
        const failed  = new Map([['deleteduser', '2026-05-16T10:00:00.000Z']]);

        GitHub.getLoginByDatabaseId = async () => null;

        const stats = await Cleanup.reconcileRichUsersWithTracker({
            users,
            tracker,
            failed,
            blocklist: new Set()
        });

        expect(stats).toMatchObject({
            richOrphans      : 1,
            restored         : 0,
            renamed          : 0,
            prunedMissingUser: 1,
            prunedConflicts  : 0
        });
        expect(stats.users).toEqual([]);
        expect(tracker).toEqual([]);
        expect(failed.has('deleteduser')).toBe(false);
    });

    test('rethrows transient resolver failures instead of blind requeueing', async () => {
        const users = [{
            l : 'TransientUser',
            i : 24680,
            lu: '2026-05-01T10:00:00.000Z',
            tc: 4000
        }];

        GitHub.getLoginByDatabaseId = async () => {
            throw new Error('REST Error: 502 Bad Gateway');
        };

        await expect(Cleanup.reconcileRichUsersWithTracker({
            users,
            tracker  : [],
            failed   : new Map(),
            blocklist: new Set()
        })).rejects.toThrow('REST Error: 502 Bad Gateway');
    });
});
