import BaseGridContainer       from '../../../src/grid/Container.mjs';
import GridContainerController from './GridContainerController.mjs';
import Store                   from './Store.mjs';
import Util                    from './Util.mjs';

/**
 * @class Neo.examples.grid.covid.GridContainer
 * @extends Neo.grid.Container
 */
class GridContainer extends BaseGridContainer {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.covid.GridContainer'
         * @protected
         */
        className: 'Neo.examples.grid.covid.GridContainer',
        /**
         * @member {String[]} cls=['covid-country-grid']
         */
        cls: ['covid-country-grid'],
        /**
         * Default configs for each column
         * @member {Object} columnDefaults
         */
        columnDefaults: {
            cellAlign           : 'right',
            defaultSortDirection: 'DESC',
            renderer            : Util.formatNumber,
            width               : 100
        },
        /**
         * @member {Object[]} columns
         */
        columns: [{
            cls     : ['neo-index-column'],
            dock    : 'left',
            field   : 'index',
            minWidth: 40,
            text    : '#',
            renderer: Util.indexRenderer,
            width   : 40
        }, {
            cellAlign           : 'left',
            defaultSortDirection: 'ASC',
            dock                : 'left',
            field               : 'country',
            text                : 'Country',
            width               : 200,

            renderer: data => {
                return {
                    cls : ['neo-country-column', 'neo-grid-cell'],
                    html: [
                        '<div style="display: flex; align-items: center">',
                            '<img style="height:20px; margin-right:10px; width:20px;" src="' + Util.getCountryFlagUrl(data.value) + '">' + data.value,
                        '</div>'
                    ].join('')
                };
            }
        }, {
            field: 'cases',
            text : 'Cases'
        }, {
            field: 'casesPerOneMillion',
            text : 'Cases / 1M'
        }, {
            field   : 'infected',
            text    : 'Infected',
            renderer: data => Util.formatInfected(data)
        }, {
            field   : 'active',
            text    : 'Active',
            renderer: data => Util.formatNumber(data, '#64B5F6')
        }, {
            field   : 'recovered',
            text    : 'Recovered',
            renderer: data => Util.formatNumber(data, '#28ca68')
        }, {
            field   : 'critical',
            text    : 'Critical',
            renderer: data => Util.formatNumber(data, 'orange')
        }, {
            field   : 'deaths',
            text    : 'Deaths',
            renderer: data => Util.formatNumber(data, '#fb6767')
        }, {
            field: 'todayCases',
            text : 'Cases today'
        }, {
            field   : 'todayDeaths',
            text    : 'Deaths today',
            renderer: data => Util.formatNumber(data, '#fb6767')
        }, {
            field: 'tests',
            text : 'Tests'
        }, {
            field: 'testsPerOneMillion',
            text : 'Tests / 1M'
        }],
        /**
         * @member {Neo.controller.Component} controller=GridContainerController
         */
        controller: GridContainerController,
        /**
         * @member {Object[]} store=Store
         */
        store: Store
    }
}

Neo.applyClassConfig(GridContainer);

export default GridContainer;
