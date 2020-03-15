import {default as ComponentController} from '../../../src/controller/Component.mjs';

/**
 * @class Covid.view.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static getConfig() {return {
        className: 'Covid.view.MainContainerController'
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
     * @param {Array} data
     */
    addStoreItems(data) {
        console.log('addStoreItems', data);
    }

    /**
     *
     */
    loadData() {
        const me       = this,
              proxyUrl = "https://cors-anywhere.herokuapp.com/",
              url      = 'https://corona.lmao.ninja/countries';

        fetch(proxyUrl + url)
            .then(response => response.json())
            .then(data => me.addStoreItems(data))
            .catch(err => console.log('Can’t access ' + url, err));
    }
}

Neo.applyClassConfig(MainContainerController);

export {MainContainerController as default};