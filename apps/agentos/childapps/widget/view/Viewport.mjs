import BaseViewport from '../../../../../src/container/Viewport.mjs';
import DataModel    from '../../../../../src/data/Model.mjs';
import GridContainer from '../../../../../src/grid/Container.mjs';
import Panel         from '../../../../../src/container/Panel.mjs';

export const FIRST_WIDGET_BLUEPRINT_SCHEMA = 'neo.harness.firstWidget.v1';

const
    allowedBlueprintKeys = ['columns', 'liveState', 'rows', 'schema', 'summary', 'title'],
    allowedColumnKeys    = ['cellAlign', 'dataField', 'flex', 'text', 'width'],
    allowedLiveStateKeys = ['status', 'updatedAt'];

/**
 * @summary Deterministic constrained blueprint for the first H2 Agent Harness widget.
 *
 * The payload is deliberately plain data: no functions, no executable strings, and no framework class
 * references. Later conversational leaves can swap the source of this blueprint, but this first leaf proves
 * that a small serializable contract can become a live Neo grid pane.
 * @type {Object}
 */
export const FIRST_WIDGET_BLUEPRINT = Object.freeze({
    schema: FIRST_WIDGET_BLUEPRINT_SCHEMA,
    title : 'Pipeline Snapshot',
    summary: 'Static sample data rendered through a constrained blueprint contract.',
    liveState: Object.freeze({
        status   : 'live',
        updatedAt: 'demo-seed'
    }),
    columns: Object.freeze([
        Object.freeze({dataField: 'stage',      text: 'Stage',      flex: 1.4}),
        Object.freeze({dataField: 'owner',      text: 'Owner',      flex: 1}),
        Object.freeze({dataField: 'confidence', text: 'Confidence', width: 120}),
        Object.freeze({dataField: 'nextStep',   text: 'Next step',  flex: 1.6})
    ]),
    rows: Object.freeze([
        Object.freeze({id: 'lead-intake',       stage: 'Lead intake',       owner: 'Agent', confidence: '92%', nextStep: 'Qualify request'}),
        Object.freeze({id: 'blueprint-emit',    stage: 'Blueprint emit',    owner: 'Agent', confidence: '88%', nextStep: 'Render live pane'}),
        Object.freeze({id: 'human-review',      stage: 'Human review',      owner: 'Human', confidence: '81%', nextStep: 'Adjust data'}),
        Object.freeze({id: 'write-through-plan', stage: 'Write-through plan', owner: 'Agent', confidence: '67%', nextStep: 'Future leaf'})
    ])
});

/**
 * @class AgentOSWidget.model.FirstWidgetRow
 * @extends Neo.data.Model
 *
 * @summary Data model for the constrained first-widget blueprint rows.
 */
class FirstWidgetRowModel extends DataModel {
    static config = {
        /**
         * @member {String} className='AgentOSWidget.model.FirstWidgetRow'
         * @protected
         */
        className: 'AgentOSWidget.model.FirstWidgetRow',
        /**
         * @member {Object[]} fields
         */
        fields: FIRST_WIDGET_BLUEPRINT.columns.map(column => ({
            name: column.dataField,
            type: 'String'
        }))
    }
}

export const FirstWidgetRow = Neo.setupClass(FirstWidgetRowModel);

/**
 * @summary Returns true when an object only carries keys from the allow-list.
 * @param {Object} value Object to inspect.
 * @param {String[]} allowedKeys Permitted keys.
 * @returns {Boolean}
 */
function hasOnlyAllowedKeys(value, allowedKeys) {
    return Object.keys(value).every(key => allowedKeys.includes(key))
}

/**
 * @summary Validates the constrained first-widget blueprint payload.
 * @param {Object} blueprint Candidate blueprint.
 * @returns {Boolean}
 */
export function isValidFirstWidgetBlueprint(blueprint) {
    if (!blueprint || typeof blueprint !== 'object' || !hasOnlyAllowedKeys(blueprint, allowedBlueprintKeys)) {
        return false
    }

    const {columns, liveState, rows, schema, title} = blueprint;

    if (schema !== FIRST_WIDGET_BLUEPRINT_SCHEMA || typeof title !== 'string' || !title.trim()) {
        return false
    }

    if (blueprint.summary !== undefined && typeof blueprint.summary !== 'string') {
        return false
    }

    if (!Array.isArray(columns) || columns.length === 0 || !Array.isArray(rows) || rows.length === 0) {
        return false
    }

    if (liveState && (typeof liveState !== 'object' || !hasOnlyAllowedKeys(liveState, allowedLiveStateKeys))) {
        return false
    }

    if (liveState && (
        liveState.status !== undefined && typeof liveState.status !== 'string' ||
        liveState.updatedAt !== undefined && typeof liveState.updatedAt !== 'string'
    )) {
        return false
    }

    const dataFields = new Set();

    for (const column of columns) {
        if (!column || typeof column !== 'object' || !hasOnlyAllowedKeys(column, allowedColumnKeys)) {
            return false
        }

        if (typeof column.dataField !== 'string' || !column.dataField.trim() || typeof column.text !== 'string') {
            return false
        }

        dataFields.add(column.dataField)
    }

    for (const row of rows) {
        if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id.trim()) {
            return false
        }

        const allowedRowKeys = new Set(['id', ...dataFields]);

        if (!Object.keys(row).every(key => allowedRowKeys.has(key))) {
            return false
        }

        for (const dataField of dataFields) {
            if (row[dataField] !== undefined && typeof row[dataField] !== 'string') {
                return false
            }
        }
    }

    return true
}

/**
 * @summary Creates the live grid item config for the first-widget pane.
 * @param {Object} blueprint Constrained first-widget blueprint.
 * @returns {Object} Neo component config.
 */
export function createFirstWidgetGridItem(blueprint = FIRST_WIDGET_BLUEPRINT) {
    if (!isValidFirstWidgetBlueprint(blueprint)) {
        return {
            ntype: 'component',
            cls  : ['agent-first-widget-empty'],
            html : 'First widget blueprint rejected.'
        }
    }

    return {
        module   : GridContainer,
        cls      : ['agent-first-widget-grid'],
        reference: 'first-widget-grid',
        flex     : 1,
        store    : {
            keyProperty: 'id',
            model      : FirstWidgetRow,
            data       : blueprint.rows.map(row => ({...row}))
        },
        columns: blueprint.columns.map(column => ({...column}))
    }
}

/**
 * @class AgentOSWidget.view.Viewport
 * @extends Neo.container.Viewport
 *
 * @summary First-widget child app viewport for the Agent Harness H2 live-blueprint proof.
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='AgentOSWidget.view.Viewport'
         * @protected
         */
        className: 'AgentOSWidget.view.Viewport',
        /**
         * @member {String[]} additionalThemeFiles=['AgentOS.view.Viewport']
         */
        additionalThemeFiles: ['AgentOS.view.Viewport'],
        /**
         * @member {String[]} cls=['agent-os-viewport','agent-first-widget-viewport']
         * @reactive
         */
        cls: ['agent-os-viewport', 'agent-first-widget-viewport'],
        /**
         * @member {Object} containerConfig
         */
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * @member {Object[]} items
         */
        items: [{
            module : Panel,
            cls    : ['agent-first-widget-panel'],
            headers: [{
                dock: 'top',
                text: FIRST_WIDGET_BLUEPRINT.title
            }],
            items: [{
                ntype: 'component',
                cls  : ['agent-first-widget-blueprint-meta'],
                flex : 'none',
                height: 48,
                html : `<span class="agent-first-widget-state">${FIRST_WIDGET_BLUEPRINT.liveState.status}</span>${FIRST_WIDGET_BLUEPRINT.summary}`
            }, createFirstWidgetGridItem()]
        }]
    }
}

export default Neo.setupClass(Viewport);
