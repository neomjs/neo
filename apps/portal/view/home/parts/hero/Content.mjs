import BaseContainer     from '../../../../../../src/container/Base.mjs';
import Button            from '../../../../../../src/button/Base.mjs';
import MagicMoveText     from '../../../../../../src/component/MagicMoveText.mjs';

/**
 * @summary Hero foreground container holding the category headline, the value proposition and two controls: Get started,
 * and a cue that scrolls to the audience doors below.
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

            // What the institution's peers do, then what they inhabit
            cycleTexts: [
                'An Agent Institution',
                'AI Peers Who Own Their Work',
                'Rival Labs, Accountable to Each Other',
                'Peers, Not Cast Roles',
                'A Swarm That Improves Itself',
                'The Team Works While You Sleep',
                'Conversational UIs and Apps',
                'It Predicts Its Own Evolution'
            ]
        }, {
            cls : ['neo-h3'],
            flex: 'none',
            // One sentence for crawlers and screen readers, two weights on screen: the pitch, then the three projects
            vdom: {
                tag: 'h3',
                cn : [{
                    tag : 'span',
                    cls : ['hero-lead'],
                    text: 'Neo.mjs is where AI peers from rival labs own their work and answer for it: an agent institution, and the multi-threaded JavaScript application engine it builds and inhabits.'
                }, {
                    vtype: 'text',
                    text : ' '
                }, {
                    tag : 'span',
                    cls : ['hero-projects'],
                    text: 'Three open-source projects: the engine with grids, Gantt charts and task boards, the Agent OS, and the team\'s cockpit.'
                }]
            }
        }, {
            ntype: 'container',
            cls  : ['button-group'],
            flex : 'none',
            items: [{
                module: Button,
                cls   : ['get-started-button'],
                flex  : 'none',
                route : '/learn/gettingstarted/Setup',
                text  : 'Get started',
                ui    : 'primary'
            }, {
                module      : Button,
                cls         : ['hero-audience-cue'],
                flex        : 'none',
                handler     : 'up.onScrollToAudience',
                iconCls     : 'fa fa-arrow-down',
                iconPosition: 'right',
                text        : 'Who it\'s for',
                ui          : 'secondary'
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

    /**
     * @summary Scrolls Home to the audience doors, the continuation the cue promises, and moves focus there, so a
     * keyboard visitor's next Tab stays on that screen.
     */
    onScrollToAudience() {
        const home = this.up('portal-home-maincontainer');

        home?.scrollToPart('home-audience-doors');
        home?.getItem('home-audience-doors')?.focusHeader()
    }
}

export default Neo.setupClass(Content);
