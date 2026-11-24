import BaseListModel from '../../../../src/selection/ListModel.mjs';

/**
 * @summary Selection and keyboard-navigation model for {@link Portal.view.examples.List} cards.
 *
 * Separates native anchor launches (`.neo-title`, `.portal-example-open-cue`, `.neo-github-image`) from card-body
 * selection so clicking a link on card B launches once while preserving card A's selection (`selectOnFocus: false` /
 * `autoClick: false` on the owning list). Card-body clicks toggle selection (`select` / `deselect`), `Escape` clears
 * selection, `ArrowLeft` / `ArrowRight` step linearly across visible cards (`ArrowLeft` on the first card hands the step
 * to the list's owner as `leaveStart`, and {@link #enter} is the way back in), and `ArrowUp` / `ArrowDown` traverse
 * visual grid rows via {@link Neo.component.Base#getDomRect} — handling uniform multi-column grids, `2×2` `leadCard`
 * hero layouts, and single-column narrow containers while keeping DOM focus and `.neo-selected` on the same card. Past
 * the first or last row the card stays and the list hands the step to its owner as `leaveRow`, so a page that stacks
 * lists can carry it into the next one through {@link #enterRow}.
 *
 * @class Portal.view.examples.ListModel
 * @extends Neo.selection.ListModel
 * @see Portal.view.examples.List
 */
class ListModel extends BaseListModel {
    static config = {
        /**
         * @member {String} className='Portal.view.examples.ListModel'
         * @protected
         */
        className: 'Portal.view.examples.ListModel',
        /**
         * @member {String} ntype='portal-examples-listmodel'
         * @protected
         */
        ntype: 'portal-examples-listmodel'
    }

    /**
     * The row navigation request whose geometry is still relevant to the current input.
     * @member {Symbol|null} #rowNavigationRequest=null
     * @private
     */
    #rowNavigationRequest = null

    /**
     * @summary Picks the card of one visual row that lies nearest a horizontal span: the row whose edge is first in the
     * step's direction, then the cards overlapping the span, then the smallest center distance (leftmost on a tie).
     * @param {Object[]} boxes Card boxes: `{bottom, centerX, index, left, right, top}`
     * @param {Number} direction `1` picks from the topmost row, `-1` from the bottommost
     * @param {Number} left The span's left edge
     * @param {Number} right The span's right edge
     * @returns {Number} The picked card's record index
     * @private
     */
    #nearestInRow(boxes, direction, left, right) {
        const centerX       = (left + right) / 2,
              rowEdge       = direction > 0 ? Math.min(...boxes.map(b => b.top)) : Math.max(...boxes.map(b => b.bottom)),
              rowCandidates = boxes.filter(b => Math.abs((direction > 0 ? b.top : b.bottom) - rowEdge) <= 12),
              overlapping   = rowCandidates.filter(b => Math.min(b.right, right) - Math.max(b.left, left) > 2),
              pool          = overlapping.length ? overlapping : rowCandidates;

        pool.sort((a, b) => {
            const distDiff = Math.abs(a.centerX - centerX) - Math.abs(b.centerX - centerX);
            return Math.abs(distDiff) > 1 ? distDiff : a.left - b.left
        });

        return pool[0].index
    }

    /**
     * @summary Measures the visible cards. Resolves `null` without a mounted view, and `false` when a newer navigation
     * request replaced this one while the measurement was in flight.
     * @param {Object[]} records The visible records
     * @param {Symbol} request The navigation request this measurement belongs to
     * @returns {Promise<Object[]|null|false>} One box per record, `null` for an unmeasurable card
     * @private
     */
    async #measure(records, request) {
        const me     = this,
              {view} = me;

        if (!view.mounted || typeof view.getDomRect !== 'function') {
            return null
        }

        const rects = await view.getDomRect(records.map(record => view.getItemId(view.getRecordId(record))));

        if (me.#rowNavigationRequest !== request || me.view !== view || !view.mounted) {
            return false
        }

        return rects.map((rect, index) => {
            if (!rect || !(rect.width > 0 && rect.height > 0)) {
                return null
            }

            const left = rect.left ?? rect.x,
                  top  = rect.top  ?? rect.y;

            return {bottom: rect.bottom ?? (top + rect.height), centerX: left + rect.width / 2, index, left, right: rect.right ?? (left + rect.width), top}
        })
    }

    /**
     * @summary Selects and focuses the selected card, or else the first visible one: the way into the cards from outside
     * the list.
     */
    enter() {
        const me      = this,
              records = me.getNavigableRecords();

        records.length && me.selectAndFocus(records[Math.max(me.getCurrentRecordIndex(null, records), 0)])
    }

    /**
     * @summary Resolves the active index inside the visible record list from event focus path or current selection.
     * @param {Object} [data]
     * @param {Object[]} records
     * @returns {Number}
     * @protected
     */
    getCurrentRecordIndex(data, records) {
        let me     = this,
            {view} = me,
            path   = data?.path,
            itemIndex, recordId;

        if (Array.isArray(path)) {
            itemIndex = view.getInteractiveItemIndex(path);

            if (itemIndex !== undefined) {
                recordId = view.getItemRecordId(path[itemIndex].id);

                const focusedIdx = records.findIndex(record => view.getRecordId(record) === recordId || record.id === recordId);

                if (focusedIdx !== -1) {
                    return focusedIdx
                }
            }
        }

        if (me.items.length > 0) {
            const selectedItemId = me.items[0],
                  selectedIdx    = records.findIndex(record => me.getSelectionItemId(record) === selectedItemId);

            if (selectedIdx !== -1) {
                return selectedIdx
            }
        }

        return -1
    }

    /**
     * @summary Returns all store records currently rendered into the DOM (excluding hidden items).
     * @returns {Object[]}
     * @protected
     */
    getNavigableRecords() {
        const {view} = this;

        if (!view?.store || view.disableSelection) {
            return []
        }

        return view.store.items.filter(record => !view.isHiddenItem(record))
    }

    /**
     * @summary Detects whether a click originated inside a native `<a>` descendant of the clicked list item.
     * @param {Object} data
     * @param {String} [data.currentTarget]
     * @param {Object[]} [data.path]
     * @returns {Boolean}
     * @protected
     */
    hasAnchorInPath({currentTarget, path}={}) {
        if (!Array.isArray(path)) {
            return false
        }

        for (const entry of path) {
            if (String(entry?.tagName).toLowerCase() === 'a') {
                return true
            }

            if (currentTarget && entry?.id === currentTarget) {
                break
            }
        }

        return false
    }

    /**
     * @summary Moves selection and focus one visual row downward.
     * @param {Object} data
     * @returns {Promise<void>}
     */
    async onKeyDownDown(data) {
        await this.stepRow(data, 1)
    }

    /**
     * @summary Clears card selection when `Escape` is pressed.
     */
    onKeyDownEscape() {
        let me = this;

        me.#rowNavigationRequest = null;
        me.hasSelection() && me.deselectAll()
    }

    /**
     * @summary Moves selection and focus to the previous visible card. The first card has none, so the list hands the
     * step to its owner and the card keeps its selection.
     * @param {Object} data
     */
    onKeyDownLeft(data) {
        const me      = this,
              records = me.getNavigableRecords();

        if (records.length && me.getCurrentRecordIndex(data, records) === 0) {
            me.#rowNavigationRequest = null;

            /**
             * @event leaveStart
             * @param {Object} record The first card's record
             */
            me.view.fire('leaveStart', {record: records[0]})
        } else {
            me.stepLinear(data, -1)
        }
    }

    /**
     * @summary Moves selection and focus to the next visible card.
     * @param {Object} data
     */
    onKeyDownRight(data) {
        this.stepLinear(data, 1)
    }

    /**
     * @summary Moves selection and focus one visual row upward.
     * @param {Object} data
     * @returns {Promise<void>}
     */
    async onKeyDownUp(data) {
        await this.stepRow(data, -1)
    }

    /**
     * @summary Toggles card selection on body clicks while ignoring clicks on native `<a>` links.
     * @param {Object} data
     */
    onListClick(data) {
        let me = this;

        me.#rowNavigationRequest = null;

        if (me.hasAnchorInPath(data)) {
            return
        }

        let {view} = me,
            id     = view?.getItemRecordId(data.currentTarget),
            record = id !== undefined ? view.store?.get(id) : null;

        if (!view?.disableSelection && record) {
            const itemId = me.getSelectionItemId(record);

            if (me.isSelected(itemId)) {
                me.deselect(record)
            } else {
                me.select(record)
            }
        }
    }

    /**
     * @summary Selects the target record and moves {@link Neo.main.addon.Navigator} focus onto its list item.
     * @param {Object} record
     * @protected
     */
    selectAndFocus(record) {
        if (!record) {
            return
        }

        const itemId = this.getSelectionItemId(record);

        this.select(itemId);
        this.view?.focus(itemId)
    }

    /**
     * @summary Steps linearly by `delta` (`-1` or `1`) across visible records without wrapping.
     * @param {Object} data
     * @param {Number} delta
     * @protected
     */
    stepLinear(data, delta) {
        let me      = this,
            records = me.getNavigableRecords();

        me.#rowNavigationRequest = null;

        if (!records.length) {
            return
        }

        const currentIndex = me.getCurrentRecordIndex(data, records),
              nextIndex    = currentIndex < 0
                  ? (delta > 0 ? 0 : records.length - 1)
                  : Math.max(0, Math.min(records.length - 1, currentIndex + delta));

        me.selectAndFocus(records[nextIndex])
    }

    /**
     * @summary Steps vertically (`direction`: `1` down, `-1` up) across visual CSS Grid rows using live DOM rects.
     *
     * Handles uniform 3-column / 2-column / 1-column grids as well as `leadCard: true` (`2×2` hero spanning two
     * columns and two rows) by selecting the nearest row strictly below/above the current card's box and preferring
     * horizontal span overlap before center-to-center horizontal distance.
     *
     * @param {Object} data
     * @param {Number} direction `1` for Down, `-1` for Up
     * @returns {Promise<void>}
     * @protected
     */
    async stepRow(data, direction) {
        const me      = this,
              records = me.getNavigableRecords(),
              request = Symbol();

        me.#rowNavigationRequest = request;

        if (!records.length) {
            return
        }

        const currentIndex = me.getCurrentRecordIndex(data, records);

        if (currentIndex < 0) {
            me.selectAndFocus(records[direction > 0 ? 0 : records.length - 1]);
            return
        }

        const boxes = await me.#measure(records, request);

        if (boxes === false) {
            return
        }

        const current = boxes?.[currentIndex];

        if (!current) {
            me.stepLinear(data, direction);
            return
        }

        const candidates = boxes.filter(box => box && box.index !== currentIndex &&
            (direction > 0 ? box.top >= current.bottom - 4 : box.bottom <= current.top + 4));

        if (!candidates.length) {
            // The boundary row keeps the card, and the owner may carry the step into a list below or above
            me.selectAndFocus(records[currentIndex]);

            /**
             * @event leaveRow
             * @param {Number} direction `1` past the last row, `-1` past the first
             * @param {Number} left The card's left edge
             * @param {Number} right The card's right edge
             */
            me.view.fire('leaveRow', {direction, left: current.left, right: current.right});
            return
        }

        me.selectAndFocus(records[me.#nearestInRow(candidates, direction, current.left, current.right)])
    }

    /**
     * @summary Enters the cards from a neighbouring list on the same page: selects and focuses the card of the first
     * visual row (`direction: 1`, coming from above) or the last (`-1`, coming from below) nearest the leaving card's
     * span. Without a measurable layout it takes the first or last card in reading order.
     * @param {Number} direction `1` enters the first row, `-1` the last
     * @param {Object} span The leaving card's horizontal span
     * @param {Number} span.left
     * @param {Number} span.right
     * @returns {Promise<void>}
     */
    async enterRow(direction, {left, right}) {
        const me      = this,
              records = me.getNavigableRecords(),
              request = Symbol();

        me.#rowNavigationRequest = request;

        if (!records.length) {
            return
        }

        const boxes = await me.#measure(records, request);

        if (boxes === false) {
            return
        }

        const measured = boxes?.filter(Boolean);

        me.selectAndFocus(records[measured?.length
            ? me.#nearestInRow(measured, direction, left, right)
            : (direction > 0 ? 0 : records.length - 1)])
    }
}

export default Neo.setupClass(ListModel);
