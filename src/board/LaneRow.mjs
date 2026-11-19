import Column    from './Column.mjs';
import Component from '../component/Base.mjs';
import Container from '../container/Base.mjs';

/**
 * @summary One swimlane row of a board: a header with the collapse toggle, the lane title and its total card count, over
 * an hbox of one {@link Neo.board.Column} per status with `laneValue` bound to {@link #value}.
 * @description A lane row owns no records. `Neo.board.Container` projects one `LaneRow` per distinct value of
 * `board.laneField` (or each entry in `board.lanes`, plus an `Unassigned` row with `value: null` when records lack a
 * lane value). Collapsing the row (`collapsed: true`) hides {@link #columnContainer} while keeping {@link #header} and
 * its live card count visible.
 * @class Neo.board.LaneRow
 * @extends Neo.container.Base
 */
class LaneRow extends Container {
    static config = {
        /**
         * @member {String} className='Neo.board.LaneRow'
         * @protected
         */
        className: 'Neo.board.LaneRow',
        /**
         * @member {String} ntype='board-lane'
         * @protected
         */
        ntype: 'board-lane',
        /**
         * @member {String[]} baseCls=['neo-board-lane']
         * @protected
         */
        baseCls: ['neo-board-lane'],
        /**
         * The board this swimlane row belongs to
         * @member {Neo.board.Container|null} board=null
         */
        board: null,
        /**
         * True hides {@link #columnContainer} and keeps {@link #header} with its count badge visible
         * @member {Boolean} collapsed_=false
         */
        collapsed_: false,
        /**
         * Total number of cards across all columns in this lane row, updated by the board after column reconciliation
         * @member {Number} count_=0
         */
        count_: 0,
        /**
         * @member {String} flex='none'
         */
        flex: 'none',
        /**
         * The lane header and the horizontal column strip
         * @member {Object[]} items
         */
        items: [{
            module   : Component,
            cls      : ['neo-board-lane-header'],
            flex     : 'none',
            reference: 'header'
        }, {
            module   : Container,
            cls      : ['neo-board-lane-columns'],
            flex     : 'none',
            layout   : {ntype: 'hbox', align: 'stretch'},
            reference: 'columns',
            role     : 'group'
        }],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * The header text; defaults to `value`, or `board.emptyLaneTitle` (`'Unassigned'`) when `value` is `null`
         * @member {String|null} title_=null
         */
        title_: null,
        /**
         * The lane value this row projects; `null` for the unassigned lane
         * @member {String|null} value=null
         */
        value: null
    }

    /**
     * The horizontal container that holds this lane's {@link Neo.board.Column} instances
     * @member {Neo.container.Base|null} columnContainer
     */
    get columnContainer() {
        const item = this.items?.[1];
        return item instanceof Container ? item : null
    }

    /**
     * The {@link Neo.board.Column} instances in this lane row, in status display order
     * @member {Neo.board.Column[]} columns
     */
    get columns() {
        return (this.columnContainer?.items || []).filter(item => item instanceof Column)
    }

    /**
     * The lane header component
     * @member {Neo.component.Base|null} header
     */
    get header() {
        const item = this.items?.[0];
        return item instanceof Component ? item : null
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        this.addDomListeners({
            click   : this.onCollapseClick,
            delegate: '.neo-board-lane-collapse',
            scope   : this
        })
    }

    /**
     * @summary Applies a collapse change after construction (the initial state lands in `onConstructed`)
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetCollapsed(value, oldValue) {
        oldValue !== undefined && this.applyCollapsed()
    }

    /**
     * @summary A new count updates the lane header badge
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetCount(value, oldValue) {
        oldValue !== undefined && this.updateHeader()
    }

    /**
     * @summary A new title updates the lane header text
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetTitle(value, oldValue) {
        oldValue !== undefined && this.updateHeader()
    }

    /**
     * @summary Reflects `collapsed` on the lane class, the columns container, and the header toggle.
     */
    applyCollapsed() {
        let me          = this,
            {collapsed} = me;

        me.toggleCls('neo-board-lane-collapsed', collapsed);

        if (me.columnContainer) {
            me.columnContainer.hidden = collapsed
        }

        me.updateHeader();
        me.fire('collapse', {collapsed, lane: me})
    }

    /**
     * @summary Creates the lane header's nodes once: the collapse toggle, the title and the count badge, in one
     * `.neo-board-lane-label`.
     * @description An open lane is as wide as its columns, so on a narrower board its header is wider than the board.
     * The label sticks to the board's visible start (`LaneRow.css`), which keeps the toggle beside the title it folds
     * at every scroll position, in open and folded lanes alike.
     */
    createHeaderNodes() {
        const {header, id} = this;

        if (header && !header.vdom.cn?.length) {
            header.vdom.cn = [{
                tag: 'span',
                id : `${id}__label`,
                cls: ['neo-board-lane-label'],
                cn : [{
                    tag : 'button',
                    id  : `${id}__collapse`,
                    type: 'button',
                    cls : ['neo-board-lane-collapse'],
                    text: ''
                }, {
                    tag : 'span',
                    id  : `${id}__title`,
                    cls : ['neo-board-lane-title'],
                    text: ''
                }, {
                    tag : 'span',
                    id  : `${id}__count`,
                    cls : ['neo-board-lane-count'],
                    text: ''
                }]
            }]
        }
    }

    /**
     * @summary Returns this lane's column for `status`, or null
     * @param {String} status
     * @returns {Neo.board.Column|null}
     */
    getColumn(status) {
        return this.columns.find(column => column.status === status) || null
    }

    /**
     * @summary Toggles `collapsed` when the lane header collapse button is clicked
     * @param {Object} data
     */
    onCollapseClick(data) {
        this.collapsed = !this.collapsed
    }

    /**
     * @summary Applies the initial header and collapse state once the header and column container exist
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.createHeaderNodes();
        me.updateHeader();
        me.collapsed && me.applyCollapsed()
    }

    /**
     * @summary Recomputes {@link #count} as the sum of card counts across all columns in this lane row
     */
    updateCount() {
        this.count = this.columns.reduce((sum, column) => sum + (column.count || 0), 0)
    }

    /**
     * @summary Updates the lane header in place: title, total card count badge, and collapse toggle ARIA attributes
     */
    updateHeader() {
        let me                         = this,
            {collapsed, count, header} = me,
            title, badge, toggle;

        if (!header) {
            return
        }

        me.createHeaderNodes();

        [{cn: [toggle, title, badge]}] = header.vdom.cn;

        title.text = me.title ?? (me.value != null ? String(me.value) : (me.board?.emptyLaneTitle ?? 'Unassigned'));
        badge.text = String(count);

        toggle['aria-expanded'] = String(!collapsed);
        toggle['aria-label']    = collapsed ? 'Expand lane' : 'Collapse lane';
        toggle.text             = collapsed ? '▸' : '▾';

        header.update()
    }
}

export default Neo.setupClass(LaneRow);
