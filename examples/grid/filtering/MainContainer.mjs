import BooleanContainer                    from '../../../src/filter/BooleanContainer.mjs';
import Button                              from '../../../src/button/Base.mjs';
import ComboBox                            from '../../../src/form/field/ComboBox.mjs';
import Component                           from '../../../src/component/Base.mjs';
import Container                           from '../../../src/container/Base.mjs';
import DateContainer                       from '../../../src/filter/DateContainer.mjs';
import GridContainer                       from '../../../src/grid/Container.mjs';
import MainStore, {categories, orderCount} from './MainStore.mjs';
import NumberContainer                     from '../../../src/filter/NumberContainer.mjs';
import Viewport                            from '../../../src/container/Viewport.mjs';

const
    count    = new Intl.NumberFormat('en-US').format,
    currency = new Intl.NumberFormat('en-US', {currency: 'USD', maximumFractionDigits: 0, style: 'currency'}).format,
    day      = new Intl.DateTimeFormat('en-US', {day: 'numeric', month: 'short', timeZone: 'UTC', year: 'numeric'}).format;

/**
 * @summary 10,000 orders filtered from the row under the headers: text, a category, an amount, a date and a status,
 * each with the filter field its type needs. The count says how many orders the filters keep, and one button clears
 * them all.
 *
 * The filter row is the grid's own (`showHeaderFilters`); each column names its field with `editorConfig` and its
 * comparison with `filterConfig`.
 * @class Neo.examples.grid.filtering.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.filtering.MainContainer'
         * @protected
         */
        className: 'Neo.examples.grid.filtering.MainContainer',
        /**
         * @member {String[]} cls=['neo-examples-grid-filtering']
         */
        cls: ['neo-examples-grid-filtering'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls   : ['grid-filtering-toolbar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
            items : [{
                module: Component,
                // Shares the row on a desktop, takes a row of its own on a phone
                flex: '1 1 320px',
                vdom: {cn: [
                    {cls: ['grid-filtering-title'], text: 'Filter 10,000 orders'},
                    {cls: ['grid-filtering-instruction'], text: 'Type, pick or compare in the column headers. Every filter narrows the count.'}
                ]}
            }, {
                module   : Component,
                cls      : ['grid-filtering-count'],
                reference: 'count'
            }, {
                module : Button,
                handler: 'up.onResetClick',
                iconCls: 'fa-solid fa-filter-circle-xmark',
                text   : 'Reset filters',
                tooltip: 'Clear every filter',
                ui     : 'ghost'
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
            module           : GridContainer,
            flex             : 1,
            reference        : 'grid',
            showHeaderFilters: true,
            store            : MainStore,

            // Each header holds its caption and its filter field side by side, so every column flexes from a
            // width that fits both
            columns: [{
                dataField   : 'customer',
                editorConfig: {width: 130},
                flex        : 1,
                minWidth    : 260,
                text        : 'Customer'
            }, {
                dataField   : 'category',
                filterConfig: {operator: '==='},
                flex        : 1,
                minWidth    : 260,
                text        : 'Category',

                editorConfig: {
                    module  : ComboBox,
                    editable: false,
                    store   : categories,
                    width   : 130
                }
            }, {
                cellAlign   : 'right',
                dataField   : 'amount',
                filterConfig: {operator: '>='},
                flex        : 1,
                minWidth    : 240,
                renderer    : ({value}) => currency(value),
                text        : 'Amount',

                // The field shows the operator the filter applies, and the field's default maxValue of 100 would
                // clamp a typed 4000 on blur
                editorConfig: {
                    module      : NumberContainer,
                    buttonConfig: {operators: ['>=', '<=', '===']},
                    fieldConfig : {maxValue: 5000},
                    operator    : '>='
                }
            }, {
                dataField   : 'date',
                filterConfig: {operator: '==='},
                flex        : 1,
                minWidth    : 290,
                renderer    : ({value}) => value ? day(new Date(value)) : '',
                text        : 'Date',

                editorConfig: {
                    module     : DateContainer,
                    fieldConfig: {matchPickerWidth: false}
                }
            }, {
                dataField   : 'paid',
                filterConfig: {operator: '==='},
                flex        : 1,
                minWidth    : 230,
                renderer    : ({value}) => value ? 'Paid' : 'Open',
                text        : 'Status',

                editorConfig: {module: BooleanContainer}
            }]
        }]
    }

    /**
     * @summary Releases the page's observations of the grid's Store, which outlives the page.
     * @param {...*} args
     */
    destroy(...args) {
        let me = this;

        me.getReference('grid')?.store?.un({filter: me.updateCount, load: me.updateCount, scope: me});

        super.destroy(...args)
    }

    /** @summary Counts the orders after every filter change and reflects the boot theme. */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.getReference('grid').store.on({filter: me.updateCount, load: me.updateCount, scope: me});
        me.updateCount();
        me.syncThemeButton()
    }

    /** @summary Clears every filter field in the header row; each field's change clears its own store filter. */
    onResetClick() {
        this.getReference('grid').headerToolbar.items.forEach(({filterField}) => {
            if (filterField) {
                filterField.value = null
            }
        })
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

    /** @summary Writes how many orders the filters keep, of all orders. */
    updateCount() {
        let label = this.getReference('count');

        label.text = `${count(this.getReference('grid').store.getCount())} of ${count(orderCount)} orders`
    }
}

export default Neo.setupClass(MainContainer);
