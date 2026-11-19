import Button        from '../../../src/button/Base.mjs';
import Component     from '../../../src/component/Base.mjs';
import Container     from '../../../src/container/Base.mjs';
import FooterToolbar from './FooterToolbar.mjs';
import GridContainer from '../../../src/grid/Container.mjs';
import MainStore     from './MainStore.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

const
    currency = new Intl.NumberFormat('en-US', {currency: 'USD', style: 'currency'}).format,
    integer  = new Intl.NumberFormat('en-US').format;

/**
 * @summary Streams 50,000 settlement records into a buffered grid while the footer reports arriving chunks and exposes "Load again".
 * @class Neo.examples.grid.streaming.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.streaming.MainContainer'
         * @protected
         */
        className: 'Neo.examples.grid.streaming.MainContainer',
        /**
         * @member {String[]} cls=['neo-examples-grid-streaming']
         */
        cls: ['neo-examples-grid-streaming'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls   : ['streaming-toolbar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                module  : Component,
                flex    : 1,
                minWidth: 0,
                vdom    : {cn: [
                    {cls: ['streaming-title'], text: 'Streaming 50,000 rows'},
                    {cls: ['streaming-instruction'], text: 'Scroll while rows arrive. Load again clears and replays all 50,000 rows.'}
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
            module       : GridContainer,
            flex         : 1,
            footerToolbar: {module: FooterToolbar, reference: 'footerToolbar'},
            reference    : 'grid',
            store        : MainStore,

            columns: [
                {dataField: 'settlementId', flex: 1, minWidth: 114, text: 'Settlement'},
                {dataField: 'counterparty', flex: 2, minWidth: 162, text: 'Counterparty'},
                {dataField: 'corridor',     flex: 1, minWidth: 114, text: 'Corridor'},
                {dataField: 'desk',         flex: 1, minWidth: 132, text: 'Desk'},
                {
                    cellAlign   : 'right',
                    cls         : ['streaming-header-right'],
                    dataField   : 'amount',
                    flex        : 1,
                    iconPosition: 'left',
                    minWidth    : 118,
                    renderer    : ({value}) => currency(value),
                    text        : 'Amount'
                },
                {
                    cellAlign   : 'right',
                    cls         : ['streaming-header-right'],
                    dataField   : 'latencyMs',
                    flex        : 1,
                    iconPosition: 'left',
                    minWidth    : 88,
                    renderer    : ({value}) => `${integer(value)} ms`,
                    text        : 'Latency'
                },
                {dataField: 'settledAt', flex: 1, minWidth: 108, text: 'Time (UTC)'},
                {dataField: 'status',    flex: 1, minWidth: 94,  text: 'Status'}
            ]
        }]
    }

    /**
     * @summary Reflects the effective boot theme, including a theme selected by URL.
     */
    onConstructed() {
        super.onConstructed();
        this.syncThemeButton()
    }

    /**
     * @summary Clears the grid back to zero rows and restarts the 50,000-row stream from chunk 1.
     */
    onLoadAgainClick() {
        this.getReference('grid').store.reloadStream()
    }

    /**
     * @summary Reveals the new skin from the pointer, then keeps the grid and button in sync.
     * @param {Object} [data] Click coordinates
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
     * @summary Labels the theme toggle button with the theme its next click selects.
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
