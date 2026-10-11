/**
 * @summary Resolves the optional playback controller through the workspace's ordinary controller.
 * @param {Object} app Connected Neural Link application.
 * @param {String} workspaceId Workspace owning the toolbar.
 * @returns {Promise<String>} Registered playback-controller id.
 */
export async function getWorkstationTour(app, workspaceId) {
    const controller = await app.callMethod(workspaceId, 'controller.getTourController');
    return controller.id
}

/**
 * @summary Calls the actual playback owner without retaining removed Workspace facade methods.
 * @param {Object} app Connected Neural Link application.
 * @param {String} workspaceId Workspace owning the toolbar.
 * @param {String} method Playback method.
 * @param {Array} args Method arguments.
 * @returns {Promise<*>}
 */
export async function callWorkstationTour(app, workspaceId, method, args=[]) {
    return app.callMethod(await getWorkstationTour(app, workspaceId), method, args)
}
