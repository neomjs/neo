import DockParticipation from '../../../src/dashboard/dock/window/Participation.mjs';

/**
 * @summary Keeps Workstation's saved-home drop policy while the engine owns preview and geometry.
 * @description The main workspace borrows its existing affordances. A window-admitted pointer
 * outside every measured zone may return a pane to its surviving saved home; on-zone gestures
 * use the engine's complete placement grammar. The inherited lifetime owns the target and
 * releases only the visuals it created, leaving the workspace's borrowed controller intact.
 * @class Workstation.window.Participation
 * @extends Neo.dashboard.dock.window.Participation
 */
class Participation extends DockParticipation {
    static config = {
        /** @member {String} className='Workstation.window.Participation' */
        className: 'Workstation.window.Participation'
    }

    /**
     * @summary Uses the engine preview first, then the saved-home tab target for an off-zone pointer.
     * @param {Object} payload The target-local remote drag frame.
     * @returns {Object|null} The exact preview consumed by the drop path.
     * @protected
     */
    defaultPreviewFor(payload) {
        const me = this;

        if (!me.defaultHitTest(payload?.localX, payload?.localY)) {
            me.resolveAffordances()?.renderPreview(null, payload?.dwell ?? null);
            return null
        }

        const preview = super.defaultPreviewFor(payload);
        if (preview) return preview;

        const workspace    = me.workspace,
              affordances  = me.resolveAffordances(),
              geometry     = affordances?.geometry,
              draggedItem  = payload?.draggedItem,
              itemId       = draggedItem?.dockItemId,
              sourceId     = draggedItem?.dockSourceWorkspaceId,
              sourceItemId = sourceId === me.workspaceId ? itemId : workspace.getPopupState(sourceId)?.itemId,
              storedHome   = sourceItemId && workspace.tearOutHandlers?.peekPlacement(sourceItemId)?.tabsNodeId,
              nodes        = workspace.dockModel?.nodes ?? {},
              homeId       = nodes[storedHome]?.type === 'tabs' ? storedHome
                  : Object.keys(nodes).find(id => nodes[id].type === 'tabs'),
              home          = geometry?.zones.find(zone => zone.nodeId === homeId);

        if (!home || !itemId) return null;

        return affordances.renderPreview(affordances.producer.produce({
            groupNodeId : draggedItem.dockGroupNodeId ?? null,
            itemId,
            pointer     : {x: home.rect.x + home.rect.width / 2, y: home.rect.y + home.rect.height / 2},
            sourceNodeId: draggedItem.dockSourceNodeId ?? payload.sourceNodeId,
            zones       : [home]
        }), payload.dwell ?? null)
    }
}

export default Neo.setupClass(Participation);
