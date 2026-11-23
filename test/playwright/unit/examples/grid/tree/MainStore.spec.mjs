import {setup} from '../../../../setup.mjs';

setup({appConfig: {name: 'TreeGridRollupStoreTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import MainStore      from '../../../../../../examples/grid/tree/MainStore.mjs';

test.describe('examples/grid/tree MainStore', () => {
    test('opens on 16 first-level rows over 52 three-level nodes and computes every parent sum from its children', () => {
        const store = Neo.create(MainStore);

        // 4 expanded departments + 12 collapsed teams = 16 visible rows out of 52 total nodes
        expect(store.getCount()).toBe(16);

        const roots = store.getChildren('root');
        expect(roots).toHaveLength(4);

        let totalNodes = 0;

        const assertParentRollup = parent => {
            totalNodes++;

            const children = store.getChildren(parent.id);

            if (parent.isLeaf) {
                expect(children).toHaveLength(0);
                expect(parent.budget).toBeGreaterThan(0);
                expect(parent.utilization).toBe(Math.round((parent.spent / parent.budget) * 100));
                return
            }

            expect(children.length).toBeGreaterThan(0);

            let sumBudget    = 0,
                sumHeadcount = 0,
                sumSpent     = 0;

            for (const child of children) {
                assertParentRollup(child);
                sumBudget    += child.budget;
                sumHeadcount += child.headcount;
                sumSpent     += child.spent
            }

            expect(parent.budget,    `${parent.id} budget`).toBe(sumBudget);
            expect(parent.headcount, `${parent.id} headcount`).toBe(sumHeadcount);
            expect(parent.spent,     `${parent.id} spent`).toBe(sumSpent);
            expect(parent.utilization, `${parent.id} utilization`).toBe(Math.round((sumSpent / sumBudget) * 100))
        };

        for (const root of roots) {
            assertParentRollup(root)
        }

        expect(totalNodes).toBe(52);

        store.destroy()
    });

    test('editing a leaf item recomputes its team and department roll-ups', () => {
        const store    = Neo.create(MainStore),
              leaf     = store.get('item-worker-pool'),
              team     = store.get('team-runtime'),
              dept     = store.get('dept-platform'),
              teamBase = team.budget,
              deptBase = dept.budget;

        leaf.set({
            budget   : leaf.budget + 120000,
            headcount: leaf.headcount + 2,
            spent    : leaf.spent + 90000
        });

        expect(team.budget).toBe(teamBase + 120000);
        expect(dept.budget).toBe(deptBase + 120000);
        expect(team.utilization).toBe(Math.round((team.spent / team.budget) * 100));
        expect(dept.utilization).toBe(Math.round((dept.spent / dept.budget) * 100));

        store.resetHierarchy();

        expect(store.get('team-runtime').budget).toBe(teamBase);
        expect(store.get('dept-platform').budget).toBe(deptBase);

        store.destroy()
    });

    test('a ratio-changing leaf edit recomputes the edited leaf utilization alongside its ancestors', () => {
        const store = Neo.create(MainStore),
              leaf  = store.get('item-worker-pool'),
              team  = store.get('team-runtime'),
              dept  = store.get('dept-platform');

        expect(leaf.utilization).toBe(75);
        expect(store.get('item-signing').owner).toBe('Kwame Mensah');

        leaf.set({spent: leaf.spent + 200000});

        expect(leaf.utilization).toBe(117);
        expect(team.utilization).toBe(Math.round((team.spent / team.budget) * 100));
        expect(dept.utilization).toBe(Math.round((dept.spent / dept.budget) * 100));

        store.destroy()
    })
});
