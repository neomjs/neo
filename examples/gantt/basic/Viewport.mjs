import Button          from '../../../src/button/Base.mjs';
import Container       from '../../../src/container/Base.mjs';
import Viewport        from '../../../src/container/Viewport.mjs';
import Label           from '../../../src/component/Label.mjs';
import DependencyStore from '../../../src/gantt/DependencyStore.mjs';
import Gantt           from '../../../src/gantt/Container.mjs';
import TaskStore       from '../../../src/gantt/TaskStore.mjs';
import ThemeSwitcher   from '../../../src/button/ThemeSwitcher.mjs';
import Toolbar         from '../../../src/toolbar/Base.mjs';

const storageKey = 'neo-examples-gantt-project-plan-v1';
const tasks      = [
    {id:'phase',       parentId:null,          isLeaf:false, collapsed:false, percentDone:90, title:'Site & raised beds',   startDate:'2026-11-09T00:00:00Z', endDate:'2026-11-12T18:00:00Z'},
    {id:'survey',      parentId:'phase',       isLeaf:true,  percentDone:100, title:'Survey the site',      startDate:'2026-11-09T00:00:00Z', endDate:'2026-11-10T00:00:00Z'},
    {id:'design',      parentId:'phase',       isLeaf:true,  percentDone:100, title:'Design the beds',      startDate:'2026-11-10T00:00:00Z', endDate:'2026-11-11T00:00:00Z'},
    {id:'materials',   parentId:'phase',       isLeaf:true,  percentDone:100, title:'Gather materials',     startDate:'2026-11-11T00:00:00Z', endDate:'2026-11-12T00:00:00Z'},
    {id:'build',       parentId:'phase',       isLeaf:true,  percentDone:65,  title:'Build the beds',       startDate:'2026-11-12T00:00:00Z', endDate:'2026-11-12T18:00:00Z'},
    {id:'phase-water', parentId:null,          isLeaf:false, collapsed:false, percentDone:88, title:'Water & paths',        startDate:'2026-11-09T12:00:00Z', endDate:'2026-11-12T16:00:00Z'},
    {id:'trench',      parentId:'phase-water', isLeaf:true,  percentDone:100, title:'Trench water line',    startDate:'2026-11-09T12:00:00Z', endDate:'2026-11-10T18:00:00Z'},
    {id:'spigots',     parentId:'phase-water', isLeaf:true,  percentDone:100, title:'Install drip spigots', startDate:'2026-11-10T18:00:00Z', endDate:'2026-11-11T16:00:00Z'},
    {id:'paths',       parentId:'phase-water', isLeaf:true,  percentDone:65,  title:'Lay gravel paths',     startDate:'2026-11-11T16:00:00Z', endDate:'2026-11-12T16:00:00Z'},
    {id:'phase-plant', parentId:null,          isLeaf:false, collapsed:false, percentDone:0,  title:'Soil & planting',      startDate:'2026-11-13T00:00:00Z', endDate:'2026-11-17T06:00:00Z'},
    {id:'water-ready', parentId:'phase-plant', isLeaf:true,  milestone:true,  title:'Water & beds ready',   startDate:'2026-11-13T00:00:00Z', endDate:'2026-11-13T00:00:00Z'},
    {id:'soil',        parentId:'phase-plant', isLeaf:true,  percentDone:0,   title:'Fill compost & soil',  startDate:'2026-11-13T06:00:00Z', endDate:'2026-11-14T12:00:00Z'},
    {id:'plant',       parentId:'phase-plant', isLeaf:true,  percentDone:0,   title:'Plant winter greens',  startDate:'2026-11-14T12:00:00Z', endDate:'2026-11-16T00:00:00Z'},
    {id:'mulch',       parentId:'phase-plant', isLeaf:true,  percentDone:0,   title:'Mulch & plot signs',   startDate:'2026-11-16T00:00:00Z', endDate:'2026-11-17T06:00:00Z'},
    {id:'shed',        parentId:'phase-plant', isLeaf:true,  percentDone:0,   title:'Set up tool shed',     startDate:'2026-11-14T00:00:00Z', endDate:'2026-11-15T12:00:00Z'}
];
const dependencies = [
    {id:'survey-design',    fromId:'survey',      toId:'design',      type:'FS', lag:0, lagUnit:'hour'},
    {id:'design-materials', fromId:'design',      toId:'materials',   type:'FS', lag:0, lagUnit:'hour'},
    {id:'trench-spigots',   fromId:'trench',      toId:'spigots',     type:'FS', lag:0, lagUnit:'hour'},
    {id:'spigots-paths',    fromId:'spigots',     toId:'paths',       type:'FS', lag:0, lagUnit:'hour'},
    {id:'build-ready',      fromId:'build',       toId:'water-ready', type:'FS', lag:0, lagUnit:'hour'},
    {id:'paths-ready',      fromId:'paths',       toId:'water-ready', type:'FS', lag:0, lagUnit:'hour'},
    {id:'ready-soil',       fromId:'water-ready', toId:'soil',        type:'FS', lag:0, lagUnit:'hour'},
    {id:'soil-plant',       fromId:'soil',        toId:'plant',       type:'FS', lag:0, lagUnit:'hour'},
    {id:'plant-mulch',      fromId:'plant',       toId:'mulch',       type:'FS', lag:0, lagUnit:'hour'}
];

/**
 * @summary An editable project plan whose tasks and links stay in this browser.
 * @class Neo.examples.gantt.basic.Viewport
 * @extends Neo.container.Viewport
 */
class ProjectViewport extends Viewport {
    static config = {
        className: 'Neo.examples.gantt.basic.Viewport',
        layout   : {ntype:'vbox', align:'stretch'},
        items    : [{
            module:Toolbar, cls:['project-toolbar'], flex:'none', layout:{ntype:'hbox', align:'center', wrap:'wrap'}, items:[
                {module:Label, cls:['project-title'], text:'Community garden plan'},
                {module:Label, cls:['project-subtitle'], text:'November · UTC'},
                '->',
                {module:Label, cls:['project-save-status'], reference:'save-status', text:''},
                {module:Button, ui:'secondary', cls:['project-control'], text:'Working time', reference:'working', pressed:false, handler:'up.onWorking'},
                {
                    module: Container,
                    cls   : ['project-zoom-group'],
                    flex  : 'none',
                    layout: {ntype: 'hbox', align: 'center'},
                    role  : 'group',
                    vdom  : {'aria-label': 'Time scale', cn: []},
                    items : [
                        {module:Button, ui:'secondary', cls:['project-control'], text:'Day', reference:'day', pressed:false, handler:'up.onDay'},
                        {module:Button, ui:'secondary', cls:['project-control'], text:'Week', reference:'week', pressed:true, handler:'up.onWeek'}
                    ]
                },
                {module:ThemeSwitcher}
            ]
        }, {
            module:Gantt, reference:'gantt', flex:1, editable:true, rowHeight:37, barMarginPct:10, animateCascade:true,
            store:{module:TaskStore, data:tasks, rollupParents:true}, dependencyStore:{module:DependencyStore, data:dependencies},
            dependencyCreation:true, cascadeDependencies:true, showNonWorkingTime:true,
            taskColumns:[{type:'tree',dataField:'title',text:'Task',width:220,locked:'start'}],
            majorTickUnit:'week',
            majorFormatter: tick => tick.date.toLocaleDateString('en-GB', {day:'numeric', month:'short', timeZone:'UTC'}),
            minorFormatter: tick => tick.unit === 'hour'
                ? tick.date.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit', timeZone:'UTC'})
                : tick.date.toLocaleDateString('en-GB', {weekday:'short', day:'numeric', timeZone:'UTC'}),
            timeAxis:{start:'2026-11-09',end:'2026-11-22',now:'2026-11-12T11:30:00Z',timeZone:'UTC',tickUnit:'day',pxPerMinute:0.10,snapMinutes:60},
            listeners:{taskChange:'up.onTaskChange'}
        }]
    }

    #write = Promise.resolve()
    #loading = true

    /** @summary Restores this browser's last saved project. */
    onConstructed() {
        super.onConstructed();
        this.loadProject()
    }

    /** @summary Restores saved records and subscribes to subsequent link changes. */
    async loadProject() {
        const gantt  = this.getReference('gantt');
        let   status = 'Edits stay on this device';
        try {
            const {value} = await Neo.main.addon.LocalStorage.readLocalStorageItem({key:storageKey, windowId:this.windowId});
            if (value && !this.isDestroyed) {
                const saved = JSON.parse(value);
                if (Array.isArray(saved.tasks) && Array.isArray(saved.dependencies)) {
                    gantt.store.data = saved.tasks;
                    gantt.dependencyStore.data = saved.dependencies
                }
            }
        } catch {
            status = 'Could not load saved edits'
        }
        if (!this.isDestroyed) {
            this.#loading = false;
            gantt.dependencyStore.on('mutate', () => this.saveProject());
            this.getReference('save-status').text = status
        }
    }

    /** @summary Persists the committed task and cascade together. */
    onTaskChange() { this.saveProject() }

    /** @summary Saves all task and dependency records in edit order. */
    saveProject() {
        if (this.#loading || this.isDestroyed) return;
        const gantt    = this.getReference('gantt');
        const taskRows = gantt.collectAllTasks().map(task => ({
            id       : task.id, parentId: task.parentId, isLeaf: task.isLeaf, collapsed: task.collapsed,
            title    : task.title, description: task.description, percentDone: task.percentDone, milestone: task.milestone,
            startDate: task.startDate, endDate: task.endDate, duration: task.duration, durationUnit: task.durationUnit
        }));
        const links = gantt.dependencyStore.items.map(({id,fromId,toId,type,lag,lagUnit}) => ({id,fromId,toId,type,lag,lagUnit}));
        const value = JSON.stringify({tasks:taskRows, dependencies:links}), windowId = this.windowId;
        this.getReference('save-status').text = 'Saving…';
        const write = this.#write.then(() => Neo.main.addon.LocalStorage.updateLocalStorageItem({key:storageKey,value,windowId}));
        this.#write = write.catch(() => {});
        const latest = this.#write;
        write.then(() => {
            if (!this.isDestroyed && this.#write === latest) this.getReference('save-status').text = 'Saved on this device'
        }, () => {
            if (!this.isDestroyed && this.#write === latest) this.getReference('save-status').text = 'Changes could not be saved'
        })
    }

    /** @summary Toggles use of the project's working calendar. */
    onWorking() {
        const gantt = this.getReference('gantt');
        gantt.useWorkingTime = !gantt.useWorkingTime;
        this.getReference('working').pressed = gantt.useWorkingTime
    }

    /** @summary Shows the daily time scale. */
    onDay() {
        this.getReference('gantt').zoomTo('day');
        this.getReference('day').pressed = true;
        this.getReference('week').pressed = false
    }

    /** @summary Shows the weekly time scale. */
    onWeek() {
        this.getReference('gantt').zoomTo({...Gantt.zoomPresets.week, pxPerMinute:0.10});
        this.getReference('day').pressed = false;
        this.getReference('week').pressed = true
    }
}

export default Neo.setupClass(ProjectViewport);
