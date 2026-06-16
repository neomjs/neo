import Controller        from '../../../../../src/controller/Component.mjs';
import {validateRequest} from '../util/validateRequest.mjs';

/**
 * @class AgentOSWidget.view.ViewportController
 * @extends Neo.controller.Component
 * @summary Wires the first-widget chat intake to the evidence pane.
 *
 * Handles the intake submit: validates the typed request through {@link validateRequest} and either
 * projects the accepted request into the existing EvidencePane request state (reusing the deterministic
 * first-widget path — no second widget path), or renders the bounded fail-closed reason as safe vdom
 * text in the intake's error line. No model invocation / orchestration / persistence — deterministic.
 */
class ViewportController extends Controller {
    static config = {
        /**
         * @member {String} className='AgentOSWidget.view.ViewportController'
         * @protected
         */
        className: 'AgentOSWidget.view.ViewportController'
    }

    /**
     * Triggered by the intake submit button. Reads the current request field value, validates it,
     * and projects an accepted request into the evidence pane or shows the rejected reason.
     * @param {Object} data
     * @protected
     */
    onSubmitRequest(data) {
        let me     = this,
            field  = me.getReference('request-field'),
            error  = me.getReference('request-error'),
            result = validateRequest(field.value);

        if (result.accepted) {
            me.getReference('evidence-pane').request = result.value
        }

        error.vdom.cn[0].text = result.accepted ? '' : result.reason;
        error.update()
    }
}

export default Neo.setupClass(ViewportController);
