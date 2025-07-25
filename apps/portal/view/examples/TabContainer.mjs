import Container              from '../../../../src/tab/Container.mjs';
import ExampleStore           from '../../store/Examples.mjs';
import List                   from './List.mjs';
import TabContainerController from './TabContainerController.mjs';

/**
 * @class Portal.view.examples.TabContainer
 * @extends Neo.tab.Container
 */
class TabContainer extends Container {
    static config = {
        /**
         * @member {String} className='Portal.view.examples.TabContainer'
         * @protected
         */
        className: 'Portal.view.examples.TabContainer',
        /**
         * @member {Number|null} activeIndex=null
         * @reactive
         */
        activeIndex: null,
        /**
         * @member {String[]} baseCls=['portal-examples-tab-container','neo-tab-container']
         */
        baseCls: ['portal-examples-tab-container', 'neo-tab-container'],
        /**
         * @member {Neo.controller.Component} controller=TabContainerController
         * @reactive
         */
        controller: TabContainerController,
        /**
         * @member {Object} headerToolbar
         */
        headerToolbar: {
            cls: ['portal-examples-tab-header-toolbar']
        },
        /**
         * @member {Object} itemDefaults
         */
        itemDefaults: {
            module: List
        },
        /**
         * @member {Object[]} items
         */
        items: [{
            reference: 'examples-devmode-list',
            store    : {module: ExampleStore, url: '../../apps/portal/resources/data/examples_devmode.json'},
            header   : {
                iconCls: 'fa fa-chess-knight',
                route  : '/examples/devmode',
                text   : 'Dev Mode'
            }
        }, {
            environment: 'dist/development',
            reference  : 'examples-dist-dev-list',
            store      : {module: ExampleStore, url: '../../apps/portal/resources/data/examples_dist_dev.json'},
            header     : {
                iconCls: 'fa fa-chess-bishop',
                route  : '/examples/dist_dev',
                text   : 'dist/dev'
            }
        }, {
            environment: 'dist/production',
            reference  : 'examples-dist-esm-list',
            store      : {module: ExampleStore, url: '../../apps/portal/resources/data/examples_dist_esm.json'},
            header     : {
                iconCls: 'fa fa-chess-queen',
                route  : '/examples/dist_esm',
                text   : 'dist/esm'
            }
        }, {
            environment: 'dist/production',
            reference  : 'examples-dist-prod-list',
            store      : {module: ExampleStore, url: '../../apps/portal/resources/data/examples_dist_prod.json'},
            header     : {
                iconCls: 'fa fa-chess-king',
                route  : '/examples/dist_prod',
                text   : 'dist/prod'
            }
        }],
        /**
         * @member {Boolean} sortable=true
         * @reactive
         */
        sortable: true,
        /**
         * @member {String} tabBarPosition='left'
         * @reactive
         */
        tabBarPosition: 'left',
    }
}

export default Neo.setupClass(TabContainer);
