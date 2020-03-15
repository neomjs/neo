import {default as ComponentController} from '../../../src/controller/Component.mjs';

/**
 * @class Covid.view.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.MainContainerController'
         * @private
         */
        className: 'Covid.view.MainContainerController',
        /**
         * @member {String} apiUrl='https://corona.lmao.ninja/countries'
         * @private
         */
        apiUrl: 'https://corona.lmao.ninja/countries',
        /**
         * The Covid API does not support CORS, so we do need to use a proxy
         * @member {String} proxyUrl='https://cors-anywhere.herokuapp.com/'
         * @private
         */
        proxyUrl: 'https://cors-anywhere.herokuapp.com/'
    }}

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        this.loadData();
    }

    /**
     *
     * @param {Object[]} data
     */
    addStoreItems(data) {
        const me = this;

        // todo: only render the active view & feed the matching store
        // me.getReference('gallery').store.data = data;
        // me.getReference('helix')  .store.data = data;
        me.getReference('table').store.data = data;

        console.log(me.getReference('table'));
    }

    /**
     *
     */
    loadData() {
        const me = this;

        fetch(me.proxyUrl + me.apiUrl)
            .then(response => response.json())
            .then(data => me.addStoreItems(data))
            .catch(err => console.log('Can’t access ' + me.apiUrl, err));
    }
}

Neo.applyClassConfig(MainContainerController);

export {MainContainerController as default};