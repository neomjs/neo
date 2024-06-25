import BaseContainer from './BaseContainer.mjs';

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
         * @member {Object} layout={ntype:'vbox',align:'stretch',pack:'center'}
         */
        layout: {ntype: 'vbox', align: 'stretch', pack: 'center'},
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype: 'container',
            flex : 1
        }, {
            cls : 'neo-h1',
            flex: 'none',
            html: 'Additional Stuff',
            vdom: {tag: 'h1'}
        }, {
            cls : 'neo-h2',
            flex: 'none',
            html: 'More to come here',
            vdom: {tag: 'h2'}
        }, {
            cls : 'neo-content',
            flex: 'none',
            html: 'Neo uses several cores to run the application. See the spinner on the page?',
            vdom: {tag: 'p'}
        }, {
            ntype: 'container',
            flex : 1
        }, {
            ntype : 'container',
            cls   : 'home-footer',
            height: '40%',
            html  : 'This is the footer',
            vdom  : {tag: 'footer'},

            style : { // todo: css
                background: 'black',
                color     : 'white',
                height    : '40%',
                padding   : '15px'
            }
        }]
    }
}

Neo.setupClass(AfterMath);

export default AfterMath;
