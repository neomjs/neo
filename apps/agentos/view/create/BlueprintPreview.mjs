import Button              from '../../../../src/button/Base.mjs';
import Container           from '../../../../src/container/Base.mjs';
import Label               from '../../../../src/component/Label.mjs';
import {CREATION_STATES}   from './util/creationFlowState.mjs';
import {BLUEPRINT_SCHEMAS} from './util/blueprintSchema.mjs';

/**
 * @summary Formats a blueprint's allowlisted config surface for the preview card. The function
 * iterates the schema registry allowlist, never the candidate's own keys, so render truth mirrors
 * the validator's structural firewall.
 * @param {Object|null} blueprint
 * @returns {String}
 */
export function formatPreviewConfig(blueprint) {
    const schema = BLUEPRINT_SCHEMAS[blueprint?.schema];

    if (!schema || !blueprint?.config) {
        return 'No config preview';
    }

    const rows = [];

    schema.configAllowlist.forEach(key => {
        const value = blueprint.config[key];

        if (value === undefined) return;

        if (key === 'columns' && Array.isArray(value)) {
            rows.push(`columns: ${value.map(column => `${column.field} -> ${column.text}`).join(' | ')}`);
        } else if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) {
            rows.push(`${key}: ${String(value)}`);
        }
    });

    return rows.length > 0 ? rows.join(' | ') : 'No allowlisted config values'
}

/**
 * @summary Formats the candidate's data size without exposing row internals in the preview chrome.
 * @param {Object|null} blueprint
 * @returns {String}
 */
export function formatRowCount(blueprint) {
    const rows = Array.isArray(blueprint?.data) ? blueprint.data.length : 0;

    return `${rows} row${rows === 1 ? '' : 's'}`
}

/**
 * @class AgentOS.view.create.BlueprintPreview
 * @extends Neo.container.Base
 *
 * @summary Composing-state confirmation card for the keeper create flow. It renders only the
 * route-validated candidate parked on the create provider: schema id, title, allowlisted config
 * summary, row count, and the confirm/edit affordances that dispatch back through the provider
 * event path.
 */
class BlueprintPreview extends Container {
    static config = {
        /**
         * @member {String} className='AgentOS.view.create.BlueprintPreview'
         * @protected
         */
        className: 'AgentOS.view.create.BlueprintPreview',
        /**
         * @member {String} ntype='agentos-blueprint-preview'
         * @protected
         */
        ntype: 'agentos-blueprint-preview',
        /**
         * @member {String[]} cls=['agentos-blueprint-preview']
         * @reactive
         */
        cls: ['agentos-blueprint-preview'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * The preview exists only for a route-accepted candidate in COMPOSING. Refusals render the
         * existing error strip; an absent candidate means the user is still composing raw intent.
         * @member {Object}
         */
        bind: {
            hidden: data => data.flowState !== CREATION_STATES.COMPOSING || !data.candidateBlueprint
        },
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls   : ['agentos-blueprint-preview-header'],
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                module: Label,
                cls   : ['agentos-blueprint-preview-schema'],
                bind  : {text: data => data.candidateBlueprint?.schema || ''}
            }, {
                module: Label,
                cls   : ['agentos-blueprint-preview-title'],
                flex  : 1,
                bind  : {text: data => data.candidateBlueprint?.title || ''}
            }]
        }, {
            module: Label,
            cls   : ['agentos-blueprint-preview-config'],
            bind  : {text: data => formatPreviewConfig(data.candidateBlueprint)}
        }, {
            module: Label,
            cls   : ['agentos-blueprint-preview-rows'],
            bind  : {text: data => formatRowCount(data.candidateBlueprint)}
        }, {
            module: Container,
            cls   : ['agentos-blueprint-preview-actions'],
            layout: {ntype: 'hbox'},
            items : [{
                module : Button,
                text   : 'Confirm',
                iconCls: 'fas fa-check',
                handler: 'onConfirmPreview'
            }, {
                module : Button,
                text   : 'Edit',
                ui     : 'secondary',
                iconCls: 'fas fa-pen',
                handler: 'onEditPreview'
            }]
        }]
    }
}

export default Neo.setupClass(BlueprintPreview);
