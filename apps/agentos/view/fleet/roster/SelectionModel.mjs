import ListModel from '../../../../../src/selection/ListModel.mjs';

/**
 * The roster's selection semantics: single-select (one detail pane, one memories target — the
 * product contract), with the lifecycle-control carve-out — a click that lands inside a card's
 * control cluster (start/stop/restart) operates the agent and MUST NOT re-target the cockpit's
 * selection-driven panes, so those clicks never reach the base selection path. Keyboard: the
 * Navigator addon moves item focus (the base list contract); Enter selects the focused row.
 *
 * @class AgentOS.view.fleet.roster.SelectionModel
 * @extends Neo.selection.ListModel
 */
class SelectionModel extends ListModel {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.roster.SelectionModel'
         * @protected
         */
        className: 'AgentOS.view.fleet.roster.SelectionModel',
        /**
         * @member {String} ntype='fm-roster-selection-model'
         * @protected
         */
        ntype: 'fm-roster-selection-model',
        /**
         * One selected resident at a time — multi-select has no product meaning here (one detail
         * inspector, one memories target).
         * @member {Boolean} singleSelect=true
         */
        singleSelect: true
    }

    /**
     * @summary The control-cluster carve-out: when the click path reaches a card's lifecycle
     * control cluster BEFORE the list item (i.e. the click landed inside the controls), the click
     * belongs to the lifecycle seam (`lifecycleIntent`) and selection stays untouched. Every other
     * item click selects through the base path.
     * @param {Object} data The delegated list click; `data.path` is the DOM path, innermost first.
     */
    onListClick(data) {
        const
            path         = data.path || [],
            {itemCls}    = this.view,
            controlIndex = path.findIndex(node => node.cls?.includes('fm-card-control-verbs')),
            itemIndex    = path.findIndex(node => node.cls?.includes(itemCls));

        if (controlIndex > -1 && (itemIndex === -1 || controlIndex < itemIndex)) {
            return
        }

        super.onListClick(data)
    }

    /**
     * @summary Enter selects the row the Navigator's item focus sits on (`view.focusIndex` is kept
     * current by the base `onListNavigate`). A no-op without a focused row.
     * @param {Object} data The key event.
     */
    onKeyDownEnter(data) {
        const {focusIndex} = this.view;

        Neo.isNumber(focusIndex) && focusIndex > -1 && this.selectAt(focusIndex)
    }
}

export default Neo.setupClass(SelectionModel);
