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
 * is created INTO — as a single unit inside the main `apps/agentos` cockpit's `dashboard.Container`. The
 * subtree's coupling is carried verbatim from the childapp viewport so the insert-observer
 * {@link AgentOSWidget.view.ViewportController controller} resolves its sibling `getReference` wiring
 * (`evidence-pane`, `widget-stage`, `first-widget-grid`, the intake fields) in-tree: it boots the first
 * grid through the `add → insert` seam and projects the inserted grid into the evidence pane
 * App-Worker-locally.
 *
 * This is an S1 **internal** visual host — NOT the full relocation, and NOT an external `create_component`
 * target. This panel's stage carries no fixed external id; the childapp viewport retains the sole external
 * target, so there is no duplicate consumed-surface contract. The single-owner relocation (physically move
 * the subtree out of the childapp + reduce its shell) and the S2 cross-window detach are a tracked
 * follow-up — both need a running harness with trusted-pointer drag, un-verifiable headless.
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
            // the live-grid stage — resolved by the controller via `getReference`, NOT a fixed external id.
            // The childapp viewport keeps the sole external `create_component` target (no duplicate contract).
            reference: 'widget-stage',
            cls      : ['agent-os-widget-stage'],
            flex     : 1,
            layout   : {ntype: 'fit'}
        }]
    }
}

export default Neo.setupClass(FirstWidgetPanel);
