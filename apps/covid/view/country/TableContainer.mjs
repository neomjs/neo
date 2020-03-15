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
         * The unique record field containing the id.
         * @member {String} keyProperty='id'
         */
        keyProperty: 'country',
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
        }]
    }}
}

Neo.applyClassConfig(TableContainer);

export {TableContainer as default};