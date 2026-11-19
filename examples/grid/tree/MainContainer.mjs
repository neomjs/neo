import Button        from '../../../src/button/Base.mjs';
import Component     from '../../../src/component/Base.mjs';
import Container     from '../../../src/container/Base.mjs';
import GridContainer from './GridContainer.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

/**
 * @summary Viewport for the Tree Grid budget roll-up example, pairing a headline/instruction bar
 * and Expand all / Reset / Theme controls with a full-stage `GridContainer`.
 *
 * @class Neo.examples.grid.tree.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.tree.MainContainer'
         * @protected
         */
        className: 'Neo.examples.grid.tree.MainContainer',
        /**
         * @member {String[]} cls=['neo-examples-grid-tree']
         */
        cls: ['neo-examples-grid-tree'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls   : ['tree-grid-toolbar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                module  : Component,
                cls     : ['tree-grid-intro'],
                flex    : 1,
                minWidth: 0,
                vdom    : {cn: [
                    {cls: ['tree-grid-title'], text: 'Tree Grid'},
                    {cls: ['tree-grid-instruction'], text: 'Expand a team with its arrow or ArrowRight / ArrowLeft — its seats, budget and spend add up to its department.'}
                ]}
            }, {
                module: Container,
                cls   : ['tree-grid-actions'],
                flex  : 'none',
                layout: {ntype: 'hbox', align: 'center'},
                items : [{
                    module   : Button,
                    handler  : 'up.onExpandAllClick',
                    iconCls  : 'fa-solid fa-maximize',
                    reference: 'expandAllButton',
                    text     : 'Expand all',
                    ui       : 'ghost'
                }, {
                    module   : Button,
                    handler  : 'up.onResetClick',
                    iconCls  : 'fa-solid fa-rotate-left',
                    reference: 'resetButton',
                    text     : 'Reset',
                    ui       : 'ghost'
                }, {
                    module   : Button,
                    handler  : 'up.onThemeButtonClick',
                    iconCls  : 'fa-solid fa-moon',
                    reference: 'themeButton',
                    text     : 'Dark theme',
                    tooltip  : 'Switch between the light and dark theme',
                    ui       : 'ghost'
                }]
            }]
        }, {
            module   : GridContainer,
            flex     : 1,
            reference: 'treeGrid'
        }]
    }

    /**
     * @summary Syncs the theme toggle label to the initial boot theme (`?theme=` or `prefersDarkTheme`).
     */
    onConstructed() {
        super.onConstructed();
        this.syncThemeButton()
    }

    /**
     * @summary Expands every department and team node so all 52 rows can be inspected at once.
     */
    onExpandAllClick() {
        this.getReference('treeGrid').store.expandAll()
    }

    /**
     * @summary Restores initial data, clears active sorters, and collapses teams back to the default first-level view.
     */
    onResetClick() {
        const grid = this.getReference('treeGrid');

        grid.store.resetHierarchy();
        grid.headerToolbar?.items?.forEach(column => {
            if (column.isSorted) {
                column.isSorted = null
            }
        })
    }

    /**
     * @summary Switches between `neo-theme-neo-light` and `neo-theme-neo-dark`.
     * @param {Object} [data]
     * @returns {Promise<void>}
     */
    async onThemeButtonClick(data) {
        await Neo.main.DomAccess.startViewTransition({
            delay   : 100,
            reveal  : {x: data?.clientX, y: data?.clientY},
            windowId: this.windowId
        }).catch(() => {});

        this.theme = this.getTheme() === 'neo-theme-neo-dark' ? 'neo-theme-neo-light' : 'neo-theme-neo-dark';
        this.syncThemeButton()
    }

    /**
     * @summary Updates the theme button icon and label to name the opposite skin.
     */
    syncThemeButton() {
        const dark = this.getTheme() === 'neo-theme-neo-dark';

        this.getReference('themeButton').set({
            iconCls: dark ? 'fa-solid fa-sun' : 'fa-solid fa-moon',
            text   : dark ? 'Light theme' : 'Dark theme'
        })
    }
}

export default Neo.setupClass(MainContainer);
