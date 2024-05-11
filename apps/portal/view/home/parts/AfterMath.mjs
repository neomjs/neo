import Container from '../../../../../src/container/Base.mjs';

/**
 * @class Portal.view.home.parts.AfterMath
 * @extends Neo.container.Base
 */
class AfterMath extends Container {
    static config = {
        /**
         * @member {String} className='Portal.view.home.parts.AfterMath'
         * @protected
         */
        className: 'Portal.view.home.parts.AfterMath',

        cls: ['page', 'after-math'],

        layout: {ntype: 'vbox', align: 'stretch', pack: 'center'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            flex  : 1
        }, {
            cls : 'neo-h1',
            flex: 'none',
            html: 'Additional Stuff'
        }, {
            cls : 'neo-h2',
            flex: 'none',
            html: 'More to come her',
            // height: 200
        }, {
            cls : 'neo-content',
            flex: 'none',
            html: 'Neo uses several cores to run the application. See the spinner on the page?',
            // height: 200
        }, {
            module: Container,
            flex  : 1
        }, {
            module: Container,
            cls   : 'home-footer',
            height: '40%',
            style : {
                background: 'black',
                color     : 'white',
                padding   : '15px',
                height    : '40%',
                margin    : '0 -20px -20px -20px'
            },
            html  : 'This is the footer'
        }]
    }
}

Neo.setupClass(AfterMath);

export default AfterMath;
