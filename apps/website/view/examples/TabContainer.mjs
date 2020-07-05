import Container from '../../../../src/tab/Container.mjs';
import List      from './List.mjs';

/**
 * @class Website.view.examples.TabContainer
 * @extends Neo.container.Base
 */
class TabContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Website.view.examples.TabContainer'
         * @protected
         */
        className: 'Website.view.examples.TabContainer',
        /**
         * @member {Number} activeIndex=2
         */
        activeIndex: 2,
        /**
         * @member {Array} items
         */
        items: [{
            module         : List,
            reference      : 'examples-devmode-list',
            storeUrl       : '../../apps/website/data/examples_devmode.json',
            tabButtonConfig: {
                iconCls: 'fa fa-chess-knight',
                route  : 'childview=devmode',
                text   : 'DevMode'
            }
        }, {
            module         : List,
            reference      : 'examples-dist-dev-list',
            storeUrl       : '../../apps/website/data/examples_dist_dev.json',
            tabButtonConfig: {
                iconCls: 'fa fa-chess-queen',
                route  : 'childview=dist_dev',
                text   : 'dist/dev'
            }
        }, {
            module         : List,
            reference      : 'examples-dist-prod-list',
            storeUrl       : '../../apps/website/data/examples_dist_prod.json',
            tabButtonConfig: {
                iconCls: 'fa fa-chess-king',
                route  : 'childview=dist_prod',
                text   : 'dist/prod'
            }
        }],
        /**
         * @member {String} tabBarPosition='left'
         */
        tabBarPosition: 'left',
    }}
}

Neo.applyClassConfig(TabContainer);

export {TabContainer as default};