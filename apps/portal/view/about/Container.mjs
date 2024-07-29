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
            location       : 'Germany',
            name           : 'Tobias Uhlig',
            picture        : 'tobiu.png',
            teamRole       : 'Co-Founder & Core Team Member'
        }],
        /**
         * @member {Object} layout={ntype:'vbox',align:'start'}
         */
        layout: {ntype: 'vbox', align: 'start'}
    }
}

Neo.setupClass(Container);

export default Container;
