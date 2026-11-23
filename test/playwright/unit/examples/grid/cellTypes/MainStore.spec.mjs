import {setup} from '../../../../setup.mjs';

setup({appConfig: {name: 'CellTypesStoreTest'}});

import {test, expect}                  from '@playwright/test';
import Neo                             from '../../../../../../src/Neo.mjs';
import * as core                       from '../../../../../../src/core/_export.mjs';
import MainStore, {buildDirectoryRows} from '../../../../../../examples/grid/cellTypes/MainStore.mjs';

test.describe('examples/grid/cellTypes MainStore', () => {
    test('builds 32 deterministic public maintainer rows with non-empty values for every column type', () => {
        const firstRun  = buildDirectoryRows(),
              secondRun = buildDirectoryRows();

        expect(firstRun).toHaveLength(32);
        expect(secondRun).toEqual(firstRun);

        const store = Neo.create(MainStore);

        expect(store.getCount()).toBe(32);

        for (const record of store.items) {
            expect(record.login).toBeTruthy();
            expect(record.name).toBeTruthy();
            expect(record.avatarUrl).toBeGreaterThan(0);
            expect(record.countryCode).toMatch(/^[A-Z]{2}$/);
            expect(record.location).toBeTruthy();
            expect(record.ecosystem).toBeTruthy();
            expect(record.annualGoal).toBeGreaterThanOrEqual(24000);
            expect(record.pledged).toBeGreaterThan(0);
            expect(record.goalPercent).toBeGreaterThan(0);
            expect(record.recentCommits).toBeGreaterThan(0);
            expect(record.trend).toHaveLength(8);
            expect(record.tierIcon).toMatch(/^fa-solid /);
            expect(record.topRepoUrl).toMatch(/^https:\/\/github\.com\/.+\/.+$/);
            expect(record.topRepoStars).toContain('★');
            expect(record.linkedin).toBeTruthy();
            expect(record.organizations.length).toBeGreaterThanOrEqual(1);
            expect(record.actionLabel).toBe('+$250')
        }

        const first         = store.getAt(0),
              seededPledged = first.pledged;

        first.set({pledged: first.annualGoal});
        expect(first.pledged).toBe(first.annualGoal);
        expect(first.goalPercent).toBe(100);

        store.resetDirectory();
        expect(store.getAt(0).pledged).toBe(seededPledged);

        store.destroy()
    })
});
