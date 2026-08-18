import Component from '../../../../src/component/Base.mjs';

/**
 * The actor-identity chip: an avatar-first badge naming WHO acted, composed by the activity
 * stream's rows (and any future feed row that carries an actor). Avatar when the roster join
 * supplies one, handle text always — the fast-recognition anchor pattern the agent cards
 * established. The chip renders an IDENTITY it is given and nothing else: no roster reach, no
 * fallback identity, no derivation — a row without an actor simply composes no chip (honest
 * absence is the consumer's contract, not a blank chip's).
 *
 * Chip mechanics deliberately follow the cockpit chip family's direction (one designed system);
 * if the unified family lands with a different anatomy, this specimen reconciles to it rather
 * than forking the vocabulary.
 *
 * @class AgentOS.view.fleet.ActorChip
 * @extends Neo.component.Base
 */
class ActorChip extends Component {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.ActorChip'
         * @protected
         */
        className: 'AgentOS.view.fleet.ActorChip',
        /**
         * @member {String} ntype='fm-actor-chip'
         * @protected
         */
        ntype: 'fm-actor-chip',
        /**
         * @member {String[]} baseCls=['fm-actor-chip']
         */
        baseCls: ['fm-actor-chip'],
        /**
         * @member {String} tag='span'
         * @protected
         * @reactive
         */
        tag: 'span',
        /**
         * The actor's canonical id (`@`-form or bare) — the chip's text when no display label is
         * supplied, and the hover title always (the citable identity).
         * @member {String|null} agentId_=null
         * @reactive
         */
        agentId_: null,
        /**
         * Roster-joined avatar URL; absent renders the handle-only chip — never a placeholder
         * image posing as an identity.
         * @member {String|null} avatarUrl_=null
         * @reactive
         */
        avatarUrl_: null,
        /**
         * Optional display label (roster `displayName`); the canonical id stays on the title.
         * @member {String|null} label_=null
         * @reactive
         */
        label_: null
    }

    /** @param {String|null} value @param {String|null} oldValue @protected */
    afterSetAgentId(value, oldValue) {
        this.updateChip()
    }

    /** @param {String|null} value @param {String|null} oldValue @protected */
    afterSetAvatarUrl(value, oldValue) {
        this.updateChip()
    }

    /** @param {String|null} value @param {String|null} oldValue @protected */
    afterSetLabel(value, oldValue) {
        this.updateChip()
    }

    /**
     * @summary Rebuild the chip vdom: optional avatar image + the actor text, with the canonical
     * id on the title for citation. An absent agentId renders empty — the consumer owns absence.
     * @protected
     */
    updateChip() {
        const
            me      = this,
            agentId = me.agentId,
            text    = me.label || agentId || '';

        me.vdom.title = agentId || null;
        me.vdom.cn    = [
            ...(me.avatarUrl ? [{tag: 'img', cls: ['fm-actor-chip-avatar'], src: me.avatarUrl, alt: '', 'aria-hidden': 'true'}] : []),
            {tag: 'span', cls: ['fm-actor-chip-text'], text}
        ];

        me.update()
    }
}

export default Neo.setupClass(ActorChip);
