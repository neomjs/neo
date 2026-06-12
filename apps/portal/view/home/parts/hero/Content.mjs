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
                'Self-Evolving Software Organism',
                'Professional AI Engineering Team',
                'The Application Engine for the AI Era',
                'Conversational UIs',
                'Agentic Control',
                'Neural Link Possession Interface',
                'Active Hybrid GraphRAG',
                'The Dream Pipeline',
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
                'Neo.mjs is a self-evolving software organism: a professional AI engineering team whose cross-model ',
                'swarm inhabits live apps through Neural Link, Active Hybrid GraphRAG, DreamService, and self-healing loops.'
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
