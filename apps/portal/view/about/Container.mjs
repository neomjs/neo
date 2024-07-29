import Base            from '../../../../src/container/Base.mjs';
import MemberComponent from './MemberComponent.mjs';

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
            html: 'Meet the Team',
            tag : 'h1'
        }, {
            module: MemberComponent,
            name  : 'Tobias Uhlig'
        }]
    }
}

Neo.setupClass(Container);

export default Container;
