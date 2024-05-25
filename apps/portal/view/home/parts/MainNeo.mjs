import Button    from '../../../../../src/button/Base.mjs';
import Container from '../../../../../src/container/Base.mjs';

/**
 * @class Portal.view.home.parts.MainNeo
 * @extends Neo.container.Base
 */
class MainNeo extends Container {
    static config = {
        /**
         * @member {String} className='Portal.view.home.parts.MainNeo'
         * @protected
         */
        className: 'Portal.view.home.parts.MainNeo',

        cls: ['page', 'landing-page'],

        layout: {ntype: 'vbox', align: 'center', pack: 'center'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls   : ['vector'],
            flex  : 'none',
        }, {
            cls : 'neo-h1',
            flex: 'none',
            html: 'The High-Performance Web Framework for Next Generation Interfaces'
            // }, {
            //     cls : 'neo-h2',
            //     flex: 'none',
            //     html: 'This is a perfect subline',
            //     // height: 200
        }, {
            module: Container,
            cls   : ['button-group'],
            flex  : 'none',

            items: [{
                module : Button,
                cls    : 'get-started-button',
                text   : 'Get started',
                flex   : 'none',
                tooltip: {
                    text     : 'Coming soon',
                    showDelay: 0,
                    hideDelay: 0
                }
            }, {
                module: Button,
                flex  : 'none',
                text  : 'View on GitHub',
                ui    : 'secondary',
                url   : 'https://github.com/neomjs/neo'
            }]
        }]
    }
}

Neo.setupClass(MainNeo);

export default MainNeo;