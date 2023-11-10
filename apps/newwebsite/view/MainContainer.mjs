import Viewport     from '../../../src/container/Viewport.mjs';
import Button       from '../../../src/button/Base.mjs';
import Container    from '../../../src/container/Base.mjs';

/**
 * @class newwebsite.view.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='newwebsite.view.MainContainer'
         * @protected
         */
        className: 'newwebsite.view.MainContainer',

        cls: 'newwebsite-main-container',

        flex: 'none',
        /**
         * @member {Boolean} autoMount=true
         */
        autoMount: true,
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls: 'vector',
            flex: 'none'
        },{
            html: 'The High-Performance Web Framework for Next Generation Interfaces',
            flex: 'none',
            cls: 'neo-h1'
        },{
            module: Container,
            cls: ['button-group'],
            flex: 'none',
            items: [{
                module: Button,
                cls: 'get-started-button',
                text: 'Get started',
                flex: 'none',
                tooltip: {
                    text: 'Coming soon',
                    showDelay : 0,
                    hideDelay: 0
                }
            },{
                module: Button,
                text: 'View on GitHub',
                ui: 'secondary',
                flex: 'none',
                route: 'https://github.com/neomjs/neo'
            }]
        }],

        
        /*
         * @member {Object} layout={ntype:'fit'}
         */
        
    }
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;