import Button    from '../../../../src/button/Base.mjs';
import Container from '../../../../src/container/Base.mjs';

/**
 * @class Portal.view.home.MainContainer
 * @extends Neo.container.Base
 */
class Viewport extends Container {
    static config = {
        /**
         * @member {String} className='Portal.view.home.MainContainer'
         * @protected
         */
        className: 'Portal.view.home.MainContainer',
        /**
         * @member {String[]} cls=['newwebsite-viewport']
         */
        cls: ['newwebsite-viewport'],
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls   : ['vector'],
            flex  : 'none'
        }, {
            cls : 'neo-h1',
            flex: 'none',
            html: 'The High-Performance Web Framework for Next Generation Interfaces'
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

Neo.setupClass(Viewport);

export default Viewport;
