import Button        from '../../../src/button/Base.mjs';
import ComboBox      from '../../../src/form/field/ComboBox.mjs';
import Component     from '../../../src/component/Base.mjs';
import Container     from '../../../src/container/Base.mjs';
import GridContainer from '../../../src/grid/Container.mjs';
import Label         from '../../../src/component/Label.mjs';
import MainStore     from './MainStore.mjs';
import PagingToolbar from '../../../src/toolbar/Paging.mjs';
import StateProvider from '../../../src/state/Provider.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';
import {countries}   from './SimulatedConnection.mjs';

const count = value => value.toLocaleString('en-GB'),
      money = new Intl.NumberFormat('en-GB', {style: 'currency', currency: 'EUR', maximumFractionDigits: 0});

/**
 * @summary Demonstrates server-owned paging, sorting and filtering with a visibly simulated server.
 * @class Neo.examples.grid.serverSide.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        className    : 'Neo.examples.grid.serverSide.MainContainer',
        cls          : ['neo-examples-grid-server-side'],
        layout       : {ntype: 'vbox', align: 'stretch'},
        stateProvider: {module: StateProvider, stores: {orders: {module: MainStore}}},
        items        : [{
            module: Container,
            cls   : ['server-side-heading'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                module: Component,
                flex  : 1,
                vdom  : {cn: [
                    {tag: 'h1', text: 'One page. 100,000 orders.'},
                    {tag: 'p', text: 'Page, sort a column or choose a country. Each action asks the simulated server for just one page.'}
                ]}
            }, {
                module         : Button,
                reference      : 'themeButton',
                handler        : 'up.onThemeButtonClick',
                iconCls        : 'fa-solid fa-moon',
                text           : 'Dark theme',
                ui             : 'secondary',
                useRippleEffect: false
            }]
        }, {
            module: Container,
            cls   : ['server-side-controls'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                module       : ComboBox,
                reference    : 'country',
                name         : 'country',
                labelText    : 'Country',
                labelPosition: 'inline',
                labelWidth   : 65,
                width        : 240,
                editable     : false,
                clearable    : false,
                useFilter    : false,
                triggerAction: 'all',
                value        : 'all',
                store        : [{id: 'all', name: 'All countries'}, ...countries.map(id => ({id, name: id}))],
                listeners    : {change: 'up.onCountryChange'}
            }, {
                module: Label,
                cls   : ['server-side-scope'],
                text  : 'Simulated server · 100,000 seeded orders'
            }]
        }, {
            module   : Label,
            cls      : ['server-side-request'],
            reference: 'request',
            flex     : 'none',
            text     : 'Preparing the first request…',
            vdom     : {role: 'status', 'aria-live': 'polite'}
        }, {
            module   : GridContainer,
            reference: 'grid',
            flex     : 1,
            bind     : {store: 'stores.orders'},
            columns  : [
                {dataField: 'id', text: 'Order', width: 72},
                {dataField: 'customer', text: 'Customer', flex: 2, minWidth: 112},
                {dataField: 'country', text: 'Country', flex: 1, minWidth: 84},
                {dataField: 'amount', text: 'Amount €', flex: 1, minWidth: 96, cellAlign: 'right', renderer: ({value}) => money.format(value)}
            ]
        }, {
            module   : PagingToolbar,
            reference: 'paging',
            cls      : ['server-side-paging'],
            flex     : 'none',
            bind     : {store: 'stores.orders'},
            pageSize : 50,
            totalText: count => `Total: ${count.toLocaleString('en-GB')} rows`,
            items    : {
                'nav-button-first': {text: 'First', tooltip: 'First page', cls: ['server-side-page-button'],
                    useRippleEffect: false, vdom: {'aria-label': 'First'}},
                'nav-button-prev' : {text: 'Previous', tooltip: 'Previous page', cls: ['server-side-page-button'],
                    useRippleEffect: false, vdom: {'aria-label': 'Previous'}},
                'nav-button-next' : {text: 'Next', tooltip: 'Next page', cls: ['server-side-page-button'],
                    useRippleEffect: false, vdom: {'aria-label': 'Next'}},
                'nav-button-last' : {text: 'Last', tooltip: 'Last page', cls: ['server-side-page-button'],
                    useRippleEffect: false, vdom: {'aria-label': 'Last'}},
                'pages-text': {cls: ['server-side-page-position']},
                label       : {cls: ['server-side-page-size-label']},
                spacer      : {cls: ['server-side-page-spacer']},
                'total-text': {cls: ['server-side-page-total']},
                rowsPerPage : {value: 50}
            }
        }]
    }

    /** @summary Subscribes before the initial read so even the first loading state is observable. */
    onConstructed() {
        super.onConstructed();
        const me    = this,
              store = me.getReference('grid').store;

        store.pipeline.connection.on({request: me.onRequest, scope: me});
        store.on({load: me.onStoreLoad, scope: me});
        me.syncThemeButton();
        store.load().catch(error => {
            if (!me.isDestroyed) {
                me.setBusy(false);
                me.getReference('request').text = `Request failed: ${error.message}`
            }
        })
    }

    /**
     * @summary Releases view subscriptions before the root provider destroys its owned Store.
     * @param {...*} args
     */
    destroy(...args) {
        const store = this.getReference('grid')?.store;
        store?.pipeline?.connection?.un({request: this.onRequest, scope: this});
        store?.un({load: this.onStoreLoad, scope: this});
        super.destroy(...args)
    }

    /**
     * @summary Changes the remote filter once; Store resets the page as part of that mutation.
     * @param {Object} data
     */
    onCountryChange({value}) {
        const store   = this.getReference('grid')?.store,
              country = value?.id ?? value;
        if (store) store.filters = country === 'all' ? [] : [{property: 'country', operator: '===', value: country}]
    }

    /**
     * @summary Shows the actual outbound parameters while the simulated response is pending.
     * @param {Object} request
     */
    onRequest(request) {
        this.setBusy(true);
        this.getReference('request').text = `${this.describeRequest(request)} · Loading…`
    }

    /** @summary Replaces the loading receipt only once the response page has reached the Store. */
    onStoreLoad() {
        const store   = this.getReference('grid').store,
              request = store.pipeline.connection.lastRequest;

        if (request?.duration == null || store.count !== request.returned) return;
        this.setBusy(false);
        this.getReference('request').text = `${this.describeRequest(request)} · ${request.returned} of ${count(request.totalCount)} rows · ${request.duration} ms`
    }

    /**
     * @summary Formats the connection's request snapshot, rather than guessing from the controls.
     * @param {Object} request
     * @returns {String}
     */
    describeRequest({number, page, pageSize, filters, sorters}) {
        const sort   = sorters.map(({property, direction}) => `${property} ${direction.toLowerCase()}`).join(', ') || 'none',
              filter = filters.map(({property, value}) => `${property} = ${value}`).join(', ') || 'none';
        return `Request ${number} · page ${page} · size ${pageSize} · sort: ${sort} · filter: ${filter}`
    }

    /**
     * @summary Prevents overlapping gestures while showing the grid's native loading mask.
     * @param {Boolean} busy
     */
    setBusy(busy) {
        const grid = this.getReference('grid');
        this[busy ? 'addCls' : 'removeCls']('server-side-busy');
        grid.isLoading = busy ? `Fetching page ${grid.store.currentPage} from the simulated server…` : false;
        this.getReference('paging').disabled = busy
    }

    /** @summary Switches the example between its two supported themes. */
    onThemeButtonClick() {
        this.theme = this.getTheme() === 'neo-theme-neo-dark' ? 'neo-theme-neo-light' : 'neo-theme-neo-dark';
        this.syncThemeButton()
    }

    /** @summary Reflects the effective boot theme and the next available theme action. */
    syncThemeButton() {
        const dark = this.getTheme() === 'neo-theme-neo-dark';
        this.getReference('themeButton').set({
            iconCls: dark ? 'fa-solid fa-sun' : 'fa-solid fa-moon',
            text   : dark ? 'Light theme' : 'Dark theme'
        })
    }
}

export default Neo.setupClass(MainContainer);
