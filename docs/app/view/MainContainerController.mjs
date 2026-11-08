import Component from '../../../src/controller/Component.mjs';

/**
 * @class Docs.view.MainContainerController
 * @extends Neo.controller.Component
 * @summary Controller for the Docs app MainContainer handling navigation, theme switching, and tab creation with full-path header tooltips.
 */
class MainContainerController extends Component {
    static config = {
        /**
         * @member {String} className='Docs.view.MainContainerController'
         * @protected
         */
        className: 'Docs.view.MainContainerController',
        /**
         * @member {String} ntype='docs-maincontainer-controller'
         * @protected
         */
        ntype: 'docs-maincontainer-controller',
        /**
         * @member {Object} routes
         * @protected
         */
        routes: {
            '/viewClass/{className}'                   : 'onViewClassRoute',
            '/viewSource/{className}'                  : 'onViewSourceRoute',
            '/viewSource/{className}/line/{lineNumber}': 'onViewSourceRoute'
        }
    }

    /**
     * @summary Syncs the initial theme and source-view theme button state and HighlightJS stylesheet to the active theme, hiding the Docs theme button when embedded in the Portal.
     */
    onComponentConstructed() {
        super.onComponentConstructed();

        let me                    = this,
            isPortal              = me.component.appName === 'Portal',
            isDark                = Boolean(me.component.getTheme()?.includes('dark')),
            libPath               = Neo.config.basePath + 'resources/lib/',
            sourceViewThemeButton = me.getReference('source-view-theme-button'),
            themeButton           = me.getReference('theme-button'),
            opts                  = {
                themePath: libPath + (isDark ? 'highlightjs-custom-dark-theme.css' : 'highlightjs-custom-github-theme.css'),
                windowId : me.windowId
            };

        if (themeButton) {
            if (isPortal) {
                themeButton.hidden = true
            } else {
                themeButton.text = isDark ? 'Theme Light' : 'Theme Dark'
            }
        }

        if (sourceViewThemeButton) {
            sourceViewThemeButton.text = isDark ? 'Source View Theme Light' : 'Source View Theme Dark'
        }

        Neo.main.addon.HighlightJS.loadFiles(opts)
    }

    /**
     * @summary Runs a route handler again once the structure index has loaded, because a deep link fires before it does.
     * @param {Function} handler
     * @param {Object} data
     * @returns {Boolean} true when the route waits for the load
     */
    deferUntilStructureLoaded(handler, data) {
        let me    = this,
            store = me.getStateProvider().getStore('structure');

        if (store.isLoaded) {
            return false
        }

        store.on('load', () => handler.call(me, data), me, {once: true});

        return true
    }

    /**
     * @summary Opens or focuses the clicked class tree leaf's tab. Where the Docs app owns the hash, the click also moves
     * the URL to the class route, so a reload restores the tab. The tab opens directly, so reopening a closed tab whose
     * route is still the URL works too.
     * @param {Object} record
     */
    onApiListLeafClick(record) {
        let me = this;

        me.openClassTab(record);
        me.ownsRoutes() && Neo.Main.setRoute({value: `/viewClass/${record.className}`, windowId: me.windowId})
    }

    /**
     * @summary Opens or focuses the API documentation tab of a class record, setting the full className as the tab
     * header tooltip. Where the Docs app owns the hash, the header carries the class route.
     * @param {Object} record
     */
    openClassTab(record) {
        let me = this;

        me.getReference('content-tabcontainer').add({
            ntype        : 'classdetails-maincontainer',
            id           : record.className,
            structureData: record,

            header: {
                iconCls: record.singleton ? 'fa fa-arrow-alt-circle-right' : 'fa fa-copyright',
                route  : me.ownsRoutes() ? `/viewClass/${record.className}` : null,
                text   : record.name,
                tooltip: record.className
            }
        })
    }

    /**
     * @summary The standalone Docs app owns the URL hash. Inside the Portal the Portal's router does, and a route it
     * does not own leaves a reload without the docs view, so the Docs app sets no route there.
     * @returns {Boolean}
     */
    ownsRoutes() {
        return this.component.appName !== 'Portal'
    }

    /**
     * @summary Opens or focuses the example tab for a clicked examples tree leaf, setting the dot-joined example path as the tab header tooltip.
     * @param {Object} record
     */
    onExamplesListLeafClick(record) {
        let me                  = this,
            contentTabContainer = me.getReference('content-tabcontainer'),
            name                = record.name,
            pathArray           = [],
            store               = me.getReference('examples-treelist').store,
            tmpRecord           = record,
            header;

        while (tmpRecord.parentId !== null) {
            tmpRecord = store.get(tmpRecord.parentId);
            name      = tmpRecord.name + '.' + name
        }

        header = {
            iconCls: 'fa fa-desktop',
            text   : record.name,
            tooltip: name
        };

        name = 'examples_' + name;

        if (!Array.isArray(record.path)) {
            import(
                /* webpackIgnore: true */
                record.path).then((module) => {
                    contentTabContainer.add({
                        module: module.default,
                        header,
                        id    : name
                    })
                }
            )
        } else {
            record.path.forEach(path => {
                pathArray.push(import(/* webpackIgnore: true */ path))
            });

            Promise.all(pathArray).then(function(modules) {
                let items = [];

                modules.forEach(module => {
                    items.push({
                        module: module.default
                    })
                });

                contentTabContainer.add({
                    ntype: 'container',
                    header,
                    id   : name,
                    items,
                    style: {padding: '10px'}
                })
            })
        }
    }

    /**
     * @summary Filters the Docs navigation tree lists when the search field value changes.
     * @param {Object} data
     */
    onNavigationSearchFieldChange(data) {
        let me    = this,
            value = data.value;

        me.getReference('examples-treelist').filter('name', value, null);
        me.getReference('apps-treelist')    .filter('name', value, null);
        me.getReference('api-treelist')     .filter('name', value, null)
    }

    /**
     * @param {Object} data
     */
    onNavTabContainerResize(data) {
        // console.log('onNavTabContainerResize', data)
    }

    /**
     * @summary Toggles the HighlightJS source-view stylesheet and button label between light and dark themes.
     */
    onSwitchSourceViewThemeButtonClick() {
        let me      = this,
            button  = me.getReference('source-view-theme-button'),
            libPath = Neo.config.basePath + 'resources/lib/',
            buttonText, href;

        if (button.text === 'Source View Theme Light') {
            buttonText = 'Source View Theme Dark';
            href       = libPath + 'highlightjs-custom-github-theme.css'
        } else {
            buttonText = 'Source View Theme Light';
            href       = libPath + 'highlightjs-custom-dark-theme.css'
        }

        Neo.main.addon.Stylesheet.swapStyleSheet({
            href,
            id      : 'hljs-theme',
            windowId: me.windowId,
        }).then(data => {
            button.text = buttonText
        })
    }

    /**
     * @summary Toggles the Docs view theme and theme-switch button label between light and dark themes.
     */
    onSwitchThemeButtonClick() {
        let me     = this,
            button = me.getReference('theme-button'),
            view   = me.component,
            buttonText, theme;

        if (button.text === 'Theme Light') {
            buttonText = 'Theme Dark';
            theme      = 'neo-theme-light'
        } else {
            buttonText = 'Theme Light';
            theme      = 'neo-theme-dark'
        }

        view.theme  = theme;
        button.text = buttonText
    }

    /**
     * @param {Object} record
     */
    onTutorialListLeafClick(record) {
        let me                  = this,
            contentTabContainer = me.getReference('content-tabcontainer');

        contentTabContainer.add({
            ntype   : 'classdetails-tutorialcomponent',
            fileName: record.fileName,
            fileType: record.type,
            id      : record.name,

            header: {
                iconCls: 'fa fa-hands-helping',
                text   : record.name
            }
        })
    }

    /**
     * @summary Opens or focuses the API documentation tab of a class route, so a reload or deep link restores it.
     * @param {Object} data
     * @param {String} data.className
     */
    onViewClassRoute(data) {
        let me = this,
            record;

        if (me.deferUntilStructureLoaded(me.onViewClassRoute, data)) {
            return
        }

        record = me.getStateProvider().getStore('structure').find('className', data.className)[0];

        record && me.openClassTab(record)
    }

    /**
     * @summary Resolves source routes against the complete index regardless of navigation tab or search state.
     * @param {Object} data
     * @param {String} data.className
     * @param {String} data.lineNumber
     */
    onViewSourceRoute(data) {
        let me                  = this,
            className           = data.className,
            lineNumber          = data.lineNumber && parseInt(data.lineNumber) || null,
            contentTabContainer = me.getReference('content-tabcontainer'),
            record, tab;

        if (me.deferUntilStructureLoaded(me.onViewSourceRoute, data)) {
            return
        }

        record = me.getStateProvider().getStore('structure').find('className', className)[0];

        if (record) {
            tab = contentTabContainer.add({
                ntype        : 'classdetails-sourceviewcomponent',
                id           : className + '__source',
                line         : lineNumber,
                structureData: record,

                header: {
                    iconCls: 'fa fa-code',
                    route  : me.ownsRoutes() ? `/viewSource/${record.className}` : null,
                    text   : record.name,
                    tooltip: record.className
                }
            });


            // adjust the highlighted line for already added source view tabs
            tab.line = lineNumber
        }
    }
}

export default Neo.setupClass(MainContainerController);
