import Container              from '../../../../src/tab/Container.mjs';
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
         */
        activeIndex: null,
        /**
         * @member {String[]} baseCls=['portal-examples-tab-container','neo-tab-container']
         */
        baseCls: ['portal-examples-tab-container', 'neo-tab-container'],
        /**
         * @member {Neo.controller.Component} controller=TabContainerController
         */
        controller: TabContainerController,
        /**
         * @member {Object} headerToolbarDefaults
         */
        headerToolbarDefaults: {
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
            reference      : 'examples-devmode-list',
            storeUrl       : '../../apps/portal/resources/data/examples_devmode.json',
            tabButtonConfig: {
                iconCls: 'fa fa-chess-knight',
                route  : '/examples/devmode',
                text   : 'DevMode'
            }
        }, {
            reference      : 'examples-dist-dev-list',
            storeUrl       : '../../apps/portal/resources/data/examples_dist_dev.json',
            tabButtonConfig: {
                iconCls: 'fa fa-chess-queen',
                route  : '/examples/dist_dev',
                text   : 'dist/dev'
            }
        }, {
            reference      : 'examples-dist-prod-list',
            storeUrl       : '../../apps/portal/resources/data/examples_dist_prod.json',
            tabButtonConfig: {
                iconCls: 'fa fa-chess-king',
                route  : '/examples/dist_prod',
                text   : 'dist/prod'
            }
        }],
        /**
         * @member {Boolean} sortable=true
         */
        sortable: true,
        /**
         * @member {String} tabBarPosition='left'
         */
        tabBarPosition: 'left',
    }
}

export default Neo.setupClass(TabContainer);
