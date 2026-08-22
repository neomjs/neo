import BaseList                            from '../../../../../src/list/Base.mjs';
import NeoArray                            from '../../../../../src/util/Array.mjs';
import {formatViewerTime, viewerTimeTitle} from '../../../util/viewerTime.mjs';

/**
 * @summary Provenance words per source axis — the pill every task row carries. Exported because
 * the owning {@link AgentOS.view.fleet.tasks.Container} meta line speaks the same vocabulary.
 * @type {Object}
 */
export const SOURCE_LABELS = Object.freeze({
    orchestrator: 'orchestrator',
    mc          : 'memory core',
    kb          : 'knowledge base'
});

/**
 * @summary The meta-line word for each source state the envelope can report — the Container's
 * `sourceLine` half of the shared vocabulary.
 * @type {Object}
 */
export const SOURCE_STATE_WORDS = Object.freeze({
    wired      : 'live',
    stale      : 'stale',
    degraded   : 'degraded',
    unavailable: 'unavailable',
    unwired    : 'not reachable'
});

/**
 * The tasks list — the WHAT surface's rows as a real `Neo.list.Base` (the base-class-first + suffix laws): the owning Container projects one `fleetTasks` envelope into the bound Store as
 * section-header records (`isHeader`, the `useHeaders` contract), task rows, and honest empty-line
 * rows; this class renders each record kind under the one row grammar the surface shipped with —
 * `[time] [name] [state] [progress?] [provenance]`, a determinate run as a native `progress`
 * element PLUS its percentage text (the bar is the glance, the text is the 1.4.1 channel), a
 * backlog gauge labeled as a queue.
 *
 * The list renders; it never reads. The Store is the seam: a snapshot replace re-renders through
 * the list's own store listeners, and no method here touches an envelope or a bridge.
 *
 * @class AgentOS.view.fleet.tasks.List
 * @extends Neo.list.Base
 */
class List extends BaseList {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.tasks.List'
         * @protected
         */
        className: 'AgentOS.view.fleet.tasks.List',
        /**
         * @member {String} ntype='fm-tasks-list'
         * @protected
         */
        ntype: 'fm-tasks-list',
        /**
         * @member {String[]} baseCls=['fm-tasks-list','neo-list']
         */
        baseCls: ['fm-tasks-list', 'neo-list'],
        /**
         * The projection Store is created, seated and destroyed by the owning Container — this
         * list must never destroy an injected store it does not own.
         * @member {Boolean} autoDestroyStore=false
         */
        autoDestroyStore: false,
        /**
         * Task rows are a glance surface, not a selection surface.
         * @member {Boolean} disableSelection=true
         * @reactive
         */
        disableSelection: true,
        /**
         * The projection Store carries the section-header records this contract renders.
         * @member {Boolean} useHeaders=true
         * @reactive
         */
        useHeaders: true
    }

    /**
     * @summary The base `useHeaders` hook switches the whole list to the definition-list shape
     * (`dl` root, `dd` items, `dt` headers). This surface's declared contract is the FLAT `ul/li`
     * list — headers are ordinary `li` rows too — so the base switch is deliberately not applied:
     * the root stays `ul` and `itemTagName` stays `li`; only the header-record semantics of
     * `useHeaders` (the `isHeader` branch in `createItem`) are consumed.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetUseHeaders(value, oldValue) {
        // intentionally empty — see summary
    }

    /**
     * @summary One list item per projection record, styled by its record kind. The base `isHeader`
     * branch emits `dt` nodes; inside this flat `ul` every row — header, task, empty — is a real
     * `li`, so the tag is normalized here and the header keeps its `neo-list-header` marker class.
     * @param {Object} record
     * @param {Number} index
     * @returns {Object|null} The list item vdom object.
     */
    createItem(record, index) {
        const item = super.createItem(record, index);

        if (!item) {
            return item
        }

        item.tag = 'li';

        NeoArray.add(item.cls, record.isHeader
            ? ['fm-tasks-section-head', `is-${record.section ?? 'unknown'}`]
            : record.rowKind === 'empty'
                ? ['fm-tasks-empty-row', `is-${record.section ?? 'unknown'}`]
                : ['fm-task-row', `is-${record.section ?? 'unknown'}`]);

        return item
    }

    /**
     * @summary The one row grammar, per record kind: a header renders its section label + freshness
     * pill, an empty row its honest sentence, a task row `[time] [name] [state] [progress?]
     * [provenance]` with the exact ISO instant riding the time cell's `title` (T5) and a `detail`
     * riding the name cell's.
     * @param {Object} record
     * @param {Number} index
     * @returns {Object[]} The item vdom children.
     */
    createItemContent(record, index) {
        const me = this,
              id = me.getItemId(me.getRecordId(record));

        if (record.isHeader) {
            return [
                {tag: 'span', id: `${id}__label`, cls: ['fm-tasks-section-label'], text: record.label ?? record.section},
                {tag: 'span', id: `${id}__pill`,  cls: ['fm-freshness', `is-${record.pill ?? 'unknown'}`], text: record.pill ?? 'unknown'}
            ]
        }

        if (record.rowKind === 'empty') {
            return [
                {tag: 'span', id: `${id}__empty`, cls: ['fm-tasks-empty'], text: record.label ?? ''}
            ]
        }

        const
            progress = record.progressKind && Number.isInteger(record.progressDone) && Number.isInteger(record.progressTotal) && record.progressTotal > 0
                ? {kind: record.progressKind, done: Math.min(record.progressDone, record.progressTotal), total: record.progressTotal}
                : null,
            title    = viewerTimeTitle(record.at),
            cn       = [{
                tag : 'span',
                id  : `${id}__time`,
                cls : ['fm-task-time'],
                text: me.formatStamp(record.at),
                ...(title ? {title} : {})
            }, {
                tag : 'span',
                id  : `${id}__name`,
                cls : ['fm-task-name'],
                text: record.name ?? 'Unnamed task',
                ...(record.detail ? {title: record.detail} : {})
            }, {
                tag : 'span',
                id  : `${id}__state`,
                cls : ['fm-task-state'],
                text: record.state ?? 'unknown'
            }];

        if (progress) {
            const label = progress.kind === 'determinate'
                ? `${Math.round(progress.done / progress.total * 100)}%`
                : `${progress.done} / ${progress.total}`;

            cn.push({
                tag: 'span',
                id : `${id}__progress`,
                cls: ['fm-task-progress', `is-${progress.kind}`],
                cn : [{
                    tag         : 'progress',
                    id          : `${id}__bar`,
                    cls         : ['fm-task-bar'],
                    value       : progress.done,
                    max         : progress.total,
                    'aria-label': `${record.name ?? 'task'} ${progress.kind === 'backlog' ? 'backlog' : 'progress'}`
                }, {
                    tag : 'span',
                    id  : `${id}__progress-text`,
                    cls : ['fm-task-progress-text'],
                    text: label
                }]
            })
        }

        cn.push({
            tag : 'span',
            id  : `${id}__source`,
            cls : ['fm-freshness', record.sample ? 'is-sample' : `is-source-${record.source ?? 'unknown'}`],
            text: record.sample ? 'sample' : (SOURCE_LABELS[record.source] ?? 'unknown source')
        });

        return cn
    }

    /**
     * @summary Viewer-local rendering of one wire instant, or the honest dash for a row with no
     * governing time (a frozen collection, a queue fact without a cycle).
     * @param {String|null} value
     * @returns {String}
     */
    formatStamp(value) {
        return value ? (formatViewerTime(value)?.text ?? 'unknown time') : '—'
    }
}

export default Neo.setupClass(List);
