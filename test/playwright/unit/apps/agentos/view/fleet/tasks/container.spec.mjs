import {setup} from '../../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'TasksPaneTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../../src/core/_export.mjs';
import '../../../../../../../../src/manager/Instance.mjs';
import TasksPane      from '../../../../../../../../apps/agentos/view/fleet/tasks/Container.mjs';

/**
 * @summary Build one envelope in the exact `fleetTasks` contract shape.
 * @param {Object} [overrides]
 * @returns {Object}
 */
function envelope(overrides = {}) {
    return {
        capability: {state: 'wired', capturedAt: '2026-08-22T12:30:00.000Z'},
        viewer    : '@e2e-operator',
        sources   : {
            deployment: {state: 'wired', reason: null, observedAt: '2026-08-22T12:29:30.000Z'},
            rem       : {state: 'wired', reason: null},
            ingestion : {state: 'unwired', reason: 'ingestion-verb-unreachable-from-this-process', scope: null}
        },
        running: [
            {id: 'kb:ingestion:run', section: 'running', name: 'KB ingestion', source: 'kb', state: 'embedding', at: '2026-08-22T12:25:00.000Z', progress: {kind: 'determinate', done: 100, total: 400}, detail: 'this-process-only'}
        ],
        queued: [
            {id: 'orchestrator:tenant-sync:cbff435fe549', section: 'queued', name: 'Repo sync · cbff435f', source: 'orchestrator', state: 'due', at: '2026-08-22T12:34:23.859Z', progress: null, detail: 'rev d8ae9ff'},
            {id: 'mc:rem:digest', section: 'queued', name: 'REM digest', source: 'mc', state: 'backlog', at: null, progress: {kind: 'backlog', done: 1040, total: 2000}, detail: '960 undigested · 1040 digested'}
        ],
        recent: [
            {id: 'orchestrator:tenant-sync:last', section: 'recent', name: 'Tenant repo sync', source: 'orchestrator', state: 'completed', at: '2026-08-22T12:11:42.269Z', progress: null, detail: '0 synced · 3 not due · 0 failed'}
        ],
        counts: {running: 1, queued: 2, recent: 1},
        ...overrides
    }
}

/**
 * @summary Create the pane with captured `tasksRequest` intents.
 * @param {Object} [config]
 * @returns {{pane: Object, requests: Object[]}}
 */
function createPane(config = {}) {
    const requests = [],
          pane     = Neo.create(TasksPane, {
              listeners: {tasksRequest: data => {
                  const {source, ...params} = data;
                  requests.push(params)
              }},
              ...config
          });

    return {pane, requests}
}

// The list renders the projection Store into a flat vdom of section-header, task and empty-line
// items — the render truth lives in the list's vdom nodes, the projection truth in the
// Store records. Both are asserted.
const
    nodesOf   = pane => pane.getReference('tasks-list').getVdomRoot().cn.filter(Boolean),
    headersOf = pane => nodesOf(pane).filter(node => node.cls?.includes('fm-tasks-section-head')),
    labelOf   = header => header.cn[0],
    pillOf    = header => header.cn[1],
    rowsIn    = (pane, section) => nodesOf(pane).filter(node => node.cls?.includes('fm-task-row') && node.cls?.includes(`is-${section}`)),
    emptyIn   = (pane, section) => nodesOf(pane).find(node => node.cls?.includes('fm-tasks-empty-row') && node.cls?.includes(`is-${section}`))?.cn[0],
    cellsOf   = row => row.cn,
    taskCount = pane => pane.taskStore.items.filter(record => record.rowKind === 'task' && !record.sample).length;

test.describe('AgentOS tasks surface — the WHAT view as a store-driven list', () => {

    test('the list keeps the flat ul/li contract — the base dl/dt/dd switch is not applied', () => {
        const {pane} = createPane(),
              list   = pane.getReference('tasks-list');

        expect(list.vdom.tag, 'the root stays ul').toBe('ul');
        expect(list.itemTagName, 'the base useHeaders hook must not flip li to dd').toBe('li');

        const nodes = nodesOf(pane);

        expect(nodes.length).toBeGreaterThan(0);
        nodes.forEach(node => expect(node.tag, `${node.id} must be an li`).toBe('li'));

        pane.destroy()
    });

    test('the cold spine renders one sample-labeled row per section — shape, never a claim', () => {
        const {pane}  = createPane(),
              headers = headersOf(pane);

        expect(pane.getReference('tasks-meta').text).toContain('not observed yet');
        expect(headers).toHaveLength(3);
        expect(headers.map(header => labelOf(header).text)).toEqual(['Running', 'Queued · next', 'Recent']);

        for (const header of headers) {
            expect(pillOf(header).text).toBe('sample');
            expect(pillOf(header).cls).toContain('is-sample')
        }

        for (const section of ['running', 'queued', 'recent']) {
            const rows = rowsIn(pane, section);

            expect(rows).toHaveLength(1);
            expect(cellsOf(rows[0]).at(-1).text, 'the row pill says sample too').toBe('sample')
        }

        // the running sample carries the determinate idiom: a native progress element PLUS the text
        const progress = cellsOf(rowsIn(pane, 'running')[0]).find(cell => cell.cls?.includes('fm-task-progress'));

        expect(progress.cn[0]).toMatchObject({tag: 'progress', value: 42, max: 100});
        expect(progress.cn[1].text).toBe('42%');

        // the Store is the full render projection now — sample rows enter LABELED (`sample: true`,
        // the pill word), never as deployment claims: zero unlabeled task records on the cold spine
        expect(taskCount(pane), 'no record claims to be the deployment').toBe(0);
        expect(pane.taskStore.items.filter(record => record.sample)).toHaveLength(3);

        pane.destroy()
    });

    test('a transport-level fallback (no bridge, unwired verb, thrown read) is the cold spine — the labeled sample stays, the reason is named', () => {
        const {pane} = createPane({snapshot: {capability: {state: 'unavailable', reason: 'fleet tasks verb not wired'}, viewer: null, sources: {}, running: [], queued: [], recent: [], counts: {running: 0, queued: 0, recent: 0}}});

        const meta = pane.getReference('tasks-meta');

        expect(meta.text).toContain('fleet tasks verb not wired');
        expect(meta.text).toContain('show the shape, not the deployment');
        expect(meta.vdom.title, 'no stamp hovers behind an unavailable read').toBeFalsy();

        for (const header of headersOf(pane)) {
            expect(pillOf(header).text).toBe('sample')
        }

        for (const section of ['running', 'queued', 'recent']) {
            expect(rowsIn(pane, section)).toHaveLength(1);
            expect(cellsOf(rowsIn(pane, section)[0]).at(-1).text).toBe('sample')
        }

        expect(taskCount(pane)).toBe(0);

        pane.destroy()
    });

    test('a source-level unavailable read (the source answered, every axis failed) renders the honest empty lines under the reason', () => {
        const {pane} = createPane({snapshot: {
            capability: {state: 'unavailable', reason: 'no-task-source-answered', capturedAt: '2026-08-22T12:30:00.000Z'},
            viewer    : '@e2e-operator',
            sources   : {deployment: {state: 'unavailable', reason: 'deployment-read-failed'}, rem: {state: 'unavailable', reason: 'rem-read-failed'}, ingestion: {state: 'unwired'}},
            running   : [], queued: [], recent: [], counts: {running: 0, queued: 0, recent: 0}
        }});

        expect(pane.getReference('tasks-meta').text).toBe('Tasks unavailable · no-task-source-answered');

        for (const header of headersOf(pane)) {
            expect(pillOf(header).text).toBe('unavailable')
        }

        for (const section of ['running', 'queued', 'recent']) {
            expect(rowsIn(pane, section)).toHaveLength(0);
            expect(emptyIn(pane, section).text).toContain('did not answer')
        }

        pane.destroy()
    });

    test('a wired envelope projects into the Store and renders the one row grammar per section', () => {
        const {pane} = createPane({snapshot: envelope()}),
              meta   = pane.getReference('tasks-meta');

        expect(taskCount(pane)).toBe(4);
        expect(meta.text).toContain('captured');
        expect(meta.text).toContain('orchestrator live · memory core live · knowledge base not reachable');
        expect(meta.vdom.title, 'T5: the exact wire instant rides the title').toContain('2026-08-22T12:30:00.000Z');

        for (const header of headersOf(pane)) {
            expect(pillOf(header).text).toBe('live')
        }

        // running: time · name · state word · determinate bar + percent · source pill
        const run = cellsOf(rowsIn(pane, 'running')[0]);

        expect(run[1].text).toBe('KB ingestion');
        expect(run[1].title, 'the detail rides the name\'s title').toBe('this-process-only');
        expect(run[2].text).toBe('embedding');
        expect(run[3].cn[0]).toMatchObject({tag: 'progress', value: 100, max: 400});
        expect(run[3].cn[1].text).toBe('25%');
        expect(run[4].text).toBe('knowledge base');
        expect(run[4].cls).toContain('is-source-kb');

        // queued: the due repo (no bar) and the backlog gauge under its own word
        const [due, backlog] = rowsIn(pane, 'queued').map(cellsOf);

        expect(due[1].text).toBe('Repo sync · cbff435f');
        expect(due[2].text).toBe('due');
        expect(due.find(cell => cell.cls?.includes('fm-task-progress'))).toBeUndefined();
        expect(due.at(-1).text).toBe('orchestrator');

        expect(backlog[0].text, 'no instant → the honest dash').toBe('—');
        expect(backlog[2].text).toBe('backlog');
        expect(backlog[3].cls).toContain('is-backlog');
        expect(backlog[3].cn[0]).toMatchObject({tag: 'progress', value: 1040, max: 2000});
        expect(backlog[3].cn[1].text).toBe('1040 / 2000');
        expect(backlog.at(-1).text).toBe('memory core');

        // recent
        const done = cellsOf(rowsIn(pane, 'recent')[0]);

        expect(done[1].text).toBe('Tenant repo sync');
        expect(done[2].text).toBe('completed');

        pane.destroy()
    });

    test('a partial envelope is readable as exactly that — the failed axis in words, its rows absent', () => {
        const snapshot = envelope({
            capability: {state: 'partial', capturedAt: '2026-08-22T12:30:00.000Z'},
            sources   : {deployment: {state: 'wired', reason: null}, rem: {state: 'unavailable', reason: 'rem-read-failed'}, ingestion: {state: 'unwired'}},
            queued    : [{id: 'orchestrator:tenant-sync:cbff435fe549', section: 'queued', name: 'Repo sync · cbff435f', source: 'orchestrator', state: 'due', at: '2026-08-22T12:34:23.859Z', progress: null, detail: null}]
        });

        const {pane} = createPane({snapshot});

        expect(pane.getReference('tasks-meta').text).toContain('memory core unavailable');
        expect(rowsIn(pane, 'queued')).toHaveLength(1);

        pane.destroy()
    });

    test('a wired section with no rows says so in words, and a fresh snapshot REPLACES rows — never accumulates', () => {
        const {pane} = createPane({snapshot: envelope()});

        expect(taskCount(pane)).toBe(4);

        pane.snapshot = envelope({
            running: [],
            queued : [],
            recent : [{id: 'orchestrator:tenant-sync:last', section: 'recent', name: 'Tenant repo sync', source: 'orchestrator', state: 'completed', at: '2026-08-22T12:41:00.000Z', progress: null, detail: null}],
            counts : {running: 0, queued: 0, recent: 1}
        });

        expect(taskCount(pane)).toBe(1);
        expect(rowsIn(pane, 'running')).toHaveLength(0);
        expect(emptyIn(pane, 'running').text).toBe('Nothing in flight.');
        expect(emptyIn(pane, 'queued').text).toBe('Nothing scheduled.');
        expect(rowsIn(pane, 'recent')).toHaveLength(1);

        pane.destroy()
    });

    test('the refresh affordance fires the read INTENT through the controller — the surface never touches a bridge', () => {
        const {pane, requests} = createPane({snapshot: envelope()});

        pane.getController().onRefreshClick({});

        expect(requests).toEqual([{}]);

        pane.destroy()
    });

    test('destroy releases the pane-local Store through exactly ONE owner', () => {
        const {pane} = createPane(),
              store  = pane.taskStore,
              orig   = store.destroy.bind(store);

        let destroys = 0;

        store.destroy = (...args) => {
            destroys++;
            return orig(...args)
        };

        pane.destroy();

        // the Container is the single destruction owner: the list carries autoDestroyStore: false,
        // so an injected store is never double-destroyed — one invocation, terminally destroyed,
        // gone from the pane (core destroy releases the instance's own keys)
        expect(destroys).toBe(1);
        expect(pane.taskStore).toBeFalsy();
        expect(store.isDestroyed).toBe(true)
    })
});
