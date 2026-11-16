import {setup}        from '../../setup.mjs';
import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
import TaskStore       from '../../../../src/gantt/TaskStore.mjs';
import DependencyStore from '../../../../src/gantt/DependencyStore.mjs';

setup({neoConfig: {unitTestMode: true, allowVdomUpdatesInTests: false},
    appConfig: {name: 'GanttStoresTest', isMounted: () => true}});

test('task ranges retain tree identity and dependency admission refuses duplicate and cyclic edges', () => {
    const tasks = Neo.create(TaskStore, {data: [
        {id: 'a', title: 'A', isLeaf: true, startDate: '2026-01-01T01:00Z', endDate: '2026-01-01T02:00Z'},
        {id: 'b', title: 'B', isLeaf: true, startDate: '2026-01-01T02:00Z', endDate: '2026-01-01T02:00Z'}
    ]});
    const edges = Neo.create(DependencyStore, {data: []});
    try {
        expect(tasks.getRangeRecords('2026-01-01T02:00Z', '2026-01-01T02:00Z').map(row => row.id)).toEqual(['b']);
        expect(edges.addFinishToStart({fromId: 'a', toId: 'b', id: 'ab'}).status).toBe('committed');
        expect(edges.getSuccessors('a').map(edge => edge.id)).toEqual(['ab']);
        expect(edges.getPredecessors('b').map(edge => edge.id)).toEqual(['ab']);
        expect(edges.addFinishToStart({fromId: 'a', toId: 'b'}).reason).toBe('duplicate');
        expect(edges.addFinishToStart({fromId: 'b', toId: 'a'}).reason).toBe('cycle');
        expect(edges.getCount()).toBe(1)
    } finally { tasks.destroy(); edges.destroy() }
});

test('generated edge ids skip persisted keys while explicit collisions are refused', () => {
    const edges    = Neo.create(DependencyStore, {data: [{id: 'gantt-link-1', fromId: 'a', toId: 'b', type: 'FS'}]});
    const original = Neo.getId;
    let   next     = 0;
    Neo.getId = () => `gantt-link-${++next}`;
    try {
        expect(edges.addFinishToStart({fromId: 'c', toId: 'd', id: 'gantt-link-1'}).reason).toBe('duplicate-id');
        expect(edges.addFinishToStart({fromId: 'c', toId: 'd'})).toMatchObject({status: 'committed', edge: {id: 'gantt-link-2'}})
    } finally { Neo.getId = original; edges.destroy() }
});

test('repeated predecessor and successor lookups over a 2,048-edge chain index the store in a single pass', () => {
    const edgeCount = 2048,
          edges     = Neo.create(DependencyStore, {
              data: Array.from({length: edgeCount}, (_, i) => ({
                  id    : `e-${i}`,
                  fromId: String(i),
                  toId  : String(i + 1),
                  type  : 'FS'
              }))
          }),
          origGetAt = edges.getAt.bind(edges);

    let visits = 0;
    edges.getAt = index => {
        visits++;
        return origGetAt(index)
    };

    try {
        for (let taskId = 1; taskId <= 32; taskId++) {
            const incoming = edges.getPredecessors(taskId),
                  outgoing = edges.getSuccessors(taskId);

            expect(incoming).toHaveLength(1);
            expect(outgoing).toHaveLength(1);
            expect(incoming[0]).toBe(edges.get(`e-${taskId - 1}`));
            expect(outgoing[0]).toBe(edges.get(`e-${taskId}`))
        }

        expect(edges.getPredecessors('0')).toEqual([]);
        expect(edges.getSuccessors('0')).toEqual([edges.get('e-0')]);
        expect(edges.getPredecessors('2048')).toEqual([edges.get('e-2047')]);
        expect(edges.getSuccessors('2048')).toEqual([]);
        expect(edges.getPredecessors('9999')).toEqual([]);
        expect(edges.getSuccessors(null)).toEqual([]);
        expect(edges.getPredecessors(undefined)).toEqual([]);
        expect(visits).toBe(edgeCount);

        for (let taskId = 1; taskId <= 32; taskId++) {
            expect(edges.getPredecessors(taskId)).toEqual([edges.get(`e-${taskId - 1}`)]);
            expect(edges.getSuccessors(taskId)).toEqual([edges.get(`e-${taskId}`)])
        }

        expect(visits).toBe(edgeCount)
    } finally {
        edges.destroy()
    }
});

test('endpoint lookups match full scans across mutations, silent updates, retargeting, sorting, filtering and caller array writes', () => {
    const scanOracle = (store, endpointField, taskId) => {
        if (taskId === null || taskId === undefined) {
            return []
        }

        const target = String(taskId),
              result = [],
              count  = store.getCount();

        for (let i = 0; i < count; i++) {
            const edge = store.getAt(i);
            if (edge && String(edge[endpointField]) === target) {
                result.push(edge)
            }
        }

        return result
    };

    const probeKeys    = [0, '0', 1, '1', 2, '2', 3, '3', 'missing', null, undefined],
          assertParity = store => {
              for (const key of probeKeys) {
                  const expectedPred = scanOracle(store, 'toId', key),
                        expectedSucc = scanOracle(store, 'fromId', key),
                        actualPred   = store.getPredecessors(key),
                        actualSucc   = store.getSuccessors(key);

                  expect(actualPred).toEqual(expectedPred);
                  expect(actualSucc).toEqual(expectedSucc);
                  expect(actualPred).not.toBe(store.getPredecessors(key));
                  expect(actualSucc).not.toBe(store.getSuccessors(key))
              }
          };

    const edges = Neo.create(DependencyStore, {
        data: [
            {id: 'e1', fromId: '0', toId: '1', type: 'FS'},
            {id: 'e2', fromId: '1', toId: '2', type: 'FS'},
            {id: 'e3', fromId: '0', toId: '2', type: 'SS'}
        ]
    });

    try {
        assertParity(edges);

        // Caller mutating returned arrays must not corrupt cached answers.
        const succ0 = edges.getSuccessors(0);
        succ0.pop();
        succ0.push('tampered');
        const emptyPred = edges.getPredecessors(null);
        emptyPred.push('tampered');
        assertParity(edges);

        // Prepending preserves store order; addFinishToStart and removals stay indexed.
        edges.insert(0, {id: 'e0', fromId: '0', toId: '1', type: 'FS'});
        assertParity(edges);

        expect(edges.addFinishToStart({id: 'e4', fromId: '2', toId: '3'}).status).toBe('committed');
        assertParity(edges);

        edges.remove('e1');
        assertParity(edges);
        edges.removeAt(0);
        assertParity(edges);

        // Endpoint retargeting via field setter, record.set, synchronous recordChange listener, and updateRows.
        const recordEvents = [];
        edges.on('recordChange', () => recordEvents.push({
            succ1: edges.getSuccessors('1').map(e => e.id),
            pred3: edges.getPredecessors(3).map(e => e.id)
        }));
        edges.get('e2').fromId = '0';
        assertParity(edges);
        edges.get('e2').set({toId: '3'});
        assertParity(edges);
        expect(recordEvents[0].succ1).toEqual([]);
        expect(recordEvents[1].pred3).toEqual(['e2', 'e4']);

        edges.updateRows([{key: 'e2', values: {fromId: '1', toId: '2'}}]);
        assertParity(edges);

        // Silent membership updates (silent splice, startUpdate(true)/endUpdate(true), clearSilent) without mutate events.
        let mutateCount = 0;
        edges.on('mutate', () => mutateCount++);

        edges.splice(null, [], [{id: 'e-silent', fromId: '1', toId: '3', type: 'FS'}], true);
        expect(mutateCount).toBe(0);
        assertParity(edges);

        edges.startUpdate(true);
        edges.add({id: 'e-batch', fromId: '3', toId: '0', type: 'FS'});
        edges.remove('e-silent');
        edges.endUpdate(true);
        expect(mutateCount).toBe(0);
        assertParity(edges);

        edges.clearSilent();
        expect(mutateCount).toBe(0);
        assertParity(edges);

        // Replacing data, sorting (including silent doSort and move), and filtering / unfiltering.
        edges.data = [
            {id: 'd1', fromId: '0', toId: '2', type: 'SS'},
            {id: 'd2', fromId: '0', toId: '1', type: 'FS'},
            {id: 'd3', fromId: '1', toId: '2', type: 'FS'},
            {id: 'd4', fromId: '0', toId: '2', type: 'FS'}
        ];
        assertParity(edges);

        edges.sorters = [{property: 'id', direction: 'DESC'}];
        assertParity(edges);
        edges.doSort(edges.items, true);
        assertParity(edges);
        edges.move(0, 1);
        assertParity(edges);

        edges.filters = [{property: 'type', value: 'FS'}];
        assertParity(edges);
        edges.clearFilters();
        assertParity(edges)
    } finally {
        edges.destroy()
    }

    // Turbo Mode (autoInitRecords: false) + raw-row updateRows parity.
    const lazyEdges = Neo.create(DependencyStore, {
        autoInitRecords: false,
        data           : [
            {id: 't1', fromId: '0', toId: '1', type: 'FS'},
            {id: 't2', fromId: '1', toId: '2', type: 'FS'}
        ]
    });

    try {
        assertParity(lazyEdges);
        lazyEdges.add([{id: 't3', fromId: '2', toId: '3', type: 'FS'}], false);
        lazyEdges.updateRows([{key: 't3', values: {fromId: '0'}}]);
        assertParity(lazyEdges)
    } finally {
        lazyEdges.destroy()
    }
});
