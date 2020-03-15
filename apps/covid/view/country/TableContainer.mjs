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
            text     : 'Country',
            dataField: 'country'
        }, {
            text     : 'Cases',
            dataField: 'cases'
        }, {
            text     : 'Deaths',
            dataField: 'deaths'
        }, {
            text     : 'Critical',
            dataField: 'critical'
        }, {
            text     : 'Recovered',
            dataField: 'recovered'
        }, {
            text     : 'Cases today',
            dataField: 'todayCases'
        }, {
            text     : 'Deaths today',
            dataField: 'todayDeaths'
        }]
    }}
}

Neo.applyClassConfig(TableContainer);

export {TableContainer as default};