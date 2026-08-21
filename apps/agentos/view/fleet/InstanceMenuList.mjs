import MenuList     from '../../../../src/menu/List.mjs';
import {stateClass} from './StateDot.mjs';

/**
 * @summary Resolves the operator-facing label for one configured Fleet instance.
 *
 * The mutable label wins when present; otherwise the canonical endpoint is shown without its
 * scheme. A missing record stays explicit instead of inventing an identity.
 *
 * @param {AgentOS.model.FleetInstance|null} record
 * @returns {String}
 */
export function displayInstanceLabel(record) {
    if (!record) {
        return 'no instance'
    }

    return record.label || String(record.canonicalEndpoint).replace(/^https?:\/\//, '')
}

/**
 * @class AgentOS.view.fleet.InstanceMenuList
 * @extends Neo.menu.List
 *
 * @summary Store-driven floating menu for the Agent OS instance scope control.
 *
 * Profile rows come directly from the provider-owned {@link AgentOS.store.FleetInstances} Store.
 * The list owns presentation and keyboard navigation only: choosing a profile or the terminal
 * manage affordance delegates intent back to its parent InstanceSwitcher. The provider Store is
 * never destroyed with this view.
 */
class InstanceMenuList extends MenuList {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.InstanceMenuList'
         * @protected
         */
        className: 'AgentOS.view.fleet.InstanceMenuList',
        /**
         * @member {String[]} cls=['fm-instance-menu']
         * @reactive
         */
        cls: ['fm-instance-menu'],
        /**
         * The Store belongs to the Viewport state.Provider, not this transient menu.
         * @member {Boolean} autoDestroyStore=false
         */
        autoDestroyStore: false,
        /**
         * @member {Object} _vdom
         */
        _vdom: {
            tag         : 'ul',
            role        : 'menu',
            'aria-label': 'Available Agent OS instances',
            cn          : []
        }
    }

    /**
     * @summary Stable vnode id for the non-record terminal affordance.
     * @returns {String}
     */
    get manageItemId() {
        return `${this.id}__manage`
    }

    /**
     * @summary Preserve provider Store ownership when a binding replaces the Store instance.
     *
     * list.Base assumes view-owned Stores and destroys the old value. This feature consumes an
     * injected provider Store, so it detaches the inherited listeners and returns the new instance
     * verbatim instead.
     *
     * @param {Neo.data.Store} value
     * @param {Neo.data.Store|null} oldValue
     * @returns {Neo.data.Store}
     * @protected
     */
    beforeSetStore(value, oldValue) {
        let me = this;

        oldValue?.un({
            filter      : me.onStoreFilter,
            load        : me.onStoreLoad,
            recordChange: me.onStoreRecordChange,
            sort        : me.onStoreSort,
            scope       : me
        });

        return value
    }

    /**
     * @summary Renders one rich profile row from the FleetInstance record supplied by menu.List.
     *
     * Selection is structural (`is-bound` + `aria-checked`), never hue-alone. The state dot keeps
     * the existing two-channel anatomy while the label, endpoint, and custodian remain literal
     * record projections.
     *
     * @param {AgentOS.model.FleetInstance} record
     * @returns {Object}
     */
    createItemContent(record) {
        let switcher = this.parentComponent,
            bound    = record.profileId === switcher?.boundProfileId,
            rowState = bound ? switcher.instanceState : 'off';

        return {
            cls              : ['fm-instance-row', ...(bound ? ['is-bound'] : [])],
            role             : 'menuitemradio',
            'aria-checked'   : String(bound),
            'data-profile-id': record.profileId,
            title            : record.canonicalEndpoint,
            cn               : [
                {tag: 'span', cls: ['fm-state-dot', stateClass(rowState)], 'aria-hidden': 'true'},
                {tag: 'span', cls: ['fm-instance-row-name'],      text: displayInstanceLabel(record)},
                {tag: 'span', cls: ['fm-instance-row-endpoint'],  text: record.canonicalEndpoint},
                {tag: 'span', cls: ['fm-instance-row-custodian'], text: record.custodian}
            ]
        }
    }

    /**
     * @summary Lets menu.List build the Store-backed profile rows, then appends the one terminal
     * non-record affordance. No profile array is copied or hand-mapped.
     * @param {Boolean} [silent=false]
     */
    createItems(silent=false) {
        let me   = this,
            vdom = me.getVdomRoot();

        super.createItems(true);

        vdom.cn.push(
            {cls: ['fm-instance-menu-sep'], role: 'separator', 'aria-hidden': 'true'},
            {
                id      : me.manageItemId,
                tag     : me.itemTagName,
                cls     : [me.itemCls, 'fm-instance-manage'],
                role    : 'menuitem',
                tabIndex: -1,
                text    : 'Manage instances…'
            }
        );

        !silent && me.promiseUpdate().then(() => me.fire('createItems'))
    }

    /**
     * @summary Activates either a Store-backed profile row or the terminal manage affordance.
     * Keyboard Enter reaches this same path through the framework Navigator's synthetic click.
     * @param {Object} node
     * @param {Object} data
     */
    onItemClick(node, data) {
        let me       = this,
            isManage = node.id === me.manageItemId,
            record   = isManage ? null : me.store.get(me.getItemRecordId(node.id));

        data.record = record;
        me.fire('itemClick', {record});
        me.unmount();

        if (isManage) {
            me.parentComponent?.onInstanceMenuManage()
        } else if (record) {
            me.parentComponent?.onInstanceMenuSelect(record)
        }
    }

    /**
     * @summary Surgically refreshes the old/new bound rows without rebuilding the Store-backed set.
     * @param {...String|null} profileIds
     */
    refreshBoundRows(...profileIds) {
        let me      = this,
            changed = false,
            {store} = me;

        [...new Set(profileIds.filter(Boolean))].forEach(profileId => {
            let record = store.get(profileId),
                index  = record && store.indexOf(record);

            if (record && index > -1) {
                me.vdom.cn[index] = me.createItem(record, index);
                changed = true
            }
        });

        changed && me.update()
    }

    /**
     * @summary Gives the parent button the concrete menu instance after lazy construction.
     */
    onConstructed() {
        super.onConstructed();
        Object.assign(this.getVdomRoot(), {
            role        : 'menu',
            'aria-label': 'Available Agent OS instances'
        });
        this.parentComponent?.onInstanceMenuReady(this)
    }

    /**
     * @summary Keeps the trigger's expanded state synchronized for Escape, focus-leave, selection,
     * and explicit button-toggle dismissal paths.
     */
    unmount() {
        this.parentComponent?.syncMenuExpanded(false);
        super.unmount()
    }
}

export default Neo.setupClass(InstanceMenuList);
