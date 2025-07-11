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
         * @reactive
         */
        cls: ['portal-about-container'],
        /**
         * @member {Object[]} items
         */
        items: [{
            tag : 'h1',
            text: 'Meet the Team'
        }, {
            module         : MemberContainer,
            location       : 'Germany',
            name           : 'Tobias Uhlig',
            picture        : 'tobiu.png',
            profileGitHub  : 'https://github.com/tobiu',
            profileLinkedIn: 'https://www.linkedin.com/in/tobiasuhlig/',
            teamRole       : 'Co-Founder & Core Team Member'
        }, {
            module         : MemberContainer,
            location       : 'Florida, USA',
            name           : 'Rich Waters',
            picture        : 'rwaters.png',
            profileGitHub  : 'https://github.com/rwaters',
            profileLinkedIn: 'https://www.linkedin.com/in/rwaters/',
            teamRole       : 'Contributor'
        }, {
            module         : MemberContainer,
            location       : 'Germany',
            name           : 'Torsten Dinkheller',
            picture        : 'torsten.png',
            profileGitHub  : 'https://github.com/Dinkh',
            profileLinkedIn: 'https://www.linkedin.com/in/dinkheller/',
            teamRole       : 'Contributor'
        },{
            module         : MemberContainer,
            location       : 'Madison, Wisconsin',
            name           : 'Max Rahder',
            picture        : 'Max.jpeg',
            profileGitHub  : 'https://github.com/maxrahder/',
            profileLinkedIn: 'https://www.linkedin.com/in/maxrahder/',
            teamRole       : 'Contributor'
        }],
        /**
         * @member {Object} layout={ntype:'vbox',align:'center'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'center'}
    }
}

export default Neo.setupClass(Container);
