import {default as ComponentController} from '../../../src/controller/Component.mjs';

/**
 * @class Covid.view.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static getStaticConfig() {return {
        /**
         * A regex to replace blank chars
         * @member {RegExp} flagRegEx=/ /gi
         * @private
         * @static
         */
        flagRegEx: / /gi
    }}

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
         * @member {String} apiSummaryUrl='https://corona.lmao.ninja/all'
         * @private
         */
        apiSummaryUrl: 'https://corona.lmao.ninja/all',
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
        this.loadSummaryData();
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
        // me.getReference('table').store.data = data;

        setTimeout(() => {
            console.log('addStoreItems', data);
            me.getReference('gallery').store.data = data;
        }, 2000);
    }

    /**
     *
     * @param {Object} data
     * @param {Number} data.cases
     * @param {Number} data.deaths
     * @param {Number} data.recovered
     */
    applySummaryData(data) {
        console.log('applySummaryData', data);
    }

    /**
     *
     * @param {String} name
     * @return {String} url
     */
    getCountryFlagUrl(name) {
        let imageName = name.toLowerCase();

        imageName = imageName.replace(MainContainerController.flagRegEx, '-');

        switch(imageName) {
            case 'car':
                imageName = 'central-african-republic';
                break;
            case 'channel-islands':
                imageName = 'jersey';
                break;
            case 'congo':
                imageName = 'democratic-republic-of-congo';
                break;
            case 'curaçao':
                imageName = 'curacao';
                break;
            case 'czechia':
                imageName = 'czech-republic';
                break;
            case 'diamond-princess':
                imageName = 'japan'; // cruise ship?
                break;
            case 'drc':
                imageName = 'democratic-republic-of-congo';
                break;
            case 'eswatini':
                imageName = 'swaziland';
                break;
            case 'faeroe-islands':
                imageName = 'faroe-islands';
                break;
            case 'french-guiana':
                imageName = 'france'; // ?
                break;
            case 'guadeloupe':
                imageName = 'france'; // ?
                break;
            case 'mayotte':
                imageName = 'france'; // ?
                break;
            case 'north-macedonia':
                imageName = 'republic-of-macedonia';
                break;
            case 'poland':
                imageName = 'republic-of-poland';
                break;
            case 'réunion':
                imageName = 'france';
                break;
            case 'saint-lucia':
                imageName = 'st-lucia';
                break;
            case 's.-korea':
                imageName = 'south-korea';
                break;
            case 'st.-barth':
                imageName = 'st-barts';
                break;
            case 'saint-martin':
                imageName = 'sint-maarten';
                break;
            case 'st.-vincent-grenadines':
                imageName = 'st-vincent-and-the-grenadines';
                break;
            case 'u.s.-virgin-islands':
                imageName = 'virgin-islands';
                break;
            case 'uae':
                imageName = 'united-arab-emirates';
                break;
            case 'uk':
                imageName = 'united-kingdom';
                break;
            case 'usa':
                imageName = 'united-states-of-america';
                break;
            case 'uzbekistan':
                imageName = 'uzbekistn';
                break;
        }

        return 'https://raw.githubusercontent.com/neomjs/pages/master/resources/images/flaticon/country_flags/png/' + imageName + '.png'
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

    /**
     *
     */
    loadSummaryData() {
        const me = this;

        fetch(me.proxyUrl + me.apiSummaryUrl)
            .then(response => response.json())
            .then(data => me.applySummaryData(data))
            .catch(err => console.log('Can’t access ' + me.apiSummaryUrl, err));
    }
}

Neo.applyClassConfig(MainContainerController);

export {MainContainerController as default};