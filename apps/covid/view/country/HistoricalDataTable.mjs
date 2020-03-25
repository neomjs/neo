import Container      from '../../../../src/table/Container.mjs';
import HistoricalData from '../../store/HistoricalData.mjs';
import Util           from '../../Util.mjs';

/**
 * @class Covid.view.country.HistoricalDataTable
 * @extends Neo.table.Container
 */
class HistoricalDataTable extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.country.HistoricalDataTable'
         * @private
         */
        className: 'Covid.view.country.HistoricalDataTable',
        /**
         * @member {Array} cls=['covid-country-table', 'neo-table-container']
         */
        cls: ['covid-country-table', 'neo-table-container'],
        /**
         * Default configs for each column
         * @member {Object} columnDefaults=null
         */
        columnDefaults: {
            align   : 'right',
            renderer: Util.formatNumber
        },
        /**
         * @member {Object[]} columns
         */
        columns: [{
            align    : 'left',
            dataField: 'date',
            text     : 'Date',
            renderer : function(value) {
                return new Intl.DateTimeFormat('default', {
                    day  : 'numeric',
                    month: 'numeric',
                    year : 'numeric'
                }).format(new Date(value));
            }
        }, {
            dataField: 'cases',
            text     : 'Cases'
        }, {
            dataField: 'recovered',
            text     : 'Recovered',
            renderer : value => Util.formatNumber(value, 'green')
        }, {
            dataField: 'deaths',
            text     : 'Deaths',
            renderer : value => Util.formatNumber(value, 'red')
        }],
        /**
         * @member {Boolean} createRandomData=false
         */
        createRandomData: false, // testing config
        /**
         * @member {Neo.data.Store} store=HistoricalData
         */
        store: HistoricalData
    }}
}

Neo.applyClassConfig(HistoricalDataTable);

export {HistoricalDataTable as default};