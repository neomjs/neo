/**
 * @summary Activates Workstation's optional driver and invokes its actual instance methods.
 * @param {Object} app Connected Neural Link application.
 * @param {String} workspaceId Workspace owning the script.
 * @param {String} method Driver method name.
 * @param {Array} args Method arguments.
 * @returns {Promise<*>}
 */
export async function callWorkstationGesture(app, workspaceId, method, args=[]) {
    await app.callMethod(workspaceId, 'getGestureDriver');
    return app.callMethod(workspaceId, `gestureDriver.${method}`, args)
}
