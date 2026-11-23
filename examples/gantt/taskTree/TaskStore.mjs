import BaseTaskStore from '../../../src/gantt/TaskStore.mjs';

// Dates are UTC and end dates are exclusive; phase spans and progress belong to the store.
const phases = [
    ['curate', 'Curate exhibition', [
        ['story', 'Choose story', 2, 4, 100],
        ['loans', 'Confirm loans', 3, 7, 75],
        ['labels', 'Write labels', 5, 9, 50],
        ['design', 'Approve design', 7, 10, 25]
    ]],
    ['build', 'Prepare gallery', [
        ['walls', 'Paint walls', 9, 12, 100],
        ['cases', 'Install cases', 10, 13, 50],
        ['lighting', 'Focus lighting', 12, 14, 25],
        ['artwork', 'Hang artwork', 12, 15, 0]
    ]],
    ['welcome', 'Welcome visitors', [
        ['invitations', 'Send invites', 15, 18, 75],
        ['guides', 'Brief the guides', 17, 20, 25],
        ['preview', 'Host preview', 20, 22, 0],
        ['opening', 'Opening day', 22, 24, 0]
    ]]
];

/**
 * @summary Exhibition phases and their tasks; the Gantt store derives every phase from its children.
 * @class Neo.examples.gantt.taskTree.TaskStore
 * @extends Neo.gantt.TaskStore
 */
class TaskStore extends BaseTaskStore {
    static config = {
        className    : 'Neo.examples.gantt.taskTree.TaskStore',
        rollupParents: true
    }

    /** @summary Creates fresh records for the exhibition plan. @returns {Object[]} */
    static buildSeedTasks() {
        const date = day => `2026-11-${String(day).padStart(2, '0')}T00:00:00Z`;

        return phases.flatMap(([id, title, children]) => [
            {id, title, parentId: null, isLeaf: false, collapsed: false},
            ...children.map(([taskId, taskTitle, start, end, percentDone]) => ({
                id       : taskId, title: taskTitle, parentId: id, isLeaf: true,
                startDate: date(start), endDate: date(end), percentDone
            }))
        ])
    }

    /** @summary Seeds the plan when no task data is supplied. @param {Object} config */
    construct(config) {
        super.construct(config);

        if (!this.getCount()) {
            this.data = this.constructor.buildSeedTasks()
        }
    }
}

export default Neo.setupClass(TaskStore);
