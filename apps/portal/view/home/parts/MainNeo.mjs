import BaseContainer from './BaseContainer.mjs';
import Button        from '../../../../../src/button/Base.mjs';

/**
 * @class Portal.view.home.parts.MainNeo
 * @extends Portal.view.home.parts.BaseContainer
 */
class MainNeo extends BaseContainer {
    static config = {
        /**
         * @member {String} className='Portal.view.home.parts.MainNeo'
         * @protected
         */
        className: 'Portal.view.home.parts.MainNeo',
        /**
         * @member {String[]} cls=['portal-home-main-neo']
         */
        cls: ['portal-home-main-neo'],

        layout: {ntype: 'vbox', align: 'center', pack: 'center'},
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype: 'container',
            cls  : ['vector'],
            flex : 'none',
        }, {
            cls : ['neo-h1'],
            flex: 'none',
            html: 'The High-Performance Web Framework for Next Generation Interfaces',
            vdom: {tag: 'h1'}
        }, {
            cls : ['neo-h3'],
            ntype: 'component',
            html: 'Extreme speed. Multi-threaded. Multi-window. Smple code.',
            vdom: {tag: 'h3'}
        }, {
            ntype: 'container',
            cls  : ['button-group'],
            flex : 'none',
            items: [{
                module : Button,
                cls    : ['get-started-button'],
                text   : 'Get started',
                flex   : 'none',
                route : '/learn'
            }, {
                module: Button,
                cls   : ['neo-github'],
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
