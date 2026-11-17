import Button        from '../../../src/button/Base.mjs';
import Component     from '../../../src/component/Base.mjs';
import Container     from '../../../src/container/Base.mjs';
import GridContainer from '../../../src/grid/Container.mjs';
import MainStore     from './MainStore.mjs';
import Radio         from '../../../src/form/field/Radio.mjs';
import TextField     from '../../../src/form/field/Text.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

/**
 * The number of CSV lines the preview pane shows: the header line and the first 19 rows
 */
export const PREVIEW_LINES = 20;

const
    currency = new Intl.NumberFormat('en-US', {currency: 'USD', style: 'currency'}).format,
    dateText = new Intl.DateTimeFormat('en-US', {day: 'numeric', month: 'short', timeZone: 'UTC', year: 'numeric'}).format;

/**
 * @summary 300 invoices that leave the grid as CSV, in the grid's current filter and sort.
 *
 * "Show CSV" opens a read-only pane with the first lines of `toCsv()`, so the proof needs no file and works on a
 * phone. "Export CSV" downloads the whole text with `exportCsv()`. The pane follows the filter field, a header sort
 * and the delimiter choice.
 *
 * The amount is shown as currency but exported by its `exportRenderer` as a plain number with two decimals
 * (`1234.50`), so a spreadsheet reads a number. The date is shown as `Mar 4, 2026` and exported as the ISO day
 * the record holds. Invoice INV-1004's customer starts with `=`, and the CSV writes it with a leading `'`.
 * @class Neo.examples.grid.export.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.export.MainContainer'
         * @protected
         */
        className: 'Neo.examples.grid.export.MainContainer',
        /**
         * @member {String[]} cls=['neo-examples-grid-export']
         */
        cls: ['neo-examples-grid-export'],
        /**
         * The field separator the pane and the download use
         * @member {String} delimiter_=','
         * @reactive
         */
        delimiter_: ',',
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls   : ['export-toolbar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                module  : Component,
                flex    : 1,
                minWidth: 0,
                vdom    : {cn: [
                    {cls: ['export-title'], text: 'Export to CSV'},
                    {cls: ['export-instruction'], text: 'Filter or sort the invoices, then show or export the CSV. It holds what the grid shows, in the same order.'}
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
            module: Container,
            cls   : ['export-controls'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
            items : [{
                module       : TextField,
                clearable    : true,
                labelPosition: 'inline',
                labelText    : 'Filter customer',
                listeners    : {change: 'up.onFilterChange'},
                reference    : 'filter',
                width        : 200
            }, {
                module   : Container,
                cls      : ['export-delimiter'],
                layout   : {ntype: 'hbox', align: 'center'},
                reference: 'delimiter',
                items    : [{
                    module    : Radio,
                    checked   : true,
                    hideLabel : true,
                    listeners : {change: 'up.onDelimiterChange'},
                    name      : 'delimiter',
                    reference : 'delimiter-comma',
                    value     : ',',
                    valueLabel: 'Comma'
                }, {
                    module    : Radio,
                    hideLabel : true,
                    listeners : {change: 'up.onDelimiterChange'},
                    name      : 'delimiter',
                    reference : 'delimiter-semicolon',
                    value     : ';',
                    valueLabel: 'Semicolon'
                }]
            }, {
                module   : Button,
                handler  : 'up.onShowCsvClick',
                iconCls  : 'fa-solid fa-eye',
                reference: 'showCsvButton',
                text     : 'Show CSV',
                ui       : 'secondary'
            }, {
                module   : Button,
                handler  : 'up.onExportCsvClick',
                iconCls  : 'fa-solid fa-download',
                reference: 'exportCsvButton',
                text     : 'Export CSV'
            }]
        }, {
            module: Container,
            cls   : ['export-body'],
            flex  : 1,
            layout: {ntype: 'hbox', align: 'stretch'},
            items : [{
                module   : GridContainer,
                flex     : 1,
                minWidth : 0,
                reference: 'grid',
                store    : MainStore,

                columns: [
                    {dataField: 'invoice',  text: 'Invoice',  width: 110},
                    {dataField: 'customer', text: 'Customer', width: 190},
                    {dataField: 'date',     text: 'Date',     width: 130, renderer: ({value}) => dateText(new Date(value))},
                    {
                        cellAlign     : 'right',
                        dataField     : 'amount',
                        exportRenderer: ({value}) => value.toFixed(2),
                        renderer      : ({value}) => currency(value),
                        text          : 'Amount',
                        width         : 120
                    },
                    {dataField: 'status', flex: 1, minWidth: 100, text: 'Status'}
                ]
            }, {
                module   : Container,
                cls      : ['export-pane'],
                hidden   : true,
                layout   : {ntype: 'vbox', align: 'stretch'},
                reference: 'pane',
                items    : [{
                    module   : Component,
                    cls      : ['export-pane-title'],
                    flex     : 'none',
                    reference: 'paneTitle',
                    text     : `toCsv(): first ${PREVIEW_LINES} lines`
                }, {
                    module   : Component,
                    cls      : ['export-pane-text'],
                    flex     : 1,
                    reference: 'csvText',
                    tag      : 'pre'
                }]
            }]
        }]
    }

    /** @summary Reflects the effective boot theme, and keeps an open pane in step with the store. */
    onConstructed() {
        super.onConstructed();

        let me = this;

        // A header sort fires `load`, the filter field fires `filter`
        me.getReference('grid').store.on({filter: me.updateCsvPane, load: me.updateCsvPane, scope: me});
        me.syncThemeButton()
    }

    /**
     * Triggered after the delimiter config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetDelimiter(value, oldValue) {
        oldValue && this.updateCsvPane()
    }

    /**
     * @param {Object} data
     * @param {Neo.form.field.Radio} data.component
     * @param {Boolean} data.value
     */
    onDelimiterChange({component, value}) {
        if (value) {
            this.delimiter = component.value
        }
    }

    /**
     * @summary Downloads every row of the current filter and sort, not only the rendered ones.
     * @returns {Promise<void>}
     */
    async onExportCsvClick() {
        await this.getReference('grid').exportCsv({delimiter: this.delimiter, fileName: 'invoices.csv'})
    }

    /**
     * @param {Object} data
     * @param {String|null} data.value
     */
    onFilterChange({value}) {
        this.getReference('grid').store.getFilter('customer').value = value || null
    }

    /** @summary Opens or closes the preview pane. */
    onShowCsvClick() {
        let me     = this,
            pane   = me.getReference('pane'),
            hidden = !pane.hidden;

        pane.hidden = hidden;

        me.getReference('showCsvButton').set({
            iconCls: hidden ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash',
            text   : hidden ? 'Show CSV' : 'Hide CSV'
        });

        me.updateCsvPane()
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

    /** @summary Writes the first lines of `toCsv()` into the pane, while the pane is open. */
    updateCsvPane() {
        let me   = this,
            pane = me.getReference('pane');

        if (pane && !pane.hidden) {
            me.getReference('csvText').text = me.getReference('grid').toCsv({delimiter: me.delimiter})
                .split('\r\n').slice(0, PREVIEW_LINES).join('\n')
        }
    }
}

export default Neo.setupClass(MainContainer);
