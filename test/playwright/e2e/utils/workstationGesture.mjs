import {getWorkstationTour} from './workstationTour.mjs';

/**
 * @summary Activates Workstation's optional driver and invokes its actual instance methods.
 * @param {Object} app Connected Neural Link application.
 * @param {String} workspaceId Workspace owning the script.
 * @param {String} method Driver method name.
 * @param {Array} args Method arguments.
 * @returns {Promise<*>}
 */
export async function callWorkstationGesture(app, workspaceId, method, args=[]) {
    const controllerId = await getWorkstationTour(app, workspaceId);
    await app.callMethod(controllerId, 'getGestureDriver');
    return app.callMethod(controllerId, `gestureDriver.${method}`, args)
}

/**
 * @summary Item-catalog keys per Group participant — which document owns an item, not merely whether one does.
 *
 * A tear-out receipt reads the ORIGIN's `dockModel` alone, so a missing catalog record is indistinguishable
 * from a record that moved to the vessel's participant. Catalog ownership is per-participant
 * (`WorkspaceSet` derives `preserveItemIds` from the OTHER participants' `items`), which makes "gone" and
 * "held elsewhere" different outcomes with opposite repairs.
 *
 * Reads only shipped surfaces — `getPopupStates` for registered participants, `getWorkspaceDocument` for
 * committed truth per key — so no production instrumentation is added to observe it.
 * @param {Object} app Connected Neural Link application.
 * @param {String} workspaceId Main workspace owning the Group.
 * @returns {Promise<Object<String,String[]>>} Catalog keys keyed by workspace id, `main` included.
 */
export async function captureCatalogsByParticipant(app, workspaceId) {
    const
        popupStates = await app.callMethod(workspaceId, 'getPopupStates') ?? [],
        keys        = ['workstation-main', ...popupStates.map(state => state?.workspaceId).filter(Boolean)],
        catalogs    = {};

    for (const key of keys) {
        const document = await app.callMethod(workspaceId, 'getWorkspaceDocument', [key]);

        // `null` and `{}` are different answers: an unregistered participant versus one holding an empty
        // catalog. Collapsing them would hide exactly the transfer this function exists to detect.
        catalogs[key] = document ? Object.keys(document.items ?? {}) : null
    }

    return catalogs
}
