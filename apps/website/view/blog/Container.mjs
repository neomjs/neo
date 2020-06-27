import {default as BaseContainer} from '../../../../src/container/Base.mjs';
import {default as Component}     from '../../../../src/component/Base.mjs';

/**
 * @class Website.view.blog.Container
 * @extends Neo.container.Base
 */
class Container extends BaseContainer {
    static getConfig() {return {
        /**
         * @member {String} className='Website.view.blog.Container'
         * @protected
         */
        className: 'Website.view.blog.Container',
        /**
         * @member {Array} items
         */
        items: [{
            module: Container,
            height: 50,
            layout: {ntype: 'hbox', align: 'stretch'},

            items: [{
                module: Component,
                html  : 'Controls'
            }]
        }, {
            module: Component,
            flex  : 1,
            html  : 'List'
        }],
        /**
         * @member {Object} layout={ntype: 'vbox', align: 'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }}
}

Neo.applyClassConfig(Container);

export {Container as default};