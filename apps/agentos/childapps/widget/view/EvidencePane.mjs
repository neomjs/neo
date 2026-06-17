import Container                 from '../../../../../src/container/Base.mjs';
import {projectBlueprintEvidence} from '../util/blueprintEvidence.mjs';

/**
 * @class AgentOSWidget.view.EvidencePane
 * @extends Neo.container.Base
 * @summary Safe transcript + blueprint-evidence pane for the H2 first widget.
 *
 * Shows the visible provenance for the first widget — the user request, a short agent response
 * summary, and the accepted blueprint's metadata — so a reviewer can see this is a conversational
 * creation loop rather than a hardcoded demo. All request / response / evidence text renders as
 * vdom text nodes (never `html` / `innerHTML`), and the blueprint is passed through
 * {@link projectBlueprintEvidence} so only safe scalar metadata reaches the view; an invalid
 * blueprint fails closed to a bounded rejected-state line instead of rendering anything unvalidated.
 */
class EvidencePane extends Container {
    static config = {
        /**
         * @member {String} className='AgentOSWidget.view.EvidencePane'
         * @protected
         */
        className: 'AgentOSWidget.view.EvidencePane',
        /**
         * @member {String} ntype='agent-os-evidence-pane'
         * @protected
         */
        ntype: 'agent-os-evidence-pane',
        /**
         * @member {String[]} cls=['agent-os-evidence-pane']
         * @reactive
         */
        cls: ['agent-os-evidence-pane'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * The deterministic user request that produced the first widget.
         * @member {String} request_='build me a neo grid'
         * @reactive
         */
        request_: 'build me a neo grid',
        /**
         * A short deterministic agent response summary.
         * @member {String} responseSummary_='Accepted a bounded grid blueprint and rendered it as a live widget.'
         * @reactive
         */
        responseSummary_: 'Accepted a bounded grid blueprint and rendered it as a live widget.',
        /**
         * The latest bounded follow-up edit outcome — an accepted-edit echo or a fail-closed
         * `Rejected: …` reason. Rendered as a safe text node so neither an applied edit nor a rejection
         * reason can reach the view as HTML.
         * @member {String} editOutcome_=''
         * @reactive
         */
        editOutcome_: '',
        /**
         * The accepted first-widget blueprint. Rendered through `projectBlueprintEvidence`, so only
         * safe scalar metadata reaches the view; invalid input fails closed to a rejected line.
         * @member {Object|null} blueprint_
         * @reactive
         */
        blueprint_: {
            schema : 'Neo.grid.Container',
            title  : 'First Neo Grid',
            columns: [{dataField: 'id'}, {dataField: 'firstname'}, {dataField: 'lastname'}],
            rows   : [{id: 1}, {id: 2}, {id: 3}]
        },
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype    : 'component',
            reference: 'transcript',
            cls      : ['agent-os-evidence-transcript'],
            vdom     : {cn: [
                {cls: ['agent-os-evidence-request']},
                {cls: ['agent-os-evidence-response']},
                {cls: ['agent-os-evidence-edit-outcome']}
            ]}
        }, {
            ntype    : 'component',
            reference: 'blueprint-evidence',
            cls      : ['agent-os-evidence-blueprint'],
            vdom     : {cn: []}
        }]
    }

    /**
     * Triggered after the request config changed; renders it as a safe text node.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetRequest(value, oldValue) {
        let transcript = this.getItem('transcript');

        if (transcript) {
            transcript.vdom.cn[0].text = value;
            transcript.update?.()
        }
    }

    /**
     * Triggered after the responseSummary config changed; renders it as a safe text node.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetResponseSummary(value, oldValue) {
        let transcript = this.getItem('transcript');

        if (transcript) {
            transcript.vdom.cn[1].text = value;
            transcript.update?.()
        }
    }

    /**
     * Triggered after the editOutcome config changed; renders it as a safe text node so an applied-edit
     * echo or a fail-closed rejection reason can never reach the view as HTML.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetEditOutcome(value, oldValue) {
        let transcript = this.getItem('transcript');

        if (transcript) {
            transcript.vdom.cn[2].text = value;
            transcript.update?.()
        }
    }

    /**
     * Triggered after the blueprint config changed. Projects it to safe metadata and renders the
     * accepted metadata list, or a bounded rejected-state line when the projection fails closed.
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetBlueprint(value, oldValue) {
        let pane = this.getItem('blueprint-evidence');

        if (!pane) {
            return
        }

        const projection = projectBlueprintEvidence(value);

        if (projection.accepted) {
            pane.cls     = ['agent-os-evidence-blueprint'];
            pane.vdom.cn = [{tag: 'dl', cls: ['agent-os-evidence-meta'], cn: [
                {tag: 'dt', text: 'Schema'},  {tag: 'dd', text: projection.schema},
                {tag: 'dt', text: 'Title'},   {tag: 'dd', text: projection.title},
                {tag: 'dt', text: 'Columns'}, {tag: 'dd', text: `${projection.columnCount}`},
                {tag: 'dt', text: 'Rows'},    {tag: 'dd', text: `${projection.rowCount}`}
            ]}]
        } else {
            pane.cls     = ['agent-os-evidence-blueprint', 'agent-os-evidence-rejected'];
            pane.vdom.cn = [{cls: ['agent-os-evidence-rejected-text'], text: projection.reason}]
        }

        pane.update?.()
    }
}

export default Neo.setupClass(EvidencePane);
