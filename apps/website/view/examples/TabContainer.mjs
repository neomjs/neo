import {default as Component} from '../../../../src/component/Base.mjs';
import Container              from '../../../../src/tab/Container.mjs';

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
         * @member {Object} itemDefaults
         */
        itemDefaults: {
            module: Component,
            cls   : ['neo-examples-tab-component'],
            style : {padding: '20px'},
        },
        /**
         * @member {Array} items
         */
        items: [{
            tabButtonConfig: {
                iconCls: 'fa fa-images',
                text   : 'development mode'
            },
            vdom: {innerHTML: 'development mode'}
        }, {
            tabButtonConfig: {
                iconCls: 'fa fa-play-circle',
                text   : 'dist/development'
            },
            vdom: {innerHTML: 'dist/development'}
        }, {
            tabButtonConfig: {
                iconCls: 'fa fa-home',
                text   : 'dist/production'
            },
            vdom: {innerHTML: 'dist/production'}
        }],
        /**
         * @member {String} tabBarPosition='left'
         */
        tabBarPosition: 'left',
    }}
}

Neo.applyClassConfig(TabContainer);

export {TabContainer as default};