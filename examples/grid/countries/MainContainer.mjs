import Button        from '../../../src/button/Base.mjs';
import Component     from '../../../src/component/Base.mjs';
import Container     from '../../../src/container/Base.mjs';
import CountryColumn from './CountryColumn.mjs';
import GridContainer from '../../../src/grid/Container.mjs';
import MainStore     from './MainStore.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

const
    integer = new Intl.NumberFormat('en-US'),
    decimal = new Intl.NumberFormat('en-US', {maximumFractionDigits: 1, minimumFractionDigits: 1}),
    percent = new Intl.NumberFormat('en-US', {maximumFractionDigits: 1, minimumFractionDigits: 1, style: 'percent'}),
    change  = new Intl.NumberFormat('en-US', {maximumFractionDigits: 1, minimumFractionDigits: 1, signDisplay: 'exceptZero', style: 'percent'}),
    dollars = new Intl.NumberFormat('en-US', {currency: 'USD', maximumFractionDigits: 0, style: 'currency'}),
    compact = new Intl.NumberFormat('en-US', {currency: 'USD', maximumFractionDigits: 1, minimumFractionDigits: 1, notation: 'compact', style: 'currency'}),
    // The grid hands a renderer an empty string for a null field (src/grid/Row.mjs), which Intl would format as 0
    missing = value => value === '' || value === null,
    /**
     * A cell renderer for one format. A value the World Bank has not published since 2020 shows a dash.
     * @param {Function} format Receives the value, returns its text
     * @returns {Function}
     */
    show    = format => ({value}) => missing(value) ? {cls: ['countries-missing'], text: '–'} : format(value),
    // The data holds percentages as numbers (35.7 means 35.7 %); Intl's percent style multiplies by 100
    share   = show(value => percent.format(value / 100)),
    /**
     * A growth rate, tinted green when it grew and red when it shrank. The tint follows the shown figure, so -0.02
     * reads 0.0% without a tint.
     * @param {Object} data
     * @param {Number|null} data.value
     * @returns {Object}
     */
    growth  = ({value}) => {
        if (missing(value)) {
            return {cls: ['countries-missing'], text: '–'}
        }

        const shown = Math.round(value * 10) / 10;

        return {
            cls : shown > 0 ? ['countries-up'] : shown < 0 ? ['countries-down'] : [],
            text: change.format(shown / 100)
        }
    },
    figure  = {cellAlign: 'right', defaultSortDirection: 'DESC'};

/**
 * @summary 217 economies from the World Bank's latest indicators: a flag beside each name, figures formatted, a value
 * tint on economic growth, and the largest population first.
 *
 * The data is a JSON file inside the example (`data/countries.json`), so the grid never waits on an outside service.
 * The rank and the country stay in place while the figures scroll under three header groups.
 * @class Neo.examples.grid.countries.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.countries.MainContainer'
         * @protected
         */
        className: 'Neo.examples.grid.countries.MainContainer',
        /**
         * @member {String[]} cls=['neo-examples-grid-countries']
         */
        cls: ['neo-examples-grid-countries'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls   : ['countries-toolbar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                module  : Component,
                flex    : 1,
                minWidth: 0,
                vdom    : {cn: [
                    {cls: ['countries-title'], text: 'Country statistics'},
                    {cls: ['countries-instruction'], text: 'Sort by any figure. Green means growth rose, red that it fell.'},
                    {cls: ['countries-source'], cn: [
                        {tag: 'a', href: 'https://data.worldbank.org', target: '_blank', text: 'World Bank, World Development Indicators'},
                        {vtype: 'text', text: ' · '},
                        {tag: 'a', href: 'https://creativecommons.org/licenses/by/4.0/', target: '_blank', text: 'CC BY 4.0'},
                        {vtype: 'text', text: ' · retrieved 17 Nov 2026'}
                    ]}
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
                // A header label gets its width minus about 53px of padding and sort glyph
                {type: 'index', dataField: 'id', locked: 'start', text: '#', width: 72},
                {module: CountryColumn, dataField: 'country', locked: 'start', text: 'Country', width: 190},
                {text: 'People', columns: [
                    {...figure, dataField: 'population',       renderer: show(value => integer.format(value)), text: 'Population', width: 130},
                    {...figure, dataField: 'populationGrowth', renderer: growth,                           text: 'Growth',     width: 100}
                ]},
                {text: 'Economy', columns: [
                    {...figure, dataField: 'gdp',          renderer: show(value => compact.format(value)), text: 'GDP',        width: 95},
                    {...figure, dataField: 'gdpPerCapita', renderer: show(value => dollars.format(value)), text: 'Per person', width: 120},
                    {...figure, dataField: 'gdpGrowth',    renderer: growth,                           text: 'Growth',     width: 100}
                ]},
                {text: 'Living', columns: [
                    {...figure, dataField: 'lifeExpectancy', renderer: show(value => decimal.format(value)), text: 'Life expectancy', width: 150},
                    {...figure, dataField: 'urban',          renderer: share,                              text: 'Urban',           width: 90},
                    {...figure, dataField: 'internet',       renderer: share,                              text: 'Internet',        width: 100},
                    {...figure, dataField: 'electricity',    renderer: share,                              text: 'Electricity',     width: 120}
                ]},
                {dataField: 'region', text: 'Region', width: 320}
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
