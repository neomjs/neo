import Button        from '../../../src/button/Base.mjs';
import Component     from '../../../src/component/Base.mjs';
import Container     from '../../../src/container/Base.mjs';
import GridContainer from '../../../src/grid/Container.mjs';
import MainStore     from './MainStore.mjs';
import {months}      from './MainModel.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

// December flexes from the same 150px minimum, so it reads 150px wherever the centre overflows
const quarter = (text, slice) => ({text, columns: slice.map(month => ({
    dataField: month, text: month[0].toUpperCase() + month.slice(1), ...(month === 'dec' ? {flex: 1, minWidth: 150} : {width: 150})
}))});

/**
 * @summary A grid whose columns sit under shared group headers in every region, also the fixture its e2e specs drive.
 *
 * The geometry is fixed for test math:
 * - locked start: `region` (180px), ungrouped, so its part of the group row holds no cell;
 * - centre: four quarters of three months each, every month 150px, so 1800px that overflows the centre viewport
 *   and scrolls. `dec` flexes from a 150px minimum, so a centre wider than its months re-lays it out. An ungrouped
 *   `id` (100px) follows the quarters, so the centre part of the group row holds no cell over it;
 * - locked end: the `Year` group over `total` (140px).
 *
 * @class Neo.examples.grid.headerGroups.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.headerGroups.MainContainer'
         * @protected
         */
        className: 'Neo.examples.grid.headerGroups.MainContainer',
        /**
         * @member {String[]} cls=['neo-examples-grid-header-groups']
         */
        cls: ['neo-examples-grid-header-groups'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls   : ['header-groups-toolbar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                module  : Component,
                flex    : 1,
                minWidth: 0,
                vdom    : {cn: [
                    {cls: ['header-groups-title'], text: 'Grouped column headers'},
                    {cls: ['header-groups-instruction'], text: 'Move a quarter as a group, or reorder months within it. Resize a month to see its group stay aligned.'}
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
                {dataField: 'region', locked: 'start', text: 'Region', width: 180},
                quarter('Q1', months.slice(0, 3)),
                quarter('Q2', months.slice(3, 6)),
                quarter('Q3', months.slice(6, 9)),
                quarter('Q4', months.slice(9)),
                {dataField: 'id', text: 'Id', width: 100},
                {text: 'Year', locked: 'end', columns: [{dataField: 'total', text: 'Total', width: 140}]}
            ]
        }]
    }

    /** @summary Reflects the effective boot theme, including a theme selected by the example URL. */
    onConstructed() {
        super.onConstructed();
        this.syncThemeButton()
    }

    /** @summary Switches the viewport theme so the grid and its floating drag proxies share the active skin. */
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
