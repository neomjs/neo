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
         * @member {Array} items
         */
        items: [{
            module         : List,
            reference      : 'examples-devmode-list',
            storeUrl       : '../../apps/website/data/examples_devmode.json',
            tabButtonConfig: {
                iconCls: 'fa fa-images',
                text   : 'development mode'
            }
        }, {
            module         : List,
            reference      : 'examples-dist-dev-list',
            storeUrl       : '../../apps/website/data/examples_dist_dev.json',
            tabButtonConfig: {
                iconCls: 'fa fa-play-circle',
                text   : 'dist/development'
            }
        }, {
            module         : List,
            reference      : 'examples-dist-prod-list',
            storeUrl       : '../../apps/website/data/examples_dist_prod.json',
            tabButtonConfig: {
                iconCls: 'fa fa-home',
                text   : 'dist/production'
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