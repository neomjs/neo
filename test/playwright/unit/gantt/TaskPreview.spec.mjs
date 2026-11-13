import {setup}        from '../../setup.mjs';
import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
import EventDragZone from '../../../../src/gantt/EventDragZone.mjs';
import Gantt         from '../../../../src/gantt/Container.mjs';

setup({neoConfig:{unitTestMode:true, allowVdomUpdatesInTests:false, useDomApiRenderer:false},
    appConfig:{name:'GanttTaskPreviewUnitTest', isMounted:()=>true, vnodeInitialising:false}});

test('task previews retain rendered variants and content without cloning live interaction identities', () => {
    const zone = Neo.create(EventDragZone);
    try {
        for (const kind of ['neo-gantt-bar-summary', 'neo-gantt-bar-milestone', 'neo-timeline-bar-highlighted']) {
            const source = {
                id:'bar', cls:['neo-timeline-bar',kind,'consumer-bar'], role:'button', tabIndex:0,
                'aria-label':'Task', data:{eventId:'task',custom:'kept'},
                style:{left:'30px',top:'14%',width:'50px',height:'72%'},
                cn:[
                    {id:'progress',cls:['neo-timeline-bar-progress'],style:{width:'50%'}},
                    {id:'slot',cls:['consumer-slot'],text:'Custom content'},
                    {id:'resize',cls:['neo-timeline-bar-handle','neo-resizable-end']},
                    {id:'terminal',cls:['neo-gantt-link-terminal']}
                ]
            };
            const preview = zone.buildTaskPreview(source);
            expect(preview.cls).toEqual(source.cls);
            expect(preview.cn.map(node => node.cls[0])).toEqual(['neo-timeline-bar-progress','consumer-slot']);
            expect(preview.cn[1].text).toBe('Custom content');
            expect(preview.data).toEqual({custom:'kept'});
            expect(preview.id).toBeUndefined();
            expect(preview.cn.every(node => node.id === undefined)).toBe(true);
            expect(preview.role).toBeUndefined();
            expect(source.cn).toHaveLength(4);
            expect(source.data.eventId).toBe('task')
        }
    } finally { zone.destroy() }
});

test('a failed drag handshake leaves no task or link feedback behind', async () => {
    Neo.ns('Neo.main.addon.DragDrop', true);
    const previous = Neo.main.addon.DragDrop;
    Neo.main.addon.DragDrop = {setConfigs:async () => { throw new Error('handshake failed') }};
    const gantt = Neo.create(Gantt, {
        appName:'GanttTaskPreviewUnitTest', store:{data:[
            {id:'task',isLeaf:true,title:'Task',startDate:'2026-11-09T01:00:00Z',endDate:'2026-11-09T02:00:00Z'}
        ]}, dependencyStore:{data:[]},
        timeAxis:{start:'2026-11-09',end:'2026-11-10',timeZone:'UTC',pxPerMinute:1}
    });
    try {
        gantt.body.set({availableHeight:200, containerWidth:600});
        gantt.timelineColumn.refreshMountedRows();
        const row = gantt.body.items.find(item => item.record === gantt.store.get('task'));
        const bar = row.vdom.cn[0].cn[0].cn[0].cn.find(node => node.data?.eventId === 'task');
        await expect(gantt.onBarDragStart({clientX:10,clientY:10,path:[bar]})).rejects.toThrow('handshake failed');
        expect(gantt.eventDragZone.taskPreviewRecord).toBeNull();
        expect(gantt.eventDragZone.linkTarget).toBeNull();
        expect(gantt.eventDragZone.dragProxy).toBeNull();
        expect(gantt.cls).not.toContain('neo-is-dragging');
        expect(gantt.store.get('task').startDate.toISOString()).toBe('2026-11-09T01:00:00.000Z')
    } finally {
        gantt.destroy();
        Neo.main.addon.DragDrop = previous
    }
});
