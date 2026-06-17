import Button    from '../../../../../src/button/Base.mjs';
import Container from '../../../../../src/container/Base.mjs';
import TextField from '../../../../../src/form/field/Text.mjs';

/**
 * @class AgentOSWidget.view.RequestIntake
 * @extends Neo.container.Base
 * @summary Bounded first-widget chat-intake surface — a text input + submit affordance.
 *
 * The H2 intake gesture: a user types the first-widget request and submits it. The field is bounded
 * (`maxLength`), the submit routes to the Viewport controller (which validates + projects the request
 * into the evidence state), and the error line below renders any fail-closed reason as safe vdom
 * `text` — never `html` / `innerHTML`, and never executable. Deterministic: no model call here.
 *
 * Below the create row, a bounded follow-up EDIT row (a second field + `Edit` submit) routes to the
 * controller's edit handler, which mutates the EXISTING widget through a small deterministic grammar
 * (rename / row-count / reset) — the same one chat surface, not a second chat path.
 */
class RequestIntake extends Container {
    static config = {
        /**
         * @member {String} className='AgentOSWidget.view.RequestIntake'
         * @protected
         */
        className: 'AgentOSWidget.view.RequestIntake',
        /**
         * @member {String} ntype='agent-os-request-intake'
         * @protected
         */
        ntype: 'agent-os-request-intake',
        /**
         * @member {String[]} cls=['agent-os-request-intake']
         * @reactive
         */
        cls: ['agent-os-request-intake'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype : 'container',
            cls   : ['agent-os-request-row'],
            layout: {ntype: 'hbox', align: 'stretch'},
            items : [{
                module         : TextField,
                reference      : 'request-field',
                flex           : 1,
                labelText      : 'Request',
                placeholderText: 'build me a neo grid',
                maxLength      : 200
            }, {
                module : Button,
                cls    : ['agent-os-request-submit'],
                handler: 'onSubmitRequest',
                text   : 'Build'
            }]
        }, {
            ntype    : 'component',
            reference: 'request-error',
            cls      : ['agent-os-request-error'],
            vdom     : {cn: [{text: ''}]}
        }, {
            ntype : 'container',
            cls   : ['agent-os-edit-row'],
            layout: {ntype: 'hbox', align: 'stretch'},
            items : [{
                module         : TextField,
                reference      : 'edit-field',
                flex           : 1,
                labelText      : 'Edit',
                placeholderText: 'rename it to … · show 8 rows · reset data',
                maxLength      : 200
            }, {
                module : Button,
                cls    : ['agent-os-edit-submit'],
                handler: 'onSubmitEdit',
                text   : 'Edit'
            }]
        }]
    }
}

export default Neo.setupClass(RequestIntake);
