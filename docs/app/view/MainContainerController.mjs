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
     * @summary Opens or focuses the API documentation tab for a clicked class tree leaf, setting the full className as the tab header tooltip.
     * @param {Object} record
     */
    onApiListLeafClick(record) {
        let me                  = this,
            contentTabContainer = me.getReference('content-tabcontainer');

        contentTabContainer.add({
            ntype        : 'classdetails-maincontainer',
            id           : record.className,
            structureData: record,

            header: {
                iconCls: record.singleton ? 'fa fa-arrow-alt-circle-right' : 'fa fa-copyright',
                text   : record.name,
                tooltip: record.className
            }
        })
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
     * @summary Handles the /viewSource route by opening or focusing the source view tab with the full className as the tab header tooltip.
     * @param {Object} data
     * @param {String} data.className
     * @param {String} data.lineNumber
     */
    onViewSourceRoute(data) {
        let me                  = this,
            className           = data.className,
            lineNumber          = data.lineNumber && parseInt(data.lineNumber) || null,
            contentTabContainer = me.getReference('content-tabcontainer'),
            structureStore      = me.getReference('api-treelist').store,
            record              = structureStore.find('className', className)[0],
            tab;

        if (record) {
            tab = contentTabContainer.add({
                ntype        : 'classdetails-sourceviewcomponent',
                id           : className + '__source',
                line         : lineNumber,
                structureData: record,

                header: {
                    iconCls: 'fa fa-code',
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
