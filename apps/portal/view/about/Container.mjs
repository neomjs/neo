import Base            from '../../../../src/container/Base.mjs';
import MemberContainer from './MemberContainer.mjs';

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
         * @member {String[]} cls=['portal-about-container']
         */
        cls: ['portal-about-container'],
        /**
         * @member {Object[]} items
         */
        items: [{
            html: 'Meet the Team',
            tag : 'h1'
        }, {
            module         : MemberContainer,
            githubProfile  : 'https://github.com/tobiu',
            linkedinProfile: 'https://www.linkedin.com/in/tobiasuhlig/',
            name           : 'Tobias Uhlig'
        }],
        /**
         * @member {Object} layout={ntype:'vbox',align:'start'}
         */
        layout: {ntype: 'vbox', align: 'start'}
    }
}

Neo.setupClass(Container);

export default Container;
