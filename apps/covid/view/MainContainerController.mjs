import {default as ComponentController} from '../../../src/controller/Component.mjs';
import NeoArray                         from '../../../src/util/Array.mjs';
import Util                             from '../Util.mjs';

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
        data: null,
        /**
         * @member {String[]} mainTabs=['table', 'gallery', 'helix']
         * @private
         */
        mainTabs: ['table', 'gallery', 'helix'],
        /**
         * @member {Object} summaryData=null
         */
        summaryData: null,
    }}

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        const me = this;

        me.loadData();
        me.loadSummaryData();

        me.view.on('mounted', me.onMainViewMounted, me);
    }

    /**
     *
     * @param {Object[]} data
     */
    addStoreItems(data) {
        const me = this;

        me.data = data;

        me.getReference('country-field').store.data = data;

        me.getReference(me.mainTabs[me.activeMainTabIndex]).store.data = data;
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

        this.summaryData = data;

        vdom.cn[0].cn[1].html = Util.formatNumber(data.cases);
        vdom.cn[1].cn[1].html = Util.formatNumber(data.recovered, 'green');
        vdom.cn[2].cn[1].html = Util.formatNumber(data.deaths,    'red');

        summaryTable.vdom = vdom;
    }

    /**
     *
     * @param {String} name
     * @return {String} url
     */
    getCountryFlagUrl(name) {
        const map = {
            'bosnia'                                    : 'bosnia-and-herzegovina',
            'cabo-verde'                                : 'cape-verde',
            'car'                                       : 'central-african-republic',
            'channel-islands'                           : 'jersey',
            'coast-d\'ivoire'                           : 'ivory-coast',
            'congo'                                     : 'republic-of-the-congo',
            'congo,-the-democratic-republic-of-the'     : 'democratic-republic-of-congo',
            'curaçao'                                   : 'curacao',
            'czechia'                                   : 'czech-republic',
            'diamond-princess'                          : 'japan', // cruise ship?
            'drc'                                       : 'democratic-republic-of-congo',
            'el-salvador'                               : 'salvador',
            'eswatini'                                  : 'swaziland',
            'faeroe-islands'                            : 'faroe-islands',
            'french-guiana'                             : 'france', // ?
            'guadeloupe'                                : 'france', // ?
            'holy-see-(vatican-city-state)'             : 'vatican-city',
            'iran,-islamic-republic-of'                 : 'iran',
            'lao-people\'s-democratic-republic'         : 'laos',
            'libyan-arab-jamahiriya'                    : 'libya',
            'macedonia,-the-former-yugoslav-republic-of': 'republic-of-macedonia',
            'mayotte'                                   : 'france', // ?
            'moldova,-republic-of'                      : 'moldova',
            'new-caledonia'                             : 'france',
            'palestinian-territory,-occupied'           : 'palestine',
            'poland'                                    : 'republic-of-poland',
            'réunion'                                   : 'france',
            's.-korea'                                  : 'south-korea',
            'st.-barth'                                 : 'st-barts',
            'saint-lucia'                               : 'st-lucia',
            'saint-martin'                              : 'sint-maarten',
            'saint-vincent-and-the-grenadines'          : 'st-vincent-and-the-grenadines',
            'syrian-arab-republic'                      : 'syria',
            'tanzania,-united-republic-of'              : 'tanzania',
            'timor-leste'                               : 'east-timor',
            'turks-and-caicos-islands'                  : 'turks-and-caicos',
            'u.s.-virgin-islands'                       : 'virgin-islands',
            'uae'                                       : 'united-arab-emirates',
            'uk'                                        : 'united-kingdom',
            'usa'                                       : 'united-states-of-america',
            'uzbekistan'                                : 'uzbekistn',
            'venezuela,-bolivarian-republic-of'         : 'venezuela',
            'viet-nam'                                  : 'vietnam'
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
        if (!hashObject || !hashObject.mainview) {
            return 0;
        }

        return this.mainTabs.indexOf(hashObject.mainview);
    }

    /**
     *
     * @param {Number} tabIndex
     * @return {Neo.component.Base}
     */
    getView(tabIndex) {
        return this.getReference(this.mainTabs[tabIndex]);
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

        setTimeout(() => {
            if (!me.summaryData) {
                const table = me.getReference('table'),
                      vdom = table.vdom;

                vdom.cn[0].cn[1].cn.push({
                    tag  : 'div',
                    cls  : ['neo-box-label', 'neo-label'],
                    html : [
                        'Summary data did not arrive after 2s.</br>',
                        'Please double-check if the API is offline:</br></br>',
                        '<a target="_blank" href="https://corona.lmao.ninja/all">NovelCOVID/API all endpoint</a></br></br>',
                        'and if so try again later please.'
                    ].join(''),
                    style: {
                        margin: '20px'
                    }
                });

                table.vdom = vdom;
            }
        }, 2000);
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

        tabContainer.activeIndex = activeIndex;
        me.activeMainTabIndex    = activeIndex;

        if (activeIndex === 2) {
            activeView.getOffsetValues();
        }

        // todo: this will only load each store once. adjust the logic in case we want to support reloading the API

        if (me.data && activeView.store.getCount() < 1) {
            activeView.store.data = me.data;
            delaySelection = 500;
        }

        if (value.country) {
            // todo: instead of a timeout this should add a store load listener (single: true)
            setTimeout(() => {
                if (me.data) {
                    countryField.value = value.country;

                    if (activeView.ntype === 'table-container') {
                        id = selectionModel.getRowId(activeView.store.indexOf(value.country));

                        me.getReference('table-container').fire('countrySelect', {record: activeView.store.get(value.country)});

                        if (!selectionModel.isSelected(id)) {
                            selectionModel.select(id);
                            Neo.main.DomAccess.scrollToTableRow({id: id});
                        }
                    } else if (activeView.ntype === 'helix') {
                        if (!selectionModel.isSelected(value.country)) {
                            selectionModel.select(value.country, false);
                            activeView.onKeyDownSpace(null);
                        }
                    } else {
                        if (!selectionModel.isSelected(value.country)) {
                            selectionModel.select(value.country, false);
                        }
                    }
                }
            }, delaySelection);
        }
    }

    /**
     *
     */
    onMainViewMounted() {
        const me = this;

        Neo.main.DomAccess.addScript({
            async: true,
            defer: true,
            src  : 'https://buttons.github.io/buttons.js'
        });

        me.getReference('gallery').on('select', me.updateCountryField, me);
        me.getReference('helix')  .on('select', me.updateCountryField, me);
        me.getReference('table')  .on('select', me.updateCountryField, me);
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
    onRemoveFooterButtonClick(data) {
        this.view.remove(this.getReference('footer'), true);
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

    /**
     *
     * @param {Object} data
     * @param {Object} data.record
     */
    updateCountryField(data) {
        Neo.Main.editRoute({
            country: data.record.country
        });
    }
}

Neo.applyClassConfig(MainContainerController);

export {MainContainerController as default};