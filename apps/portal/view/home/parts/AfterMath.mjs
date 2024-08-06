import BaseContainer   from './BaseContainer.mjs';
import FooterContainer from '../FooterContainer.mjs';

/**
 * @class Portal.view.home.parts.AfterMath
 * @extends Portal.view.home.parts.BaseContainer
 */
class AfterMath extends BaseContainer {
    static config = {
        /**
         * @member {String} className='Portal.view.home.parts.AfterMath'
         * @protected
         */
        className: 'Portal.view.home.parts.AfterMath',
        /**
         * @member {String[]} cls=['portal-home-aftermath']
         */
        cls: ['portal-home-aftermath'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch',pack:'center'}
         */
        layout: {ntype: 'vbox', align: 'stretch', pack: 'center'},
        /**
         * @member {Object[]} items
         */
        items: [{
            flex: 1
        }, {
            cls : ['neo-h1'],
            flex: 'none',
            html: 'Next Steps',
            tag : 'h1'
        }, {
            cls : ['neo-content'],
            flex: 'none',
            html: `
            <p>
            To learn more about Neo.mjs please read <a href="#/learn">the Learning Section</a> or browse <a href="#/blog">the blog</a>.
            </p>
            <p>
            To arrange a demo or to talk to an engineer email <a href="mailto:info@neomjs.com">info@neomjs.com</a>. 
            <br>For help starting a project email <a href="mailto:services@neomjs.com">services@neomjs.com</a>. 
            <br>For questions about private training email <a href="mailto:training@neomjs.com">training@neomjs.com</a>.
            </p>
            `,
            tag : 'div'
        }, {
            flex: 1
        }, {
            module: FooterContainer,
            flex  : 'none'
        }]
    }
}

Neo.setupClass(AfterMath);

export default AfterMath;
