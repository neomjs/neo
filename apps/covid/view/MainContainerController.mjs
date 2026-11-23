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
         * @member {String} apiSummaryUrl='https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/data/cvid_static/all.json'
         */
        apiFallbackSummaryUrl: 'https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/data/cvid_static/all.json',
        /**
         * @member {String} apiUrl='https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/data/cvid_static_countries.json'
         */
        apiFallbackUrl: 'https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/data/cvid_static_countries.json',
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
                item.country = item.country.replace(/"/g, "\'");
            }

            item.casesPerOneMillion = item.casesPerOneMillion > item.cases ? 'N/A' : item.casesPerOneMillion || 0;
            item.infected           = item.casesPerOneMillion
        });

        me.data = data;

        if (countryStore.getCount() < 1) {
            countryStore.data = data;

            me.onCountryFieldChange({
                component: countryField,
                value    : countryField.value
            })
        }

        if (['gallery', 'helix', 'table'].includes(reference)) {
            if (activeTab) {
                activeTab.store.data = data
            }
        }

        else if (reference === 'mapboxglmap') {
            if (activeTab) {
                activeTab.chartData   = data;
                me.mapboxglMapHasData = true
            }
        }

        else if (reference === 'worldmap') {
            if (activeTab) {
                activeTab.loadData(data);
                me.worldMapHasData = true
            }
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

        container.items[0].vdom.cn[1].text = Util.formatNumber({value: data.cases});
        container.items[1].vdom.cn[1].text = Util.formatNumber({value: data.active});
        container.items[2].vdom.cn[1].text = Util.formatNumber({value: data.recovered});
        container.items[3].vdom.cn[1].text = Util.formatNumber({value: data.deaths});

        container.updateDepth = 2;
        container.update();

        container = me.getReference('last-update');
        vdom      = container.vdom;

        vdom.text = 'Last Update: ' + new Intl.DateTimeFormat('default', {
            hour  : 'numeric',
            minute: 'numeric',
            second: 'numeric'
        }).format(new Date(data.updated));

        container.update()
    }

    /**
     * @param {Object} hashObject
     * @param {String} hashObject.mainview
     * @returns {Number}
     */
    getTabIndex(hashObject) {
        if (!hashObject || !hashObject.mainview) {
            return 0
        }

        return this.mainTabs.indexOf(hashObject.mainview)
    }

    /**
     * @param {Number} tabIndex
     * @returns {Neo.component.Base}
     */
    getView(tabIndex) {
        return this.getReference(this.mainTabs[tabIndex])
    }

    /**
     *
     */
    loadData() {
        let me     = this,
            apiUrl = Neo.config.useFallbackApi ? me.apiFallbackUrl : me.apiUrl;

        fetch(apiUrl)
            .then(response => response.json())
            .catch(err => console.log('Can’t access ' + apiUrl, err))
            .then(data => me.addStoreItems(data));
    }

    /**
     *
     */
    loadSummaryData() {
        let me            = this,
            apiSummaryUrl = Neo.config.useFallbackApi ? me.apiFallbackSummaryUrl : me.apiSummaryUrl;

        fetch(apiSummaryUrl)
            .then(response => response.json())
            .catch(err => console.log('Can’t access ' + apiSummaryUrl, err))
            .then(data => me.applySummaryData(data));

        me.timeout(2000).then(() => {
            if (!me.summaryData) {
                me.onLoadSummaryDataFail()
            }
        })
    }

    /**
     * @summary Initializes the default route and syncs theme-dependent chrome with the resolved start theme.
     */
    onComponentConstructed() {
        super.onComponentConstructed();

        let me = this;

        me.observeConfig(me.component, 'theme', () => me.syncThemeChrome());
        me.syncThemeChrome();

        if (!Neo.config.hash) {
            me.onHashChange({
                country   : 'all',
                hash      : {mainview: 'table'},
                hashString: 'mainview=table'
            }, null)
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

        me.component.on('mounted', me.onMainViewMounted, me)
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
                value  = value[component.displayField]
            } else {
                record = value && store.find('country', value)?.[0]
            }

            this.setState({
                country      : value,
                countryRecord: record || null
            })
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

        if (ntype === 'mapboxgl' && me.mapboxStyle) {
            activeView.mapboxStyle = activeView[me.mapboxStyle];
            delete me.mapboxStyle
        }

        if (ntype === 'mapboxgl' && me.data) {
            if (!me.mapboxglMapHasData) {
                activeView.chartData = me.data;
                me.mapboxglMapHasData = true
            }

            countryRecord = me.getStateProvider().data.countryRecord;
            countryRecord && MainContainerController.selectMapboxGlCountry(activeView, countryRecord);

            activeView.autoResize()
        } else if (ntype === 'covid-world-map' && me.data) {
            if (!me.worldMapHasData) {
                activeView.loadData(me.data);
                me.worldMapHasData = true
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

        table.update()
    }

    /**
     *
     */
    onMainViewMounted() {
        let me = this;

        Neo.main.DomAccess.addScript({
            async   : true,
            defer   : true,
            src     : 'https://buttons.github.io/buttons.js',
            windowId: me.windowId
        });

        me.getReference('tab-container').on('moveTo', me.onTabMove, me)
    }

    /**
     * @param {Object} data
     */
    onReloadDataButtonClick(data) {
        this.loadData();
        this.loadSummaryData()
    }

    /**
     * @param {Object} data
     */
    onRemoveFooterButtonClick(data) {
        let me        = this,
            activeTab = me.getReference('tab-container').getActiveCard();

        me.component.remove(me.getReference('footer'), true);

        if (activeTab.ntype === 'covid-mapboxgl-container') {
            me.getReference('mapboxglmap').autoResize()
        }
    }

    /**
     * @summary Switches the root viewport between `neo-theme-dark` and `neo-theme-light`.
     */
    onSwitchThemeButtonClick() {
        let {component} = this;

        component.theme = component.getTheme() === 'neo-theme-light' ? 'neo-theme-dark' : 'neo-theme-light'
    }

    /**
     * @summary Aligns the header logo, toggle button, and Mapbox style with the viewport's current theme.
     */
    syncThemeChrome() {
        let me       = this,
            button   = me.getReference('theme-button'),
            isLight  = me.component.getTheme() === 'neo-theme-light',
            logo     = me.getReference('logo'),
            logoPath = 'https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/images/apps/covid/',
            mapView  = me.getReference('mapboxglmap');

        if (logo) {
            logo.vdom.src = logoPath + (isLight ? 'covid_logo_light.jpg' : 'covid_logo_dark.jpg');
            logo.update()
        }

        button?.set({
            iconCls: isLight ? 'fa fa-moon' : 'fa fa-sun',
            text   : isLight ? 'Theme Dark' : 'Theme Light'
        });

        if (mapView) {
            mapView.mapboxStyle = isLight ? mapView.mapboxStyleLight : mapView.mapboxStyleDark
        } else {
            me.mapboxStyle = isLight ? 'mapboxStyleLight' : 'mapboxStyleDark'
        }
    }

    /**
     * @param {Object} data
     */
    onTabMove(data) {
        NeoArray.move(this.mainTabs, data.fromIndex, data.toIndex)
    }

    /**
     * @param view
     * @param record
     */
    static selectMapboxGlCountry(view, record) {
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

        view.zoom = 5 // todo: we could use a different value for big countries (Russia, USA,...)
    }
}

export default Neo.setupClass(MainContainerController);
