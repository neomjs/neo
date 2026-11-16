import Button          from '../../../src/button/Base.mjs';
import Viewport        from '../../../src/container/Viewport.mjs';
import Label           from '../../../src/component/Label.mjs';
import DependencyStore from '../../../src/gantt/DependencyStore.mjs';
import Gantt           from '../../../src/gantt/Container.mjs';
import TaskStore       from '../../../src/gantt/TaskStore.mjs';
import Toolbar         from '../../../src/toolbar/Base.mjs';

const storageKey = 'neo-examples-gantt-project-plan-v1';
const tasks      = [
    {id:'phase', parentId:null, isLeaf:false, collapsed:false, title:'Community garden', startDate:'2026-11-09T00:00:00Z', endDate:'2026-11-14T00:00:00Z'},
    {id:'survey', parentId:'phase', isLeaf:true, title:'Survey the site', startDate:'2026-11-09T00:00:00Z', endDate:'2026-11-10T00:00:00Z'},
    {id:'design', parentId:'phase', isLeaf:true, title:'Design the beds', startDate:'2026-11-10T00:00:00Z', endDate:'2026-11-11T00:00:00Z'},
    {id:'materials', parentId:'phase', isLeaf:true, title:'Gather materials', startDate:'2026-11-11T00:00:00Z', endDate:'2026-11-12T00:00:00Z'},
    {id:'build', parentId:'phase', isLeaf:true, title:'Build the beds', startDate:'2026-11-12T00:00:00Z', endDate:'2026-11-14T00:00:00Z'}
];
const dependencies = [
    {id:'survey-design', fromId:'survey', toId:'design', type:'FS', lag:0, lagUnit:'hour'},
    {id:'design-materials', fromId:'design', toId:'materials', type:'FS', lag:0, lagUnit:'hour'}
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
            module:Toolbar, cls:['project-toolbar'], flex:'none', items:[
                {module:Label, cls:['project-title'], text:'Community garden plan'},
                {module:Label, cls:['project-subtitle'], text:'November · UTC'},
                '->',
                {module:Label, cls:['project-save-status'], reference:'save-status', text:''},
                {module:Button, ui:'secondary', cls:['project-control'], text:'Working time', reference:'working', pressed:false, handler:'up.onWorking'},
                {module:Button, ui:'secondary', cls:['project-control'], text:'Day', reference:'day', pressed:false, handler:'up.onDay'},
                {module:Button, ui:'secondary', cls:['project-control'], text:'Week', reference:'week', pressed:true, handler:'up.onWeek'}
            ]
        }, {
            module:Gantt, reference:'gantt', flex:1, editable:true, rowHeight:56,
            store:{module:TaskStore, data:tasks}, dependencyStore:{module:DependencyStore, data:dependencies},
            dependencyCreation:true, cascadeDependencies:true, showNonWorkingTime:true,
            taskColumns:[{type:'tree',dataField:'title',text:'Task',width:220,locked:'start'}],
            majorTickUnit:'week',
            majorFormatter: tick => tick.date.toLocaleDateString('en-GB', {day:'numeric', month:'short', timeZone:'UTC'}),
            minorFormatter: tick => tick.unit === 'hour'
                ? tick.date.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit', timeZone:'UTC'})
                : tick.date.toLocaleDateString('en-GB', {weekday:'short', day:'numeric', timeZone:'UTC'}),
            timeAxis:{start:'2026-11-09',end:'2026-11-20',timeZone:'UTC',tickUnit:'day',pxPerMinute:0.12,snapMinutes:60},
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
        this.getReference('gantt').zoomTo({...Gantt.zoomPresets.week, pxPerMinute:0.12});
        this.getReference('day').pressed = false;
        this.getReference('week').pressed = true
    }
}

export default Neo.setupClass(ProjectViewport);
