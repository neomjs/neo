import ComponentController from '../../../src/controller/Component.mjs';
import NeoArray            from '../../../src/util/Array.mjs';
import Util                from '../Util.mjs';

/**
 * @class Covid.view.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static config = {
        /**
         * @member {String} className='Covid.view.MainContainerController'
         * @protected
         */
        className: 'Covid.view.MainContainerController',
        /**
         * @member {String} ntype='maincontainer-controller'
         * @protected
         */
        ntype: 'maincontainer-controller',
        /**
         * @member {Number} activeMainTabIndex=0
         */
        activeMainTabIndex: 0,
        /**
         * @member {String} apiSummaryUrl='https://disease.sh/v3/covid-19/all'
         */
        apiSummaryUrl: 'https://disease.sh/v3/covid-19/all',
        /**
         * @member {String} apiUrl='https://disease.sh/v3/covid-19/countries'
         */
        apiUrl: 'https://disease.sh/v3/covid-19/countries',
        /**
         * @member {Object|null} countryRecord=null
         */
        countryRecord: null,
        /**
         * @member {Object[]|null} data=null
         */
        data: null,
        /**
         * @member {String[]} mainTabs=['table', 'mapboxglmap', 'worldmap', 'gallery', 'helix', 'attribution']
         * @protected
         */
        mainTabs: ['table', 'mapboxglmap', 'worldmap', 'gallery', 'helix', 'attribution'],
        /**
         * Flag to only load the map once onHashChange, but always on reload button click
         * @member {Boolean} mapboxglMapHasData=false
         * @protected
         */
        mapboxglMapHasData: false,
        /**
         * @member {Object} summaryData=null
         */
        summaryData: null,
        /**
         * Flag to only load the map once onHashChange, but always on reload button click
         * @member {Boolean} worldMapHasData=false
         * @protected
         */
        worldMapHasData: false
    }

    /**
     * @param {Object[]} data
     */
    addStoreItems(data) {
        let me           = this,
            countryField = me.getReference('country-field'),
            countryStore = countryField.store,
            reference    = me.mainTabs[me.activeMainTabIndex],
            activeTab    = me.getReference(reference);

        data.forEach(item => {
            if (item.country.includes('"')) {
                item.country = item.country.replace('"', "\'");
            }

            item.casesPerOneMillion = item.casesPerOneMillion > item.cases ? 'N/A' : item.casesPerOneMillion || 0;
            item.infected           = item.casesPerOneMillion;
        });

        me.data = data;

        if (countryStore.getCount() < 1) {
            countryStore.data = data;

            me.onCountryFieldChange({
                component: countryField,
                value    : countryField.value
            });
        }

        if (['gallery', 'helix', 'table'].includes(reference)) {
            if (activeTab) {
                activeTab.store.data = data;
            }
        }

        else if (reference === 'mapboxglmap') {
            me.getReference('mapboxglmap').chartData = data;
            me.mapboxglMapHasData = true;
        }

        else if (reference === 'worldmap') {
            activeTab.loadData(data);
            me.worldMapHasData = true;
        }
    }

    /**
     * @param {Object} data
     * @param {Number} data.active
     * @param {Number} data.cases
     * @param {Number} data.deaths
     * @param {Number} data.recovered
     * @param {Number} data.updated // timestamp
     */
    applySummaryData(data) {
        let me        = this,
            container = me.getReference('total-stats'),
            vdom;

        me.summaryData = data;

        container.items[0].vdom.cn[1].html = Util.formatNumber({value: data.cases});     container.items[0].update();
        container.items[1].vdom.cn[1].html = Util.formatNumber({value: data.active});    container.items[1].update();
        container.items[2].vdom.cn[1].html = Util.formatNumber({value: data.recovered}); container.items[2].update();
        container.items[3].vdom.cn[1].html = Util.formatNumber({value: data.deaths});    container.items[3].update();

        container = me.getReference('last-update');
        vdom      = container.vdom;

        vdom.html = 'Last Update: ' + new Intl.DateTimeFormat('default', {
            hour  : 'numeric',
            minute: 'numeric',
            second: 'numeric'
        }).format(new Date(data.updated));

        container.update();
    }

    /**
     * @param {Object} hashObject
     * @param {String} hashObject.mainview
     * @returns {Number}
     */
    getTabIndex(hashObject) {
        if (!hashObject || !hashObject.mainview) {
            return 0;
        }

        return this.mainTabs.indexOf(hashObject.mainview);
    }

    /**
     * @param {Number} tabIndex
     * @returns {Neo.component.Base}
     */
    getView(tabIndex) {
        return this.getReference(this.mainTabs[tabIndex]);
    }

    /**
     *
     */
    loadData() {
        let me = this;

        fetch(me.apiUrl)
            .then(response => response.json())
            .catch(err => console.log('Can’t access ' + me.apiUrl, err))
            .then(data => me.addStoreItems(data));
    }

    /**
     *
     */
    loadSummaryData() {
        let me = this;

        fetch(me.apiSummaryUrl)
            .then(response => response.json())
            .catch(err => console.log('Can’t access ' + me.apiSummaryUrl, err))
            .then(data => me.applySummaryData(data));

        me.timeout(2000).then(() => {
            if (!me.summaryData) {
                me.onLoadSummaryDataFail()
            }
        })
    }

    /**
     *
     */
    onComponentConstructed() {
        super.onComponentConstructed();

        if (!Neo.config.hash) {
            this.onHashChange({
                country   : 'all',
                hash      : {mainview: 'table'},
                hashString: 'mainview=table'
            }, null);
        }
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.loadData();
        me.loadSummaryData();

        me.component.on('mounted', me.onMainViewMounted, me);
    }

    /**
     * @param {Object} data
     */
    onCountryFieldChange(data) {
        let component  = data.component,
            store      = component.store,
            value      = data.value,
            record;

        if (store.getCount() > 0) {
            if (Neo.isRecord(value)) {
                record = value;
                value  = value[component.displayField];
            } else {
                record = value && store.find('country', value)?.[0];
            }

            this.setState({
                country      : value,
                countryRecord: record || null
            });
        }
    }

    /**
     * @param {Object} value
     * @param {Object} oldValue
     */
    onHashChange(value, oldValue) {
        let me          = this,
            activeIndex = me.getTabIndex(value.hash),
            activeView  = me.getView(activeIndex),
            country     = value.hash?.country,
            countryRecord, ntype;

        me.getReference('tab-container').activeIndex = activeIndex;
        me.activeMainTabIndex = activeIndex;

        if (!activeView) {
            me.timeout(10).then(() => {
                me.onHashChange(value, oldValue);
            });

            return
        }

        me.setState({
            country: country || null
        });

        ntype = activeView.ntype;

        // todo: this will only load each store once. adjust the logic in case we want to support reloading the API
        if (me.data && activeView.store?.getCount() < 1) {
            activeView.store.data = me.data;
        }

        if (ntype === 'mapboxgl' && me.data) {
            if (me.mapboxStyle) {
                activeView.mapboxStyle = activeView[me.mapboxStyle];
                delete me.mapboxStyle;
            }

            if (!me.mapboxglMapHasData) {
                activeView.chartData = me.data;
                me.mapboxglMapHasData = true;
            }

            countryRecord = me.getStateProvider().data.countryRecord;
            countryRecord && MainContainerController.selectMapboxGlCountry(activeView, countryRecord);

            activeView.autoResize();
        } else if (ntype === 'covid-world-map' && me.data) {
            if (!me.worldMapHasData) {
                activeView.loadData(me.data);
                me.worldMapHasData = true;
            }
        }
    }

    /**
     *
     */
    onLoadSummaryDataFail() {
        let table = this.getReference('table');

        table.vdom.cn[0].cn[1].cn.push({
            cls  : ['neo-box-label', 'neo-label'],
            style: {margin: '20px'},

            html: [
                'Summary data did not arrive after 2s.</br>',
                'Please double-check if the API is offline:</br></br>',
                '<a target="_blank" href="https://disease.sh/all">NovelCOVID/API all endpoint</a></br></br>',
                'and if so please try again later.'
            ].join('')
        });

        table.update();
    }

    /**
     *
     */
    onMainViewMounted() {
        let me = this;

        Neo.main.DomAccess.addScript({
            async: true,
            defer: true,
            src  : 'https://buttons.github.io/buttons.js'
        });

        me.getReference('tab-container').on('moveTo', me.onTabMove, me);
    }

    /**
     * @param {Object} data
     */
    onReloadDataButtonClick(data) {
        this.loadData();
        this.loadSummaryData();
    }

    /**
     * @param {Object} data
     */
    onRemoveFooterButtonClick(data) {
        let me        = this,
            activeTab = me.getReference('tab-container').getActiveCard();

        me.component.remove(me.getReference('footer'), true);

        if (activeTab.ntype === 'covid-mapboxgl-container') {
            me.getReference('mapboxglmap').autoResize();
        }
    }

    /**
     * @param {Object} data
     */
    onSwitchThemeButtonClick(data) {
        let me         = this,
            button     = data.component,
            component  = me.component,
            logo       = me.getReference('logo'),
            logoPath   = 'https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/images/apps/covid/',
            mapView    = me.getReference('mapboxglmap'),
            themeLight = button.text === 'Theme Light',
            buttonText, cls, href, iconCls, mapViewStyle, theme;

        if (themeLight) {
            buttonText   = 'Theme Dark';
            href         = '../dist/development/neo-theme-light-no-css-vars.css';
            iconCls      = 'fa fa-moon';
            mapViewStyle = mapView?.mapboxStyleLight;
            theme        = 'neo-theme-light';
        } else {
            buttonText   = 'Theme Light';
            href         = '../dist/development/neo-theme-dark-no-css-vars.css';
            iconCls      = 'fa fa-sun';
            mapViewStyle = mapView?.mapboxStyleDark;
            theme        = 'neo-theme-dark';
        }

        logo.vdom.src = logoPath + (theme === 'neo-theme-dark' ? 'covid_logo_dark.jpg' : 'covid_logo_light.jpg');
        logo.update();

        cls = [...component.cls];

        component.cls.forEach(item => {
            if (item.includes('neo-theme')) {
                NeoArray.remove(cls, item);
            }
        });

        NeoArray.add(cls, theme);
        component.cls = cls;

        button.set({iconCls, text: buttonText});

        if (mapView) {
            mapView.mapboxStyle = mapViewStyle;
        } else {
            me.mapboxStyle = themeLight ? 'mapboxStyleLight' : 'mapboxStyleDark';
        }
    }

    /**
     * @param {Object} data
     */
    onTabMove(data) {
        NeoArray.move(this.mainTabs, data.fromIndex, data.toIndex);
    }

    /**
     * @param view
     * @param record
     */
    static selectMapboxGlCountry(view, record) {console.log(record.countryInfo.iso2);
        // https://github.com/neomjs/neo/issues/490
        // there are missing iso2&3 values on natural earth vector
        const map = {
            FRA    : ['match', ['get', 'NAME'], ['France'], true, false],
            NOR    : ['match', ['get', 'NAME'], ['Norway'], true, false],
            default: ['match', ['get', 'ISO_A3'], [record.countryInfo.iso3], true, false]
        };

        view.setFilter({
            layerId: 'ne-10m-admin-0-countries-4s7rvf',
            value  : map[record.countryInfo.iso3] || map['default']
        });

        view.flyTo({
            lat: record.countryInfo.lat,
            lng: record.countryInfo.long
        });

        view.zoom = 5; // todo: we could use a different value for big countries (Russia, USA,...)
    }
}

export default Neo.setupClass(MainContainerController);
