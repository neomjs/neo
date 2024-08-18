import Controller from '../../../src/controller/Component.mjs';

/**
 * @class Neo.examples.grid.covid.GridContainerController
 * @extends Neo.controller.Component
 */
class GridContainerController extends Controller {
    /**
     * @member {String} apiUrl='https://disease.sh/v3/covid-19/countries'
     */
    apiUrl = 'https://disease.sh/v3/covid-19/countries'

    static config = {
        /**
         * @member {String} className='Neo.examples.grid.covid.GridContainerController'
         * @protected
         */
        className: 'Neo.examples.grid.covid.GridContainerController'
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.loadData();
    }

    /**
     * @param {Object[]} data
     */
    addStoreItems(data) {
        let store = this.component.store;

        data.forEach(item => {
            if (item.country.includes('"')) {
                item.country = item.country.replace('"', "\'");
            }

            item.casesPerOneMillion = item.casesPerOneMillion > item.cases ? 'N/A' : item.casesPerOneMillion || 0;
            item.infected           = item.casesPerOneMillion;
        });

        store.data = data;
    }

    /**
     *
     */
    loadData() {
        let me = this;

        fetch(me.apiUrl)
            .then(response => response.json())
            .catch(err => console.log('Can’t access ' + me.apiUrl, err))
            .then(data => me.addStoreItems(data))
    }
}

export default Neo.setupClass(GridContainerController);
