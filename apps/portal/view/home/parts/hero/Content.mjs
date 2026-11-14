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
         * Accounts for the initial ~460 ms character fade-in plus MagicMoveText's 20 ms cycle
         * offset so the visible stand on "An Agent Institution" measures ~5.0 s.
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
     * Cancels an in-flight initial category hold when the hero deactivates before the hold elapses.
     * @member {AbortController|null} #initialHoldController=null
     * @private
     */
    #initialHoldController = null
    /**
     * @member {Boolean} initialHoldPending=true
     * @protected
     */
    initialHoldPending = true

    /**
     * @summary Displays the opening category phrase for initialHoldDelay before starting autoCycle.
     * @returns {Promise<void>}
     */
    async activate() {
        let me        = this,
            magicMove = me.getItem('magic-move');

        if (me.#initialHoldController || magicMove.autoCycle) {
            return
        }

        if (me.initialHoldPending) {
            me.initialHoldPending = false;

            if (me.initialHoldDelay > 0) {
                const controller = me.#initialHoldController = new AbortController();

                magicMove.cycleText();

                try {
                    await me.timeout(me.initialHoldDelay, {signal: controller.signal})
                } catch (error) {
                    if (error !== Neo.isDestroyed && !(controller.signal.aborted && error === controller.signal.reason)) {
                        throw error
                    }
                    return
                } finally {
                    if (me.#initialHoldController === controller) {
                        me.#initialHoldController = null
                    }
                }

                if (!me.isDestroyed && !controller.signal.aborted) {
                    magicMove.autoCycle = true
                }

                return
            }
        }

        magicMove.autoCycle = true
    }

    /**
     * @summary Cancels any pending hold timer and stops MagicMoveText auto-cycling.
     */
    deactivate() {
        let me = this;

        me.#initialHoldController?.abort();
        me.#initialHoldController = null;
        me.getItem('magic-move').autoCycle = false
    }
}

export default Neo.setupClass(Content);
