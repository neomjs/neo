import BooleanContainer from '../../src/filter/BooleanContainer.mjs';
import Button           from '../../src/button/Base.mjs';
import CellModel        from '../../src/selection/table/CellModel.mjs';
import CheckBox         from '../../src/form/field/CheckBox.mjs';
import ComboBox         from '../../src/form/field/ComboBox.mjs';
import Component        from '../../src/component/Base.mjs';
import Container        from '../../src/container/Base.mjs';
import DateContainer    from '../../src/filter/DateContainer.mjs';
import DateUtil         from '../../src/util/Date.mjs';
import MainStore        from './MainStore.mjs';
import NumberContainer  from '../../src/filter/NumberContainer.mjs';
import TableContainer   from '../../src/table/Container.mjs';
import Viewport         from '../../src/container/Viewport.mjs';

/**
 * @summary Demonstrates inline column header filters across text, combobox, numeric, date, and boolean table columns.
 * @class Neo.examples.tableFiltering.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        className: 'Neo.examples.tableFiltering.MainContainer',
        layout   : {ntype: 'vbox', align: 'stretch'},
        style    : {padding: '20px'},

        items: [{
            module: Component,
            flex  : 'none',
            style : {marginBottom: '5px'},
            vdom  : {cn: [{
                tag : 'h1',
                text: 'Table Filtering'
            }, {
                tag : 'p',
                text: 'Type in a header field. Combine two filters.'
            }]}
        }, {
            module: Container,
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            style : {marginBottom: '5px'},

            items: [{
                module: Component,
                flex  : 1
            }, {
                module        : CheckBox,
                checked       : true,
                hideLabel     : true,
                hideValueLabel: false,
                valueLabel    : 'Show Filters',

                listeners: {
                    change: function(opts) {
                        Neo.getComponent('myTableFilterContainer').showHeaderFilters = opts.value;
                    }
                }
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
            module           : TableContainer,
            bodyConfig       : {selectionModel: CellModel},
            flex             : 1,
            id               : 'myTableFilterContainer',
            showHeaderFilters: true,
            store            : MainStore,
            width            : '100%',
            wrapperStyle     : {flex: 1, minHeight: 0},

            columns: [{
                dataField: 'customer',
                flex     : 2,
                minWidth : 115,
                text     : 'Customer'
            }, {
                dataField: 'country',
                flex     : 1,
                minWidth : 110,
                text     : 'Country',

                editorConfig: {
                    module: ComboBox,
                    width : 150,

                    store: {
                        autoLoad   : true,
                        keyProperty: 'code',
                        url        : new URL(Neo.config.basePath + 'resources/examples/data/countries.json', Neo.config.url.base).href,

                        model: {
                            fields: [{
                                name: 'code',
                                type: 'String'
                            }, {
                                name: 'name',
                                type: 'String'
                            }]
                        }
                    }
                }
            }, {
                dataField   : 'openOrders',
                filterConfig: {operator: '>'},
                text        : 'Open Orders',
                width       : 120,

                editorConfig: {
                    module  : NumberContainer,
                    operator: '>',

                    fieldConfig: {
                        maxValue: 16,
                        minValue: 0
                    }
                }
            }, {
                dataField   : 'lastOrder',
                filterConfig: {operator: '>='},
                renderer    : data => DateUtil.convertToyyyymmdd(data.value),
                text        : 'Last Order',
                width       : 135,

                editorConfig: {
                    module  : DateContainer,
                    operator: '>=',

                    fieldConfig: {
                        matchPickerWidth: false
                    }
                }
            }, {
                dataField   : 'active',
                filterConfig: {operator: '==='},
                renderer    : data => `<i class="fa fa-${data.value ? 'check' : 'times'}"></i>`,
                text        : 'Active',
                width       : 90,

                editorConfig: {
                    module: BooleanContainer
                }
            }]
        }]
    }

    /** @summary Reflects the effective boot theme, including a theme selected by the example URL. */
    onConstructed() {
        super.onConstructed();
        this.syncThemeButton()
    }

    /** @summary Toggles the viewport between light and dark themes and updates the button label. */
    onThemeButtonClick() {
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
