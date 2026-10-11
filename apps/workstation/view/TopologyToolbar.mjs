import Toolbar            from '../../../src/toolbar/Base.mjs';
import TransactionManager from '../../../src/manager/Transaction.mjs';

/**
 * @summary Workstation's topology controls, borrowing its workspace and inherited provider.
 * History reads the Group provider directly; this view creates no state, store or transaction owner.
 * @class Workstation.view.TopologyToolbar
 * @extends Neo.toolbar.Base
 */
class TopologyToolbar extends Toolbar {
    static config = {
        /** @member {String} className='Workstation.view.TopologyToolbar' */
        className: 'Workstation.view.TopologyToolbar',
        /** @member {String[]} cls */
        cls: ['workstation-topologybar'],
        /** @member {String} flex='none' */
        flex: 'none',
        /** @member {Object} layout */
        layout: {ntype: 'flexbox', align: 'center', direction: 'row', wrap: 'wrap'},
        /** @member {String} reference='topology-toolbar' */
        reference: 'topology-toolbar',
        /** @member {Workstation.view.Workspace|null} workspace=null Borrowed command and Group address. */
        workspace: null
    }

    /**
     * @summary Binds the controls to this instance's borrowed workspace before its items materialize.
     * Provider formatters run with the provider as scope, so closures retain the workspace while
     * their live Group reads remain normal reactive dependencies. Commands stay on their owners.
     * @param {Object} config
     */
    construct(config) {
        const me        = this,
              workspace = config.workspace ?? me.workspace;

        super.construct({
            actions: [{
                action: 'undo',
                bind  : {
                    badgeText: () => me.historyStepBadge(provider => provider.getData('historyCursor') + 1),
                    disabled : () => TransactionManager.getProvider(workspace.topologyGroupId)?.getData('canUndo') !== true
                },
                handler    : () => TransactionManager.undo({groupId: workspace.topologyGroupId}),
                iconCls    : 'fa fa-rotate-left',
                showOnFocus: false,
                text       : 'Undo'
            }, {
                action: 'redo',
                bind  : {
                    badgeText: () => me.historyStepBadge(provider =>
                        provider.getData('historyLength') - 1 - provider.getData('historyCursor')),
                    disabled : () => TransactionManager.getProvider(workspace.topologyGroupId)?.getData('canRedo') !== true
                },
                handler    : () => TransactionManager.redo({groupId: workspace.topologyGroupId}),
                iconCls    : 'fa fa-rotate-right',
                showOnFocus: false,
                text       : 'Redo'
            }],
            items: [{
                ntype  : 'button',
                bind   : {disabled: data => !data.dock.perspective.modified},
                handler: () => workspace.resetTopology(),
                iconCls: 'fa fa-rotate-left',
                text   : 'Reset to default'
            }],
            ...config
        })
    }

    /**
     * @summary Reads the available history count from its Group provider, or no badge for zero.
     * A missing or retired Group has neither enabled history actions nor a surviving badge.
     * @param {Function} count Reads the desired count from the Group provider.
     * @returns {String|null}
     * @protected
     */
    historyStepBadge(count) {
        const provider = TransactionManager.getProvider(this.workspace.topologyGroupId),
              steps    = provider ? count(provider) : 0;

        return Number.isFinite(steps) && steps > 0 ? `${steps}` : null
    }

}

export default Neo.setupClass(TopologyToolbar);
