import Base               from '../../../src/core/Base.mjs';
import TransactionManager from '../../../src/manager/Transaction.mjs';
import WorkspaceDocument  from '../../../src/dashboard/dock/model/WorkspaceDocument.mjs';

/**
 * @class Neo.examples.dashboard.crossWindow.DemoBNativeWindowHost
 * @extends Neo.core.Base
 * @summary Connects the cross-window demo's native effects and binding events to its live host.
 *
 * Mixed into the workspace without constructing another owner. The Group owns native resources;
 * the host retains flow reservations, documents, collaborators, listeners and their teardown.
 * Source callbacks resolve current host methods and collaborators, including after awaited work.
 */
class DemoBNativeWindowHost extends Base {
    static config = {
        /** @member {String} className='Neo.examples.dashboard.crossWindow.DemoBNativeWindowHost' */
        className: 'Neo.examples.dashboard.crossWindow.DemoBNativeWindowHost'
    }

    /**
     * @summary Hands this host's native effects to the Group's single lifecycle owner — as TWO
     * sources, because this host speaks two workspace-key shapes.
     *
     * `Neo.dashboard.dock.Workspace` registers its source for its subclasses; this host extends
     * `container.Base` and composes the dock modules itself, so it inherits none of that and
     * registers its own.
     *
     * **Why two sources rather than one.** A source's `keyFor` maps an item to exactly one
     * workspace key, and this host has two shapes: a vessel binds under `popup:<itemId>` while a
     * stage target binds under the popup workspace id itself. A single source cannot express both
     * without teaching the generic owner about this host's flows. Two sources can, because a source
     * identity is opaque within the Group and every lookup is source-scoped — the vessel flows
     * (`click-popout`, `tear-out`) share one, the stage flow takes the other. The Group learns
     * nothing about which flow it is serving; it only ever matches a reserved key.
     * @param {Neo.manager.Transaction} [manager=TransactionManager]
     * @returns {void}
     * @protected
     */
    bindNativeWindowSources(manager=TransactionManager) {
        const me = this;

        if (!manager || !me.topologyGroupId || me.nativeWindows) return;

        me.nativeWindows = manager.getNativeLifecycle(me.topologyGroupId);

        me.nativeWindows.registerSource(me.vesselSourceId, {
            close  : vessel => me.closeTearOutVessel(vessel),
            keyFor : itemId => `popup:${itemId}`,
            open   : request => me.openTearOutVessel(request),
            context: data => ({activeVessel: me.tearOutHandlers?.activeVessel, app: Neo.apps[data.windowId]}),
            // Geometry-ready is part of child admission: nothing is published to any ownership
            // branch until the vessel's Main realm has installed movement and resize observation —
            // the same pair the host window armed at construction, for the same reason. The live
            // pane enters the child here, while model truth stays untouched until the terminal.
            prepare: async context => {
                const {itemId, windowId} = context,
                      // Retirement authority is the Group's, and it is established BEFORE the close
                      // it awaits. A vessel that binds while its retirement is in flight is
                      // cleanup-only: never stage or publish content into a closing realm.
                      retiring = () => me.isDestroyed || !Neo.apps[windowId] ||
                          me.nativeWindows.pendingRetirements(me.vesselSourceId).some(vessel => vessel.itemId === itemId);

                if (!context.app || retiring()) return false;

                await Neo.main.addon.WindowPosition?.setConfigs({observeMovement: true, observeResize: true, windowId});

                if (retiring()) return false;

                // What THIS admission staged is the fact the continuation needs, not whether the item
                // is staged now: the answer is carried on the context so `bound` reads the same one.
                context.staged = await me.tearOutEmbodiment.stage({itemId, windowId});

                // A re-entry, cancel or physical death may retire the vessel while the cross-window
                // render transaction is still painting. A dead generation must never publish itself,
                // and the stage it began is restored rather than left holding the pane.
                if (retiring()) {
                    context.staged && me.tearOutEmbodiment.restore({itemId, windowId});
                    return false
                }

                const gesture = me.crossWindowGestureContext;
                if (context.staged && gesture?.itemId === itemId && gesture.pane === me.paneCache[itemId]) {
                    gesture.vesselMountCount = gesture.pane.mountCount
                }

                return true
            },
            // Whichever of terminal and connect lands SECOND performs adoption. Arriving here with
            // ownership already committed means the terminal won that race, so the pane is promoted
            // out of its stage (or reparented, when nothing staged it). Arriving unowned means this
            // connect was first; the Group holds the connection until the terminal reads it.
            bound: context => {
                const {connection, itemId, owned, staged} = context;

                if (!owned) return;

                // The terminal won the race, so ownership was recorded before any window existed and
                // names none. This binding is what finally names it: the record learns its window
                // here, or a later disconnect cannot recognise the generation that died.
                me.nativeWindows.recordOwner(me.vesselSourceId, connection.workspaceKey, connection, null, true);

                if (staged) {
                    me.tearOutEmbodiment.promote({itemId, windowId: connection.windowId})
                } else {
                    me.tearOutHandlers.reparentAdopted(itemId, connection)
                }
            },
            // A vessel that died before its terminal committed published nothing, so the maps a
            // reattach would consult do not know this window: the stage is restored and the gesture
            // is told its vessel retired. A committed item comes HOME instead.
            released: ({committed, entry, itemId, workspaceKey}) => {
                const windowId = entry?.windowId ?? entry?.connectingWindowId,
                      // A published connection carries the accepted generation; an admission carries
                      // only the window it was binding. Which one the release matched is what says
                      // whether this vessel ever got as far as presenting content.
                      published = Boolean(entry && 'generation' in entry),
                      // `committed` describes the record the release MATCHED, not the item. Ownership
                      // recorded before its window bound is matched through the admission instead,
                      // and that item is every bit as committed — so ask the registry, not the match.
                      owned     = committed || Boolean(me.nativeWindows.getOwner(me.vesselSourceId, workspaceKey));

                if (me.tearOutEmbodiment.isStaged(itemId)) {
                    // A published vessel whose item has already left the source tree has no
                    // placeholder to restore into — restoring would put the pane back into nothing —
                    // so its stage promotes. Everything else comes home the way it left.
                    const orphaned = published && !WorkspaceDocument.findContainingTabsId(me.dockModel, itemId);

                    me.tearOutEmbodiment[orphaned ? 'promote' : 'restore']({itemId, windowId})
                }

                me.tearOutHandlers.onVesselRetired({...entry, itemId, windowName: entry?.windowName ?? `tearout-${itemId}`});

                if (owned) {
                    // Physical death withdraws ownership: a successor gesture must neither inherit the dead
                    // generation nor be blocked by it. The item comes HOME, its pane out of the reaped tree.
                    me.nativeWindows.recordOwner(me.vesselSourceId, workspaceKey, null);
                    return me.tearOutHandlers.reintegrateItem(itemId, me.paneCache[itemId])
                }
            }
        });

        me.nativeWindows.registerSource(me.stageSourceId, {
            close  : vessel => me.closeTearOutVessel(vessel),
            // A stage target IS a workspace, so its item id and its key are the same string. The
            // identity is deliberate rather than incidental: a stage binds the popup workspace
            // itself, where a vessel binds a slot minted for one item inside one.
            keyFor : workspaceId => workspaceId,
            // Stage acquisition still runs through `openCrossWindowStage`, which reserves its own
            // slot; nothing calls `acquire` for this source yet. Refusing is the honest effect —
            // pointing it at the vessel opener would open a tear-out popup for a stage target.
            open   : () => null,
            context: data => ({app: Neo.apps[data.windowId]})
        })
    }

    /**
     * @summary A slot this workspace reserved ran out its lease without a window binding: the manager freed
     * it, and a window presenting that reservation later forks into its own Group. The pending record
     * leaves with the slot, so no handler here still expects that child.
     * @param {Object} data
     * @param {String} data.groupId
     * @param {String} data.workspaceKey
     * @protected
     */
    onTopologyLeaseExpired({groupId, workspaceKey}) {
        let me          = this,
            reservation = me.vesselReservations.get(workspaceKey);

        if (me.isDestroyed || groupId !== me.topologyGroupId || !reservation || reservation.windowId) return;

        me.vesselReservations.delete(workspaceKey)
    }

    /**
     * @summary Reserves one slot of this workspace's Group for a window about to open, and remembers
     * the flow that asked. The reservation IS the admission: the manager holds the slot, the lineage
     * token the window must present and the clock; the returned identity rides `Main.windowOpen`
     * into the child's carrier, so nothing about the owner is in the popup's URL. A slot with a live
     * binder, or a workspace whose own window has not bound, refuses.
     * @param {String} workspaceKey `popup:<itemId>` for a vessel, the popup workspace id for a stage target.
     * @param {String} flow `workspace-target`, `click-popout`, or `tear-out`.
     * @param {String} [windowName=null] The native window name the opener will use.
     * @returns {{groupId: String, workspaceKey: String, generationToken: String}|null}
     * @protected
     */
    reserveVessel(workspaceKey, flow, windowName=null) {
        let me          = this,
            groupId     = me.topologyGroupId,
            reservation = groupId && TransactionManager.reserve({groupId, workspaceKey});

        if (!reservation) return null;

        me.vesselReservations.set(workspaceKey, {
            ...reservation,
            flow,
            itemId  : flow === 'workspace-target' ? workspaceKey : workspaceKey.slice('popup:'.length),
            windowId: null,
            windowName
        });

        return reservation
    }

    /**
     * @summary Gives a reserved slot back before its window came — the popup was blocked, the stage
     * timed out, a transfer was reversed. A slot whose window already bound is the manager's to
     * release on that window's disconnect; only this host's record of it goes.
     * @param {String} workspaceKey
     * @protected
     */
    revokeVessel(workspaceKey) {
        let me          = this,
            reservation = me.vesselReservations.get(workspaceKey);

        if (!reservation) return;

        me.vesselReservations.delete(workspaceKey);
        reservation.windowId || TransactionManager.revoke(reservation)
    }

    /**
     * @summary A window bound one of this workspace's reserved slots: a cross-window stage target mounts its
     * popup workspace, a click pop-out receives its parked pane, and a tear-out vessel embodies the
     * SAME live pane right away while a hidden exact-slot placeholder keeps the source tab/card
     * indices coherent — model truth stays untouched until the terminal. The instance moves trees;
     * nothing is recreated — the counter proves it. A window presenting a copied or stale identity
     * was forked into its own Group by the manager and never reaches this handler's Group check.
     * @param {Object} data
     * @param {String} data.groupId
     * @param {String} data.windowId
     * @param {String} data.workspaceKey
     * @protected
     */
    async onTopologyBind({groupId, windowId, workspaceKey}) {
        let me          = this,
            app         = Neo.apps[windowId],
            reservation = me.vesselReservations.get(workspaceKey);

        if (me.isDestroyed) return;

        // The host's own window binding, accepted after construction: the Group is learned and the
        // participants register before any reserved slot is answered.
        windowId === me.windowId && me.adoptTopologyGroup(groupId);

        if (!app || groupId !== me.topologyGroupId || !reservation || reservation.windowId) return;

        reservation.windowId = windowId;

        // Geometry-ready is part of child admission: do not publish the bound vessel to any
        // ownership branch until its Main realm has installed movement and resize observation — the
        // same pair the host window armed at construction, for the same reason.
        await Neo.main.addon.WindowPosition?.setConfigs({observeMovement: true, observeResize: true, windowId});

        if (me.isDestroyed || me.vesselReservations.get(workspaceKey) !== reservation) return;

        const {flow, itemId} = reservation;

        if (flow === 'workspace-target') {
            await me.mountCrossWindowTarget(app, windowId, itemId);
            return
        }

        // The remaining flow is `click-popout`. A tear-out vessel never reaches this handler: its
        // slot is reserved by the Group's native lifecycle rather than by `reserveVessel`, so its
        // admission lives in the vessel source and the Group answers its binding through that
        // source's `prepare`/`bound` effects.
        let entry = me.detachedPanes[itemId],
            pane  = me.paneCache[itemId];

        if (entry && pane && me.popupDocument?.items?.[itemId]) {
            entry.windowId = windowId;
            app.mainView.add(pane)
        }
    }

    /**
     * @summary A window that held one of this workspace's slots left the shared heap: whatever pane it hosted
     * comes HOME — the reattach commit brings the item back into the document; the re-projection
     * re-adopts the parked instance. Physical death is authoritative: every state owner clears, so
     * a successor gesture can neither inherit nor be blocked by the retired generation.
     * @param {Object} data
     * @param {String} data.groupId
     * @param {String} data.windowId
     * @param {String} data.workspaceKey
     * @param {Object} workspaceIds Host-owned semantic workspace identities.
     * @param {String} workspaceIds.mainWorkspaceId
     * @param {String} workspaceIds.popupWorkspaceId
     * @param {String} workspaceIds.popup2WorkspaceId
     * @returns {Promise<Object>|void} The existing reattach settlement when an item returns.
     * @protected
     */
    routeTopologyRelease(data, {mainWorkspaceId, popupWorkspaceId, popup2WorkspaceId}) {
        let me                                = this,
            {groupId, windowId, workspaceKey} = data,
            reservation                       = me.vesselReservations.get(workspaceKey);

        if (me.isDestroyed || groupId !== me.topologyGroupId) return;

        me.vesselProxyEmbodiment.restoreByWindow(windowId);

        // A tear-out vessel's death is the Group's to observe: its slot is the vessel source's, so
        // the `released` effect restores an unsettled stage and brings a committed item home. Only
        // the stage and click-pop-out flows still hold their reservation here.
        reservation?.windowId === windowId && me.vesselReservations.delete(workspaceKey);

        let disconnectedWorkspaceId = windowId === me.crossWindowTargetWindowId
                ? popupWorkspaceId
                : windowId === me.crossWindowTarget2WindowId
                    ? popup2WorkspaceId
                    : null;

        if (disconnectedWorkspaceId) {
            let isPopup2       = disconnectedWorkspaceId === popup2WorkspaceId,
                workspaceId    = disconnectedWorkspaceId,
                detachedItemId = Object.entries(me.detachedPanes)
                    .find(([, entry]) => entry.windowId === windowId)?.[0];

            me.crossWindowStageGeneration++;
            me.crossWindowGestureContext?.sourceZone?.dragCoordinator?.onDragCancel({
                sourceSortZone: me.crossWindowGestureContext.sourceZone
            });
            me.crossWindowGestureResolve?.({
                applied: false,
                errors : ['cross-window target disconnected before the gesture settled']
            });

            if (isPopup2) {
                me.crossWindowStage2Reject?.(new Error('cross-window target disconnected before readiness settled'))
            } else {
                me.crossWindowStageReject?.(new Error('cross-window target disconnected before readiness settled'))
            }

            me.crossWindowParticipations.get(workspaceId)?.destroy();
            me.crossWindowParticipations.delete(workspaceId);
            me.crossWindowGeometry.delete(workspaceId);

            // The main participation serves every staged popup pair: it retires only when the
            // LAST popup target is gone, never while a sibling stage remains live.
            let siblingTargetId = isPopup2 ? me.crossWindowTargetWindowId : me.crossWindowTarget2WindowId;

            if (!siblingTargetId) {
                me.crossWindowParticipations.get(mainWorkspaceId)?.destroy();
                me.crossWindowParticipations.delete(mainWorkspaceId);
                me.crossWindowGeometry.delete(mainWorkspaceId)
            }

            me.crossWindowHosts.delete(workspaceId);

            if (isPopup2) {
                me.crossWindowTarget2WindowId = null;
                me.crossWindowStage2Promise   = null;
                me.crossWindowStage2Resolve   = null;
                me.crossWindowStage2Reject    = null;
                me.kbdLivePopup2              = null
            } else {
                me.crossWindowTargetWindowId = null;
                me.crossWindowStagePromise   = null;
                me.crossWindowStageResolve   = null;
                me.crossWindowStageReject    = null;
                me.kbdLivePopup              = null
            }

            me.crossWindowGestureResolve = null;
            me.crossWindowGestureContext = null;

            // A post-commit manual close is a terminal vessel event, not ownership loss.
            // A pre-commit close has no detached entry and remains a cancelled gesture.
            return detachedItemId && me.reattachPane(detachedItemId, {windowAlreadyClosed: true})
        }

        for (const [itemId, entry] of Object.entries(me.detachedPanes)) {
            if (entry.windowId === windowId) {
                return me.reattachPane(itemId, {windowAlreadyClosed: true})
            }
        }

        // Physical death of a tear-out vessel — whether pre-terminal, or after an exact close
        // returned false because the native event outran its Boolean acknowledgement, or because the
        // user closed the retained recovery window by hand — is the Group's to observe. It clears
        // both of its own state owners and calls this host's `released` effect, so a successor
        // gesture can neither inherit nor be blocked by the retired generation.
    }
}

export default Neo.setupClass(DemoBNativeWindowHost);
