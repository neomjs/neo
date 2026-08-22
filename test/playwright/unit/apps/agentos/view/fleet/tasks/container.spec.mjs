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

const
    sectionsOf = pane => pane.getReference('tasks-sections').items,
    headOf     = section => section.items[0],
    pillOf     = section => headOf(section).items[1],
    rowsOf     = section => section.items.slice(1).filter(item => item.cls?.includes('fm-task-row')),
    emptyOf    = section => section.items.slice(1).find(item => item.cls?.includes('fm-tasks-empty')),
    cellsOf    = row => row.items;

test.describe('AgentOS TasksPane — the WHAT surface', () => {
    test('the cold spine renders one sample-labeled row per section — shape, never a claim', () => {
        const {pane}   = createPane(),
              sections = sectionsOf(pane);

        expect(pane.getReference('tasks-meta').text).toContain('not observed yet');
        expect(sections).toHaveLength(3);
        expect(sections.map(section => headOf(section).items[0].text)).toEqual(['Running', 'Queued · next', 'Recent']);

        for (const section of sections) {
            expect(pillOf(section).text).toBe('sample');
            expect(pillOf(section).cls).toContain('is-sample');

            const rows = rowsOf(section);

            expect(rows).toHaveLength(1);
            expect(cellsOf(rows[0]).at(-1).text, 'the row pill says sample too').toBe('sample')
        }

        // the running sample carries the determinate idiom: a native progress element PLUS the text
        const progress = cellsOf(rowsOf(sections[0])[0]).find(cell => cell.cls?.includes('fm-task-progress'));

        expect(progress.vdom.cn[0]).toMatchObject({tag: 'progress', value: 42, max: 100});
        expect(progress.vdom.cn[1].text).toBe('42%');

        expect(pane.taskStore.count, 'samples never enter the Store').toBe(0);

        pane.destroy()
    });

    test('a transport-level fallback (no bridge, unwired verb, thrown read) is the cold spine — the labeled sample stays, the reason is named', () => {
        const {pane} = createPane({snapshot: {capability: {state: 'unavailable', reason: 'fleet tasks verb not wired'}, viewer: null, sources: {}, running: [], queued: [], recent: [], counts: {running: 0, queued: 0, recent: 0}}});

        const meta = pane.getReference('tasks-meta');

        expect(meta.text).toContain('fleet tasks verb not wired');
        expect(meta.text).toContain('show the shape, not the deployment');
        expect(meta.vdom.title, 'no stamp hovers behind an unavailable read').toBeFalsy();

        for (const section of sectionsOf(pane)) {
            expect(pillOf(section).text).toBe('sample');
            expect(rowsOf(section)).toHaveLength(1);
            expect(cellsOf(rowsOf(section)[0]).at(-1).text).toBe('sample')
        }

        expect(pane.taskStore.count).toBe(0);

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

        for (const section of sectionsOf(pane)) {
            expect(pillOf(section).text).toBe('unavailable');
            expect(rowsOf(section)).toHaveLength(0);
            expect(emptyOf(section).text).toContain('did not answer')
        }

        pane.destroy()
    });

    test('a wired envelope projects into the Store and renders the one row grammar per section', () => {
        const {pane}                    = createPane({snapshot: envelope()}),
              [running, queued, recent] = sectionsOf(pane),
              meta                      = pane.getReference('tasks-meta');

        expect(pane.taskStore.count).toBe(4);
        expect(meta.text).toContain('captured');
        expect(meta.text).toContain('orchestrator live · memory core live · knowledge base not reachable');
        expect(meta.vdom.title, 'T5: the exact wire instant rides the title').toContain('2026-08-22T12:30:00.000Z');

        for (const section of [running, queued, recent]) {
            expect(pillOf(section).text).toBe('live')
        }

        // running: time · name · state word · determinate bar + percent · source pill
        const run = cellsOf(rowsOf(running)[0]);

        expect(run[1].text).toBe('KB ingestion');
        expect(run[1].vdom.title, 'the detail rides the name\'s title').toBe('this-process-only');
        expect(run[2].text).toBe('embedding');
        expect(run[3].vdom.cn[0]).toMatchObject({tag: 'progress', value: 100, max: 400});
        expect(run[3].vdom.cn[1].text).toBe('25%');
        expect(run[4].text).toBe('knowledge base');
        expect(run[4].cls).toContain('is-source-kb');

        // queued: the due repo (no bar) and the backlog gauge under its own word
        const [due, backlog] = rowsOf(queued).map(cellsOf);

        expect(due[1].text).toBe('Repo sync · cbff435f');
        expect(due[2].text).toBe('due');
        expect(due.find(cell => cell.cls?.includes('fm-task-progress'))).toBeUndefined();
        expect(due.at(-1).text).toBe('orchestrator');

        expect(backlog[0].text, 'no instant → the honest dash').toBe('—');
        expect(backlog[2].text).toBe('backlog');
        expect(backlog[3].cls).toContain('is-backlog');
        expect(backlog[3].vdom.cn[0]).toMatchObject({tag: 'progress', value: 1040, max: 2000});
        expect(backlog[3].vdom.cn[1].text).toBe('1040 / 2000');
        expect(backlog.at(-1).text).toBe('memory core');

        // recent
        const done = cellsOf(rowsOf(recent)[0]);

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
        expect(rowsOf(sectionsOf(pane)[1])).toHaveLength(1);

        pane.destroy()
    });

    test('a wired section with no rows says so in words, and a fresh snapshot REPLACES rows — never accumulates', () => {
        const {pane} = createPane({snapshot: envelope()});

        expect(pane.taskStore.count).toBe(4);

        pane.snapshot = envelope({
            running: [],
            queued : [],
            recent : [{id: 'orchestrator:tenant-sync:last', section: 'recent', name: 'Tenant repo sync', source: 'orchestrator', state: 'completed', at: '2026-08-22T12:41:00.000Z', progress: null, detail: null}],
            counts : {running: 0, queued: 0, recent: 1}
        });

        const [running, queued, recent] = sectionsOf(pane);

        expect(pane.taskStore.count).toBe(1);
        expect(rowsOf(running)).toHaveLength(0);
        expect(emptyOf(running).text).toBe('Nothing in flight.');
        expect(emptyOf(queued).text).toBe('Nothing scheduled.');
        expect(rowsOf(recent)).toHaveLength(1);

        pane.destroy()
    });

    test('the refresh affordance fires the read INTENT — the pane never touches a bridge', () => {
        const {pane, requests} = createPane({snapshot: envelope()});

        pane.onRefreshClick();

        expect(requests).toEqual([{}]);

        pane.destroy()
    });

    test('destroy releases the pane-local Store', () => {
        const {pane} = createPane(),
              store  = pane.taskStore;

        pane.destroy();

        // the instance's own keys are released by core destroy; the contract is that the Store is
        // gone from the pane AND destroyed itself — no process-lifetime record survives the view
        expect(pane.taskStore).toBeFalsy();
        expect(store.isDestroyed).toBe(true)
    })
});
