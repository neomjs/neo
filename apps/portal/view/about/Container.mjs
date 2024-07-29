import Base from '../../../../src/container/Base.mjs';

/**
 * @class Portal.view.about.Container
 * @extends Neo.container.Base
 */
class Container extends Base {
    static config = {
        /**
         * @member {String} className='Portal.view.about.Container'
         * @protected
         */
        className: 'Portal.view.about.Container',
        /**
         * @member {Object[]} items
         */
        items: [{
            html: 'Meet the Team'
        }]
    }
}

Neo.setupClass(Container);

export default Container;
