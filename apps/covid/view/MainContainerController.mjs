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
         * @member {String} ntype='maincontainer-controller'
         * @private
         */
        ntype: 'maincontainer-controller',
        /**
         * @member {Number} activeMainTabIndex=0
         */
        activeMainTabIndex: 0,
        /**
         * @member {String} apiUrl='https://corona.lmao.ninja/countries'
         */
        apiUrl: 'https://corona.lmao.ninja/countries',
        /**
         * @member {String} apiSummaryUrl='https://corona.lmao.ninja/all'
         */
        apiSummaryUrl: 'https://corona.lmao.ninja/all'
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

        switch(me.activeMainTabIndex) {
            case 0:
                me.getReference('table').store.data = data;
                break;
            case 1:
                me.getReference('gallery').store.data = data;
                break;
            case 2:
                me.getReference('helix').store.data = data;
                break;
        }
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
     * @param {Object} hashObject
     * @param {String} hashObject.mainview
     * @return {Number}
     */
    getTabIndex(hashObject) {
        if (!hashObject) {
            return 0;
        }

        switch(hashObject.mainview) {
            case 'gallery':
                return 1;
            case 'helix':
                return 2;
            case 'table':
                return 0;
        }
    }

    /**
     *
     */
    loadData() {
        const me = this;

        fetch(me.apiUrl)
            .then(response => response.json())
            .then(data => me.addStoreItems(data))
            .catch(err => console.log('Can’t access ' + me.apiUrl, err));
    }

    /**
     *
     */
    loadSummaryData() {
        const me = this;

        fetch(me.apiSummaryUrl)
            .then(response => response.json())
            .then(data => me.applySummaryData(data))
            .catch(err => console.log('Can’t access ' + me.apiSummaryUrl, err));
    }

    /**
     *
     * @param {Object} value
     * @param {Object} oldValue
     * @param {String} hashString
     */
    onHashChange(value, oldValue, hashString) {
        let me          = this,
            activeIndex = me.getTabIndex(value);

        console.log('onHashChange', value);

        me.getReference('tab-container').activeIndex = activeIndex;

        me.activeMainTabIndex = activeIndex;
    }
}

Neo.applyClassConfig(MainContainerController);

export {MainContainerController as default};