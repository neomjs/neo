import BaseViewport       from '../../../../../src/container/Viewport.mjs';
import EvidencePane       from './EvidencePane.mjs';
import RequestIntake      from './RequestIntake.mjs';
import ViewportController from './ViewportController.mjs';

/**
 * @class AgentOSWidget.view.Viewport
 * @extends Neo.container.Viewport
 *
 * The H2 first-widget surface: a bounded chat intake, the evidence pane (request / response /
 * accepted-blueprint metadata), and a stage the live grid is created INTO. The grid is no longer a
 * declarative child — the {@link AgentOSWidget.view.ViewportController controller} creates it through
 * the same `add → insert` path a Neural-Link `create_component` drives, then projects the actually
 * created grid into the evidence pane. That keeps a single create path: the evidence describes the
 * grid that was inserted into the stage, and an external agent's `create_component` into the stage flows
 * through the identical projection. The evidence pane starts on its own default blueprint until the
 * first insert projects the real grid over it.
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='AgentOSWidget.view.Viewport'
         * @protected
         */
        className: 'AgentOSWidget.view.Viewport',
        /**
         * @member {Neo.controller.Component} controller=AgentOSWidget.view.ViewportController
         * @reactive
         */
        controller: ViewportController,
        /**
         * @member {String[]} additionalThemeFiles=['AgentOS.view.Viewport']
         */
        additionalThemeFiles: ['AgentOS.view.Viewport'],
        /**
         * @member {String[]} cls=['agent-os-viewport']
         * @reactive
         */
        cls: ['agent-os-viewport'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: RequestIntake
        }, {
            module   : EvidencePane,
            reference: 'evidence-pane'
        }, {
            ntype    : 'container',
            // a fixed, known id so an external agent can `create_component` a widget INTO this stage —
            // the same mount point the in-app bootstrap uses; both fire the projected `insert`
            id       : 'widget-stage',
            reference: 'widget-stage',
            cls      : ['agent-os-widget-stage'],
            flex     : 1,
            layout   : {ntype: 'fit'}
        }]
    }
}

export default Neo.setupClass(Viewport);
