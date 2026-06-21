import Container          from '../../../src/container/Base.mjs';
import EvidencePane       from '../childapps/widget/view/EvidencePane.mjs';
import RequestIntake      from '../childapps/widget/view/RequestIntake.mjs';
import ViewportController from '../childapps/widget/view/ViewportController.mjs';

/**
 * @class AgentOS.view.FirstWidgetPanel
 * @extends Neo.container.Base
 * @summary The first-widget work-area hosted in the cockpit as a dashboard-mountable composite.
 *
 * Hosts the first-widget subtree — the bounded chat-intake, the evidence pane, and the stage a live grid
 * is created INTO — as a single unit inside the main `apps/agentos` cockpit's `dashboard.Container`,
 * rather than a separate child app. The subtree's coupling is carried verbatim from the childapp viewport
 * so the insert-observer {@link AgentOSWidget.view.ViewportController controller} resolves its sibling
 * `getReference` wiring (`evidence-pane`, `widget-stage`, `first-widget-grid`, the intake fields) in-tree:
 * it boots the first grid through the `add → insert` seam and projects the inserted grid into the evidence
 * pane App-Worker-locally — the same projection an external Neural-Link `create_component` into the stage
 * drives. App-Worker-local projection is why the evidence updates whether the grid renders inline here (S1)
 * or, once the stage pops to its own window (S2), across that window boundary.
 *
 * This is the relocation HOST. The follow-ups: physically moving the subtree files out of the childapp into
 * this view (this composite currently reuses them in place to keep the diff focused + the existing unit/e2e
 * suites green), and the S2 cross-window detach — both need a running harness with trusted-pointer drag,
 * un-verifiable headless.
 */
class FirstWidgetPanel extends Container {
    static config = {
        /**
         * @member {String} className='AgentOS.view.FirstWidgetPanel'
         * @protected
         */
        className: 'AgentOS.view.FirstWidgetPanel',
        /**
         * @member {String[]} cls=['agent-os-first-widget-panel']
         * @reactive
         */
        cls: ['agent-os-first-widget-panel'],
        /**
         * The first-widget subtree's own insert-observer controller, reused so the `getReference` wiring
         * resolves within this composite's tree (the deterministic projection seam, preserved verbatim).
         * @member {Neo.controller.Component} controller=ViewportController
         * @reactive
         */
        controller: ViewportController,
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * The relocated first-widget subtree (intake + evidence pane + the live-grid stage), carried
         * verbatim from the childapp viewport so the controller's `getReference` wiring resolves in-tree.
         * @member {Object[]} items
         */
        items: [{
            module: RequestIntake
        }, {
            module   : EvidencePane,
            reference: 'evidence-pane'
        }, {
            ntype    : 'container',
            // the fixed, known id an external agent can `create_component` a widget INTO — the same mount
            // point the in-app bootstrap uses; both fire the projected `insert`
            id       : 'widget-stage',
            reference: 'widget-stage',
            cls      : ['agent-os-widget-stage'],
            flex     : 1,
            layout   : {ntype: 'fit'}
        }]
    }
}

export default Neo.setupClass(FirstWidgetPanel);
