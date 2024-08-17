import Component from '../../../src/controller/Component.mjs';
import NeoArray  from '../../../src/util/Array.mjs';

/**
 * @class Docs.view.MainContainerController
 * @extends Neo.controller.Component
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
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me      = this,
            appName = me.component.appName,
            opts    = {appName, windowId: me.component.windowId};

        if (appName === 'Portal') {
            opts.highlightJsPath = '../../docs/resources/highlight/highlight.pack.js';
            opts.themePath       = '../../docs/resources/highlightjs-custom-github-theme.css'
        }

        Neo.main.addon.HighlightJS.loadFiles(opts)
    }

    /**
     * @param {Object} record
     */
    onApiListLeafClick(record) {
        let me                  = this,
            contentTabContainer = me.getReference('content-tabcontainer');

        contentTabContainer.add({
            ntype        : 'classdetails-maincontainer',
            id           : record.className,
            structureData: record,

            tabButtonConfig: {
                iconCls: record.singleton ? 'fa fa-arrow-alt-circle-right' : 'fa fa-copyright',
                text   : record.name
            }
        })
    }

    /**
     * @param {Object} record
     */
    onExamplesListLeafClick(record) {
        let me                  = this,
            contentTabContainer = me.getReference('content-tabcontainer'),
            name                = record.name,
            pathArray           = [],
            store               = me.getReference('examples-treelist').store,
            tmpRecord           = record,
            tabButtonConfig;

        while (tmpRecord.parentId !== null) {
            tmpRecord = store.get(tmpRecord.parentId);
            name      = tmpRecord.name + '.' + name;
        }

        name = 'examples_' + name;

        tabButtonConfig = {
            iconCls: 'fa fa-desktop',
            text   : record.name
        };

        if (!Array.isArray(record.path)) {
            import(
                /* webpackIgnore: true */
                record.path).then((module) => {
                    contentTabContainer.add({
                        module: module.default,
                        id    : name,
                        tabButtonConfig
                    })
                }
            );
        } else {
            record.path.forEach(path => {
                pathArray.push(import(/* webpackIgnore: true */ path));
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
                    id   : name,
                    items,
                    style: {padding: '10px'},
                    tabButtonConfig
                })
            })
        }
    }

    /**
     * @param {Object} data
     */
    onNavigationSearchFieldChange(data) {
        let me    = this,
            value = data.value;

        me.getReference('examples-treelist') .filter('name', value, null);
        me.getReference('api-treelist')      .filter('name', value, null);
        me.getReference('tutorials-treelist').filter('name', value, null);
    }

    /**
     * @param {Object} data
     */
    onNavTabContainerResize(data) {
        // console.log('onNavTabContainerResize', data)
    }

    /**
     *
     */
    onSwitchSourceViewThemeButtonClick() {
        let me     = this,
            button = me.getReference('source-view-theme-button'),
            buttonText, href;

        if (button.text === 'Source View Theme Light') {
            buttonText = 'Source View Theme Dark';
            href       = './resources/highlightjs-custom-github-theme.css';
        } else {
            buttonText = 'Source View Theme Light';
            href       = './resources/highlightjs-custom-dark-theme.css';
        }

        Neo.main.addon.Stylesheet.swapStyleSheet({
            appName: me.component.appName,
            href,
            id     : 'hljs-theme'
        }).then(data => {
            button.text = buttonText;
        })
    }

    /**
     *
     */
    onSwitchThemeButtonClick() {
        let me     = this,
            button = me.getReference('theme-button'),
            view   = me.component,
            buttonText, cls, theme;

        if (button.text === 'Theme Light') {
            buttonText = 'Theme Dark';
            theme      = 'neo-theme-light';
        } else {
            buttonText = 'Theme Light';
            theme      = 'neo-theme-dark';
        }

        cls = [...view.cls];

        view.cls.forEach(item => {
            if (item.includes('neo-theme')) {
                NeoArray.remove(cls, item)
            }
        });

        NeoArray.add(cls, theme);
        view.cls = cls;

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

            tabButtonConfig: {
                iconCls: 'fa fa-hands-helping',
                text   : record.name
            }
        })
    }

    /**
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

                tabButtonConfig: {
                    iconCls: 'fa fa-code',
                    text   : record.name
                }
            });


            // adjust the highlighted line for already added source view tabs
            tab.line = lineNumber
        }
    }
}

Neo.setupClass(MainContainerController);

export default MainContainerController;
