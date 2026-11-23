import Component from '../../../src/component/Base.mjs';

const plan = [
    ['Ship the export dialog by 15:00',      'Cedar, Ember'],
    ['Clear the review queue before 17:00',  'Delta, Garnet'],
    ['Unblock the date picker spec',         'Flint'],
    ['Draft the release notes for tomorrow', 'Lumen']
];

/**
 * @summary The desk's Strategy pane: the day's plan, and the `dockReload()` contract, where reload means counting.
 *
 * The dock's reload action delegates to `dockReload()` here instead of recreating the pane, and the counter under the
 * plan is the receipt a viewer reads.
 * @class Neo.examples.dashboard.desk.PlanPane
 * @extends Neo.component.Base
 */
class PlanPane extends Component {
    static config = {
        /**
         * @member {String} className='Neo.examples.dashboard.desk.PlanPane'
         * @protected
         */
        className: 'Neo.examples.dashboard.desk.PlanPane',
        /**
         * @member {String[]} baseCls=['neo-example-desk-plan']
         */
        baseCls: ['neo-example-desk-plan']
    }

    /**
     * How often the dock's reload action asked this pane to refresh itself
     * @member {Number} reloadCount=0
     */
    reloadCount = 0

    /**
     * The reload delegation contract: this pane's reload meaning is a visible counter
     * @returns {void}
     */
    dockReload() {
        this.reloadCount++;
        this.renderPlan()
    }

    /**
     * Paints the plan before the first render
     */
    onConstructed() {
        super.onConstructed();
        this.renderPlan()
    }

    /**
     * Paints the day's goals and, once the pane was reloaded, how often
     */
    renderPlan() {
        let {reloadCount} = this;

        // The counter shows once there is something to count: before a reload it would only be a note about a control
        this.html = [
            '<h3>Today\'s plan</h3>',
            '<ol>', ...plan.map(([goal, owners]) => `<li>${goal}<span>${owners}</span></li>`), '</ol>',
            reloadCount ? `<p class="neo-example-desk-plan-reloads">Reloaded ${reloadCount}×</p>` : ''
        ].join('')
    }
}

export default Neo.setupClass(PlanPane);
