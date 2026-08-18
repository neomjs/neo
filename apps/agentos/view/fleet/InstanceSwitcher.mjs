import Component    from '../../../../src/component/Base.mjs';
import {stateClass} from './StateDot.mjs';

/**
 * The instance-connection WORD per state key — the text channel of the two-channel rule. The dot
 * reuses the session-state COLOR tokens (via `stateClass`), but the words are connection-speak:
 * an instance is "connected", never "working" — borrowed agent-session words would claim a
 * liveness semantics the transport verdict does not carry. Unknown keys degrade to the honest
 * "not connected".
 * @type {Object}
 */
const INSTANCE_STATE_WORDS = {
    limited : 'degraded',
    ok      : 'connected',
    off     : 'not connected',
    starting: 'switching'
};

/**
 * @class AgentOS.view.fleet.InstanceSwitcher
 * @extends Neo.component.Base
 *
 * @summary The top-chrome instance scope control — the ONE place the bound Agent OS
 * instance is named and switched. An affordance-class chip (§06 T2 third class: an action, never
 * an observation) composing dot + label + caret, with a reveal/dismiss profile menu.
 *
 * Honesty contract, mirroring the activity stream's actor chip: identity is rendered as GIVEN —
 * the roster rides the injected {@link #instanceStore} (provider-scoped, the C1 view binding), the
 * bound fact rides {@link #boundProfileId} (mirrored from the published bridge's `profileId`, the
 * SSOT), the connection state rides {@link #instanceState} (the spine banner's derived word, one
 * truth). The component reaches for NOTHING itself and fires intent events only — the switch, the
 * manage-surface open: `switchinstance` / `manageinstances`; the controller owns every action.
 *
 * Two-channel rule (§06 law-1): the dot carries hue via the state class (one token indirection);
 * the accessible name carries the words — `Instance: <label> — <state word>` is the TESTED surface
 * (the review-adopted AC), so no refactor can keep the visual law while dropping the text channel.
 * An unreachable instance stays pickable in the menu: a broken profile must remain fixable from
 * the UI that manages profiles.
 */
class InstanceSwitcher extends Component {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.InstanceSwitcher'
         * @protected
         */
        className: 'AgentOS.view.fleet.InstanceSwitcher',
        /**
         * @member {String[]} cls=['fm-instance-switcher']
         * @reactive
         */
        cls: ['fm-instance-switcher'],
        /**
         * The profileId of the currently BOUND instance — mirrored from the published bridge
         * (`AgentOS.fleet.registryBridge.profileId`) by the switch/boot owner; never derived here.
         * @member {String|null} boundProfileId_=null
         * @reactive
         */
        boundProfileId_: null,
        /**
         * The bound instance's connection state as a session-state KEY (`ok` / `limited` /
         * `starting` / `off`) — the spine banner's verdict mapped once at its write point, so the
         * chrome dot and the banner can never disagree.
         * @member {String} instanceState_='off'
         * @reactive
         */
        instanceState_: 'off',
        /**
         * The provider-scoped configured-instances Store (C1 records). Injected via bind — the
         * switcher never creates or reaches for a store.
         * @member {Neo.data.Store|null} instanceStore_=null
         * @reactive
         */
        instanceStore_: null,
        /**
         * Whether the profile menu is open (reveal/dismiss class, §06 T4).
         * @member {Boolean} menuOpen_=false
         * @reactive
         */
        menuOpen_: false,
        /**
         * @member {Object[]} domListeners
         */
        domListeners: [{
            click   : 'onSwitcherTriggerClick',
            delegate: '.fm-instance-trigger'
        }, {
            click   : 'onSwitcherRowClick',
            delegate: '.fm-instance-row'
        }, {
            click   : 'onSwitcherManageClick',
            delegate: '.fm-instance-manage'
        }]
    }

    /**
     * @summary Store swap: re-render on roster load so a persisted roster arriving after mount
     * updates the label without a reactive-data detour. Cleans the old listener on replace.
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @protected
     */
    afterSetInstanceStore(value, oldValue) {
        let me = this;

        oldValue?.un('load', me.onRosterLoad, me);
        value?.on('load', me.onRosterLoad, me);
        me.updateSwitcher()
    }

    /**
     * @summary Bound-instance change re-renders chip + menu marking.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetBoundProfileId(value, oldValue) {
        this.updateSwitcher()
    }

    /**
     * @summary State change re-renders the dot class + the accessible name's state word.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetInstanceState(value, oldValue) {
        this.updateSwitcher()
    }

    /**
     * @summary Menu open/close re-renders the reveal panel.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMenuOpen(value, oldValue) {
        this.updateSwitcher()
    }

    /**
     * @summary Roster load handler — the label may only now be resolvable.
     * @protected
     */
    onRosterLoad() {
        this.updateSwitcher()
    }

    /**
     * @summary The bound instance's roster record, or `null` while the roster lacks it (the boot
     * default before seeding, or a retired row) — absence renders as the endpoint-derived
     * fallback, never an invented identity.
     * @returns {Object|null}
     */
    get boundRecord() {
        let me = this;

        return (me.boundProfileId && me.instanceStore?.get(me.boundProfileId)) || null
    }

    /**
     * @summary Display label for one profile record: the mutable UX label when set, else the
     * canonical endpoint stripped of its scheme — honest identity, never a fabricated name.
     * @param {Object|null} record
     * @returns {String}
     */
    displayLabel(record) {
        if (!record) {
            return 'no instance'
        }

        return record.label || String(record.canonicalEndpoint).replace(/^https?:\/\//, '')
    }

    /**
     * @summary One menu row config for a profile record. Selection is structural (`is-bound` class
     * → border + weight, the selector-chip precedent), never hue-alone; the custodian badge is
     * micro-tier text.
     * @param {Object} record
     * @returns {Object}
     */
    menuRowVdom(record) {
        let me       = this,
            bound    = record.profileId === me.boundProfileId,
            rowState = bound ? me.instanceState : 'off';

        return {
            tag              : 'button',
            cls              : ['fm-instance-row', ...(bound ? ['is-bound'] : [])],
            role             : 'menuitemradio',
            'aria-checked'   : String(bound),
            'data-profile-id': record.profileId,
            title            : record.canonicalEndpoint,
            cn               : [
                {tag: 'span', cls: ['fm-state-dot', stateClass(rowState)], 'aria-hidden': 'true'},
                {tag: 'span', cls: ['fm-instance-row-name'],      text: me.displayLabel(record)},
                {tag: 'span', cls: ['fm-instance-row-endpoint'],  text: record.canonicalEndpoint},
                {tag: 'span', cls: ['fm-instance-row-custodian'], text: record.custodian}
            ]
        }
    }

    /**
     * @summary Composes chip + (open) menu into the component vdom — the one render path every
     * reactive config funnels through (the EventChip/ActorChip idiom).
     * @protected
     */
    updateSwitcher() {
        let me     = this,
            record = me.boundRecord,
            label  = me.displayLabel(record),
            word   = Object.hasOwn(INSTANCE_STATE_WORDS, me.instanceState) ? INSTANCE_STATE_WORDS[me.instanceState] : INSTANCE_STATE_WORDS.off,
            rows   = me.instanceStore?.items ?? [];

        me.vdom.cn = [{
            tag            : 'button',
            cls            : ['fm-instance-trigger'],
            'aria-haspopup': 'menu',
            'aria-expanded': String(me.menuOpen),
            'aria-label'   : `Instance: ${label} — ${word}`,
            title          : `${label} — ${word}`,
            cn             : [
                {tag: 'span', cls: ['fm-state-dot', stateClass(me.instanceState)], 'aria-hidden': 'true'},
                {tag: 'span', cls: ['fm-instance-label'], text: label},
                {tag: 'span', cls: ['fm-instance-caret'], 'aria-hidden': 'true', text: '▾'}
            ]
        },
        ...(me.menuOpen ? [{
            cls : ['fm-instance-menu'],
            role: 'menu',
            cn  : [
                ...rows.map(row => me.menuRowVdom(row)),
                {cls: ['fm-instance-menu-sep'], 'aria-hidden': 'true'},
                {tag: 'button', cls: ['fm-instance-manage'], role: 'menuitem', text: 'Manage instances…'}
            ]
        }] : [])];

        me.update()
    }

    /**
     * @summary Trigger click toggles the menu (reveal/dismiss).
     * @param {Object} data
     */
    onSwitcherTriggerClick(data) {
        this.menuOpen = !this.menuOpen
    }

    /**
     * @summary Row click: closes the menu and fires the switch INTENT — the controller owns the
     * custody path; picking the already-bound row is a no-op close, never a churn reconnect.
     * @param {Object} data
     */
    onSwitcherRowClick(data) {
        let me        = this,
            profileId = data.path?.find(node => node.data?.profileId)?.data?.profileId;

        me.menuOpen = false;

        if (profileId && profileId !== me.boundProfileId) {
            me.fire('switchinstance', {profileId, source: me})
        }
    }

    /**
     * @summary Manage-row click: closes the menu and fires the manage-surface INTENT.
     * @param {Object} data
     */
    onSwitcherManageClick(data) {
        this.menuOpen = false;
        this.fire('manageinstances', {source: this})
    }

    /**
     * @summary Detach the roster listener with the component.
     * @param args
     */
    destroy(...args) {
        this.instanceStore?.un('load', this.onRosterLoad, this);
        super.destroy(...args)
    }
}

export default Neo.setupClass(InstanceSwitcher);
