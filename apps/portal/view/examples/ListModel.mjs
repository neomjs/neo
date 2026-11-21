import BaseListModel from '../../../../src/selection/ListModel.mjs';

/**
 * @summary Selection and keyboard-navigation model for {@link Portal.view.examples.List} cards.
 *
 * Separates native anchor launches (`.neo-title`, `.portal-example-open-cue`, `.neo-github-image`) from card-body
 * selection so clicking a link on card B launches once while preserving card A's selection (`selectOnFocus: false` /
 * `autoClick: false` on the owning list). Card-body clicks toggle selection (`select` / `deselect`), `Escape` clears
 * selection, `ArrowLeft` / `ArrowRight` step linearly across visible cards, and `ArrowUp` / `ArrowDown` traverse
 * visual grid rows via {@link Neo.component.Base#getDomRect} — handling uniform multi-column grids, `2×2` `leadCard`
 * hero layouts, and single-column narrow containers while keeping DOM focus and `.neo-selected` on the same card.
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
        this.hasSelection() && this.deselectAll()
    }

    /**
     * @summary Moves selection and focus to the previous visible card.
     * @param {Object} data
     */
    onKeyDownLeft(data) {
        this.stepLinear(data, -1)
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
        const records = this.getNavigableRecords();

        if (!records.length) {
            return
        }

        const currentIndex = this.getCurrentRecordIndex(data, records),
              nextIndex    = currentIndex < 0
                  ? (delta > 0 ? 0 : records.length - 1)
                  : Math.max(0, Math.min(records.length - 1, currentIndex + delta));

        this.selectAndFocus(records[nextIndex])
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
              {view}  = me,
              records = me.getNavigableRecords();

        if (!records.length) {
            return
        }

        const currentIndex = me.getCurrentRecordIndex(data, records);

        if (currentIndex < 0) {
            me.selectAndFocus(records[direction > 0 ? 0 : records.length - 1]);
            return
        }

        let rects = null;

        if (view.mounted && typeof view.getDomRect === 'function') {
            rects = await view.getDomRect(records.map(record => view.getItemId(view.getRecordId(record))))
        }

        const current = rects?.[currentIndex];

        if (!current || !(current.width > 0 && current.height > 0)) {
            me.stepLinear(data, direction);
            return
        }

        const currentLeft    = current.left ?? current.x,
              currentRight   = current.right ?? (currentLeft + current.width),
              currentTop     = current.top ?? current.y,
              currentBottom  = current.bottom ?? (currentTop + current.height),
              currentCenterX = currentLeft + current.width / 2,
              candidates     = [];

        rects.forEach((rect, index) => {
            if (!rect || index === currentIndex || !(rect.width > 0 && rect.height > 0)) {
                return
            }

            const left   = rect.left ?? rect.x,
                  right  = rect.right ?? (left + rect.width),
                  top    = rect.top ?? rect.y,
                  bottom = rect.bottom ?? (top + rect.height);

            if (direction > 0 ? top >= currentBottom - 4 : bottom <= currentTop + 4) {
                candidates.push({bottom, centerX: left + rect.width / 2, index, left, right, top})
            }
        });

        if (!candidates.length) {
            // Stay on the boundary row when already at the top or bottom row
            me.selectAndFocus(records[currentIndex]);
            return
        }

        const rowEdge = direction > 0
                  ? Math.min(...candidates.map(c => c.top))
                  : Math.max(...candidates.map(c => c.bottom)),
              rowCandidates = candidates.filter(c => Math.abs((direction > 0 ? c.top : c.bottom) - rowEdge) <= 12),
              overlapping   = rowCandidates.filter(c => Math.min(c.right, currentRight) - Math.max(c.left, currentLeft) > 2),
              pool          = overlapping.length ? overlapping : rowCandidates;

        pool.sort((a, b) => {
            const distDiff = Math.abs(a.centerX - currentCenterX) - Math.abs(b.centerX - currentCenterX);
            return Math.abs(distDiff) > 1 ? distDiff : a.left - b.left
        });

        me.selectAndFocus(records[pool[0].index])
    }
}

export default Neo.setupClass(ListModel);
