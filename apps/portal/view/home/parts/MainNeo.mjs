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
         * @reactive
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
                'The Application Engine for the AI Era',
                'True Multithreading',
                'The Neural Link',
                'Object Permanence',
                'Context Engineering',
                'AI-Native Runtime',
                'Live Runtime Mutation',
                'Desktop-Class Performance',
                'Linear Scalability',
                'Multi-Window Orchestration',
                'Cross-Window Messaging',
                'JSON Blueprints',
                'Hierarchical State Management',
                'Clean Architecture',
                'Separation of Concerns',
                '100% Web Standards',
                'Zero Build Step',
                'No Transpilation',
                'Instant Page Reloads'
            ]
        }, {
            cls : ['neo-h3'],
            flex: 'none',
            tag : 'h3',

            text: [
                'Neo.mjs is the Application Engine for the AI Era. Build desktop-class, multi-window apps with ',
                'a true multi-threaded runtime and an AI co-developer.'
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
