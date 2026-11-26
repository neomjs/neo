import List from '../../src/list/Base.mjs';

/**
 * @summary `Neo.list.Base` listbox view for {@link Neo.examples.workbench.CommandPalette} action records.
 *
 * Renders each {@link Neo.examples.workbench.CommandActionModel} record as a `<li role="option">` item
 * navigated from the palette's combobox `<input>` via {@link Neo.main.addon.Navigator} (`eventSource`).
 * Unavailable commands stay navigable and clickable (`aria-disabled="true"`, `.neo-is-unavailable`)
 * rather than `.neo-disabled` (`pointer-events: none`) so keyboard and pointer users can inspect and
 * trigger explicit refusal announcements explaining why an action is unavailable.
 *
 * @class Neo.examples.workbench.CommandActionList
 * @extends Neo.list.Base
 */
class CommandActionList extends List {
    static config = {
        /**
         * @member {String} className='Neo.examples.workbench.CommandActionList'
         * @protected
         */
        className: 'Neo.examples.workbench.CommandActionList',
        /**
         * @member {String} ntype='workbench-command-action-list'
         * @protected
         */
        ntype: 'workbench-command-action-list',
        /**
         * The owning {@link Neo.examples.workbench.CommandPalette} manages store lifetime.
         * @member {Boolean} autoDestroyStore=false
         */
        autoDestroyStore: false,
        /**
         * @member {String[]} cls=['neo-command-palette-list']
         */
        cls: ['neo-command-palette-list'],
        /**
         * Active highlight is owned by {@link Neo.main.addon.Navigator} (`aria-activedescendant` +
         * `.neo-navigator-active-item`) rather than persistent multi-row selection state.
         * @member {Boolean} disableSelection=true
         */
        disableSelection: true,
        /**
         * Structured VDOM item trees replace string-level HTML highlight injection.
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
         * Preserves active option highlight across live store filter mutations (`ComboBox` pattern).
         * @member {Boolean} keepFocusIndex=true
         */
        keepFocusIndex: true,
        /**
         * @member {String} role='listbox'
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
     * @member {String} itemRole='option'
     */
    itemRole = 'option'

    /**
     * @summary Builds the structured VDOM payload merged into each `<li role="option">` item by `Neo.list.Base#createItem`.
     * @param {Neo.examples.workbench.CommandActionModel} record
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

        return {
            'aria-disabled': unavailable ? 'true' : 'false',
            'aria-selected': index === this.focusIndex ? 'true' : 'false',
            cls,
            cn             : optionChildren,
            data           : {
                recordId: String(record.id)
            }
        }
    }
}

export default Neo.setupClass(CommandActionList);
