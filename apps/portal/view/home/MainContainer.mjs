import Button     from '../../../../src/button/Base.mjs';
import Container  from '../../../../src/container/Base.mjs';
import ContentBox from './ContentBox.mjs';

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
            layout: {ntype: 'hbox'},

            items: [{
                module: Button,
                flex  : 'none',
                text  : 'View on GitHub',
                ui    : 'secondary',
                url   : 'https://github.com/neomjs/neo'
            }, {
                module: Button,
                cls   : 'get-started-button',
                text  : 'Get started',
                flex  : 'none',
                route : '/learn'
            }]
        }, {

            module: Container,
            layout: {ntype: 'hbox', align: 'stretch'},

            items: [{
                module : ContentBox,
                header : 'Quick Application Development',
                content: [
                    'Item 1',
                    'Item 2',
                    'Item 3'
                ]
            }, {
                module : ContentBox,
                header : 'Extreme Performance',
                content: [
                    'Item 1',
                    'Item 2',
                    'Item 3'
                ]
            }, {
                module : ContentBox,
                header : 'Multi Window Apps',
                content: [
                    'Item 1',
                    'Item 2',
                    'Item 3'
                ]
            }]
        }]
    }
}

Neo.setupClass(Viewport);

export default Viewport;
