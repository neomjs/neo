import Controller from '../../../../../../src/controller/Component.mjs';

/**
 * Controller for {@link AgentOS.view.fleet.roster.card.Container}: turns the card's start/stop/restart controls
 * (the B4 lane) into a single lifecycle **intent** event — and stops there. The card owns the
 * intent-emit; the cockpit→lifecycle round-trip that consumes it (`FleetControlBridge.startAgent`
 * and its siblings) is the Lane C (C2) seam. Keeping the boundary here means the card stays a pure
 * presentation + intent surface and never imports the Brain-side fleet bridge.
 *
 * @class AgentOS.view.fleet.roster.card.Controller
 * @extends Neo.controller.Component
 */
class AgentCardController extends Controller {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.roster.card.Controller'
         * @protected
         */
        className: 'AgentOS.view.fleet.roster.card.Controller'
    }

    /**
     * @summary Fires the card's lifecycle intent for the clicked control.
     *
     * Reads the durable `agentId` from the card's record and the `action`
     * (`start` | `stop` | `restart`) off the button that triggered it, then fires ONE
     * `lifecycleIntent` event `{action, agentId}` on the card. The Lane C (C2) round-trip listens
     * for this and drives `FleetControlBridge`; this controller intentionally does NOT call the
     * bridge — that boundary is the B4 ÷ C2 seam.
     * @param {Object} data The button click event; `data.component.action` carries the verb.
     */
    onLifecycleIntent(data) {
        let me      = this,
            action  = data.component.action,
            agentId = me.component.record?.agentId ?? null;

        me.component.fire('lifecycleIntent', {action, agentId})
    }

    /**
     * @summary Fires the contextual power intent — `start` when the resident is off, `stop` when running.
     *
     * The single power toggle replaces a start+stop pair: only one of the two is ever valid for a
     * given session state, so rendering both (one disabled) is noise, not safety. Reads `state` +
     * the durable `agentId` from the card's record; intent-only (Lane-C owns the round-trip).
     * @param {Object} data The button click event.
     */
    onToggleLifecycle(data) {
        let me       = this,
            {record} = me.component,
            agentId  = record?.agentId ?? null,
            action   = (record?.state ?? 'off') === 'off' ? 'start' : 'stop';

        me.component.fire('lifecycleIntent', {action, agentId})
    }

    /**
     * @summary Fires the card's drill-in select — the dedicated native drill Button opens this resident.
     *
     * Reads the durable `agentId` from the card's record and fires ONE `agentSelect` event
     * `{agentId}` on the card. Like `lifecycleIntent`, this controller does NOT act on it — the
     * cockpit (which owns the detail pane + the roster store) resolves the record and reveals the
     * inspector via {@link AgentOS.view.fleet.cockpit.Controller#onAgentSelect}.
     * @param {Object} data The drill Button click event.
     */
    onCardSelect(data) {
        // The dedicated native drill Button IS the drill target — native Enter/Space
        // activate it, and lifecycle toggle/restart are separate sibling Buttons, so the old data.key
        // filter + control-cluster path carve-out are no longer needed (a control click never reaches
        // this handler). Fires ONE agentSelect; the cockpit resolves the detail pane.
        this.component.fire('agentSelect', {agentId: this.component.record?.agentId ?? null})
    }
}

export default Neo.setupClass(AgentCardController);
