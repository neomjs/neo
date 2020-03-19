import {default as ComponentController} from '../../../src/controller/Component.mjs';
import NeoArray                         from '../../../src/util/Array.mjs';

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
        apiSummaryUrl: 'https://corona.lmao.ninja/all',
        /**
         * @member {Object[]|null} data=null
         */
        data: null
    }}

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        const me = this;

        me.loadData();
        me.loadSummaryData();

        me.view.on('mounted', () => {
            Neo.main.DomAccess.addScript({
                async: true,
                defer: true,
                src  : 'https://buttons.github.io/buttons.js'
            });
        });
    }

    /**
     *
     * @param {Object[]} data
     */
    addStoreItems(data) {
        const me = this;

        me.data = data;

        me.getReference('country-field').store.data = data;

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
        let summaryTable = this.getReference('summary-table'),
            vdom         = summaryTable.vdom;

        vdom.cn[0].cn[1].html = data.cases;
        vdom.cn[1].cn[1].html = data.deaths;
        vdom.cn[2].cn[1].html = data.recovered;

        summaryTable.vdom = vdom;
    }

    /**
     *
     * @param {String} name
     * @return {String} url
     */
    getCountryFlagUrl(name) {
        const map = {
            'car'                   : 'central-african-republic',
            'channel-islands'       : 'jersey',
            'congo'                 : 'democratic-republic-of-congo',
            'curaçao'               : 'curacao',
            'czechia'               : 'czech-republic',
            'diamond-princess'      : 'japan', // cruise ship?
            'drc'                   : 'democratic-republic-of-congo',
            'el-salvador'           : 'salvador',
            'eswatini'              : 'swaziland',
            'faeroe-islands'        : 'faroe-islands',
            'french-guiana'         : 'france', // ?
            'guadeloupe'            : 'france', // ?
            'mayotte'               : 'france', // ?
            'new-caledonia'         : 'france',
            'north-macedonia'       : 'republic-of-macedonia',
            'poland'                : 'republic-of-poland',
            'réunion'               : 'france',
            'saint-lucia'           : 'st-lucia',
            's.-korea'              : 'south-korea',
            'st.-barth'             : 'st-barts',
            'saint-martin'          : 'sint-maarten',
            'st.-vincent-grenadines': 'st-vincent-and-the-grenadines',
            'u.s.-virgin-islands'   : 'virgin-islands',
            'uae'                   : 'united-arab-emirates',
            'uk'                    : 'united-kingdom',
            'usa'                   : 'united-states-of-america',
            'uzbekistan'            : 'uzbekistn'
        };

        let imageName = name.toLowerCase().replace(MainContainerController.flagRegEx, '-');

        imageName = map[imageName] || imageName;

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
            default:
                return 0;
        }
    }

    /**
     *
     * @param {Number} tabIndex
     * @return {Neo.component.Base}
     */
    getView(tabIndex) {
        let reference;

        switch(tabIndex) {
            case 0:
                reference = 'table';
                break;
            case 1:
                reference = 'gallery';
                break;
            case 2:
                reference = 'helix';
                break;
        }

        return this.getReference(reference);
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

    onCountryFieldSelect(data) {
        Neo.Main.editRoute({
            country: data.value
        });
    }

    /**
     *
     * @param {Object} value
     * @param {Object} oldValue
     * @param {String} hashString
     */
    onHashChange(value, oldValue, hashString) {
        let me             = this,
            activeIndex    = me.getTabIndex(value),
            countryField   = me.getReference('country-field'),
            tabContainer   = me.getReference('tab-container'),
            activeView     = me.getView(activeIndex),
            selectionModel = activeView.selectionModel,
            delaySelection = !me.data ? 1000 : tabContainer.activeIndex !== activeIndex ? 100 : 0,
            id;

        // console.log('onHashChange', value);

        tabContainer.activeIndex = activeIndex;
        me.activeMainTabIndex    = activeIndex;

        // todo: this will only load each store once. adjust the logic in case we want to support reloading the API

        if (me.data && activeView.store.getCount() < 1) {
            activeView.store.data = me.data;
            delaySelection = 500;
        }

        if (value.country) {
            setTimeout(() => {
                countryField.value = value.country;

                if (activeView.ntype === 'table-container') {
                    id = selectionModel.getRowId(activeView.store.indexOf(value.country));
                    selectionModel.select(id);

                    Neo.main.DomAccess.scrollToTableRow({id: id});
                } else if (activeView.ntype === 'helix') {
                    selectionModel.select(value.country, false);
                } else {
                    selectionModel.select(value.country, false);
                }
            }, delaySelection);
        }
    }

    /**
     * @param {Object} data
     */
    onReloadDataButtonClick(data) {
        const me = this;

        me.loadData();
        me.loadSummaryData();
    }

    /**
     * @param {Object} data
     */
    onSwitchThemeButtonClick(data) {
        let me     = this,
            button = data.component,
            view   = me.view,
            buttonText, cls, href, iconCls, theme;

        if (button.text === 'Theme Light') {
            buttonText = 'Theme Dark';
            href       = '../dist/development/neo-theme-light-no-css4.css';
            iconCls    = 'fa fa-moon';
            theme      = 'neo-theme-light';
        } else {
            buttonText = 'Theme Light';
            href       = '../dist/development/neo-theme-dark-no-css4.css';
            iconCls    = 'fa fa-sun';
            theme      = 'neo-theme-dark';
        }

        if (Neo.config.useCss4) {
            cls = [...view.cls];

            view.cls.forEach((item, index) => {
                if (item.includes('neo-theme')) {
                    NeoArray.remove(cls, item);
                }
            });

            NeoArray.add(cls, theme);
            view.cls = cls;

            button.set({
                iconCls: iconCls,
                text   : buttonText
            });
        } else {
            Neo.main.DomAccess.swapStyleSheet({
                href: href,
                id  : 'neo-theme'
            }).then(data => {
                button.text = buttonText;
            });
        }
    }
}

Neo.applyClassConfig(MainContainerController);

export {MainContainerController as default};