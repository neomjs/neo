import ApiStore                from '../store/Api.mjs';
import ApiTreeList             from './ApiTreeList.mjs';
import ClassDetailsContainer   from './classdetails/MainContainer.mjs';
import Collection              from '../../../src/collection/Base.mjs';
import ContentTabContainer     from './ContentTabContainer.mjs';
import ExamplesTreeList        from './ExamplesTreeList.mjs';
import HeaderContainer         from './HeaderContainer.mjs';
import MainContainerController from './MainContainerController.mjs';
import SourceViewComponent     from './classdetails/SourceViewComponent.mjs';
import Splitter                from '../../../src/component/Splitter.mjs';
import StateProvider           from '../../../src/state/Provider.mjs';
import TutorialComponent       from './classdetails/TutorialComponent.mjs';
import Viewport                from '../../../src/container/Viewport.mjs';

/**
 * @class Docs.view.MainContainer
 * @extends Neo.container.Viewport
 * @summary Main viewport container for the Neo.mjs Docs application.
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Docs.view.MainContainer'
         * @protected
         */
        className: 'Docs.view.MainContainer',
        /**
         * @member {String} ntype='main-container'
         * @protected
         */
        ntype: 'main-container',
        /**
         * @member {String[]} baseCls=['neo-docs-maincontainer','neo-viewport']
         */
        baseCls: ['neo-docs-maincontainer', 'neo-viewport'],
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         * @reactive
         */
        controller: MainContainerController,
        /**
         * @member {Object} layout={ntype: 'vbox', align: 'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Neo.collection.Base|null} store_=null
         * @reactive
         */
        store_: null,
        /**
         * One complete source index feeds independent API and application navigation projections.
         * @member {Object} stateProvider
         * @reactive
         */
        stateProvider: {
            module: StateProvider,
            stores: {
                structure: {module: ApiStore},
                api      : {
                    module: ApiStore, url: null, sourceId: 'structure', rootName: 'src'
                },
                apps: {
                    module: ApiStore, url: null, sourceId: 'structure', rootName: 'apps'
                }
            }
        },
        /**
         * @member {Array} items=[//...]
         * @reactive
         */
        items: [HeaderContainer, {
            ntype : 'container',
            flex  : 1,
            layout: {ntype: 'hbox', align: 'stretch'},

            items: [{
                ntype   : 'tab-container',
                cls     : ['neo-docs-navigation-tab-container', 'neo-tab-container'],
                minWidth: 290,
                sortable: true,
                width   : 290,

                domListeners: {
                    resize: 'onNavTabContainerResize'
                },

                items: [{
                    module   : ApiTreeList,
                    listeners: {leafItemClick: 'onApiListLeafClick'},
                    reference: 'api-treelist',
                    bind     : {store: 'stores.api'},

                    header: {
                        iconCls: 'fa fa-code',
                        text   : 'API'
                    }
                }, {
                    module   : ApiTreeList,
                    listeners: {leafItemClick: 'onApiListLeafClick'},
                    reference: 'apps-treelist',
                    bind     : {store: 'stores.apps'},

                    header: {
                        iconCls: 'fa fa-cubes',
                        text   : 'Apps'
                    }
                }, {
                    module   : ExamplesTreeList,
                    listeners: {leafItemClick: 'onExamplesListLeafClick'},
                    reference: 'examples-treelist',

                    header: {
                        iconCls  : 'fa fa-desktop',
                        reference: 'examples-tab-button',
                        text     : 'Examples'
                    }
                }]
            }, {
                module      : Splitter,
                resizeTarget: 'previous',
                size        : 5,

                style: {
                    borderTop: 'var(--tab-strip-height) solid var(--tab-strip-background-color)',
                    marginTop: 'var(--tab-button-height)'
                }
            }, {
                module   : ContentTabContainer,
                flex     : 1,
                reference: 'content-tabcontainer'
            }]
        }]
    }

    /**
     * @summary Creates the member-doclet collection.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        if (!me.store) {
            me.store = Neo.create(Collection, {
                keyProperty: 'id'
            })
        }
    }

    /**
     * @summary Loads the shared structure index once and the separate member-doclet collection.
     */
    onConstructed() {
        super.onConstructed();

        let me  = this,
            url = '../../docs/output/all.json';

        // Dist builds cannot serve the examples yet.
        me.controller.getReference('examples-tab-button').disabled = Neo.config.environment !== 'development';

        me.getStateProvider().getStore('structure').load().then(data => {
            if (!me.isDestroyed && !data) {
                for (const reference of ['api-treelist', 'apps-treelist']) {
                    me.controller.getReference(reference).html = '<div style="padding: 1em">To get the content please use:<br>' +
                        '<code>npm run generate-docs-json</code></div>'
                }
            }
        });

        Neo.Xhr.promiseJson({url}).catch(err => {
            console.error('Error for Neo.Xhr.request', {id: me.store.id, error: err, url})
        }).then(data => {
            if (data) {
                me.store.items = data.json
            }
        })
    }
}

export default Neo.setupClass(MainContainer);
