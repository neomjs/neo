import CountryStore from '../../store/Countries.mjs';
import Container    from '../../../../src/table/Container.mjs';

/**
 * @class Covid.view.country.TableContainer
 * @extends Neo.table.Container
 */
class TableContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.country.TableContainer'
         * @private
         */
        className: 'Covid.view.country.TableContainer',


        createRandomData: false, // testing config
        /**
         * @member {Neo.data.Store} store=CountryStore
         */
        store: CountryStore,

        columns: [{
            dataField: 'country',
            text     : 'Country'
        }, {
            align    : 'right',
            dataField: 'cases',
            text     : 'Cases'
        }, {
            align    : 'right',
            dataField: 'deaths',
            text     : 'Deaths',
            renderer : function(value) {
                return `<span style="color:red;">${value}</span>`;
            }
        }, {
            align    : 'right',
            dataField: 'critical',
            text     : 'Critical',
            renderer : function(value) {
                return `<span style="color:orange;">${value}</span>`;
            }
        }, {
            align    : 'right',
            dataField: 'recovered',
            text     : 'Recovered',
            renderer : function(value) {
                return `<span style="color:green;">${value}</span>`;
            }
        }, {
            align    : 'right',
            dataField: 'todayCases',
            text     : 'Cases today'
        }, {
            align    : 'right',
            dataField: 'todayDeaths',
            text     : 'Deaths today',
            renderer : function(value) {
                return `<span style="color:red;">${value}</span>`;
            }
        }]
    }}
}

Neo.applyClassConfig(TableContainer);

export {TableContainer as default};