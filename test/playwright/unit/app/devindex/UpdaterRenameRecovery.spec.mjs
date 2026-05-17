import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'DevIndexUpdaterRenameRecoveryTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import GitHub         from '../../../../../apps/devindex/services/GitHub.mjs';
import Storage        from '../../../../../apps/devindex/services/Storage.mjs';
import Updater        from '../../../../../apps/devindex/services/Updater.mjs';

test.describe.serial('DevIndex Updater rename recovery (#11516)', () => {
    let originalFetchUserData,
        originalGetLoginByDatabaseId,
        originalGetAllowlist,
        originalGetLowestContributionThreshold,
        originalGetUsers,
        originalRateLimit,
        originalUpdateFailed,
        originalUpdateTracker,
        originalUpdateUsers,
        originalDeleteUsers,
        calls;

    test.beforeEach(() => {
        originalFetchUserData                 = Updater.fetchUserData;
        originalGetLoginByDatabaseId          = GitHub.getLoginByDatabaseId;
        originalGetAllowlist                  = Storage.getAllowlist;
        originalGetLowestContributionThreshold = Storage.getLowestContributionThreshold;
        originalGetUsers                      = Storage.getUsers;
        originalRateLimit                     = GitHub.rateLimit;
        originalUpdateFailed                  = Storage.updateFailed;
        originalUpdateTracker                 = Storage.updateTracker;
        originalUpdateUsers                   = Storage.updateUsers;
        originalDeleteUsers                   = Storage.deleteUsers;

        calls = {
            deleteUsers  : [],
            failedUpdates: [],
            tracker      : [],
            users        : []
        };

        GitHub.rateLimit = {
            core: {
                limit    : 5000,
                remaining: 5000
            }
        };

        Storage.getAllowlist                  = async () => new Set();
        Storage.getLowestContributionThreshold = async () => 0;
        Storage.getUsers                      = async () => [{
            l : '0xBigBoss',
            i : 95193764,
            lu: '2026-05-08T15:18:19.485Z',
            tc: 17244
        }];
        Storage.updateFailed                  = async (logins, add) => calls.failedUpdates.push({logins, add});
        Storage.updateTracker                 = async updates => calls.tracker.push(...updates);
        Storage.updateUsers                   = async records => calls.users.push(...records);
        Storage.deleteUsers                   = async logins => calls.deleteUsers.push(...logins);
    });

    test.afterEach(() => {
        Updater.fetchUserData                 = originalFetchUserData;
        GitHub.getLoginByDatabaseId          = originalGetLoginByDatabaseId;
        GitHub.rateLimit                     = originalRateLimit;
        Storage.getAllowlist                 = originalGetAllowlist;
        Storage.getLowestContributionThreshold = originalGetLowestContributionThreshold;
        Storage.getUsers                     = originalGetUsers;
        Storage.updateFailed                 = originalUpdateFailed;
        Storage.updateTracker                = originalUpdateTracker;
        Storage.updateUsers                  = originalUpdateUsers;
        Storage.deleteUsers                  = originalDeleteUsers;
    });

    test('keeps the old rich record protected when replacement login fetch returns no data', async () => {
        GitHub.getLoginByDatabaseId = async () => 'alleneubank';

        Updater.fetchUserData = async login => {
            if (login === '0xBigBoss') {
                throw new Error('NOT_FOUND');
            }
            return null;
        };

        await Updater.processBatch(['0xBigBoss']);

        expect(calls.deleteUsers).toEqual([]);
        expect(calls.users).toEqual([]);
        expect(calls.tracker).toHaveLength(1);
        expect(calls.tracker[0]).toMatchObject({login: '0xBigBoss'});
        expect(calls.tracker[0].delete).toBe(undefined);
        expect(calls.failedUpdates).toEqual([{logins: ['0xBigBoss'], add: true}]);
    });

    test('prunes old login only after the renamed replacement was fetched', async () => {
        const replacement = {
            l : 'alleneubank',
            i : 95193764,
            lu: '2026-05-17T02:00:00.000Z',
            tc: 18000
        };

        GitHub.getLoginByDatabaseId = async () => 'alleneubank';

        Updater.fetchUserData = async login => {
            if (login === '0xBigBoss') {
                throw new Error('NOT_FOUND');
            }
            return replacement;
        };

        await Updater.processBatch(['0xBigBoss']);

        expect(calls.users).toEqual([replacement]);
        expect(calls.deleteUsers).toEqual(['0xBigBoss']);
        expect(calls.tracker).toEqual([
            {login: '0xBigBoss', delete: true},
            {login: 'alleneubank', lastUpdate: replacement.lu}
        ]);
        expect(calls.failedUpdates).toEqual([]);
    });
});
