import Container      from '../../../../src/table/Container.mjs';
import HistoricalData from '../../store/HistoricalData.mjs';
import Util           from '../../Util.mjs';

/**
 * @class Covid.view.country.HistoricalDataTable
 * @extends Neo.table.Container
 */
class HistoricalDataTable extends Container {
    static config = {
        /**
         * @member {String} className='Covid.view.country.HistoricalDataTable'
         * @protected
         */
        className: 'Covid.view.country.HistoricalDataTable',
        /**
         * @member {String[]} baseCls=['covid-historical-data-table','neo-table-container']
         */
        baseCls: ['covid-historical-data-table', 'neo-table-container'],
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
            cellAlign: 'left',
            dataField: 'date',
            dock     : 'left',
            text     : 'Date',
            width    : 100,
            renderer : function(data) {
                return {
                    cls : ['neo-date-column', 'neo-table-cell'],
                    html: new Intl.DateTimeFormat('default', {
                        day  : 'numeric',
                        month: 'numeric',
                        year : 'numeric'
                    }).format(new Date(data.value))
                };
            }
        }, {
            dataField: 'cases',
            text     : 'Cases',
            renderer : data => Util.formatNumber(data)
        }, {
            dataField: 'active',
            text     : 'Active',
            renderer : data => Util.formatNumber(data, '#64B5F6')
        }, {
            dataField: 'recovered',
            text     : 'Recovered',
            renderer : data => Util.formatNumber(data, '#28ca68')
        }, {
            dataField: 'deaths',
            text     : 'Deaths',
            renderer : data => Util.formatNumber(data, '#fb6767')
        }, {
            dataField: 'dailyCases',
            text     : 'Daily C',
            renderer : data => Util.formatNumber(data)
        }, {
            dataField: 'dailyActive',
            text     : 'Daily A',
            renderer : data => Util.formatNumber(data, '#64B5F6')
        }, {
            dataField: 'dailyRecovered',
            text     : 'Daily R',
            renderer : data => Util.formatNumber(data, '#28ca68')
        }, {
            dataField: 'dailyDeaths',
            text     : 'Daily D',
            renderer : data => Util.formatNumber(data, '#fb6767')
        }],
        /**
         * @member {Neo.data.Store} store=HistoricalData
         */
        store: HistoricalData
    }
}

export default Neo.setupClass(HistoricalDataTable);
