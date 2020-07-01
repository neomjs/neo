import {default as Component} from '../../../../src/component/Base.mjs';
import Container              from '../../../../src/tab/Container.mjs';

/**
 * @class Website.view.home.TabContainer
 * @extends Neo.container.Base
 */
class TabContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Website.view.home.TabContainer'
         * @protected
         */
        className: 'Website.view.home.TabContainer',
        /**
         * @member {Number} activeIndex=1
         */
        activeIndex: 1,
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
                route  : 'childview=developers',
                text   : 'For Developers'
            },
            vdom: {innerHTML: 'Amazing text to describe neo.mjs for developers'}
        }, {
            tabButtonConfig: {
                iconCls: 'fa fa-play-circle',
                route  : 'childview=executives',
                text   : 'For Executives'
            },
            vdom: {innerHTML: 'Amazing text to describe neo.mjs for executives'}
        }],
        /**
         * @member {String} tabBarPosition='left'
         */
        tabBarPosition: 'left',
    }}
}

Neo.applyClassConfig(TabContainer);

export {TabContainer as default};