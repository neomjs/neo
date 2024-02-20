import BaseTableContainer       from '../../../src/table/Container.mjs';
import Store                    from './Store.mjs';
import TableContainerController from './TableContainerController.mjs';
import Util                     from './Util.mjs';

/**
 * @class Neo.examples.table.covid.TableContainer
 * @extends Neo.table.Container
 */
class TableContainer extends BaseTableContainer {
    static config = {
        /**
         * @member {String} className='Neo.examples.table.covid.TableContainer'
         * @protected
         */
        className: 'Neo.examples.table.covid.TableContainer',
        /**
         * @member {String[]} cls=['covid-country-table']
         */
        cls: ['covid-country-table'],
        /**
         * Default configs for each column
         * @member {Object} columnDefaults
         */
        columnDefaults: {
            cellAlign           : 'right',
            defaultSortDirection: 'DESC',
            renderer            : Util.formatNumber
        },
        /**
         * @member {Object[]} columns
         */
        columns: [{
            cls      : ['neo-index-column', 'neo-table-header-button'],
            dataField: 'index',
            dock     : 'left',
            minWidth : 40,
            text     : '#',
            renderer : Util.indexRenderer,
            width    : 40
        }, {
            cellAlign           : 'left',
            dataField           : 'country',
            defaultSortDirection: 'ASC',
            dock                : 'left',
            text                : 'Country',
            width               : 200,

            renderer: data => {
                return {
                    cls : ['neo-country-column', 'neo-table-cell'],
                    html: [
                        '<div style="display: flex; align-items: center">',
                        '<img style="height:20px; margin-right:10px; width:20px;" src="' + Util.getCountryFlagUrl(data.value) + '">' + data.value,
                        '</div>'
                    ].join('')
                };
            }
        }, {
            dataField: 'cases',
            text     : 'Cases'
        }, {
            dataField: 'casesPerOneMillion',
            text     : 'Cases / 1M'
        }, {
            dataField: 'infected',
            text     : 'Infected',
            renderer : data => Util.formatInfected(data)
        }, {
            dataField: 'active',
            text     : 'Active',
            renderer : data => Util.formatNumber(data, '#64B5F6')
        },  {
            dataField: 'recovered',
            text     : 'Recovered',
            renderer : data => Util.formatNumber(data, '#28ca68')
        }, {
            dataField: 'critical',
            text     : 'Critical',
            renderer : data => Util.formatNumber(data, 'orange')
        }, {
            dataField: 'deaths',
            text     : 'Deaths',
            renderer : data => Util.formatNumber(data, '#fb6767')
        }, {
            dataField: 'todayCases',
            text     : 'Cases today'
        }, {
            dataField: 'todayDeaths',
            text     : 'Deaths today',
            renderer : data => Util.formatNumber(data, '#fb6767')
        }, {
            dataField: 'tests',
            text     : 'Tests'
        }, {
            dataField: 'testsPerOneMillion',
            text     : 'Tests / 1M'
        }],
        /**
         * @member {Neo.controller.Component} controller=TableContainerController
         */
        controller: TableContainerController,
        /**
         * @member {Object[]} store=MainStore
         */
        store: Store
    }
}

Neo.setupClass(TableContainer);

export default TableContainer;
