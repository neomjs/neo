import ApiTreeList             from './ApiTreeList.mjs';
import ClassDetailsContainer   from './classdetails/MainContainer.mjs';
import Collection              from '../../../src/collection/Base.mjs';
import ContentTabContainer     from './ContentTabContainer.mjs';
import ExamplesTreeList        from './ExamplesTreeList.mjs';
import HeaderContainer         from './HeaderContainer.mjs';
import MainContainerController from './MainContainerController.mjs';
import SourceViewComponent     from './classdetails/SourceViewComponent.mjs';
import Splitter                from '../../../src/component/Splitter.mjs';
import TutorialComponent       from './classdetails/TutorialComponent.mjs';
import Viewport                from '../../../src/container/Viewport.mjs';

/**
 * @class Docs.view.MainContainer
 * @extends Neo.container.Viewport
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
         * Important for the Portal App, until the new theme fully supports it
         * @member {String} theme='neo-theme-light'
         * @reactive
         */
        theme: 'neo-theme-light',
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

                    header: {
                        iconCls: 'fa fa-code',
                        text   : 'API'
                    }
                }, {
                    module   : ExamplesTreeList,
                    listeners: {leafItemClick: 'onExamplesListLeafClick'},
                    reference: 'examples-treelist',

                    header: {
                        iconCls: 'fa fa-desktop',
                        text   : 'Examples'
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
     *
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

        // Disable the examples Tab for dist versions until the webpack builds can handle this (see: #140)
        me.items[1].items[0].items[1].header.disabled = Neo.config.environment !== 'development'
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me  = this,
            url = '../../docs/output/all.json';

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
