import {test, expect} from '@playwright/test';
import {setup}        from '../../setup.mjs';
import Neo            from '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs';
import DependencyStore from '../../../../src/gantt/DependencyStore.mjs';
import GanttContainer  from '../../../../src/gantt/Container.mjs';
import TaskStore       from '../../../../src/gantt/TaskStore.mjs';

const appName = 'GanttCascadeMotionTest';

setup({
    neoConfig: {unitTestMode: true, allowVdomUpdatesInTests: false, useDomApiRenderer: false},
    appConfig: {name: appName, isMounted: () => true, vnodeInitialising: false}
});

// At 1 px per minute an hour is 60 px. Moving "a" an hour later carries its successor "b" an hour later too.
const ease  = 'cubic-bezier(0.22, 1, 0.36, 1)',
      moveA = {startDate: '2026-11-09T02:00:00Z', endDate: '2026-11-09T03:00:00Z'};

test.describe('Neo.gantt.CascadeMotion', () => {
    let gantt, readTokens;

    /** The chart reads its motion tokens from its node through the main thread. */
    const tokens = styles => Neo.main.DomAccess.getComputedStyle = async () => styles;

    /** Creates the chart and lets its stores fire their deferred first `load`, which lands a running move. */
    const create = async (config={}) => {
        gantt = Neo.create(GanttContainer, {
            appName,
            store          : {module: TaskStore, data: [
                {id: 'a', parentId: null, isLeaf: true, title: 'A', startDate: '2026-11-09T01:00:00Z', endDate: '2026-11-09T02:00:00Z'},
                {id: 'b', parentId: null, isLeaf: true, title: 'B', startDate: '2026-11-09T02:00:00Z', endDate: '2026-11-09T03:00:00Z'},
                {id: 'c', parentId: null, isLeaf: true, title: 'C', startDate: '2026-11-09T05:00:00Z', endDate: '2026-11-09T06:00:00Z'}
            ]},
            dependencyStore: {module: DependencyStore, data: [{id: 'ab', fromId: 'a', toId: 'b', type: 'FS', lag: 0, lagUnit: 'minute'}]},
            timeAxis       : {start: '2026-11-09T00:00:00Z', end: '2026-11-09T12:00:00Z', tickUnit: 'hour', tickStep: 1, pxPerMinute: 1, snapMinutes: 15},
            viewportWidth  : 800,
            ...config
        });
        gantt.body.set({availableHeight: 200, containerWidth: 1000});
        gantt.timelineColumn.refreshMountedRows();
        gantt.syncDependencyLayer();
        await new Promise(resolve => setTimeout(resolve))
    };

    /** The drawn `left` of the bar in row `index` (rows a, b, c). */
    const barLeft = index => parseFloat(gantt.body.items[index].vdom.cn[0].cn[0].cn[0].cn[0].style.left);
    /** The link's two ends, from its path: a's finish and b's start. */
    const link = () => {
        const points = gantt.dependencyLayer.arrows[0].d.split(' ').filter(token => !/[ML]/.test(token)).map(Number);
        return [points[0], points.at(-2)]
    };
    /** Waits until the steps have moved b off its previous place. */
    const midway = () => expect.poll(() => barLeft(1) > 120 && barLeft(1) < 180).toBe(true);

    test.beforeEach(() => {
        Neo.ns('Neo.main.DomAccess', true);
        readTokens = Neo.main.DomAccess.getComputedStyle
    });

    test.afterEach(() => {
        Neo.config.prefersReducedMotion = false;
        Neo.main.DomAccess.getComputedStyle = readTokens;
        gantt?.destroy();
        gantt = null
    });

    test('off by default: a cascade lands in one update', async () => {
        await create();
        expect(gantt.animateCascade).toBe(false);

        gantt.moveTask('a', moveA);

        expect(gantt.drawnSpans.size).toBe(0);
        expect([barLeft(0), barLeft(1), barLeft(2)]).toEqual([120, 180, 300]);
        expect(link()).toEqual([180, 180])
    });

    test('on: the edit and its cascade start at their previous spans, the records at their final dates', async () => {
        tokens({'--neo-duration-panel': '20000ms', '--neo-ease-out': ease});
        await create({animateCascade: true});

        gantt.moveTask('a', moveA);

        expect(gantt.store.get('b').startDate.toISOString()).toBe('2026-11-09T03:00:00.000Z');
        expect([...gantt.drawnSpans.keys()]).toEqual(['a', 'b']);
        expect([barLeft(0), barLeft(1), barLeft(2)]).toEqual([60, 120, 300]);
        expect(link()).toEqual([120, 120])
    });

    /** The commit's own repaint is final, and nothing paints a previous span after it. */
    const expectFinalOnly = async () => {
        expect(gantt.drawnSpans.size).toBe(0);
        expect([barLeft(0), barLeft(1), barLeft(2)]).toEqual([120, 180, 300]);
        expect(link()).toEqual([180, 180]);

        await new Promise(resolve => setTimeout(resolve, 60));
        expect(gantt.drawnSpans.size).toBe(0);
        expect([barLeft(0), barLeft(1)]).toEqual([120, 180]);
        expect(link()).toEqual([180, 180])
    };

    test('a 0ms tier, reduced motion\'s, leaves the commit as the one update', async () => {
        tokens({'--neo-duration-panel': '0ms', '--neo-ease-out': ease});
        await create({animateCascade: true});

        gantt.moveTask('a', moveA);
        await expectFinalOnly()
    });

    /** Holds every token read until release() is called. */
    const holdReads = reply => {
        let release;
        const gate = new Promise(resolve => release = resolve);
        Neo.main.DomAccess.getComputedStyle = async () => {await gate; return reply()};
        return () => release()
    };

    for (const [outcome, reply] of [
        ['a 0ms tier', () => ({'--neo-duration-panel': '0ms', '--neo-ease-out': ease})],
        ['a failed read', () => {throw new Error('no main thread')}]
    ]) {
        test(`${outcome} that answers after the commit leaves the commit as the one update`, async () => {
            const release = holdReads(reply);
            await create({animateCascade: true});

            gantt.moveTask('a', moveA);
            release();
            await expectFinalOnly()
        })
    }

    // A chart that already read a positive tier: the preference reaches the worker as Neo.config.prefersReducedMotion
    test('reduced motion switched on after a positive tier was read leaves the next commit as the one update', async () => {
        tokens({'--neo-duration-panel': '20000ms', '--neo-ease-out': ease});
        await create({animateCascade: true});

        Neo.config.prefersReducedMotion = true;
        gantt.moveTask('a', moveA);
        await expectFinalOnly()
    });

    test('reduced motion switched on during a move lands it at the next step', async () => {
        tokens({'--neo-duration-panel': '20000ms', '--neo-ease-out': ease});
        await create({animateCascade: true});

        gantt.moveTask('a', moveA);
        await midway();
        Neo.config.prefersReducedMotion = true;

        await expect.poll(() => gantt.drawnSpans.size).toBe(0);
        expect([barLeft(0), barLeft(1)]).toEqual([120, 180]);
        expect(link()).toEqual([180, 180])
    });

    for (const [outcome, reply] of [
        ['a 0ms tier', () => ({'--neo-duration-panel': '0ms', '--neo-ease-out': ease})],
        ['a failed read', () => {throw new Error('no main thread')}]
    ]) {
        test(`${outcome} answering the read after a warm chart's commit lands the running move`, async () => {
            tokens({'--neo-duration-panel': '20000ms', '--neo-ease-out': ease});
            await create({animateCascade: true});
            const release = holdReads(reply);

            gantt.moveTask('a', moveA);
            expect([...gantt.drawnSpans.keys()]).toEqual(['a', 'b']);
            release();

            await expect.poll(() => gantt.drawnSpans.size).toBe(0);
            expect([barLeft(0), barLeft(1)]).toEqual([120, 180]);
            expect(link()).toEqual([180, 180])
        })
    }

    test('a positive tier that answers after the commit moves the next cascade, not this one', async () => {
        const release = holdReads(() => ({'--neo-duration-panel': '20000ms', '--neo-ease-out': ease}));
        await create({animateCascade: true});

        gantt.moveTask('a', moveA);
        release();
        await expectFinalOnly();

        gantt.moveTask('c', {startDate: '2026-11-09T06:00:00Z', endDate: '2026-11-09T07:00:00Z'});
        expect([...gantt.drawnSpans.keys()]).toEqual(['c']);
        expect(barLeft(2)).toBe(300)
    });

    test('the steps follow the panel tier eased, keep each link on its bars, and end exactly at the final spans', async () => {
        tokens({'--neo-duration-panel': '600ms', '--neo-ease-out': ease});
        await create({animateCascade: true});

        const lefts = [];
        gantt.moveTask('a', moveA);
        await expect.poll(() => {
            lefts.push(barLeft(1));
            return barLeft(1) > 150 && barLeft(1) < 180
        }).toBe(true);

        // Bars and links read the same in-flight span; a path rounds its coordinates to 0.01 px
        const [finish, start] = link();
        expect(finish).toBeCloseTo(barLeft(0) + 60, 1);
        expect(start).toBeCloseTo(barLeft(1), 1);

        await expect.poll(() => {
            lefts.push(barLeft(1));
            return gantt.drawnSpans.size
        }, {timeout: 3000}).toBe(0);

        lefts.forEach((left, i) => i && expect(left).toBeGreaterThanOrEqual(lefts[i - 1]));
        expect([barLeft(0), barLeft(1), barLeft(2)]).toEqual([120, 180, 300]);
        expect(link()).toEqual([180, 180])
    });

    test('a dragged task stays where its preview dropped it while its successor moves', async () => {
        tokens({'--neo-duration-panel': '20000ms', '--neo-ease-out': ease});
        await create({animateCascade: true});

        gantt.moveTask('a', moveA, {source: 'drag'});

        expect([...gantt.drawnSpans.keys()]).toEqual(['b']);
        expect([barLeft(0), barLeft(1)]).toEqual([120, 120]);
        await midway();
        expect(barLeft(0)).toBe(120)
    });

    test('a failed token read leaves the commit as the one update', async () => {
        Neo.main.DomAccess.getComputedStyle = async () => {throw new Error('no main thread')};
        await create({animateCascade: true});

        gantt.moveTask('a', moveA);
        await expectFinalOnly()
    });

    test('another store drops a running move: its records draw at their own dates, at once and after a step', async () => {
        tokens({'--neo-duration-panel': '20000ms', '--neo-ease-out': ease});
        await create({animateCascade: true});

        gantt.moveTask('a', moveA);
        await midway();

        // The same keys, other dates: a at 08:00 (480 px), b at 09:00 (540 px)
        const replacement = Neo.create(TaskStore, {data: [
            {id: 'a', parentId: null, isLeaf: true, title: 'A', startDate: '2026-11-09T08:00:00Z', endDate: '2026-11-09T09:00:00Z'},
            {id: 'b', parentId: null, isLeaf: true, title: 'B', startDate: '2026-11-09T09:00:00Z', endDate: '2026-11-09T10:00:00Z'},
            {id: 'c', parentId: null, isLeaf: true, title: 'C', startDate: '2026-11-09T11:00:00Z', endDate: '2026-11-09T11:30:00Z'}
        ]});

        try {
            gantt.store = replacement;
            // Draws the replacement's rows, as create() draws the first store's
            gantt.timelineColumn.refreshMountedRows();

            expect(gantt.drawnSpans.size).toBe(0);
            expect([barLeft(0), barLeft(1)]).toEqual([480, 540]);
            expect(link()).toEqual([540, 540]);

            await new Promise(resolve => setTimeout(resolve, 60));
            expect([barLeft(0), barLeft(1)]).toEqual([480, 540]);
            expect(link()).toEqual([540, 540])
        } finally {
            gantt.destroy();
            gantt = null;
            replacement.destroy()
        }
    });

    test('the same store assigned again keeps a running move', async () => {
        tokens({'--neo-duration-panel': '20000ms', '--neo-ease-out': ease});
        await create({animateCascade: true});

        gantt.moveTask('a', moveA);
        await midway();
        const left = barLeft(1);

        gantt.store = gantt.store;

        expect([...gantt.drawnSpans.keys()]).toEqual(['a', 'b']);
        await expect.poll(() => barLeft(1)).toBeGreaterThan(left)
    });

    for (const [trigger, land, final] of [
        ['a zoom',                     () => gantt.zoomTo({pxPerMinute: 2}),             [240, 360]],
        ['a scroll',                   () => gantt.body.isScrolling = true,              [120, 180]],
        ['a store sort',               () => gantt.store.fire('sort', {}),               [120, 180]],
        ['a store load',               () => gantt.store.fire('load', {items: gantt.store.items}), [120, 180]],
        ['switching the config off',   () => gantt.animateCascade = false,               [120, 180]]
    ]) {
        test(`${trigger} lands a running move at its final spans`, async () => {
            tokens({'--neo-duration-panel': '20000ms', '--neo-ease-out': ease});
            await create({animateCascade: true});

            gantt.moveTask('a', moveA);
            await midway();
            land();

            expect(gantt.drawnSpans.size).toBe(0);
            expect([barLeft(0), barLeft(1)]).toEqual(final)
        })
    }

    test('the next move lands a running one before it starts', async () => {
        tokens({'--neo-duration-panel': '20000ms', '--neo-ease-out': ease});
        await create({animateCascade: true});

        gantt.moveTask('a', moveA);
        await midway();
        gantt.moveTask('c', {startDate: '2026-11-09T06:00:00Z', endDate: '2026-11-09T07:00:00Z'});

        expect([...gantt.drawnSpans.keys()]).toEqual(['c']);
        expect([barLeft(0), barLeft(1), barLeft(2)]).toEqual([120, 180, 300])
    })
});
