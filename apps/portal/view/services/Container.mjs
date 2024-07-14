import BaseContainer from '../../../../src/container/Base.mjs';

/**
 * @class Portal.view.services.Container
 * @extends Neo.container.Base
 */
class Container extends BaseContainer {
    static config = {
        /**
         * @member {String} className='Portal.view.services.Container'
         * @protected
         */
        className: 'Portal.view.services.Container',
        /**
         * @member {String[]} baseCls=['portal-services-container','neo-container']
         */
        baseCls: ['portal-services-container', 'neo-container'],
        /**
         * @member {Array} items
         */
        items: [{
            html: 'Services',
            vdom: {tag: 'h1'}
        }],
        /**
         * @member {Object} layout={ntype: 'vbox', align: 'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }
}

Neo.setupClass(Container);

export default Container;
