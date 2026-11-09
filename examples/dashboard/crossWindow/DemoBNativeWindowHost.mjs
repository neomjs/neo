import Base                    from '../../../src/core/Base.mjs';
import NativeVesselTransaction from '../../../src/dashboard/dock/window/NativeVesselTransaction.mjs';
import TransactionManager      from '../../../src/manager/Transaction.mjs';
import WorkspaceDocument       from '../../../src/dashboard/dock/model/WorkspaceDocument.mjs';

/**
 * @class Neo.examples.dashboard.crossWindow.DemoBNativeWindowHost
 * @extends Neo.core.Base
 * @summary Connects the cross-window demo's native effects and binding events to its live host.
 *
 * Mixed into the workspace without constructing another owner. The Group owns native resources;
 * the host retains flow reservations, documents, collaborators, listeners and their teardown.
 * Source callbacks resolve current host methods and collaborators, including after awaited work.
 * ID-supplying facades stay host-only; their mixin implementations use distinct method names.
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

    /**
     * @summary Stamps a retiring vessel with the exact native route of the window it holds.
     * @description Retirement is the last moment that route is knowable. A vessel identity is minted
     * at acquisition, before any window connected, so it names no window; the binding that followed
     * is what knows one — and a refused admission gives that binding up. The Group re-presents the
     * SAME vessel on every retry, so a route not captured here is a route no retry can rediscover,
     * and the close degrades to closing by name. Capturing it is what lets a refusal be retried
     * against the exact generation instead of whatever now answers to that name.
     * @param {Object} vessel
     * @returns {Object} The vessel, carrying its exact route when one is still resolvable.
     * @protected
     */
    exactTearOutVessel(vessel) {
        let me        = this,
            itemId    = vessel?.itemId,
            entry     = itemId ? me.resolveTearOutVessel(itemId) : null,
            admission = itemId ? me.nativeWindows?.getAdmission(me.vesselSourceId, vessel.workspaceKey ?? me.resolveVesselKey(itemId)) : null,
            windowId  = entry?.windowId ?? admission?.windowId ?? admission?.connectingWindowId,
            route     = vessel?.nativeRoute ?? entry?.nativeRoute
                ?? (windowId && Neo.manager?.Window?.get(windowId)?.nativeRoute)
                // A retry presents the vessel identity again, not the copy stamped last time, and by
                // then the refused admission has given its window up. The retirement the Group still
                // holds is where that route was captured — so the retry reads it back from there.
                ?? me.nativeWindows?.pendingRetirements(me.vesselSourceId).find(pending =>
                    pending.itemId === itemId && pending.windowName === vessel?.windowName)?.nativeRoute;

        return route ? {...vessel, nativeRoute: route} : vessel
    }

    /**
     * @summary Resolves the Group key of an item's tear-out vessel. Each vessel here holds the one item it
     * was opened for, so the item's newest native record is its vessel.
     * @param {String} itemId
     * @returns {String|null}
     */
    resolveVesselKey(itemId) {
        return this.nativeWindows?.keyOf(this.vesselSourceId, itemId) ?? null
    }

    /**
     * @summary Commits a detached terminal without sacrificing the live pane to projection order.
     * @description A connect-first vessel already carries the pane and leaves an exact-slot source
     * placeholder for ordinary projection cleanup. A terminal-first vessel has no placeholder, so
     * the source reconciler must preserve the pane until the granted child arrives. This decision is
     * captured before publishing the committed document; the deferred projection can never race it.
     * @param {Object} document
     * @param {Object} operation
     * @param {Object} vessel The admitted vessel identity: the reservation's slot and lineage token.
     * @param {String} workspaceId The host main workspace identity.
     * @returns {Promise<void>} Settles after the Group accepts publication and pane adoption runs.
     * @protected
     */
    async publishTearOutDocument(document, operation, vessel, workspaceId) {
        let me       = this,
            detached = operation?.operation === 'detachItem',
            itemId   = operation?.itemId;

        if (!detached) {
            return me.onWorkspaceDocumentChange(workspaceId, document, {descriptor: operation})
        }

        await me.onWorkspaceDocumentChange(workspaceId, document, {
            descriptor     : operation,
            preserveItemIds: me.tearOutEmbodiment.isStaged(itemId) ? [] : [itemId]
        });
        me.tearOutHandlers.adoptPane(itemId, vessel, me.nativeWindows?.getConnection(me.vesselSourceId, vessel?.workspaceKey) ?? null)
    }

    /**
     * @summary The tear-out commit seam with exact-position capture riding it: the
     * `{tabsNodeId, index}` pair is readable only BEFORE a detach commit removes the item from
     * the tree, and a refused commit deletes its own capture — no stale placement outlives a
     * gesture that never committed. Every non-detach descriptor passes through untouched.
     * @param {Object} descriptor
     * @param {String} workspaceId The host main workspace identity.
     * @returns {{document:Object, errors:String[]}|null}
     * @protected
     */
    applyTearOutToWorkspace(descriptor, workspaceId) {
        let me       = this,
            isDetach = descriptor?.operation === 'detachItem',
            captured = isDetach ? WorkspaceDocument.captureItemPlacement(me.dockModel, descriptor.itemId) : null,
            result;

        captured && me.tearOutHandlers.recordPlacement(descriptor.itemId, captured);

        result = me.applyWorkspaceOperation(workspaceId, descriptor);

        isDetach && result?.errors?.length && me.tearOutHandlers.forgetPlacement(descriptor.itemId);

        return result
    }

    /**
     * @summary The pop-out moment: atomically transfers the item record + placement from the primary
     * workspace document into the popup document, parks the live pane out of the projection,
     * and opens the popup on the SAME app. The SharedWorker heap makes the new window a second
     * render target for the one worker; `onWindowConnect` moves the cached instance in.
     * @param {String} itemId
     * @param {Object} workspaceIds Host-owned workspace identities.
     * @param {String} workspaceIds.mainWorkspaceId
     * @param {String} workspaceIds.popupWorkspaceId
     * @returns {Promise<{detached: Boolean, errors: String[]}>}
     */
    async openPanePopup(itemId, {mainWorkspaceId, popupWorkspaceId}) {
        let me   = this,
            pane = me.paneCache[itemId],
            home = WorkspaceDocument.findContainingTabsId(me.dockModel, itemId);

        if (!pane || !home || me.detachedPanes[itemId]) {
            return {detached: false, errors: [`"${itemId}" is not a docked, cached, attached pane`]}
        }

        const
            workspaceKey = `popup:${itemId}`,
            windowName   = `demo-b-${itemId}`,
            reservation  = me.reserveVessel(workspaceKey, 'click-popout', windowName);

        if (!reservation) {
            return {detached: false, errors: ['no Group slot could be reserved for the pop-out vessel']}
        }

        me.detachedPanes[itemId] = {tabsNodeId: home, windowId: null};

        let committed;
        try {
            committed = await me.workspaceSet.transfer({
                operation        : 'transferItem', itemId,
                sourceWorkspaceId: mainWorkspaceId,
                targetWorkspaceId: popupWorkspaceId,
                target           : {operation: 'restoreTab', tabsNodeId: 'popup-tabs', home: {parentId: 'popup-root', slot: 'center'}}
            }, {provenance: {origin: 'human'}});

            pane.parent?.remove(pane, false);
            let winData = await Neo.Main.getWindowData({windowId: me.windowId});

            let opened = await Neo.Main.windowOpen({
                topologyIdentity: reservation,
                url             : `./index.html?popout=${itemId}`,
                windowFeatures  : `height=420,width=560,left=${winData.screenLeft + 120},top=${winData.screenTop + 120}`,
                windowId        : me.windowId,
                windowName
            });

            if (opened === false) {
                throw new Error('popup blocked')
            }
        } catch (error) {
            delete me.detachedPanes[itemId];
            me.revokeVessel(workspaceKey);
            if (committed) {
                const before = committed.participants.find(participant =>
                    participant.workspaceKey === mainWorkspaceId).before;
                await me.workspaceSet.transfer({
                    operation        : 'transferItem', itemId,
                    sourceWorkspaceId: popupWorkspaceId,
                    targetWorkspaceId: mainWorkspaceId,
                    target           : {operation: 'restoreTab', ...WorkspaceDocument.captureItemPlacement(before, itemId)}
                }, {cause: 'dock-popout-refused', provenance: {origin: 'human'}})
            }

            return {
                detached: false,
                errors  : [`popup open failed: ${error?.message || error}`]
            }
        }

        return {detached: true, errors: []}
    }

    /**
     * @summary Resolves the one connected tear-out generation that may receive physical effects.
     * @param {String} itemId
     * @returns {Object|null}
     * @protected
     */
    resolveTearOutVessel(itemId) {
        return NativeVesselTransaction.resolveVessel({
            nativeWindows: this.nativeWindows, sourceId: this.vesselSourceId, windowNameFor: (id, key) => this.vesselWindowName(id, key)
        }, itemId)
    }

    /**
     * @summary The semantic name of a tear-out vessel's window: `tearout-<itemId>`, plus the suffix its Group
     * key was minted with when the item's preferred key was taken. Two live vessels never share a name,
     * which `Main#windowOpen` would answer by reusing the first one's window.
     * @param {String} itemId
     * @param {String} [workspaceKey]
     * @returns {String}
     * @protected
     */
    vesselWindowName(itemId, workspaceKey) {
        const preferred = `popup:${itemId}`;

        return `tearout-${itemId}${workspaceKey?.startsWith(preferred) ? workspaceKey.slice(preferred.length) : ''}`
    }

    /**
     * @summary The tear-out admission seam: opens the vessel window for a mid-gesture boundary exit.
     * Reuses the `?popout=` pure-pane-host viewport mode. The granted child immediately carries
     * the same live pane through {@link Neo.dashboard.dock.window.VesselEmbodiment}; it still owns no
     * workspace document, and NOTHING is written to
     * {@link Neo.examples.dashboard.crossWindow.DemoBWorkspace#detachedPanes}, so click-pop-out model
     * machinery remains structurally absent. A blocked `windowOpen` returns false, which this effect
     * maps to null; the Group's acquire also treats a thrown platform failure as a refusal.
     *
     * This is a PLATFORM effect, not an admission: the Group's native lifecycle owns the slot, its
     * lineage token and the retirement retry, and hands the minted identity in as `topologyIdentity`
     * for this method to ride into the vessel's carrier — nothing about the owner is in the URL. The
     * returned facts are only what the platform decided; `acquire` merges them with the identity, so
     * the seam's caller still receives the full `{generationToken, workspaceKey, …}` descriptor.
     * @param {Object} request
     * @param {String} request.itemId
     * @param {Object} request.proxyRect
     * @param {Object} request.topologyIdentity The reserved slot, supplied by `NativeLifecycle#acquire`.
     * @returns {Promise<{popupHeight: Number, popupWidth: Number, windowName: String}|null>}
     * @protected
     */
    async openTearOutVessel({itemId, proxyRect, topologyIdentity}) {
        let me         = this,
            {windowId} = me,
            windowName = me.vesselWindowName(itemId, topologyIdentity?.workspaceKey);

        // Admission is the caller's: this effect is only ever reached through `acquire`, which has
        // already retried pending retirements, reserved the slot and minted the identity below. An
        // effect invoked without one would open a native window no Group slot admits.
        if (!topologyIdentity) return null;

        let winData = await Neo.Main.getWindowData({windowId}),
            width   = Math.max(Math.round(proxyRect?.width  || 480), 320),
            height  = Math.max(Math.round(proxyRect?.height || 360), 240),
            left    = Math.round((proxyRect?.x ?? 120) + winData.screenLeft),
            top     = Math.round((proxyRect?.y ?? 120) + (winData.outerHeight - winData.innerHeight) + winData.screenTop);

        me.tearOutAcquisitionAttempts++;

        let opened = await Neo.Main.windowOpen({
                nativeCapabilities: {close: true, position: true},
                topologyIdentity,
                url               : `./index.html?popout=${itemId}`,
                windowFeatures    : `height=${height},left=${left},top=${top},width=${width}`,
                windowId,
                windowName
            });

        // A blocked popup resolves `false` rather than throwing; a throw is the platform failing.
        // Both are the same answer here — no vessel — and `acquire` revokes the slot for either.
        return opened === false ? null : {popupHeight: height, popupWidth: width, windowName}
    }

    /**
     * @summary The tear-out retirement seam: closes a vessel the gesture no longer needs (re-entry, cancel,
     * or a refused model commit) through the engine's shared close. The live connection remains
     * recoverable until the platform strictly admits the close, so an explicit refusal can be retried
     * instead of orphaning a parked native generation.
     * {@link Neo.examples.dashboard.crossWindow.DemoBWorkspace#onTopologyRelease} ignores tear-out
     * windows by construction (no detachedPanes entry), so no reattach machinery fires after success.
     * This host's trimming is the vessel proxy: its source slot lives inside the vessel, so it unwinds
     * before a restoring settle.
     * @param {Object} vessel
     * @param {String} [vessel.generationToken] The reservation's lineage token.
     * @param {String} vessel.itemId
     * @param {String} vessel.windowName
     * @param {Object} [vessel.nativeRoute] Exact opener-minted physical route when available
     * @returns {Promise<Boolean>}
     * @protected
     */
    closeTearOutVessel(vessel) {
        const me = this;

        return NativeVesselTransaction.closeVessel({
            beforeRestore: ({itemId}) => !me.vesselProxyEmbodiment.isStaged(itemId) || me.vesselProxyEmbodiment.restore({itemId}),
            embodiment   : me.tearOutEmbodiment,
            nativeWindows: me.nativeWindows,
            ownerWindowId: me.windowId,
            sourceId     : me.vesselSourceId,
            sourceOwns   : itemId => Boolean(WorkspaceDocument.findContainingTabsId(me.dockModel, itemId)),
            windowNameFor: (itemId, workspaceKey) => me.vesselWindowName(itemId, workspaceKey)
        }, vessel)
    }

    /**
     * @summary The post-commit ownership write: the detached terminal committed `detachItem` (the item left
     * the tree, catalog preserved), so the vessel now OWNS the pane. The REPARENT that used to
     * follow this write now belongs to the choreography, which calls `reparentPane` right after —
     * so the long-drag and fast-terminal orders converge on one sequence instead of two.
     * @param {String} itemId
     * @param {Object|null} entry The admitted identity for terminal-first adoption, or null to withdraw.
     * @param {Object|null} [connection=null] The bound vessel connection, when one arrived first.
     * @param {Boolean} [isMerge=false] Fold into the existing record instead of replacing it.
     * @param {String} [workspaceKey] The vessel whose record changes.
     * @protected
     */
    recordDockPaneOwner(itemId, entry, connection=null, isMerge=false, workspaceKey=entry?.workspaceKey ?? connection?.workspaceKey) {
        let me = this;

        if (!me.nativeWindows) {
            if (entry === null) return;
            throw new Error('native source is not bound')
        }

        if (isMerge || entry === null) {
            me.nativeWindows.recordOwner(me.vesselSourceId, workspaceKey, entry, null, isMerge);
            return
        }

        // The shape is this host's; the registry is the Group's. A terminal that beat its connect
        // owns an as-yet-unbound window, so the record names the generation and leaves `windowId`
        // for the binding to fill. Passing the connection is what makes the write single-owner:
        // committed disconnects match ownership from here on, never the pre-terminal connect branch.
        const key = workspaceKey ?? `popup:${itemId}`;

        me.nativeWindows.recordOwner(me.vesselSourceId, key, connection ? {...connection, itemId, workspaceKey: key} : {
            generationToken: entry.generationToken ?? null,
            itemId,
            windowId       : null,
            windowName     : entry.windowName ?? `tearout-${itemId}`,
            workspaceKey   : key
        }, connection)
    }

    /**
     * @summary Moves the LIVE cached pane into a connected tear-out vessel — the same instance-moving
     * reparent the click-pop-out uses, minus every document write (the model already committed
     * at the terminal; this is pure render-target work).
     * @param {Neo.component.Base} pane
     * @param {Object} target `{windowId}`
     * @param {String} itemId
     * @returns {Boolean}
     * @protected
     */
    reparentDockPane(pane, target={}, itemId) {
        let me         = this,
            {windowId} = target,
            app        = Neo.apps[windowId];

        if (me.tearOutEmbodiment.isStaged(itemId)) {
            return me.tearOutEmbodiment.promote({itemId, windowId}) !== false
        }

        pane = me.paneCache[itemId] || pane;

        if (!app || !pane || pane.isDestroyed) return false;

        if (pane.parent !== app.mainView) {
            pane.parent?.remove(pane, false);
            app.mainView.add(pane)
        }

        return true
    }

    /**
     * @summary The reattach: atomically transfers the item from the popup document into its primary
     * tabs home, closes the popup (unless it already closed itself), and lets the projection
     * re-adopt the parked instance — same count, same instance, home again.
     * @param {String} itemId
     * @param {Object} [options={}]
     * @param {Boolean} [options.windowAlreadyClosed=false]
     * @param {Object} workspaceIds Host-owned workspace identities.
     * @param {String} workspaceIds.mainWorkspaceId
     * @param {String} workspaceIds.popupWorkspaceId
     * @returns {Promise<{reattached: Boolean, errors: String[]}>}
     */
    async returnPaneFromPopup(itemId, {windowAlreadyClosed = false} = {}, {mainWorkspaceId, popupWorkspaceId}) {
        let me    = this,
            entry = me.detachedPanes[itemId],
            pane  = me.paneCache[itemId];

        if (!entry || !pane) {
            return {errors: [`"${itemId}" is not detached`], reattached: false}
        }

        // home fallback: if the remembered tabs node left the tree (a perspective moved on),
        // the first tabs node adopts the returning pane — never a dangling reattach
        let home = me.dockModel.nodes[entry.tabsNodeId]?.type === 'tabs'
                ? entry.tabsNodeId
                : Object.keys(me.dockModel.nodes).find(id => me.dockModel.nodes[id].type === 'tabs');

        try {
            await me.workspaceSet.transfer({
                operation        : 'transferItem', itemId,
                sourceWorkspaceId: popupWorkspaceId,
                targetWorkspaceId: mainWorkspaceId,
                target           : {operation: 'addTab', tabsNodeId: home}
            }, {provenance: {origin: 'human'}})
        } catch (error) {
            return {errors: [error.message], reattached: false}
        }

        me.revokeVessel(`popup:${itemId}`);
        delete me.detachedPanes[itemId];
        pane.parent?.remove(pane, false);

        // Commit model ownership before awaiting the vessel, and park the pane: the worker reaps the popup's tree
        // once its window is gone. The deleted bookkeeping entry is the disconnect re-entrancy guard; a close
        // failure leaves an empty popup, not split truth.
        if (!windowAlreadyClosed) {
            try {
                await Neo.Main.windowClose({
                    names   : [entry.windowName || `demo-b-${itemId}`],
                    windowId: me.windowId
                })
            } catch (error) {
                return {errors: [`popup close failed: ${error?.message || error}`], reattached: true}
            }
        }

        return {errors: [], reattached: true}
    }
}

export default Neo.setupClass(DemoBNativeWindowHost);
