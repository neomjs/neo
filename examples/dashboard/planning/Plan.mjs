import DependencyStore from '../../../src/gantt/DependencyStore.mjs';
import Provider        from '../../../src/state/Provider.mjs';
import Store           from '../../../src/data/Store.mjs';
import TaskModel       from '../../../src/gantt/TaskModel.mjs';
import TaskStore       from '../../../src/gantt/TaskStore.mjs';

/**
 * @summary Owns the people, dependencies and canonical tasks of the exhibition plan.
 * @class Neo.examples.dashboard.planning.Plan
 * @extends Neo.state.Provider
 */
class Plan extends Provider {
    /** @summary Defines a leaf task on the gallery's November UTC calendar. End dates are exclusive. */
    static task(id, title, parentId, resourceId, status, order, start, end) {
        const date = day => `2026-11-${String(day).padStart(2, '0')}T00:00:00Z`;
        return {id, title, parentId, resourceId, status, order, isLeaf: true, startDate: date(start), endDate: date(end)}
    }

    static config = {
        className: 'Neo.examples.dashboard.planning.Plan',
        data     : {selectedTask: 'lighting'},
        stores   : {
            people: {
                module: Store, model: {fields: [{name: 'id'}, {name: 'name'}]},
                data  : [
                    {id: 'mara', name: 'Mara'}, {id: 'noor', name: 'Noor'},
                    {id: 'eli',  name: 'Eli'},  {id: 'ira',  name: 'Ira'}
                ]
            },
            tasks: {
                module: TaskStore, rollupParents: true,
                model : {module: TaskModel, fields: [{name: 'status'}, {name: 'order', type: 'Number'}]},
                data  : [
                    {id: 'install', title: 'Install the show', isLeaf: false, collapsed: false},
                    this.task('layout',   'Mark the floor',  'install', 'ira',  'done',   1,  9, 10),
                    this.task('fixtures', 'Rig the fixtures','install', 'mara', 'done',   2,  9, 11),
                    this.task('lighting', 'Focus lighting',  'install', 'mara', 'active', 1, 11, 13),
                    this.task('sound',    'Sound check',     'install', 'noor', 'ready',  1, 13, 16),
                    {id: 'welcome', title: 'Welcome visitors', isLeaf: false, collapsed: false},
                    this.task('labels',   'Print labels',    'welcome', 'eli',  'active', 2, 10, 12),
                    this.task('panels',   'Hang the panels', 'welcome', 'ira',  'active', 3, 12, 14),
                    this.task('walk',     'Walk the floor',  'welcome', 'noor', 'ready',  2, 16, 18),
                    this.task('doors',    'Open the doors',  'welcome', 'eli',  'ready',  3, 19, 20)
                ]
            },
            links: {module: DependencyStore, data: [{id: 'lighting-sound', fromId: 'lighting', toId: 'sound', type: 'FS'}]}
        }
    }
}

export default Neo.setupClass(Plan);
