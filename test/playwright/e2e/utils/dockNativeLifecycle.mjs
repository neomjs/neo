import {expect} from '@playwright/test';

/**
 * @summary Reads the Group's native records and rejects an unavailable observation source.
 * @param {Object} app Connected Neural Link application.
 * @param {String} workspaceId Workspace component id.
 * @returns {Promise<Object>} Separate provisional connections, committed owners and pending retirements.
 */
export async function readNativeLifecycle(app, workspaceId) {
    const state    = await app.getComponent(workspaceId, ['nativeWindows.groupId', 'vesselSourceId']),
          groupId  = state['nativeWindows.groupId'],
          sourceId = state.vesselSourceId ?? workspaceId;

    expect(groupId, 'native lifecycle observation requires a live Group').toBeTruthy();
    expect(await app.callMethod(workspaceId, 'nativeWindows.sources.has', [sourceId]),
        'native lifecycle observation requires the registered consumer source').toBe(true);

    const [connections, owners, retirements] = await Promise.all([
        app.callMethod(workspaceId, 'nativeWindows.connectionEntries', [sourceId]),
        app.callMethod(workspaceId, 'nativeWindows.ownerEntries', [sourceId]),
        app.callMethod(workspaceId, 'nativeWindows.pendingRetirements', [sourceId])
    ]);

    expect(Array.isArray(connections)).toBe(true);
    expect(Array.isArray(owners)).toBe(true);
    expect(Array.isArray(retirements)).toBe(true);

    return {groupId, sourceId, connections: Object.fromEntries(connections), owners: Object.fromEntries(owners), retirements}
}
