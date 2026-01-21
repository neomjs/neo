import BaseContainer     from '../../../../../../src/container/Base.mjs';
import Button            from '../../../../../../src/button/Base.mjs';
import MagicMoveText     from '../../../../../../src/component/MagicMoveText.mjs';

/**
 * @class Portal.view.home.parts.hero.Content
 * @extends Neo.container.Base
 */
class Content extends BaseContainer {
    static config = {
        /**
         * @member {String} className='Portal.view.home.parts.hero.Content'
         * @protected
         */
        className: 'Portal.view.home.parts.hero.Content',
        /**
         * @member {String[]} cls=['portal-home-hero-content']
         * @reactive
         */
        cls: ['portal-home-hero-content'],

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
            renderSeoList: true,

            cycleTexts: [
                'The Application Engine for the AI Era',
                'Conversational UIs',
                'Agentic Control',
                'The Neural Link',
                'Live Runtime Mutation',
                'AI-Native Runtime',
                'JSON Blueprints since 2019',
                'Object Permanence',
                'Context Engineering',
                'True Multithreading',
                'SharedWorker Simulations',
                'Physics-Driven UI',
                'Desktop-Class Performance',
                'Linear Scalability',
                'Multi-Window Orchestration',
                'Cross-Window Messaging',
                'Hierarchical State Management',
                'Clean Architecture',
                'Separation of Concerns',
                'Zero Build Step',
                '100% Web Standards',
                'No Transpilation',
                'Instant Page Reloads'
            ]
        }, {
            cls : ['neo-h3'],
            flex: 'none',
            tag : 'h3',

            text: [
                'Neo.mjs is the Application Engine for the AI Era. Build desktop-class, multi-window apps where ',
                'AI agents can see, understand, and control the runtime—enabling the next generation of Conversational UIs.'
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

export default Neo.setupClass(Content);