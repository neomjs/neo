import Toolbar            from '../../../src/toolbar/Base.mjs';
import TransactionManager from '../../../src/manager/Transaction.mjs';

/**
 * @summary Workstation's topology controls, borrowing its workspace and inherited provider.
 * The controller fills the recovery buttons through this toolbar's reference. History reads the
 * Group provider directly; this view creates no state, store or transaction owner.
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
        /** @member {Object} layout The controls wrap beside the recovery buttons. */
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
              workspace = config.workspace ?? me.workspace,
              lineState = data => ({additionalWindows: data.topology.additionalWindows, modified: data.dock.perspective.modified});

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
            // Recovery buttons join these ordinary items; the controller identifies its own
            // buttons explicitly and never counts the action spacer or another owner's items.
            items: [{
                ntype  : 'button',
                handler: 'onSaveTopology',
                text   : 'Save workspace'
            }, {
                ntype  : 'button',
                handler: 'closeTopology',
                text   : 'Close workspace'
            }, {
                ntype  : 'button',
                bind   : {disabled: data => !data.dock.perspective.modified},
                handler: () => workspace.resetTopology(),
                iconCls: 'fa fa-rotate-left',
                text   : 'Reset to default'
            }, {
                ntype: 'component',
                bind : {
                    hidden: data => !TopologyToolbar.topologyStateText(lineState(data)),
                    html  : data => TopologyToolbar.topologyStateText(lineState(data))
                },
                cls : ['workstation-topology-state'],
                flex: 'none'
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

    /**
     * @summary Formats committed window count and declared-perspective departure, hiding an empty line.
     * @param {Object} [state={}]
     * @param {Number} [state.additionalWindows=0]
     * @param {Boolean} [state.modified=false]
     * @returns {String}
     */
    static topologyStateText({additionalWindows=0, modified=false}={}) {
        const parts = [];

        if (modified)               parts.push('Modified from default');
        else if (additionalWindows) parts.push('Default arrangement');

        if (additionalWindows) parts.push(`${additionalWindows} additional window${additionalWindows === 1 ? '' : 's'}`);

        return parts.join(' · ')
    }
}

export default Neo.setupClass(TopologyToolbar);
