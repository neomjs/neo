import {setup}        from '../../setup.mjs';
import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs';
import Gantt              from '../../../../src/gantt/Container.mjs';
import GanttEventDragZone from '../../../../src/gantt/EventDragZone.mjs';

const appName = 'GanttDependencyCreationTest';
setup({neoConfig: {unitTestMode: true, allowVdomUpdatesInTests: false, useDomApiRenderer: false},
    appConfig: {name: appName, isMounted: () => true, vnodeInitialising: false}});

function chart(keys, calendar, dependencyCreation=true, config={}) {
    const data = keys.map((id, i) => ({
        id, title: String(id), isLeaf: i !== 1, parentId: i === 2 ? keys[1] : null, collapsed: false,
        startDate: new Date('2026-11-12T08:00:00Z'), endDate: new Date('2026-11-12T16:00:00Z')
    }));
    return Neo.create(Gantt, {appName, store: {data}, dependencyStore: {data: []}, dependencyCreation, useInternalId: true, ...config,
        timeAxis: {start: '2026-11-11', end: '2026-11-19', nonWorkingDays: calendar, pxPerMinute: 0.05}});
}

function bar(gantt, taskId) {
    const record = gantt.store.get(taskId);
    return gantt.timelineColumn.cellRenderer({record, row: {id: 'row-' + taskId}, gridContainer: gantt})
        .cn[0].cn.find(node => node.cls.includes('neo-timeline-bar'))
}

function root(gantt) {
    return {id: gantt.id, cls: ['neo-gantt']}
}

async function drop(chart, source, other, target, cancelled=false) {
    const sourceBar = bar(chart, source), terminal = sourceBar.cn.find(node => node.data?.linkFrom !== undefined);
    const path      = [terminal, sourceBar, root(chart)];
    await chart.onBarDragStart({clientX: 10, clientY: 42, path, targetPath: path});
    other.body.set({availableHeight: 300, containerWidth: 800});
    const row  = other.body.items.find(item => item.record === other.store.get(target)).vdom;
    const data = {clientX: 140, clientY: 80, path, targetPath: [row, root(other)]};
    chart.eventDragZone.onDragMove(data);
    expect(chart.eventDragZone.pendingDrop).toBeNull();
    chart.eventDragZone.onDragEnd({...data, cancelled})
}

test.beforeEach(() => {
    Neo.ns('Neo.main.addon.DragDrop', true);
    Neo.main.addon.DragDrop = {setConfigs: async () => ({})}
});

test('summary and milestone bars identify the record they represent', () => {
    const gantt = chart(['prepare', 'build', 'inspect'], [0, 6]);
    try {
        expect(bar(gantt, 'build').cls).toContain('neo-gantt-bar-summary');
        expect(bar(gantt, 'inspect').cls).not.toContain('neo-gantt-bar-summary');
        const inspection = gantt.store.get('inspect');
        inspection.set({milestone: true, endDate: inspection.startDate});
        expect(bar(gantt, 'inspect').cls).toContain('neo-gantt-bar-milestone')
    } finally {
        gantt.destroy()
    }
});

class CustomTerminalZone extends GanttEventDragZone {
    static config = {className: 'Test.gantt.CustomTerminalZone'}

    getLinkTerminal(path=[]) {
        this.resolutions = (this.resolutions || 0) + 1;
        return path.find(node => node.data?.customFinish)
    }
}
const TerminalZone = Neo.setupClass(CustomTerminalZone);

test('the configured zone admits its custom finish terminal while task movement is disabled', async () => {
    const gantt = chart(['up','group','child'], [0,6], true, {
        barDraggable: false, eventDragZoneConfig: {module: TerminalZone}
    });
    const {store, dependencyStore, timeAxis, eventDragZone} = gantt;
    try {
        const source  = bar(gantt,'up'), path = [{data:{customFinish:true, linkFrom:'up'}}, source, root(gantt)];
        const initial = +store.get('up').endDate;
        await gantt.onBarDragStart({path, targetPath:path});
        expect(eventDragZone.linkSource).toBe(store.get('up'));
        expect(eventDragZone.resolutions).toBe(1);
        eventDragZone.onDragEnd({path, targetPath:[bar(gantt,'group'), root(gantt)]});
        expect(dependencyStore.getSuccessors('up').map(edge => edge.toId)).toEqual(['group']);
        expect(+store.get('up').endDate).toBe(initial);

        const standard = [source.cn.find(node => node.data?.linkFrom), source, root(gantt)];
        await gantt.onBarDragStart({path:standard});
        expect(eventDragZone.initialSnapshot).toBeNull();
        expect(eventDragZone.resolutions).toBe(2)
    } finally {
        gantt.destroy();store.destroy();dependencyStore.destroy();
        if (!timeAxis.isDestroyed) timeAxis.destroy()
    }
});

for (const [keys, daysOff] of [[['stage:7', 'mix/52', 'review:4'], [0, 6]], [[27,52,85], [5]]]) {
    test('shares pointer, key and script link commands for keys ' + keys.join(', '), async () => {
        const [a,b,c] = keys, gantt = chart(keys, daysOff), other = chart(keys, daysOff);
        try {
            expect(bar(gantt, a).cn.some(node => node.cls?.includes('neo-resizable-end'))).toBe(true);
            await drop(gantt, a, other, b);
            await drop(gantt, a, gantt, b, true);
            expect(gantt.dependencyStore.getCount()).toBe(0);
            await drop(gantt, a, gantt, b);
            expect(gantt.dependencyStore.getSuccessors(a).map(e => e.toId)).toEqual([String(b)]);
            expect(gantt.linkTasks({fromId: a, toId: b})).toMatchObject({status:'refused',reason:'duplicate'});
            expect(gantt.linkTasks({fromId: b, toId: a})).toMatchObject({status:'refused',reason:'cycle'});
            expect(gantt.linkTasks({fromId: b, toId: b}).status).toBe('refused');
            await gantt.store.collapse(b);
            expect(gantt.linkTasks({fromId: a, toId: c}).status).toBe('committed');
            expect(+gantt.store.get(a).endDate).toBe(+new Date('2026-11-12T16:00:00Z'));
            const key = id => ({key:'l',path:[bar(other,id),root(other)]});
            other.onBarKeyDown(key(a)); other.onBarKeyDown({key:'Escape'}); other.onBarKeyDown(key(a));
            expect(other.onBarKeyDown(key(c)).status).toBe('committed');
            expect(other.dependencyStore.getCount()).toBe(1)
        } finally {
            for (const instance of [gantt, other]) {
                const {store, dependencyStore, timeAxis} = instance;
                instance.destroy();
                for (const owned of [store, dependencyStore, timeAxis]) if (!owned.isDestroyed) owned.destroy()
            }
        }
    })
}
