import {setup}        from '../../setup.mjs';
import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
import RecordFactory   from '../../../../src/data/RecordFactory.mjs';
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

        const unrelatedTasks = Neo.create(TaskStore, {
            data: [{id: 't1', title: 'Task 1', isLeaf: true, startDate: '2026-01-01T00:00Z', endDate: '2026-01-01T01:00Z'}]
        });
        try {
            unrelatedTasks.get('t1').title = 'Task 1 Updated';

            for (let taskId = 1; taskId <= 32; taskId++) {
                expect(edges.getPredecessors(taskId)).toEqual([edges.get(`e-${taskId - 1}`)]);
                expect(edges.getSuccessors(taskId)).toEqual([edges.get(`e-${taskId}`)])
            }

            expect(visits).toBe(edgeCount)
        } finally {
            unrelatedTasks.destroy()
        }
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

test('endpoint lookups stay coherent on reverse, setSilent, prepared adoption/rollback and shared stores', () => {
    const scanOracle = (store, endpointField, taskId) => {
        const target = String(taskId),
              result = [];

        for (let i = 0; i < store.getCount(); i++) {
            const edge = store.getAt(i);
            if (edge && String(edge[endpointField]) === target) {
                result.push(edge)
            }
        }

        return result
    };

    const assertEndpointParity = (store, keys) => {
        for (const key of keys) {
            expect(store.getPredecessors(key)).toEqual(scanOracle(store, 'toId', key));
            expect(store.getSuccessors(key)).toEqual(scanOracle(store, 'fromId', key))
        }
    };

    // 1. reverse() with no sorters after warming multi-edge predecessor & successor buckets.
    const reversed = Neo.create(DependencyStore, {
        data: [
            {id: 'r1', fromId: 'a', toId: 'b', type: 'FS'},
            {id: 'r2', fromId: 'a', toId: 'b', type: 'FS'}
        ]
    });

    try {
        expect(reversed.getSuccessors('a').map(e => e.id)).toEqual(['r1', 'r2']);
        expect(reversed.getPredecessors('b').map(e => e.id)).toEqual(['r1', 'r2']);

        const returned = reversed.reverse();
        expect(returned).toBe(reversed._items);
        expect(reversed.getSuccessors('a').map(e => e.id)).toEqual(['r2', 'r1']);
        expect(reversed.getPredecessors('b').map(e => e.id)).toEqual(['r2', 'r1']);
        assertEndpointParity(reversed, ['a', 'b'])
    } finally {
        reversed.destroy()
    }

    // 2. setSilent + prepared adoption (first-listener read, warm rollback, and cold-read-inside-seal rollback).
    const edges = Neo.create(DependencyStore, {
        data: [
            {id: 'e1', fromId: 'a', toId: 'b', type: 'FS'},
            {id: 'e2', fromId: 'a', toId: 'b', type: 'FS'}
        ]
    });

    try {
        const edge1 = edges.get('e1'),
              edge2 = edges.get('e2');

        expect(edges.getPredecessors('b').map(e => e.id)).toEqual(['e1', 'e2']);
        edge1.setSilent({toId: 'c'});
        expect(edge1.toId).toBe('c');
        expect(edges.getPredecessors('b').map(e => e.id)).toEqual(['e2']);
        expect(edges.getPredecessors('c').map(e => e.id)).toEqual(['e1']);
        assertEndpointParity(edges, ['a', 'b', 'c', 'd']);

        // Warm rollback (with seal inspecting updated buckets before aborting).
        edge1.setSilent({toId: 'b'});
        expect(edges.getPredecessors('b').map(e => e.id)).toEqual(['e1', 'e2']);

        expect(() => RecordFactory.applyPreparedFields(edges.model, [{record: edge1, fields: {toId: 'c'}}], () => {
            expect(edges.getPredecessors('c').map(e => e.id)).toEqual(['e1']);
            expect(edges.getPredecessors('b').map(e => e.id)).toEqual(['e2']);
            throw new Error('abort warm seal')
        })).toThrow('abort warm seal');

        expect(edge1.toId).toBe('b');
        expect(edges.getPredecessors('c')).toEqual([]);
        expect(edges.getPredecessors('b').map(e => e.id)).toEqual(['e1', 'e2']);

        // Cold rollback: clear index before adoption, warm it inside failing seal under 'c', then verify restored 'b'.
        edges.clearSilent(false);
        edges.add([edge1, edge2]);
        expect(() => RecordFactory.applyPreparedFields(edges.model, [{record: edge1, fields: {toId: 'c'}}], () => {
            expect(edges.getPredecessors('c').map(e => e.id)).toEqual(['e1']);
            expect(edges.getPredecessors('b').map(e => e.id)).toEqual(['e2']);
            throw new Error('abort cold seal')
        })).toThrow('abort cold seal');

        expect(edge1.toId).toBe('b');
        expect(edges.getPredecessors('c')).toEqual([]);
        expect(edges.getPredecessors('b').map(e => e.id)).toEqual(['e1', 'e2']);

        // Two-record prepared batch: first synchronous recordChange listener already observes edge2's committed endpoint.
        const firstListenerSnapshots = [];
        const onChange               = ({record}) => firstListenerSnapshots.push({
            id   : record.id,
            predC: edges.getPredecessors('c').map(e => e.id),
            predD: edges.getPredecessors('d').map(e => e.id)
        });
        edges.on('recordChange', onChange);
        RecordFactory.applyPreparedFields(edges.model, [
            {record: edge1, fields: {toId: 'c'}},
            {record: edge2, fields: {toId: 'd'}}
        ], () => {});
        edges.un('recordChange', onChange);

        expect(firstListenerSnapshots[0]).toEqual({id: 'e1', predC: ['e1'], predD: ['e2']});
        assertEndpointParity(edges, ['a', 'b', 'c', 'd'])
    } finally {
        edges.destroy()
    }

    // 3. Shared-record stores: sourceId linked store + filtered store & allItems.
    const owner = Neo.create(DependencyStore, {
        data: [
            {id: 's1', fromId: '0', toId: '1', type: 'FS'},
            {id: 's2', fromId: '0', toId: '2', type: 'SS'}
        ]
    });
    const linked = Neo.create(DependencyStore, {sourceId: owner.id});

    try {
        assertEndpointParity(owner,  ['0', '1', '2', '3']);
        assertEndpointParity(linked, ['0', '1', '2', '3']);

        const callbackSnapshots = [];
        owner.on('recordChange', () => callbackSnapshots.push({
            linkedPred1: linked.getPredecessors('1').map(e => e.id),
            linkedPred3: linked.getPredecessors('3').map(e => e.id)
        }));

        owner.get('s1').set({toId: '3'});
        expect(callbackSnapshots[0]).toEqual({linkedPred1: [], linkedPred3: ['s1']});
        assertEndpointParity(linked, ['0', '1', '2', '3']);

        owner.get('s1').setSilent({fromId: '2', toId: '1'});
        assertEndpointParity(owner,  ['0', '1', '2', '3']);
        assertEndpointParity(linked, ['0', '1', '2', '3']);

        // Filtered store + allItems holding shared records (including filtered-out s2).
        owner.filters = [{property: 'type', value: 'FS'}];
        assertEndpointParity(owner,          ['0', '1', '2', '3']);
        assertEndpointParity(owner.allItems, ['0', '1', '2', '3']);

        owner.get('s1').set({toId: '3'});
        owner.allItems.get('s2').setSilent({fromId: '1', toId: '3'});
        assertEndpointParity(owner,          ['0', '1', '2', '3']);
        assertEndpointParity(owner.allItems, ['0', '1', '2', '3']);

        owner.get('s1').setSilent({fromId: '2'});
        assertEndpointParity(owner,          ['0', '1', '2', '3']);
        assertEndpointParity(owner.allItems, ['0', '1', '2', '3'])
    } finally {
        linked.destroy();
        owner.destroy()
    }
});
