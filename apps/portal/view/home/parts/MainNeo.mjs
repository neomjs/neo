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
            cls  : ['logo-container'],
            items: [{
                ntype: 'container',
                cls  : ['vector']
            }, {
                cls : ['neo-h1'],
                html: 'Neo.mjs',
                vdom: {tag: 'h1'}
            }]
        }, {
            cls : ['neo-h2'],
            flex: 'none',
            html: 'Modern Enterprise-Ready JavaScript Framework',
            vdom: {tag: 'h2'}
        }, {
            cls : ['neo-h3'],
            flex: 'none',
            html: 'Neo.mjs provides a new approch for building feature-rich web applications.  Increase productivity by leveraging a vast component library and harness the power of multi-threading for extreme real-time performance.',
            vdom: {tag: 'h3'}
        }, {
            ntype: 'container',
            cls  : ['button-group'],
            flex : 'none',
            items: [{
                module: Button,
                cls   : ['get-started-button'],
                flex  : 'none',
                route : '/learn',
                text  : 'Get started'
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
