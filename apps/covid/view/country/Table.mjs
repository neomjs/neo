import Container    from '../../../../src/table/Container.mjs';
import CountryStore from '../../store/Countries.mjs';
import Util         from '../../Util.mjs';

/**
 * @class Covid.view.country.Table
 * @extends Neo.table.Container
 */
class Table extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.country.Table'
         * @protected
         */
        className: 'Covid.view.country.Table',
        /**
         * @member {String[]} cls=['covid-country-table', 'neo-table-container']
         */
        cls: ['covid-country-table', 'neo-table-container'],
        /**
         * Default configs for each column
         * @member {Object} columnDefaults
         */
        columnDefaults: {
            align               : 'right',
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
            align               : 'left',
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
         * @member {Neo.data.Store} store=CountryStore
         */
        store: CountryStore
    }}
}

Neo.applyClassConfig(Table);

export {Table as default};