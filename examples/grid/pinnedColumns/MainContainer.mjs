import Button        from '../../../src/button/Base.mjs';
import Component     from '../../../src/component/Base.mjs';
import Container     from '../../../src/container/Base.mjs';
import GridContainer from '../../../src/grid/Container.mjs';
import MainStore     from './MainStore.mjs';
import {months}      from './MainModel.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

const
    format   = new Intl.NumberFormat('en-US').format,
    renderer = ({value}) => format(value),
    // One header group per year over its twelve months, so a month header stays short enough for an 80px column
    years    = [...new Set(months.map(({year}) => year))].map(year => ({
        text   : String(year),
        columns: months.filter(month => month.year === year).map(({field, text}) => ({cellAlign: 'right', dataField: field, renderer, text, width: 80}))
    }));

/**
 * @summary A plan wider than any screen: product and region pinned at the start, the total at the end, 36 months
 * scrolling between them.
 *
 * Pinning is the column config `locked: 'start'` or `locked: 'end'`. The months sit under one header group per year,
 * and the pinned columns stay narrow enough that a phone still shows one whole month between them.
 * @class Neo.examples.grid.pinnedColumns.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.pinnedColumns.MainContainer'
         * @protected
         */
        className: 'Neo.examples.grid.pinnedColumns.MainContainer',
        /**
         * @member {String[]} cls=['neo-examples-grid-pinned-columns']
         */
        cls: ['neo-examples-grid-pinned-columns'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls   : ['pinned-columns-toolbar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                module  : Component,
                flex    : 1,
                minWidth: 0,
                vdom    : {cn: [
                    {cls: ['pinned-columns-title'], text: 'Pinned columns'},
                    {cls: ['pinned-columns-instruction'], text: 'Scroll sideways. Product, region and total stay in place.'}
                ]}
            }, {
                module   : Button,
                handler  : 'up.onThemeButtonClick',
                reference: 'themeButton',
                text     : 'Dark theme',
                iconCls  : 'fa-solid fa-moon',
                tooltip  : 'Switch between the light and dark theme',
                ui       : 'ghost'
            }]
        }, {
            module: GridContainer,
            flex  : 1,
            store : MainStore,

            columns: [
                {dataField: 'product', locked: 'start', text: 'Product', width: 110},
                {dataField: 'region',  locked: 'start', text: 'Region',  width: 100},
                ...years,
                {cellAlign: 'right', dataField: 'total', locked: 'end', renderer, text: 'Total', width: 90}
            ]
        }]
    }

    /** @summary Reflects the effective boot theme, including a theme selected by the example URL. */
    onConstructed() {
        super.onConstructed();
        this.syncThemeButton()
    }

    /**
     * @summary Reveals the new skin from the pointer, then keeps the grid and the button in sync.
     * @param {Object} [data] Click coordinates; absent coordinates retain the engine's default transition.
     * @returns {Promise<void>}
     */
    async onThemeButtonClick(data) {
        // Start capture before changing the theme. A failed decorative round trip must not prevent the switch.
        await Neo.main.DomAccess.startViewTransition({
            delay   : 100,
            reveal  : {x: data?.clientX, y: data?.clientY},
            windowId: this.windowId
        }).catch(() => {});

        this.theme = this.getTheme() === 'neo-theme-neo-dark' ? 'neo-theme-neo-light' : 'neo-theme-neo-dark';
        this.syncThemeButton()
    }

    /** @summary Labels the button with the theme its next click will select. */
    syncThemeButton() {
        const dark = this.getTheme() === 'neo-theme-neo-dark';
        this.getReference('themeButton').set({
            iconCls: dark ? 'fa-solid fa-sun' : 'fa-solid fa-moon',
            text   : dark ? 'Light theme' : 'Dark theme'
        })
    }
}

export default Neo.setupClass(MainContainer);
