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
            html: 'Additional Stuff',
            tag : 'h1'
        }, {
            cls : ['neo-h2'],
            flex: 'none',
            html: 'More to come here',
            tag : 'h2'
        }, {
            cls : ['neo-content'],
            flex: 'none',
            html: 'Lorem Ipsum',
            tag : 'p'
        }, {
            flex: 1
        }, {
            module: FooterContainer,
            height: '35%'
        }]
    }
}

Neo.setupClass(AfterMath);

export default AfterMath;
