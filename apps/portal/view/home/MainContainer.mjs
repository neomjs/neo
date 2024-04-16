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
         * @member {Object} layout={ntype:'vbox',align:'center',pack:'center'}
         */
        layout: {ntype: 'vbox', align: 'center', pack: 'center'},
        /**
         * @member {Object[]} items
         */
        items: [{
            cls  : ['vector'],
            flex : 'none'
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
                flex  : 'none',
                text  : 'Get started',
                route : '/learn'
            }]
        }, {
            module: Container,
            flex  : '1 0 auto',
            layout: {ntype: 'hbox', align: 'stretch'},

            items: [{
                module: ContentBox,
                header: 'Next-Generation Runtime',
                route : '#/learn/WhyNeo-Quick',

                content: [
                    'Multi-threaded',
                    'Elegant state management',
                    'Simple and powerful debugging'
                ]
            }, {
                module: ContentBox,
                header: 'Extreme Speed',
                route : '#/learn/WhyNeo-Speed',

                content: [
                    'Multi-threaded',
                    'Over 40,000 delta updates per second',
                    'Item 3'
                ]
            }]
        }]
    }
}

Neo.setupClass(Viewport);

export default Viewport;
