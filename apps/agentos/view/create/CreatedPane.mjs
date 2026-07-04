import Button            from '../../../../src/button/Base.mjs';
import Container         from '../../../../src/container/Base.mjs';
import Label             from '../../../../src/component/Label.mjs';
import StateProvider     from '../../../../src/state/Provider.mjs';
import CreatedInstances  from './store/CreatedInstances.mjs';
import {CREATION_EVENTS} from './util/creationFlowState.mjs';

/**
 * @class AgentOS.view.create.CreatedPane
 * @extends Neo.container.Base
 *
 * @summary Registry-owned chrome for a keeper-created live widget. The pane is the render target:
 * the child component remains the mutation target (`instanceId`), while `paneRef` records the
 * wrapper id so lifecycle controls destroy chrome + content together.
 *
 * The title reads the CreatedInstances registry record through a per-pane state.Provider. Storing
 * the record in provider data lets the provider's record-field bridge re-run bindings when
 * `CreatedInstances.markMutated()` retitles the registry entry, without reaching into the child
 * component tree or duplicating title state on the pane.
 */
class CreatedPane extends Container {
    static config = {
        /**
         * @member {String} className='AgentOS.view.create.CreatedPane'
         * @protected
         */
        className: 'AgentOS.view.create.CreatedPane',
        /**
         * @member {String} ntype='agentos-created-pane'
         * @protected
         */
        ntype: 'agentos-created-pane',
        /**
         * The live widget component config inserted into the pane body.
         * @member {Object|Neo.component.Base|null} content=null
         * @reactive
         */
        content_: null,
        /**
         * @member {String[]} cls=['agentos-created-pane']
         * @reactive
         */
        cls: ['agentos-created-pane'],
        /**
         * @member {String|null} instanceId=null
         * @reactive
         */
        instanceId_: null,
        /**
         * Optional unit/live seam for moving this pane into another render target. A real popup
         * surface can inject a container; tests inject the same `add()` seam used by the multi-window
         * demos.
         * @member {Function|Neo.container.Base|null} promoteTarget=null
         * @reactive
         */
        promoteTarget_: null,
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * Per-pane binding surface. The parent create-module provider remains the flow-state owner.
         * @member {Object} stateProvider
         */
        stateProvider: {
            module: StateProvider,
            data  : {
                lastPromoteReason: null,
                promoted         : false,
                record           : null
            }
        },
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls   : ['agentos-created-pane-header'],
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                module   : Label,
                reference: 'created-pane-title',
                cls      : ['agentos-created-pane-title'],
                flex     : 1,
                bind     : {text: 'record.title'}
            }, {
                module : Button,
                cls    : ['agentos-created-pane-promote'],
                iconCls: 'far fa-window-maximize',
                text   : 'Promote',
                handler: 'up.onPromote',
                bind   : {disabled: data => data.promoted}
            }, {
                module : Button,
                cls    : ['agentos-created-pane-dispose'],
                iconCls: 'fa fa-trash',
                text   : 'Dispose',
                handler: 'up.onDispose'
            }]
        }, {
            module   : Container,
            reference: 'created-pane-body',
            cls      : ['agentos-created-pane-body'],
            flex     : 1,
            layout   : {ntype: 'fit'}
        }]
    }

    /**
     * @protected
     */
    afterSetContent(value, oldValue) {
        if (this.isConstructed) {
            this.mountContent()
        }
    }

    /**
     * @protected
     */
    afterSetInstanceId(value, oldValue) {
        if (this.isConstructed) {
            this.syncRecord()
        }
    }

    /**
     * @protected
     */
    onConstructed() {
        super.onConstructed();

        this.mountContent();
        this.syncRecord()
    }

    /**
     * Inserts the accepted widget config into the body slot exactly once.
     * @returns {Neo.component.Base|null}
     */
    mountContent() {
        const
            body    = this.down({reference: 'created-pane-body'}),
            content = this.content;

        if (!body || !content || body.items?.length) {
            return body?.items?.[0] || null
        }

        return body.add(content, true)
    }

    /**
     * Registry-driven title binding anchor.
     * @returns {Object|null}
     */
    syncRecord() {
        const record = this.instanceId ? CreatedInstances.resolveTarget({instanceId: this.instanceId}) : null;

        this.setState('record', record);

        return record
    }

    /**
     * Disposes the keeper-owned pane and its content, then moves the parent flow back to empty.
     * @returns {{accepted: Boolean, reason: String|null, record: Object|null}}
     */
    onDispose() {
        const
            me           = this,
            flowProvider = me.stateProvider?.getParent?.(),
            result       = CreatedInstances.markDisposed(me.instanceId);

        if (result.accepted) {
            flowProvider?.setData({activeInstanceId: null});
            flowProvider?.applyFlowEvent?.(CREATION_EVENTS.DISPOSE);
            me.destroy()
        }

        return result
    }

    /**
     * Moves the pane into an injected render target; the registry record and child instance id stay
     * untouched, matching the shared-worker "windows are render targets" topology.
     * @returns {{accepted: Boolean, reason: String|null, pane: AgentOS.view.create.CreatedPane|null}}
     */
    onPromote() {
        const
            me              = this,
            {promoteTarget} = me,
            target          = Neo.isFunction(promoteTarget) ? promoteTarget({pane: me, instanceId: me.instanceId, record: me.syncRecord()}) : promoteTarget;

        if (!target || typeof target.add !== 'function') {
            const reason = 'no promote target available for created pane';

            me.setState({lastPromoteReason: reason, promoted: false});
            return {accepted: false, reason, pane: null}
        }

        target.add(me);
        me.setState({lastPromoteReason: null, promoted: true});

        return {accepted: true, reason: null, pane: me}
    }
}

export default Neo.setupClass(CreatedPane);
