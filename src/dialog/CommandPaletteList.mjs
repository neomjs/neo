import List from '../list/Base.mjs';

/**
 * @summary `Neo.list.Base` listbox view for {@link Neo.dialog.CommandPalette} command records.
 *
 * Renders each {@link Neo.dialog.model.CommandAction} record as a `<li role="option">` item navigated
 * from the palette's combobox `<input>` via {@link Neo.main.addon.Navigator} (`eventSource`).
 * Unavailable commands stay navigable and clickable (`aria-disabled="true"`, `.neo-is-unavailable`)
 * rather than `.neo-disabled` (`pointer-events: none`) so keyboard and pointer users can inspect and
 * trigger polite refusal announcements explaining why a command is currently unavailable.
 *
 * @class Neo.dialog.CommandPaletteList
 * @extends Neo.list.Base
 */
class CommandPaletteList extends List {
    static config = {
        /**
         * @member {String} className='Neo.dialog.CommandPaletteList'
         * @protected
         */
        className: 'Neo.dialog.CommandPaletteList',
        /**
         * @member {String} ntype='command-palette-list'
         * @protected
         */
        ntype: 'command-palette-list',
        /**
         * Store lifetime belongs to the owning {@link Neo.dialog.CommandPalette}.
         * @member {Boolean} autoDestroyStore=false
         */
        autoDestroyStore: false,
        /**
         * @member {String[]} cls=['neo-command-palette-list']
         * @reactive
         */
        cls: ['neo-command-palette-list'],
        /**
         * Active highlight is owned by {@link Neo.main.addon.Navigator} (`aria-activedescendant` +
         * `.neo-navigator-active-item`) rather than persistent multi-row selection state.
         * @member {Boolean} disableSelection=true
         * @reactive
         */
        disableSelection: true,
        /**
         * @member {Boolean} highlightFilterValue=false
         */
        highlightFilterValue: false,
        /**
         * Focus stays inside the combobox `<input>` while `Navigator` drives virtual option movement,
         * keeping `Tab` strictly between the search input and header `Esc` button.
         * @member {Boolean} itemsFocusable=false
         */
        itemsFocusable: false,
        /**
         * Preserves active option highlight across live store filter updates.
         * @member {Boolean} keepFocusIndex=true
         */
        keepFocusIndex: true,
        /**
         * @member {String} role='listbox'
         * @reactive
         */
        role: 'listbox',
        /**
         * @member {Object} selectionModel={stayInList:false}
         * @reactive
         */
        selectionModel: {
            stayInList: false
        }
    }

    /**
     * Zero-based index of the currently active `<li role="option">`, or `-1` when empty.
     * @member {Number} activeOptionIndex=-1
     */
    activeOptionIndex = -1
    /**
     * @member {String} itemRole='option'
     */
    itemRole = 'option'

    /**
     * @summary Populates `vdom.cn` silently while unmounted so pre-open `store` refreshes mount atomically
     * inside `Neo.dialog.Base#show` instead of dispatching an unmounted child update.
     * @param {Boolean} [silent=false]
     */
    createItems(silent = false) {
        super.createItems(silent || !this.mounted)
    }

    /**
     * @summary Synchronizes `aria-selected` across rendered `<li role="option">` items and aligns
     * {@link #focusIndex} without overwriting Main's `.neo-navigator-active-item` class.
     * @param {Number} activeIndex
     * @param {Boolean} [silent=false]
     */
    syncActiveSelection(activeIndex, silent = false) {
        const me    = this,
              index = Neo.isNumber(activeIndex) ? activeIndex : -1,
              nodes = me.vdom?.cn || [];

        me.activeOptionIndex = index;
        me._focusIndex       = index >= 0 ? index : null;

        let changed = false;

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];

            if (node) {
                const expected = i === index ? 'true' : 'false';

                if (node['aria-selected'] !== expected) {
                    node['aria-selected'] = expected;
                    changed               = true
                }
            }
        }

        if (changed && !silent && me.mounted) {
            me.update()
        }
    }

    /**
     * @summary Builds the structured VDOM payload merged into each `<li role="option">` item by `Neo.list.Base#createItem`.
     * @param {Neo.dialog.model.CommandAction} record
     * @param {Number} index
     * @returns {Object}
     */
    createItemContent(record, index) {
        const unavailable = !record.available,
              cls         = ['neo-command-palette-option'],
              metaNodes   = [];

        if (unavailable) {
            cls.push('neo-is-unavailable');

            if (record.unavailableReason) {
                metaNodes.push({
                    tag : 'span',
                    cls : ['neo-command-palette-unavailable-pill'],
                    text: record.unavailableReason
                })
            }
        }

        if (record.shortcut) {
            metaNodes.push({
                tag : 'kbd',
                cls : ['neo-command-palette-shortcut'],
                text: record.shortcut
            })
        }

        const headingChildren = [{
            tag : 'span',
            cls : ['neo-command-palette-option-label'],
            text: record.label
        }];

        if (record.group) {
            headingChildren.push({
                tag : 'span',
                cls : ['neo-command-palette-option-group'],
                text: record.group
            })
        }

        const copyChildren = [{
            cls: ['neo-command-palette-option-heading'],
            cn : headingChildren
        }];

        if (record.description) {
            copyChildren.push({
                tag : 'p',
                cls : ['neo-command-palette-option-detail'],
                text: record.description
            })
        }

        const mainChildren = [];

        if (record.iconCls) {
            mainChildren.push({
                tag          : 'span',
                'aria-hidden': 'true',
                cls          : ['neo-command-palette-option-icon', ...record.iconCls.trim().split(/\s+/)]
            })
        }

        mainChildren.push({
            cls: ['neo-command-palette-option-copy'],
            cn : copyChildren
        });

        const optionChildren = [{
            cls: ['neo-command-palette-option-main'],
            cn : mainChildren
        }];

        if (metaNodes.length > 0) {
            optionChildren.push({
                cls: ['neo-command-palette-option-meta'],
                cn : metaNodes
            })
        }

        const selectedIndex = this.activeOptionIndex >= 0 ? this.activeOptionIndex : this.focusIndex;

        return {
            'aria-disabled': unavailable ? 'true' : 'false',
            'aria-selected': index === selectedIndex ? 'true' : 'false',
            cls,
            cn             : optionChildren,
            data           : {
                recordId: String(record.id)
            }
        }
    }
}

export default Neo.setupClass(CommandPaletteList);
