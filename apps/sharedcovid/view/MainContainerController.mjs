import ComponentController from '../../../src/controller/Component.mjs';
import NeoArray            from '../../../src/util/Array.mjs';
import Util                from '../Util.mjs';

/**
 * @class SharedCovid.view.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static config = {
        /**
         * @member {String} className='SharedCovid.view.MainContainerController'
         * @protected
         */
        className: 'SharedCovid.view.MainContainerController',
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
         * @member {String[]} connectedApps=[]
         */
        connectedApps: [],
        /**
         * @member {Object[]|null} data=null
         */
        data: null,
        /**
         * Internal flag to prevent non main windows from triggering their initial route as a change
         * @member {Boolean} firstHashChange=true
         */
        firstHashChange: true,
        /**
         * @member {String[]} mainTabs=['table', 'mapboxglmap', 'worldmap', 'gallery', 'helix', 'attribution']
         * @protected
         */
        mainTabs: ['table','mapboxglmap', 'worldmap', 'gallery', 'helix', 'attribution'],
        /**
         * @member {String[]} mainTabsListeners=[]
         * @protected
         */
        mainTabsListeners: [],
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
        worldMapHasData: false,
        /**
         * @member {Object} windowChart=null
         */
        windowChart: null,
    }

    /**
     * @param {Object[]} data
     */
    addStoreItems(data) {
        let me           = this,
            countryStore = me.getReference('country-field').store,
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
            me.getReference('country-field').store.data = data;
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
            vdom      = container.vdom;

        me.summaryData = data;

        vdom.cn[0].cn[1].html = Util.formatNumber({value: data.cases});
        vdom.cn[1].cn[1].html = Util.formatNumber({value: data.active});
        vdom.cn[2].cn[1].html = Util.formatNumber({value: data.recovered});
        vdom.cn[3].cn[1].html = Util.formatNumber({value: data.deaths});

        container.update();

        container = me.getReference('last-update');

        container.vdom.html = 'Last Update: ' + new Intl.DateTimeFormat('default', {
            hour  : 'numeric',
            minute: 'numeric',
            second: 'numeric'
        }).format(new Date(data.updated));

        container.update();
    }

    /**
     * @param {Object} record
     */
    clearCountryField(record) {
        this.getReference('country-field').clear();
    }

    /**
     * @param {String} containerReference
     * @param {String} url
     * @param {String} windowName
     */
    createPopupWindow(containerReference, url, windowName) {
        let me = this;

        Neo.Main.getWindowData().then(winData => {
            me.component.getDomRect(me.getReference(containerReference).id).then(data => {
                let {height, left, top, width} = data;

                height -= 50; // popup header in Chrome
                left   += winData.screenLeft;
                top    += (winData.outerHeight - winData.innerHeight + winData.screenTop);

                Neo.Main.windowOpen({
                    url           : `../sharedcovid/childapps/${url}/index.html`,
                    windowFeatures: `height=${height},left=${left},top=${top},width=${width}`,
                    windowName
                });
            });
        });
    }

    /**
     * @param {String} [appName]
     * @returns {Neo.component.Base}
     */
    getMainView(appName) {
        if (!appName || appName === 'Covid') {
            return this.component;
        }

        return Neo.apps[appName].mainView;
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

        setTimeout(() => {
            if (!me.summaryData) {
                me.onLoadSummaryDataFail();
            }
        }, 2000);
    }

    /**
     * @param {Object} data
     * @param {String} data.appName
     */
    onAppConnect(data) {
        let me   = this,
            name = data.appName,
            parentView, style, toolbar, view;

        console.log('onAppConnect', name);

        switch(name) {
            case 'SharedCovidChart':
                view       = me.getReference('controls-panel');
                parentView = view.parent;
                parentView.storeReferences();

                toolbar = me.getReference('controls-panel-header');
                style   = toolbar.style || {};
                style.display = 'none';
                toolbar.style = style;
                break;
            case 'SharedCovidGallery':
                view = me.getReference('gallery-container');
                NeoArray.remove(me.mainTabs, 'gallery');
                me.activeMainTabIndex--;
                Neo.Main.editRoute({mainview: me.mainTabs[me.activeMainTabIndex]});
                break;
            case 'SharedCovidHelix':
                view = me.getReference('helix-container');
                NeoArray.remove(me.mainTabs, 'helix');
                me.activeMainTabIndex--;
                Neo.Main.editRoute({mainview: me.mainTabs[me.activeMainTabIndex]});
                break;
            case 'SharedCovidMap':
                view = me.getReference('mapbox-gl-container');
                NeoArray.remove(me.mainTabs, 'mapboxglmap');
                me.activeMainTabIndex--;
                Neo.Main.editRoute({mainview: me.mainTabs[me.activeMainTabIndex]});
                break;
        }

        if (view) {
            NeoArray.add(me.connectedApps, name);

            parentView = parentView ? parentView : view.isTab ? view.up('tab-container') : Neo.getComponent(view.parentId);
            parentView.remove(view, false);

            Neo.apps[name].on('render', () => {
                setTimeout(() => {
                    me.getMainView(name).add(view);
                }, 100);
            });

        }
    }

    /**
     * @param {Object} data
     * @param {String} data.appName
     */
    onAppDisconnect(data) {
        let me         = this,
            name       = data.appName,
            parentView = me.getMainView(name),
            view       = parentView.items[0],
            index, style, toolbar;

        console.log('onAppDisconnect', name);

        switch (name) {
            case 'SharedCovid':
                Neo.Main.windowClose({
                    names: me.connectedApps,
                });
                break;
            case 'SharedCovidChart':
            case 'SharedCovidGallery':
            case 'SharedCovidHelix':
            case 'SharedCovidMap':
                view = parentView.items[0];
                break;
        }

        if (view) {
            NeoArray.remove(me.connectedApps, name);

            parentView.remove(view, false);

            switch (name) {
                case 'SharedCovidChart':
                    toolbar = me.getReference('controls-panel-header');
                    style   = toolbar.style || {};
                    style.display = null;
                    toolbar.style = style;

                    me.getReference('table-container').add(view);
                    break;
                case 'SharedCovidGallery':
                    index = me.connectedApps.includes('SharedCovidMap') ? 2 : 3;
                    me.getReference('tab-container').insert(index, view);
                    me.mainTabs.splice(index, 0, 'gallery');
                    break;
                case 'SharedCovidHelix':
                    index = 4;
                    index = me.connectedApps.includes('SharedCovidGallery') ? index - 1 : index;
                    index = me.connectedApps.includes('SharedCovidMap')     ? index - 1 : index;
                    me.getReference('tab-container').insert(index, view);
                    me.mainTabs.splice(index, 0, 'helix');
                    break;
                case 'SharedCovidMap':
                    me.getReference('tab-container').insert(1, view);
                    me.mainTabs.splice(1, 0, 'mapboxglmap');
                    break;
            }

            Neo.apps[name].destroy();
        }
    }

    /**
     *
     */
    onComponentConstructed() {
        super.onComponentConstructed();

        !Neo.config.hash && this.onHashChange({
            country   : 'all',
            hash      : {mainview: 'table'},
            hashString: 'mainview=table'
        }, null);
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.loadData();
        me.loadSummaryData();

        Neo.currentWorker.on({
            connect   : me.onAppConnect,
            disconnect: me.onAppDisconnect,
            scope     : me
        });

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
            if (Neo.isObject(value)) {
                record = value;
                value  = value[component.displayField];
            } else {
                record = value && store.find('country', value)?.[0];
            }

            this.getModel().setData({
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
        let me           = this,
            activeIndex  = me.getTabIndex(value.hash),
            activeView   = me.getView(activeIndex),
            country      = value.hash?.country,
            tabContainer = me.getReference('tab-container'),
            countryRecord, ntype;

        if (me.firstHashChange || value.appNames) {
            tabContainer.activeIndex = activeIndex;
            me.activeMainTabIndex    = activeIndex;

            if (!activeView) {
                setTimeout(() => {
                    me.onHashChange(value, oldValue);
                }, 10);

                return;
            }

            me.getModel().setData({
                country: country || null
            });

            // todo: this will only load each store once. adjust the logic in case we want to support reloading the API
            if (me.data && activeView.store?.getCount() < 1) {
                activeView.store.data = me.data;
            }

            ntype = activeView.ntype;

            if ((ntype === 'mapboxgl' || me.connectedApps.includes('SharedCovidMap')) && me.data) {
                if (!me.mapBoxView) {
                    me.mapBoxView = me.getReference('mapboxglmap');
                }

                if (me.mapboxStyle) {
                    me.mapBoxView.mapboxStyle = me.mapBoxView[me.mapboxStyle];
                    delete me.mapboxStyle;
                }

                if (!me.mapboxglMapHasData) {
                    me.mapBoxView.chartData = me.data;
                    me.mapboxglMapHasData = true;
                }

                countryRecord = me.getModel().data.countryRecord;
                countryRecord && MainContainerController.selectMapboxGlCountry(me.mapBoxView, countryRecord);

                me.mapBoxView.autoResize();
            } else if (ntype === 'covid-world-map' && me.data) {
                if (!me.worldMapHasData) {
                    activeView.loadData(me.data);
                    me.worldMapHasData = true;
                }
            }
        }

        me.firstHashChange = false;
    }

    /**
     *
     */
    onLoadSummaryDataFail() {
        const table = this.getReference('table');

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
            logoPath   = 'https://raw.githubusercontent.com/neomjs/pages/main/resources/images/apps/covid/',
            themeLight = button.text === 'Theme Light',
            buttonText, cls, href, iconCls, mapView, mapViewStyle, theme;

        if (me.connectedApps.includes('SharedCovidMap')) {
            mapView = me.getMainView('SharedCovidMap').items[0].items[0];
        } else {
            mapView = me.getReference('mapboxglmap');
        }

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

        [component.appName, ...me.connectedApps].forEach(appName => {
            component = me.getMainView(appName);

            cls = [...component.cls];

            component.cls.forEach(item => {
                if (item.includes('neo-theme')) {
                    NeoArray.remove(cls, item)
                }
            });

            NeoArray.add(cls, theme);
            component.cls = cls;
        });

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
     * @param {Object} data
     */
    onWindowChartMaximizeButtonClick(data) {
        this.createPopupWindow('controls-panel', 'sharedcovidchart', 'SharedCovidChart');
    }

    /**
     * @param {Object} data
     */
    onWindowGalleryMaximizeButtonClick(data) {
        this.createPopupWindow('gallery-container', 'sharedcovidgallery', 'SharedCovidGallery');
    }

    /**
     * @param {Object} data
     */
    onWindowHelixMaximizeButtonClick(data) {
        this.createPopupWindow('helix-container', 'sharedcovidhelix', 'SharedCovidHelix');
    }

    /**
     * @param {Object} data
     */
    onWindowMapMaximizeButtonClick(data) {
        this.createPopupWindow('mapbox-gl-container', 'sharedcovidmap', 'SharedCovidMap');
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

        view.zoom = 5; // todo: we could use a different value for big countries (Russia, USA,...)
    }

    /**
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

export default MainContainerController;
