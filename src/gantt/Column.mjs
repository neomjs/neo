import DependencyLayer from './DependencyLayer.mjs';
import TimelineColumn  from '../timeline/Column.mjs';

/**
 * @summary Adds Gantt summary/milestone rendering and the finish link terminal to a timeline bar.
 * @class Neo.gantt.Column
 * @extends Neo.timeline.Column
 */
class Column extends TimelineColumn {
    static config = {
        /**
         * @member {String} className='Neo.gantt.Column'
         * @protected
         */
        className: 'Neo.gantt.Column'
    }

    /**
     * @summary Adds task-kind styling, milestone diamond geometry, a link terminal and the current link-target highlight to a timeline bar.
     * @param {Object} descriptor Task bar geometry and record.
     * @param {Object} context    Renderer context containing the Gantt and row record.
     * @returns {Object} Bar VDOM with the Gantt affordances.
     */
    buildBarVdom(descriptor, context) {
        let record = descriptor.bar,
            grid   = context.gridContainer,
            node   = super.buildBarVdom(descriptor, context, !grid?.store?.isDerivedParent?.(record));
        if (record.isLeaf === false) node.cls.push('neo-gantt-bar-summary');
        if (record.isLeaf !== false && record.milestone) {
            let half = DependencyLayer.milestoneHalfSize(grid?.rowHeight),
                size = half * 2;

            node.cls.push('neo-gantt-bar-milestone');
            node.style = {
                ...node.style,
                '--neo-timeline-bar-left' : `${descriptor.left - half}px`,
                '--neo-timeline-bar-width': `${size}px`,
                height                    : `${size}px`,
                left                      : `${descriptor.left - half}px`,
                top                       : `calc(50% - ${half}px)`,
                width                     : `${size}px`
            };
            node.cn = [
                {
                    tag          : 'svg',
                    id           : `${node.id}__diamond`,
                    cls          : ['neo-gantt-milestone-diamond'],
                    viewBox      : `0 0 ${size} ${size}`,
                    'aria-hidden': 'true',
                    cn           : [{
                        tag   : 'polygon',
                        id    : `${node.id}__diamond-shape`,
                        cls   : ['neo-gantt-milestone-shape'],
                        points: `${half},1 ${size - 1},${half} ${half},${size - 1} 1,${half}`
                    }]
                },
                ...node.cn
                    .filter(child => !child.cls?.includes('neo-timeline-bar-handle') && !child.cls?.includes('neo-timeline-bar-progress'))
                    .map(child => child.cls?.includes('neo-timeline-bar-label')
                        ? {...child, cls: [...child.cls, 'neo-gantt-milestone-label']}
                        : child)
            ]
        }
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

    /**
     * @summary Draws a task a cascade is moving over its in-flight span ({@link Neo.gantt.Container#drawnSpans}).
     * @param {Neo.data.Model} item    Task record
     * @param {Number}         startMs The record's start
     * @param {Number}         endMs   The record's end
     * @returns {Number[]}
     * @protected
     */
    getDrawnSpan(item, startMs, endMs) {
        let chart = this.parent,
            spans = chart?.drawnSpans;

        return spans?.size && spans.get(String(chart.store.getKey(item))) || super.getDrawnSpan(item, startMs, endMs)
    }
}

export default Neo.setupClass(Column);
