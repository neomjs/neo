import ComponentController from '../../../../../src/controller/Component.mjs';

/**
 * Controller for the {@link AgentOS.view.fleet.tasks.Container tasks surface} (the controllers-own-business-logic law):
 * business intent leaves the view. The one intent today is the refresh — the surface fires
 * `tasksRequest` and stops there; the owning cockpit holds the authenticated bridge and drives
 * the actual `fleetTasks` read (boot · liveness tick · reconnect · this intent), exactly like the
 * card controller's lifecycle seam.
 *
 * @class AgentOS.view.fleet.tasks.Controller
 * @extends Neo.controller.Component
 */
class Controller extends ComponentController {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.tasks.Controller'
         * @protected
         */
        className: 'AgentOS.view.fleet.tasks.Controller'
    }

    /**
     * @summary The Refresh affordance — fires the read INTENT on the surface; no bridge is
     * touched here (the pane-never-reads contract).
     * @param {Object} data The button click event data.
     */
    onRefreshClick(data) {
        this.component.fire('tasksRequest', {})
    }
}

export default Neo.setupClass(Controller);
