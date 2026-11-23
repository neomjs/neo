import {setup}        from '../../setup.mjs';
import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs';
import '../../../../src/vdom/Helper.mjs';
import '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import Store     from '../../../../src/data/Store.mjs';
import Gantt     from '../../../../src/gantt/Container.mjs';
import TaskStore from '../../../../src/gantt/TaskStore.mjs';
import Scheduler from '../../../../src/scheduler/Container.mjs';
import Events    from '../../../../src/timeline/store/Events.mjs';

const appName = 'TimelineEditorWithoutBarTest';

setup({
    appConfig: {name: appName, isMounted: () => true, vnodeInitialising: false},
    neoConfig: {unitTestMode: true, allowVdomUpdatesInTests: true, useDomApiRenderer: true, useVdomWorker: false}
});

test.beforeEach(() => {
    for (const name of ['syncModalMask', 'trapFocus', 'selectNode']) {
        Neo.main.DomAccess[name] ||= () => {}
    }
});

for (const [viewClass, storeClass, openEditor] of [
    [Scheduler, Events,    'openEventEditor'],
    [Gantt,     TaskStore, 'openTaskEditor']
]) {
    test(`${openEditor} mounts an off-axis record's dialog without off-screen positioning`, async () => {
        const
            records = Neo.create(storeClass, {
                data: [{
                    id       : 'outside', resourceId: 'person', isLeaf: true, title: 'Outside the axis',
                    startDate: '2027-01-01T09:00:00Z', endDate: '2027-01-01T10:00:00Z'
                }]
            }),
            resources = viewClass === Scheduler
                ? Neo.create(Store, {keyProperty: 'id', data: [{id: 'person', name: 'Person'}]})
                : null,
            view = Neo.create(viewClass, {
                appName, editable: true,
                ...(resources ? {store: resources, eventStore: records} : {store: records}),
                timeAxis: {start: '2026-11-01', end: '2026-11-02', timeZone: 'UTC'}
            });

        try {
            expect(view.findBarId('outside')).toBeFalsy();
            const editor = view[openEditor]('outside');

            expect(editor.record).toBe(records.get('outside'));
            expect(editor.animateTargetId).toBeFalsy();
            await editor.mountFlight;

            expect(editor.mounted).toBe(true);
            expect(editor.hidden).toBe(false);
            expect(editor.vnode.className).toContain('neo-floating');
            expect(editor.vnode.style).toMatchObject({left: 'initial', top: 'initial'})
        } finally {
            view.destroy();
            records.destroy();
            resources?.destroy()
        }
    })
}
