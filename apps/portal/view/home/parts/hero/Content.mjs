import BaseContainer     from '../../../../../../src/container/Base.mjs';
import Button            from '../../../../../../src/button/Base.mjs';
import MagicMoveText     from '../../../../../../src/component/MagicMoveText.mjs';

/**
 * @summary Hero foreground container holding the category headline, value proposition, and primary CTAs.
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
        /**
         * Hold duration in ms for the opening category phrase before auto-cycling starts.
         * @member {Number} initialHoldDelay=5300
         */
        initialHoldDelay: 5300,

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
                'An Agent Institution',
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
                'Neo.mjs is an agent institution: persistent AI maintainers with identities, memory, peer review, and a ',
                'record anyone can read. Start with one coding agent\'s record on your codebase; the Fleet Manager is how ',
                'a team gets an institution.'
            ].join('')
        }, {
            ntype: 'container',
            cls  : ['button-group'],
            flex : 'none',
            items: [{
                module: Button,
                cls   : ['get-started-button'],
                flex  : 'none',
                route : '/learn/gettingstarted/Setup',
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
     * @member {Boolean} initialHoldPending=true
     * @protected
     */
    initialHoldPending = true
    /**
     * @member {Number|null} initialHoldTimeoutId=null
     * @protected
     */
    initialHoldTimeoutId = null

    /**
     * @summary Displays the opening category phrase for initialHoldDelay before starting autoCycle.
     */
    activate() {
        let me        = this,
            magicMove = me.getItem('magic-move');

        if (me.initialHoldTimeoutId !== null || magicMove.autoCycle) {
            return
        }

        if (me.initialHoldPending) {
            me.initialHoldPending = false;

            if (me.initialHoldDelay > 0) {
                magicMove.cycleText();

                me.initialHoldTimeoutId = setTimeout(() => {
                    me.initialHoldTimeoutId = null;

                    if (!me.isDestroyed) {
                        magicMove.autoCycle = true
                    }
                }, me.initialHoldDelay);

                return
            }
        }

        magicMove.autoCycle = true
    }

    /**
     * @summary Cancels any pending initial category hold timer.
     */
    clearInitialHoldTimeout() {
        let me = this;

        if (me.initialHoldTimeoutId !== null) {
            clearTimeout(me.initialHoldTimeoutId);
            me.initialHoldTimeoutId = null
        }
    }

    /**
     * @summary Cancels any pending hold timer and stops MagicMoveText auto-cycling.
     */
    deactivate() {
        this.clearInitialHoldTimeout();
        this.getItem('magic-move').autoCycle = false
    }

    /**
     * @summary Clears any pending initial hold timer before destroying the container.
     * @param {...*} args
     */
    destroy(...args) {
        this.clearInitialHoldTimeout();
        super.destroy(...args)
    }
}

export default Neo.setupClass(Content);
