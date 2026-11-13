import TimelineColumn from '../timeline/Column.mjs';

/**
 * @summary Adds the Gantt finish terminal to a rendered bar while preserving its resize handles.
 * @class Neo.gantt.Column
 * @extends Neo.timeline.Column
 */
class Column extends TimelineColumn {
    static config = {className: 'Neo.gantt.Column'}

    /**
     * @summary Adds task-kind styling, a link terminal and the current link-target highlight to a timeline bar.
     * @param {Object} descriptor Task bar geometry and record.
     * @param {Object} context Renderer context containing the Gantt and row record.
     * @returns {Object} Bar VDOM with the Gantt affordances.
     */
    buildBarVdom(descriptor, context) {
        const node   = super.buildBarVdom(descriptor, context);
        const record = descriptor.bar;
        if (record.isLeaf === false) node.cls.push('neo-gantt-bar-summary');
        if (record.milestone) node.cls.push('neo-gantt-bar-milestone');
        const grid = context.gridContainer;
        if (!grid) return node;
        if (grid.eventDragZone?.taskPreviewRecord === record) node.cls.push('neo-gantt-task-source');
        if (grid.eventDragZone?.linkTarget === record) node.cls.push('neo-gantt-link-target');
        if (grid.canLinkTasks(context.record)) {
            node.cls = [].concat(node.cls || [], 'neo-gantt-linkable');
            if (grid.isKeyboardLinkSource(context.record, node.id)) {
                node.cls.push('neo-gantt-link-armed')
            }
            node['aria-keyshortcuts'] = 'L';
            node.title ||= 'Press L on the predecessor, then L on the successor to link the tasks';
            node.cn.push({
                id           : node.id + '__link-finish',
                cls          : ['neo-gantt-link-terminal', 'neo-draggable'],
                data         : {linkFrom: String(descriptor.barKey)},
                title        : 'Drag to another task to link finish to start',
                'aria-hidden': 'true'
            });
        }
        return node
    }
}

export default Neo.setupClass(Column);
