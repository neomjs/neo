import Button    from '../../../src/button/Base.mjs';
import Container from '../../../src/container/Base.mjs';
import Viewport  from '../../../src/container/Viewport.mjs';

/**
 * @class NewWebsite.view.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='NewWebsite.view.MainContainer'
         * @protected
         */
        className: 'NewWebsite.view.MainContainer',
        /**
         * @member {String[]} cls=['newwebsite-main-container']
         */
        cls: ['newwebsite-main-container'],
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

Neo.applyClassConfig(MainContainer);

export default MainContainer;
