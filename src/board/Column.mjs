import Component  from '../component/Base.mjs';
import Container  from '../container/Base.mjs';
import NeoArray   from '../util/Array.mjs';
import ColumnBody from './ColumnBody.mjs';

/**
 * @summary One column of a board: a header with the count and the WIP limit, over a body that holds the cards.
 * @description A column owns no records. Its cards are the board's records whose status equals `status` (and, with
 * lanes, whose lane equals `laneValue`), projected into {@link #body} by `Neo.board.Container`. `wipLimit` and
 * `collapsed` are column configs: a count over the limit marks the column and its badge, a collapsed column keeps
 * its header and count and hides its body — and stays a drop target for the board zone. Its id derives from the
 * board and its status (`<board>__col__<status>`), so a test or an agent addresses it without an index.
 * @class Neo.board.Column
 * @extends Neo.container.Base
 */
class Column extends Container {
    /** @summary Coalesces native scroll events at a 16ms cadence in the App Worker (which has no window rAF). */
    static delayable = {applyBodyScroll: {type: 'throttle', timer: 16}}

    static config = {
        /**
         * @member {String} className='Neo.board.Column'
         * @protected
         */
        className: 'Neo.board.Column',
        /**
         * @member {String} ntype='board-column'
         * @protected
         */
        ntype: 'board-column',
        /**
         * @member {String[]} baseCls=['neo-board-column']
         * @protected
         */
        baseCls: ['neo-board-column'],
        /**
         * The board this column belongs to
         * @member {Neo.board.Container|null} board=null
         */
        board: null,
        /**
         * True hides the body and narrows the column to its header
         * @member {Boolean} collapsed_=false
         */
        collapsed_: false,
        /**
         * A CSS color the column paints as its accent
         * @member {String|null} color_=null
         */
        color_: null,
        /**
         * The number of cards in the body, set by the board after each projection
         * @member {Number} count_=0
         */
        count_: 0,
        /**
         * The header and the body. The board projects its cards into the body.
         * @member {Object[]} items
         */
        items: [{
            module   : Component,
            cls      : ['neo-board-column-header'],
            flex     : 'none',
            reference: 'header'
        }, {
            module   : ColumnBody,
            cls      : ['neo-board-column-body'],
            flex     : 1,
            layout   : 'base',
            reference: 'body',
            role     : 'list'
        }],
        /**
         * The lane this column projects; null = no lane (the swimlane leaf sets it)
         * @member {String|null} laneValue=null
         */
        laneValue: null,
        /**
         * True locks the column in place: its header shows a lock glyph, carries `aria-disabled="true"`,
         * is excluded from `ColumnSortZone#getSortableItems`, and keeps its index when other columns reorder around it
         * @member {Boolean} locked_=false
         */
        locked_: false,
        /** @member {Number|null} maxRenderedCards_=100 Null preserves the render-all identity contract. */
        maxRenderedCards_: 100,
        /** @member {Number} overscan_=10 Additional cards in the rendered window, in total. */
        overscan_: 10,
        /** @member {Number|null} retainOffscreen_=null Retained offscreen card count; null permits one rendered window. */
        retainOffscreen_: null,
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * The status this column projects
         * @member {String|null} status=null
         */
        status: null,
        /**
         * The header text; defaults to the status
         * @member {String|null} title_=null
         */
        title_: null,
        /**
         * The work-in-progress limit; a count above it marks the column
         * @member {Number|null} wipLimit_=null
         */
        wipLimit_: null
    }

    /** @member {Number} windowStart=0 First rendered record index. */
    windowStart = 0
    /** @member {Boolean} isSliced=false Whether the canonical column population exceeds the configured limit. */
    isSliced = false
    /** @member {String|null} Summary text for the current column population. */
    #summaryText = null
    /** @member {Object[]} windowRecords=[] Current sorted record references; the Store remains authoritative. */
    windowRecords = []
    /** @member {Number} averageCardHeight=100 Bootstrap stride estimate, replaced by measured card heights and gaps. */
    averageCardHeight = 100
    /** @member {Number} viewportScrollTop=0 Last observed or requested scroll offset. */
    viewportScrollTop = 0
    /** @member {Number} measurementRevision=0 Fences measurements from an older rendered window. */
    measurementRevision = 0
    /** @member {Object|null} measurementFlight=null One shared completion promise per rendered-window revision. */
    measurementFlight = null
    /** @member {Object|null} pendingScroll=null Latest native scroll event. */
    pendingScroll = null
    /** @member {Boolean} windowPinned=false Whether a drag's held card holds the window away from the scroll position. */
    windowPinned = false
    /** @member {Object|null} navigationToken=null Keeps a requested record rendered through native scroll alignment. */
    navigationToken = null
    /** @member {Number} navigationGeneration=0 Rejects native scroll samples emitted before a requested jump. */
    navigationGeneration = 0
    /** @member {Object|null} lockNode=null Stable lock glyph VDOM node appended to the header when `locked` is true. */
    lockNode = null

    /**
     * The container that holds the cards
     * @member {Neo.container.Base|null} body
     */
    get body() {
        const item = this.items?.[1];
        return item instanceof Container ? item : null
    }

    /**
     * The header component
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
            delegate: '.neo-board-column-collapse',
            scope   : this
        })
    }

    /**
     * @summary Reprojects when the window limit changes.
     * @param {Number|null} value
     * @param {Number|null} oldValue
     */
    afterSetMaxRenderedCards(value, oldValue) {
        oldValue !== undefined && this.board?.isProjectable && this.board.reconcileColumn(this)
    }

    /**
     * @summary Reprojects when overscan changes.
     * @param {Number} value
     * @param {Number} oldValue
     */
    afterSetOverscan(value, oldValue) {
        this.afterSetMaxRenderedCards(value, oldValue)
    }

    /**
     * @summary Enforces a changed offscreen retention budget.
     * @param {Number|null} value
     * @param {Number|null} oldValue
     */
    afterSetRetainOffscreen(value, oldValue) {
        this.afterSetMaxRenderedCards(value, oldValue)
    }

    /**
     * @summary Rejects invalid window limits while retaining the explicit render-all mode.
     * @param {Number|null} value
     * @returns {Number|null}
     */
    beforeSetMaxRenderedCards(value) {
        if (value !== null && (!Number.isInteger(value) || value < 1)) throw new Error('maxRenderedCards must be a positive integer or null');
        return value
    }

    /**
     * @summary Overscan is a nonnegative total extra-card count.
     * @param {Number} value
     * @returns {Number}
     */
    beforeSetOverscan(value) {
        if (!Number.isInteger(value) || value < 0) throw new Error('overscan must be a nonnegative integer');
        return value
    }

    /**
     * @summary Retention is a card count, or one window when null.
     * @param {Number|null} value
     * @returns {Number|null}
     */
    beforeSetRetainOffscreen(value) {
        if (value !== null && (!Number.isInteger(value) || value < 0)) throw new Error('retainOffscreen must be a nonnegative integer or null');
        return value
    }

    /**
     * @summary Selects records before the board allocates their components. A sliced column's window always holds the
     * record of a card the board's drag holds, so a scroll during the drag cannot unmount it.
     * @param {Object[]} records
     * @param {Number} [sourceCount=records.length] Canonical column size, keeping filtered retention bounded.
     * @returns {Object[]}
     */
    selectWindow(records, sourceCount=records.length) {
        let me = this;

        me.windowRecords = records;
        me.isSliced = me.maxRenderedCards !== null && sourceCount > me.maxRenderedCards;
        me.windowStart = me.isSliced ? Math.max(0, Math.min(me.windowStart, records.length - me.windowCapacity)) : 0;

        // A card a drag holds stays a component of this body until the drop, so the window keeps its record, moving as
        // little as it must: a window that lost it would unmount the card the drag still moves. Once the drag lets go,
        // the window returns to the scroll position it was held away from, or the viewport would show its spacer.
        if (me.isSliced) {
            const
                zone   = me.board?.sortZone,
                index  = zone?.dragComponent ? records.indexOf(zone.dragRecord) : -1,
                scroll = me.pendingScroll;

            if (index > -1 && (index < me.windowStart || index >= me.windowStart + me.windowCapacity)) {
                me.windowStart  = index < me.windowStart ? index : index - me.windowCapacity + 1;
                me.windowPinned = true
            } else if (index < 0 && me.windowPinned) {
                me.windowPinned = false;

                if (scroll) {
                    me.windowStart = Math.max(0, Math.min(Math.floor((scroll.scrollTop + 1) / scroll.stride), records.length - me.windowCapacity))
                }
            }
        }

        me.measurementRevision++;

        return me.isSliced ? records.slice(me.windowStart, me.windowStart + me.windowCapacity) : records
    }

    /**
     * @summary Maximum rendered card count including overscan.
     * @returns {Number}
     */
    get windowCapacity() {
        return this.maxRenderedCards === null ? this.windowRecords.length : this.maxRenderedCards + this.overscan
    }

    /**
     * @summary Bounded retained-card budget for this column.
     * @returns {Number}
     */
    get retentionLimit() {
        return this.isSliced ? (this.retainOffscreen ?? this.windowCapacity) : 0
    }

    /**
     * @summary Sets a rendered-record start and synchronously reprojects the column.
     * @param {Number} index
     */
    setWindowStart(index) {
        this.windowStart = Math.max(0, Math.floor(index));
        this.board?.reconcileColumn(this, {windowOnly: true})
    }

    /**
     * @summary Saves the newest native scroll sample for the frame-coalesced projection.
     * @param {Object} data
     */
    onBodyScroll(data) {
        if (this.navigationToken || Number(data.target?.data?.boardNavigation ?? this.navigationGeneration) !== this.navigationGeneration) return;
        // Interpret the offset using the estimate that the event's DOM actually rendered, not a newer worker estimate.
        const stride = Number(data.target?.data?.boardStride) || this.averageCardHeight;
        this.viewportScrollTop = data.scrollTop * this.averageCardHeight / stride;
        this.pendingScroll = {...data, stride};
        if (stride !== this.averageCardHeight) {
            this.body.vdom.scrollTop = this.viewportScrollTop;
            this.body.update()
        }
        this.isSliced && this.applyBodyScroll()
    }

    /** @summary Maps the native offset to a bounded rendered window, including the true end position. */
    applyBodyScroll() {
        const me = this, data = me.pendingScroll;
        if (!data || !me.isSliced || me.navigationToken) return;
        const start = Math.max(0, Math.min(Math.floor((data.scrollTop + 1) / data.stride), me.windowRecords.length - me.windowCapacity));
        if (start !== me.windowStart) me.setWindowStart(start)
    }

    /** @summary Updates the two non-component spacers after the board projects cards. */
    updateSpacers() {
        const me = this, {body} = me;
        if (!body) return;
        const start = me.isSliced ? me.windowStart : 0,
              end   = me.isSliced ? Math.max(0, me.windowRecords.length - start - body.items.length) : 0;
        body.vdom['data-board-stride'] = String(me.averageCardHeight);
        body.vdom['data-board-navigation'] = String(me.navigationGeneration);
        body.vdom.cn[0].style.height = `${start * me.averageCardHeight}px`;
        body.vdom.cn[2].style.height = `${end * me.averageCardHeight}px`;
        body.updateDepth = -1;
        body.update();
        me.scheduleWindowMeasurement()
    }

    /**
     * @summary Shares the complete measurement/update flight so navigation cannot overtake a spacer correction.
     * @returns {Promise<void>}
     */
    scheduleWindowMeasurement() {
        const me = this, revision = me.measurementRevision;
        if (!me.isSliced || !me.body?.mounted || me.isDestroyed) return Promise.resolve();
        if (me.measurementFlight?.revision === revision) return me.measurementFlight.promise;
        const flight = {revision};
        flight.promise = me.measureWindow(revision).finally(() => {
            if (me.measurementFlight === flight) me.measurementFlight = null
        });
        me.measurementFlight = flight;
        return flight.promise
    }

    /**
     * @summary Measures one completed rendered window; late results cannot overwrite a newer projection.
     * @param {Number} revision
     * @returns {Promise<void>}
     */
    async measureWindow(revision) {
        let me = this, {body} = me;
        await body.promiseUpdate();
        if (me.isDestroyed || revision !== me.measurementRevision || !body.mounted) return;
        const cards = [...body.items],
              rects = await me.getDomRect(cards.map(card => card.id));
        if (me.isDestroyed || revision !== me.measurementRevision || !rects?.length || rects.some(rect => !rect || rect.height <= 0)) return;
        const gap     = rects.length > 1 ? Math.max(0, rects[1].y - rects[0].y - rects[0].height) : 0,
              average = rects.reduce((sum, rect) => sum + rect.height + gap, 0) / rects.length;
        if (Math.abs(average - me.averageCardHeight) < 0.5) return;
        const offset = me.viewportScrollTop - me.windowStart * me.averageCardHeight;
        me.averageCardHeight = average;
        me.viewportScrollTop = Math.max(0, me.windowStart * average + offset);
        body.vdom['data-board-stride'] = String(average);
        body.vdom.cn[0].style.height = `${me.windowStart * average}px`;
        body.vdom.cn[2].style.height = `${Math.max(0, me.windowRecords.length - me.windowStart - cards.length) * average}px`;
        body.vdom.scrollTop = me.viewportScrollTop;
        await body.promiseUpdate();
    }

    /**
     * @summary Brings a record into the rendered window; off-column or missing records return null.
     * @param {Object|String|Number} recordOrKey
     * @returns {Promise<Neo.board.Card|null>}
     */
    async scrollToRecord(recordOrKey) {
        const me = this;
        if (!me.board?.store) return null;
        const key   = typeof recordOrKey === 'object' && recordOrKey !== null ? me.board.getKey(recordOrKey) : recordOrKey,
              index = me.windowRecords.findIndex(record => me.board.getKey(record) === key);
        if (index < 0) return null;
        const token = me.navigationToken = {key, record: me.windowRecords[index]};
        me.navigationGeneration++;
        me.viewportScrollTop = index * me.averageCardHeight;
        me.body.vdom.scrollTop = me.viewportScrollTop;
        me.setWindowStart(index);
        try {
            if (me.body.mounted) {
                await me.body.promiseUpdate();
                await me.scheduleWindowMeasurement();
                if (me.isDestroyed || me.navigationToken !== token) return null;
                const card = me.board.getCard(key);
                if (!card || card.record !== token.record || card.parent !== me.body) return null;
                await Neo.main.DomAccess.scrollIntoView({id: card.id, behavior: 'auto', block: 'nearest', windowId: me.windowId})
            }
            const card = !me.isDestroyed && me.board.getCard(key);
            return card && card.record === token.record && card.parent === me.body ? card : null
        } finally {
            if (me.navigationToken === token) {
                me.navigationToken = null;
                me.pendingScroll = null
            }
        }
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
     * @summary Repaints the accent after construction
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetColor(value, oldValue) {
        oldValue !== undefined && this.applyColor()
    }

    /**
     * @summary A new count updates the badge and the WIP state
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetCount(value, oldValue) {
        oldValue !== undefined && this.updateHeader()
    }

    /**
     * @summary Applies a lock change after construction (the initial state lands in `onConstructed`)
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetLocked(value, oldValue) {
        oldValue !== undefined && this.applyLocked()
    }

    /**
     * @summary A new title updates the header
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetTitle(value, oldValue) {
        if (oldValue !== undefined) {
            this.updateHeader();
            this.body?.update()
        }
    }

    /**
     * @summary A new limit updates the badge and the WIP state
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetWipLimit(value, oldValue) {
        oldValue !== undefined && this.updateHeader()
    }

    /**
     * @summary Reflects `collapsed` on the column class, the body and the header.
     */
    applyCollapsed() {
        let me          = this,
            {collapsed} = me;

        me.toggleCls('neo-board-column-collapsed', collapsed);

        if (me.body) {
            me.body.hidden = collapsed
        }

        me.updateHeader();
        me.board?.selectionModel?.syncAnnotations();
        me.fire('collapse', {collapsed, column: me})
    }

    /**
     * @summary Reflects `locked` on the column class, the header (`aria-disabled` + lock glyph), and the board's
     * `columnSortZone`.
     */
    applyLocked() {
        let me       = this,
            {locked} = me;

        me.toggleCls('neo-board-column-locked', locked);
        me.updateHeader();
        me.board?.columnSortZone?.armColumn(me, Boolean(me.board.columnsResortable))
    }

    /**
     * @summary Paints `--neo-board-column-accent-color` from `color`.
     */
    applyColor() {
        let me      = this,
            style   = {...me.style},
            {color} = me;

        if (color) {
            style['--neo-board-column-accent-color'] = color
        } else {
            delete style['--neo-board-column-accent-color']
        }

        me.style = style
    }

    /**
     * @summary True when the body holds more cards than `wipLimit` allows
     * @returns {Boolean}
     */
    get isWipExceeded() {
        const {count, wipLimit} = this;
        return wipLimit != null && count > wipLimit
    }

    /**
     * The collapse toggle in the header
     * @param {Object} data
     */
    onCollapseClick(data) {
        this.collapsed = !this.collapsed
    }

    /**
     * @summary Updates the optional total without allocating or visiting card components.
     */
    syncSummary() {
        const summary = this.board?.columnSummary;
        let   text    = null;

        if (summary) {
            let total = 0;
            for (const record of this.windowRecords) {
                const value = record[summary.field];
                if (Number.isFinite(value)) total += value
            }
            text = String(summary.formatter ? summary.formatter(total) : total)
        }

        if (text !== this.#summaryText) {
            this.#summaryText = text;
            this.updateHeader()
        }
    }

    /**
     * @summary Creates the header's three nodes once: the title, the count badge, the collapse toggle.
     * @description The nodes are created once and mutated afterwards (`button.Base` keeps its text and badge nodes
     * the same way). Rebuilding them per update made every count change a remove + insert, and two updates in
     * flight — the column's own class toggle and the header's text — doubled the badge in the DOM in one run
     * of two. Stable ids let the diff address the same node every time.
     */
    createHeaderNodes() {
        const {header, id} = this;

        if (header && !header.vdom.cn?.length) {
            header.vdom.cn = [{
                tag : 'span',
                id  : `${id}__title`,
                cls : ['neo-board-column-title'],
                text: ''
            }, {
                tag : 'span',
                id  : `${id}__count`,
                cls : ['neo-board-column-count'],
                text: ''
            }, {
                tag : 'button',
                id  : `${id}__collapse`,
                type: 'button',
                cls : ['neo-board-column-collapse'],
                text: ''
            }]
        }
    }

    /**
     * @summary Applies the initial state once the header and the body exist.
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.createHeaderNodes();
        me.updateHeader();
        me.color     && me.applyColor();
        me.collapsed && me.applyCollapsed();
        me.locked    && me.applyLocked()
    }

    /**
     * @summary Updates the header in place: the title, the count badge (`n` or `n/limit`), the collapse toggle, and
     * (when `locked` is true) `aria-disabled="true"` plus the lock glyph; marks the column and the badge when the
     * count exceeds the limit.
     */
    updateHeader() {
        let me                                               = this,
            {collapsed, count, header, id, locked, wipLimit} = me,
            exceeded                                         = me.isWipExceeded,
            title, badge, toggle;

        if (!header) {
            return
        }

        me.createHeaderNodes();

        [title, badge, toggle] = header.vdom.cn;

        title.text = me.title ?? me.status ?? '';
        badge.text = wipLimit != null ? `${count}/${wipLimit}` : String(count);

        NeoArray.toggle(badge.cls, 'neo-board-column-wip-exceeded', exceeded);

        toggle['aria-expanded'] = String(!collapsed);
        toggle['aria-label']    = collapsed ? 'Expand column' : 'Collapse column';
        toggle.text             = collapsed ? '›' : '‹';

        header.vdom.cn.length = 3;
        if (locked) {
            header.vdom['aria-disabled'] = 'true';
            header.vdom.cn[3]            = me.lockNode ||= {
                tag         : 'span',
                id          : `${id}__lock`,
                cls         : ['neo-board-column-lock'],
                'aria-label': 'Locked column',
                text        : '🔒'
            }
        } else {
            delete header.vdom['aria-disabled'];
        }

        if (me.#summaryText !== null) {
            const node = me.summaryNode ||= {
                tag: 'span', id: `${id}__summary`, cls: ['neo-board-column-summary']
            };
            node.text = me.#summaryText;
            header.vdom.cn.push(node)
        }

        header.update();

        if (me.body) {
            me.body.vdom['aria-label'] = `${title.text}, ${count} ${count === 1 ? 'card' : 'cards'}`
        }

        me.toggleCls('neo-board-column-wip-exceeded', exceeded)
    }
}

export default Neo.setupClass(Column);
