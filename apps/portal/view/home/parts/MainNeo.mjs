import BaseContainer from './BaseContainer.mjs';
import Button        from '../../../../../src/button/Base.mjs';
import MagicMoveText from '../../../../../src/component/MagicMoveText.mjs';

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
                tag : 'h1',
                text: 'Neo.mjs'
            }]
        }, {
            module   : MagicMoveText,
            autoCycle: false,
            cls      : ['neo-h2'],
            colorMove: '#3E63DD',
            flex     : 'none',
            reference: 'magic-move',

            cycleTexts: [
                'Modern Enterprise JavaScript Framework',
                'An Application Worker being the Orchestrator',
                'Scalability',
                'Extensibility',
                'Performance',
                'Declarative & Reactive Component Trees',
                'Separated from Business Logic',
                'View Controllers',
                'State Providers',
                'Clean Architectures',
                'Multi Window Apps'
            ]
        }, {
            cls : ['neo-h3'],
            flex: 'none',
            tag : 'h3',

            text: [
                'Neo.mjs provides a new approach for building feature-rich web applications. Increase productivity by leveraging ',
                'a vast component library and harness the power of multi-threading for extreme real-time performance.'
            ].join('')
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

    /**
     *
     */
    activate() {
        this.getItem('magic-move').autoCycle = true
    }

    /**
     *
     */
    deactivate() {
        this.getItem('magic-move').autoCycle = false
    }
}

export default Neo.setupClass(MainNeo);
