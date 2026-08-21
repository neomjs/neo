import Button                                   from '../../../../src/button/Base.mjs';
import InstanceMenuList, {displayInstanceLabel} from './InstanceMenuList.mjs';
import {stateClass}                             from './StateDot.mjs';

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
 * @extends Neo.button.Base
 *
 * @summary The top-chrome instance scope control — a real framework button whose floating,
 * Store-backed menu owns keyboard navigation, focus-leave dismissal, alignment, and layering.
 *
 * Identity is rendered as GIVEN: the roster rides the injected {@link #instanceStore}, the bound
 * fact rides {@link #boundProfileId}, and the connection state rides {@link #instanceState}. The
 * switcher reaches for nothing itself and fires the unchanged `switchinstance` / `manageinstances`
 * intent contracts. Its accessible name remains the tested text channel:
 * `Instance: <label> — <state word>`.
 */
class InstanceSwitcher extends Button {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.InstanceSwitcher'
         * @protected
         */
        className: 'AgentOS.view.fleet.InstanceSwitcher',
        /**
         * @member {String[]} cls=['fm-instance-switcher','fm-instance-trigger']
         * @reactive
         */
        cls: ['fm-instance-switcher', 'fm-instance-trigger'],
        /**
         * The profileId of the currently bound instance, mirrored from the published bridge.
         * @member {String|null} boundProfileId_=null
         * @reactive
         */
        boundProfileId_: null,
        /**
         * The bound instance's connection-state key.
         * @member {String} instanceState_='off'
         * @reactive
         */
        instanceState_: 'off',
        /**
         * The provider-scoped configured-instances Store. Injected via binding.
         * @member {Neo.data.Store|null} instanceStore_=null
         * @reactive
         */
        instanceStore_: null,
        /**
         * The scope chip has no transient ink-ripple layer.
         * @member {Boolean} useRippleEffect=false
         * @reactive
         */
        useRippleEffect: false
    }

    /**
     * @summary Store swap: update the trigger on roster load and hand the exact provider Store to
     * the menu. The menu preserves external ownership.
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @protected
     */
    afterSetInstanceStore(value, oldValue) {
        let me = this;

        oldValue?.un('load', me.onRosterLoad, me);
        value?.on('load', me.onRosterLoad, me);

        if (value && me.menuList && me.menuList.store !== value) {
            me.menuList.store = value
        } else if (value && me.isConstructed) {
            me.ensureInstanceMenu()
        }

        me.updateSwitcher()
    }

    /**
     * @summary Bound-instance changes update the trigger plus only the old/new structural row marks.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetBoundProfileId(value, oldValue) {
        this.updateSwitcher();
        this.menuList?.refreshBoundRows(value, oldValue)
    }

    /**
     * @summary State-word changes update the trigger only. The menu's Store-backed row set is not
     * rebuilt; its bound dot refreshes on the next open.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetInstanceState(value, oldValue) {
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
     * @summary The bound instance's roster record, or null while the roster lacks it.
     * @returns {AgentOS.model.FleetInstance|null}
     */
    get boundRecord() {
        let me = this;

        return (me.boundProfileId && me.instanceStore?.get(me.boundProfileId)) || null
    }

    /**
     * @summary Compatibility-facing label resolver retained for callers and tests.
     * @param {AgentOS.model.FleetInstance|null} record
     * @returns {String}
     */
    displayLabel(record) {
        return displayInstanceLabel(record)
    }

    /**
     * @summary Creates the framework menu config once the provider Store binding is available.
     * @protected
     */
    ensureInstanceMenu() {
        let me = this;

        if (!me.menu && me.instanceStore) {
            me.menu = {
                module: InstanceMenuList,
                store : me.instanceStore
            }
        }
    }

    /**
     * @summary Lazy menu-construction callback. Reconciles a Store binding that changed while the
     * framework import was resolving.
     * @param {AgentOS.view.fleet.InstanceMenuList} menu
     */
    onInstanceMenuReady(menu) {
        if (this.instanceStore && menu.store !== this.instanceStore) {
            menu.store = this.instanceStore
        }

        this.syncMenuTheme(menu);
        menu.refreshBoundRows(this.boundProfileId)
    }

    /**
     * @summary Profile selection intent; choosing the already-bound row is a no-op.
     * @param {AgentOS.model.FleetInstance} record
     */
    onInstanceMenuSelect(record) {
        if (record.profileId !== this.boundProfileId) {
            this.fire('switchinstance', {profileId: record.profileId, source: this})
        }
    }

    /**
     * @summary Terminal menu-affordance intent. The ViewportController contract is unchanged.
     */
    onInstanceMenuManage() {
        this.fire('manageinstances', {source: this})
    }

    /**
     * @summary Synchronizes the native trigger's expanded state with every menu dismissal path.
     * @param {Boolean} expanded
     */
    syncMenuExpanded(expanded) {
        this.changeVdomRootKey('aria-expanded', String(expanded))
    }

    /**
     * @summary Projects the owner viewport's current skin onto the body-level menu. A floating
     * component is logically parented to this button but DOM-parented to body; component.Base
     * therefore suppresses the "inherited" theme class even though DOM inheritance comes from the
     * body's different skin. Keep the config plus concrete class aligned at that seam.
     * @param {AgentOS.view.fleet.InstanceMenuList} menu
     */
    syncMenuTheme(menu) {
        let theme = this.getTheme(),
            cls   = menu.cls.filter(value => !value.startsWith('neo-theme-'));

        if (theme) {
            menu.theme = theme;
            cls.push(theme)
        }

        menu.cls = cls
    }

    /**
     * @summary Uses button.Base's menu visibility path, refreshing only the bound row before an
     * opening and moving focus into the list so arrows, Enter, Escape, and focus-leave are active.
     * @returns {Promise<void>}
     */
    async toggleMenu() {
        let me         = this,
            {menuList} = me;

        if (!menuList) {
            me.ensureInstanceMenu();
            return
        }

        if (menuList.hidden) {
            // A floating menu is a document.body child, so it cannot inherit a later viewport skin
            // switch. Resolve the currently rendered owner theme at every open.
            me.syncMenuTheme(menuList);
            menuList.refreshBoundRows(me.boundProfileId)
        }

        await super.toggleMenu();

        me.syncMenuExpanded(!menuList.hidden);
        !menuList.hidden && menuList.focus()
    }

    /**
     * @summary Updates only the real button trigger: rich label children, title, and accessible
     * state. The floating menu is a separate Store-driven component and is never reconstructed here.
     * @protected
     */
    updateSwitcher() {
        let me       = this,
            label    = displayInstanceLabel(me.boundRecord),
            word     = Object.hasOwn(INSTANCE_STATE_WORDS, me.instanceState) ? INSTANCE_STATE_WORDS[me.instanceState] : INSTANCE_STATE_WORDS.off,
            expanded = Boolean(me.menuList && !me.menuList.hidden),
            root     = me.getVdomRoot();

        me.text = [
            {tag: 'span', cls: ['fm-state-dot', stateClass(me.instanceState)], 'aria-hidden': 'true'},
            {tag: 'span', cls: ['fm-instance-label'], text: label},
            {tag: 'span', cls: ['fm-instance-caret'], 'aria-hidden': 'true', text: '▾'}
        ];

        Object.assign(root, {
            'aria-haspopup': 'menu',
            'aria-expanded': String(expanded),
            'aria-label'   : `Instance: ${label} — ${word}`,
            title          : `${label} — ${word}`
        });

        me.update()
    }

    /**
     * @summary Completes lazy menu setup after every config and binding has settled.
     */
    onConstructed() {
        super.onConstructed();
        this.ensureInstanceMenu();
        this.updateSwitcher()
    }

    /**
     * @summary Detaches the roster listener; button.Base destroys the transient menu, whose
     * autoDestroyStore=false contract preserves the provider Store.
     * @param {...*} args
     */
    destroy(...args) {
        this.instanceStore?.un('load', this.onRosterLoad, this);
        super.destroy(...args)
    }
}

export default Neo.setupClass(InstanceSwitcher);
