import BaseViewport       from '../../../../../src/container/Viewport.mjs';
import EvidencePane       from './EvidencePane.mjs';
import GridContainer      from '../../../../../src/grid/Container.mjs';
import RequestIntake      from './RequestIntake.mjs';
import ViewportController from './ViewportController.mjs';

/**
 * The deterministic first-widget blueprint — the single source of truth shared by the evidence
 * pane (which shows its metadata) and the live grid (which renders its columns + rows). Keeping
 * ONE blueprint object is the whole provenance point: the metadata a reviewer inspects in the
 * evidence pane is the exact blueprint that produced the live grid below it, not a parallel
 * hand-built demo. Natural-language orchestration is intentionally out of scope for this leaf, so
 * the blueprint is fixed — the render stays deterministic and smoke-testable.
 * @type {Object}
 */
const firstWidgetBlueprint = {
    schema : 'Neo.grid.Container',
    title  : 'First Neo Grid',
    columns: [
        {dataField: 'id',       text: 'ID'},
        {dataField: 'task',     text: 'Task'},
        {dataField: 'owner',    text: 'Owner'},
        {dataField: 'evidence', text: 'Evidence'}
    ],
    rows: [
        {id: 'intent',   task: 'Verify intent', owner: 'Ada',           evidence: 'Blueprint'},
        {id: 'render',   task: 'Render grid',   owner: 'Runtime',       evidence: 'Live widget'},
        {id: 'evidence', task: 'Show evidence', owner: 'Evidence pane', evidence: 'Safe text'}
    ]
};

/**
 * @class AgentOSWidget.view.Viewport
 * @extends Neo.container.Viewport
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
         * The first-widget surface: a bounded chat intake, the evidence pane (request / response /
         * accepted blueprint metadata), and the live grid the same blueprint produced.
         * @member {Object[]} items
         */
        items: [{
            module: RequestIntake
        }, {
            module   : EvidencePane,
            reference: 'evidence-pane',
            blueprint: firstWidgetBlueprint
        }, {
            module        : GridContainer,
            reference     : 'first-widget-grid',
            cls           : ['agent-os-first-widget-grid'],
            flex          : 1,
            columnDefaults: {width: 140},
            columns       : firstWidgetBlueprint.columns.map(column => ({...column})),
            store         : {
                keyProperty: 'id',
                model      : {fields: firstWidgetBlueprint.columns.map(column => ({name: column.dataField, type: 'String'}))},
                data       : [...firstWidgetBlueprint.rows]
            }
        }]
    }
}

export default Neo.setupClass(Viewport);
