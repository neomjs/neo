import MotionSignal      from '../projection/MotionSignal.mjs';
import Plugin            from '../../../plugin/Base.mjs';
import Reconciler        from '../projection/Reconciler.mjs';
import WorkspaceDocument from '../model/WorkspaceDocument.mjs';

/**
 * @summary The dock maximize affordance as a declinable owner: one projected tabs node paints the
 * measured workspace rect in place, with the FLIP motion, the Escape restore, the resize
 * re-measurement and the drag-source suppression that belong to it.
 *
 * Presentation only — the committed document, perspectives and topology diffs never observe
 * maximize state, and no re-parent happens (a pane hosting an iframe reloads its browsing context
 * on re-parent). The owner is a `Neo.dashboard.dock.Workspace`; the plugin reaches it through four
 * collaborator seams and nothing else: the `dockHeaderAction` event carries the `maximize` intent,
 * the `beforeDockZoneDocumentChange` event lets a committed operation clear the transient before it
 * applies, {@link #getDockProjectionOptions} contributes the projected toggle and its icons, and
 * {@link #syncDockProjection} re-applies a surviving transient after each refresh. `Escape` binds
 * on the owner's key navigation with this plugin as scope.
 *
 * Input contract while a node is maximized: in-strip tab reordering stays live; cross-zone drag
 * sources and tear-out affordances of the maximized node are suppressed (every drop target sits
 * under the maximized plane); engaging maximize closes an in-progress reveal overlay; a committed
 * dock operation that reaches beyond the maximized node clears maximize BEFORE applying,
 * terminally; operations confined to the node itself (activating one of its tabs; closing,
 * reordering or adding an item within it) defer to the re-projection rule instead, which
 * re-applies onto the surviving node and clears when the node collapsed.
 *
 * Declinable by construction: a workspace created with `enableDockMaximizeAction: false` never
 * instantiates this plugin, projects no toggle, registers no observer and binds no key.
 *
 * The owner surface this plugin reads, and nothing more: `id`, `windowId`, `keys`, `plugins`,
 * `dockModel`, `dockShellIndex`, `refreshPromise`, `getDockHost()`, the `on` / `un` / `fire` and
 * `addDomListeners` / `removeDomListeners` pairs, `isDestroying` / `isDestroyed`. Owned for its whole
 * lifetime: the resize observation is armed in the owner's current render window and follows the
 * owner across windows ({@link #onOwnerWindowIdChange}), every async register/release path is
 * generation-guarded, the owner's destroy pass destroys the plugin, and a plugin destroyed while its
 * owner lives resets the node and removes every listener, binding and registration it added
 * ({@link #destroy}).
 *
 * @class Neo.dashboard.dock.plugin.Maximize
 * @extends Neo.plugin.Base
 */
class Maximize extends Plugin {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.plugin.Maximize'
         * @protected
         */
        className: 'Neo.dashboard.dock.plugin.Maximize',
        /**
         * @member {String} ntype='plugin-dock-maximize'
         * @protected
         */
        ntype: 'plugin-dock-maximize',
        /**
         * Icon of the projected maximize action while its node is not maximized.
         * @member {String} iconCls='far fa-window-maximize'
         */
        iconCls: 'far fa-window-maximize',
        /**
         * Prefix of the per-node marker class the maximize FLIP correlates. Stamped lazily onto
         * every live tabs node right before a toggle captures its first rects — the projection
         * itself stays byte-identical while nothing has ever been maximized.
         * @member {String} markerPrefix='dock-maximize-node-'
         */
        markerPrefix: 'dock-maximize-node-',
        /**
         * The workspace-transient maximize target — the projected tabs node currently painting
         * the measured workspace rect. Deliberately NOT part of the committed dock document:
         * maximize is presentation, so perspectives, persistence and topology diffs never see
         * it. Deterministic across re-projection: the presentation is re-applied iff this id
         * still resolves to a projected tabs node, and cleared otherwise — never a third
         * outcome. Committed operations clear it before they apply, terminally.
         * @member {String|null} maximizedNodeId_=null
         * @reactive
         */
        maximizedNodeId_: null,
        /**
         * Icon of the projected maximize action while its node is maximized — the restore half
         * of the toggle, the {@link Neo.dialog.Base} icon-pair precedent.
         * @member {String} restoreIconCls='far fa-window-minimize'
         */
        restoreIconCls: 'far fa-window-minimize'
    }

    /**
     * One-shot motion intent for the next {@link #maximizedNodeId} transition: 'animate' (the
     * gesture default) or 'instant' (operation-driven clears, fail-safes, re-projection
     * continuity). Consumed and reset by `afterSetMaximizedNodeId`.
     * @member {String} motion='animate'
     * @protected
     */
    motion = 'animate'
    /**
     * The in-flight maximize FLIP window (a settled-safe promise). Opposite-direction style
     * mutations and resize re-applies serialize on it: a play's end-of-window cleanup restores
     * the inline-style snapshot it captured at invert time, so geometry written INSIDE the
     * window would be silently overwritten by stale values when the window closes.
     * @member {Promise|null} play=null
     * @protected
     */
    play = null
    /**
     * True while the workspace root is registered with the main-thread ResizeObserver addon for
     * maximize re-measurement — the observation exists exactly as long as a presentation does.
     * @member {Boolean} resizeObserved=false
     * @protected
     */
    resizeObserved = false
    /**
     * The exact tuple this plugin registered with the main-thread ResizeObserver addon —
     * `{componentId, id, windowId}` — so a release names the window it armed, never the window
     * the owner happens to sit in now.
     * @member {Object|null} observation=null
     * @protected
     */
    observation = null
    /**
     * Generation of the observer's async register/release path. Every register, release, owner
     * window change and destroy advances it; an await that resumes into a later generation does
     * nothing, so a stale registration cannot outlive the state that started it.
     * @member {Number} observationGeneration=0
     * @protected
     */
    observationGeneration = 0
    /**
     * The one resize dom listener entry this plugin adds to its owner, kept by reference so an
     * independent destroy removes exactly it.
     * @member {Object|null} resizeListener=null
     * @protected
     */
    resizeListener = null
    /**
     * Releases the owner `windowId` observation held while installed.
     * @member {Function|null} unobserveOwnerWindowId=null
     * @protected
     */
    unobserveOwnerWindowId = null
    /**
     * Restoration snapshot while a maximize presentation is applied:
     * `{nodeId, zone: {allowOverdrag, boundaryContainerId, enableProxyToPopup}|null, zoneId}`.
     * Doubles as the presentation-applied flag the clear path consumes exactly once.
     * @member {Object|null} restoreSnapshot=null
     * @protected
     */
    restoreSnapshot = null
    /**
     * The in-flight maximizedNodeId transition as an awaitable — every consumer that must
     * observe settled maximize presentation (the refresh chain, the continuity sync) awaits
     * this instead of racing the async clear/apply pair.
     * @member {Promise|null} transition=null
     * @protected
     */
    transition = null

    /**
     * Wires the collaborator seams once the owner is fully configured: the two owner events
     * and the `Escape` binding, scoped to this plugin so every other Escape consumer (dialogs,
     * reveal overlays, transfer cycles) keeps its ordinary meaning.
     */
    onOwnerConstructed() {
        super.onOwnerConstructed();

        let me      = this,
            {owner} = me,
            binding = {Escape: 'onEscape', scope: me.id};

        owner.on({
            beforeDockZoneDocumentChange: me.onBeforeDockZoneDocumentChange,
            dockHeaderAction            : me.onDockHeaderAction,
            scope                       : me
        });

        if (owner.keys) {
            owner.keys.add(binding)
        } else {
            // The owner registered its (then absent) key navigation in onConstructed, before this
            // hook ran: a navigation created here registers itself.
            owner.keys = binding;
            owner.keys.register(owner)
        }

        // The observation is armed per render window: follow the owner across windows.
        me.unobserveOwnerWindowId = me.observeConfig(owner, 'windowId', me.onOwnerWindowIdChange.bind(me))
    }

    /**
     * The owner changed render windows. An observation armed in the old window is released there
     * and re-armed in the new one, and the generation advance retires any await still in flight
     * from the old window — the registration follows the owner's generation, never a stale one.
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    onOwnerWindowIdChange(value, oldValue) {
        let me = this;

        me.observationGeneration++;
        me.releaseObservation();

        // Re-arm in the new window whenever a node is maximized — including while a registration
        // from the old window is still in flight, which the generation advance just retired.
        me.maximizedNodeId && me.registerResizeObserver(true)
    }

    /**
     * The projection contribution the owner merges into its adapter options: the toggle and its
     * icon pair. Absent this plugin the adapter projects no maximize action.
     * @returns {Object}
     */
    getDockProjectionOptions() {
        return {
            dockMaximizeIconCls     : this.iconCls,
            dockMinimizeIconCls     : this.restoreIconCls,
            enableDockMaximizeAction: true
        }
    }

    /**
     * Header-action dispatch: the owner re-emits every action it does not own, and `maximize`
     * is this plugin's.
     * @param {Object} data
     * @param {String} data.action
     * @param {String} data.dockNodeId
     */
    onDockHeaderAction({action, dockNodeId}) {
        action === 'maximize' && this.toggle(dockNodeId)
    }

    /**
     * A committed operation clears maximize BEFORE applying — and that clear is terminal: the
     * re-projection continuity re-applies only a transient that survived, never one an operation
     * cleared. Operations confined to the maximized node itself are the exception: they defer to
     * that same continuity rule, which re-applies onto the surviving node — without the exception,
     * switching tabs INSIDE a maximized pane would restore it.
     * @param {Object} data
     * @param {Object|null} data.descriptor The semantic operation about to apply.
     */
    onBeforeDockZoneDocumentChange({descriptor}) {
        let me = this;

        if (me.maximizedNodeId && !me.isNeutralOperation(descriptor)) {
            me.motion          = 'instant';
            me.maximizedNodeId = null
        }
    }

    /**
     * Triggered after the maximizedNodeId config got changed — the single presentation writer:
     * clearing restores the previous node, setting applies the new one, and an A→B switch
     * restores A instantly underneath B's animation. The one-shot {@link #motion} intent decides
     * whether the transition animates (the gesture default) or lands instantly (operation-driven
     * clears, fail-safes, re-projection continuity).
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetMaximizedNodeId(value, oldValue) {
        if (oldValue === undefined) {
            return
        }

        let me             = this,
            animate        = me.motion !== 'instant',
            transitionTail = me.transition?.catch(() => {}) || Promise.resolve();

        me.motion = 'animate';

        // Transitions are one ordered lane. A superseding value used to start its apply while the
        // prior clear was still live; that clear could then remove the new presentation while the
        // reactive id correctly survived. Clear first, then wait for the latest committed projection
        // before resolving the live tabs instance the apply mutates. `syncDockProjection` remains
        // the refresh-owned idempotent reapply inside that projection.
        me.transition = transitionTail.then(async () => {
            oldValue && await me.clearPresentation({animate: animate && !value});

            if (value) {
                await (me.owner.refreshPromise?.catch(() => {}) || Promise.resolve());

                if (me.maximizedNodeId === value && !me.isDestroyed) {
                    await me.applyPresentation(value, {animate})
                }
            }
        }).catch(() => null)
    }

    /**
     * The toggle behind the header action. Restoring returns focus to the restored node's active
     * header button — the input contract's focus half.
     * @param {String} dockNodeId
     */
    toggle(dockNodeId) {
        let me       = this,
            restored = me.maximizedNodeId === dockNodeId;

        me.maximizedNodeId = restored ? null : dockNodeId;

        restored && me.focusTarget(dockNodeId)
    }

    /**
     * `Escape` restores an active maximize and returns focus to the restored node's active
     * header button. A no-op while nothing is maximized.
     * @param {Object} data
     */
    onEscape(data) {
        let me     = this,
            nodeId = me.maximizedNodeId;

        if (nodeId) {
            me.maximizedNodeId = null;
            me.focusTarget(nodeId)
        }
    }

    /**
     * Focuses the restored node's active header button after a maximize restore; an
     * unresolvable button falls back to the tabs root.
     * @param {String} nodeId
     * @protected
     */
    focusTarget(nodeId) {
        let tabContainer = this.owner.getDockHost()?.down?.({dockNodeId: nodeId});

        if (tabContainer) {
            let buttons = tabContainer.getTabButtons?.() || [],
                index   = tabContainer.activeIndex;

            (buttons[index] || tabContainer).focus?.()
        }
    }

    /**
     * Measures the dock area's live viewport rect — the geometry authority for the maximize
     * presentation. A maximized pane fills the DOCK AREA, not the app view: a workspace that
     * frames it with a tour bar or a status bar keeps them in sight. The area is measured
     * explicitly: a named dock host is the consumer's stated dock area; a workspace that is its own
     * host measures the projected shell at `dockShellIndex` — the chrome it frames the shell with
     * (a perspective toolbar at index 0) sits outside that rect; the workspace root stands in only
     * while nothing is mounted. `inset: 0` would answer to the viewport or an incidental fixed
     * containing block instead. `null` is the fail-safe trigger (unmounted mid-gesture, zero-area
     * rect).
     * @returns {Promise<Object|null>}
     * @protected
     */
    async measureRect() {
        let {owner} = this,
            host    = owner.getDockHost(),
            area    = host === owner ? (owner.items?.[owner.dockShellIndex] || owner) : (host || owner),
            rect    = null;

        try {
            rect = await Neo.main.DomAccess.getBoundingClientRect({id: area.id, windowId: owner.windowId})
        } catch (error) {
            rect = null
        }

        Array.isArray(rect) && (rect = rect[0]);

        return (rect?.width > 0 && rect?.height > 0) ? rect : null
    }

    /**
     * @summary The four inline rect values of a maximized node: the measured host rect inset by
     * the gap token on every side.
     *
     * The gap is a paint-contract value (`--dock-maximize-gap` on `.neo-dashboard`), never a
     * worker literal, so the rect is written as `calc()` against the token and resolves in CSS —
     * a consumer tunes the gap without a worker round trip. The FLIP measures the DOM and is
     * unaffected by how the values are expressed.
     * @param {Object} rect The host's live viewport rect
     * @returns {Object} `{height, left, top, width}`
     * @protected
     */
    rectStyle(rect) {
        const gap = 'var(--dock-maximize-gap, 0px)';

        return {
            height: `calc(${rect.height}px - 2 * ${gap})`,
            left  : `calc(${rect.left}px + ${gap})`,
            top   : `calc(${rect.top}px + ${gap})`,
            width : `calc(${rect.width}px - 2 * ${gap})`
        }
    }

    /**
     * The fail-safe half of the geometry contract: an unresolvable measurement or projection
     * clears the transient through the ordinary restore path — never a half state.
     * @param {String} nodeId The transition this failure belongs to.
     * @protected
     */
    fail(nodeId) {
        let me = this;

        if (me.maximizedNodeId === nodeId) {
            me.motion          = 'instant';
            me.maximizedNodeId = null
        }
    }

    /**
     * Stamps the maximize FLIP marker onto every live projected tabs node (idempotent) and
     * flushes, so a following capture sees each node's pre-toggle rect: the maximized node
     * glides, and the siblings reflowing around its vacated flow slot glide with it instead of
     * snapping. Stamped lazily at gesture time — a workspace that never maximizes projects
     * byte-identically.
     * @returns {Promise<void>}
     * @protected
     */
    async stampMarkers() {
        let me      = this,
            {owner} = me,
            prefix  = me.markerPrefix,
            shell   = owner.getDockHost()?.items?.[owner.dockShellIndex],
            tabs    = shell ? Reconciler.collectProjectedTabs(shell) : new Map(),
            dirty   = [];

        tabs.forEach(tab => {
            let marker = `${prefix}${encodeURIComponent(tab.dockNodeId)}`;

            if (!tab.cls.includes(marker)) {
                tab.cls = [...new Set([...tab.cls, marker])];
                dirty.push(tab)
            }
        });

        await Promise.all(dirty.map(tab => tab.promiseUpdate?.()))
    }

    /**
     * FLIP first-phase for a maximize transition, over the dedicated maximize marker family —
     * separate from the owner's `flipMarkerPrefix` so committed-operation refreshes and maximize
     * gestures never consume each other's snapshots.
     * @returns {Promise<Neo.container.Base|null>} The dock host, for the paired play call.
     * @protected
     */
    async captureFirst() {
        let me   = this,
            host = me.owner.getDockHost(),
            flip = Neo.main?.addon?.DockFlip;

        if (!host?.mounted) {
            return null
        }

        try {
            await flip?.captureFirst({hostId: host.id, markerPrefix: me.markerPrefix, windowId: host.windowId})
        } catch (error) {/* instant landing */}

        return host
    }

    /**
     * FLIP second-phase for a maximize transition — the same fail-safe discipline as the owner's
     * refresh: gate on the play capability, bracket the motion signal on the owner, and let every
     * failure land the final geometry instantly. Truth never waits on motion.
     * @param {Neo.container.Base|null} host
     * @returns {Promise<*>}
     * @protected
     */
    playFlip(host) {
        let me      = this,
            {owner} = me,
            flip    = Neo.main?.addon?.DockFlip,
            played;

        if (!host || typeof flip?.play !== 'function' || me.isDestroyed) {
            return Promise.resolve(null)
        }

        MotionSignal.enter(owner);

        try {
            played = flip.play({hostId: host.id, markerPrefix: me.markerPrefix, windowId: host.windowId})
        } catch (error) {
            played = Promise.reject(error)
        }

        played = Promise.resolve(played).catch(() => null);
        played.finally(() => MotionSignal.leave(owner));

        me.play = played;

        return played
    }

    /**
     * Engaging maximize closes an in-progress reveal — one overlay tier at a time, and
     * deterministically: the reveal machine gets an explicit dismissal input rather than the
     * presentation relying on the overlay's focus/outside-click decay to arrive in time.
     * @protected
     */
    dismissRevealOverlays() {
        let {owner} = this,
            walk    = item => {
                if (!item) {
                    return
                }

                if (item.ntype === 'dashboard-dock-rail') {
                    item.revealMachine?.outsideClick?.();
                    return
                }

                (item.items || []).forEach(walk)
            };

        walk(owner.getDockHost()?.items?.[owner.dockShellIndex])
    }

    /**
     * The input-contract guard while a node is maximized: in-strip reorder stays live (the zone
     * keeps sorting, clamped to its own toolbar), while cross-zone exits and tear-out are
     * suppressed — every drop target sits under the maximized plane, so offering the gesture
     * would be dishonest. Idempotent per zone instance: re-application onto the same live zone
     * keeps the original snapshot, so restore always lands the pre-maximize values.
     * @param {Neo.tab.Container} tabContainer
     * @protected
     */
    suppressDragSources(tabContainer) {
        let me   = this,
            bar  = tabContainer.getTabBar?.(),
            zone = bar?.sortZone || null;

        if (me.restoreSnapshot?.zoneId && me.restoreSnapshot.zoneId === zone?.id) {
            return
        }

        me.restoreSnapshot = {
            nodeId: tabContainer.dockNodeId,
            zone  : zone && {
                allowOverdrag      : zone.allowOverdrag,
                boundaryContainerId: zone.boundaryContainerId,
                enableProxyToPopup : zone.enableProxyToPopup
            },
            zoneId: zone?.id || null
        };

        // One coherent batched mutation per direction — the core reactive-config idiom.
        zone?.set({
            allowOverdrag      : false,
            boundaryContainerId: bar.id,
            enableProxyToPopup : false
        })
    }

    /**
     * Applies the maximize presentation onto the live projected tabs node: the measured
     * workspace rect as four inline values plus the class toggle — never a re-parent, never a
     * committed operation. Fail-safe: an unresolvable node or measurement clears the transient
     * instead of leaving a half state. Idempotent, so the re-projection continuity can re-enter it.
     * @param {String} nodeId
     * @param {Object} [options={}]
     * @param {Boolean} [options.animate=true]
     * @returns {Promise<void>}
     * @protected
     */
    async applyPresentation(nodeId, {animate=true}={}) {
        let me   = this,
            host = null,
            rect, tabContainer;

        tabContainer = me.owner.getDockHost()?.down?.({dockNodeId: nodeId});

        if (!tabContainer || tabContainer.isDestroyed) {
            me.fail(nodeId);
            return
        }

        rect = await me.measureRect();

        if (!rect) {
            me.fail(nodeId);
            return
        }

        if (me.maximizedNodeId !== nodeId || me.isDestroyed) {
            return
        }

        // Serialize on any in-flight FLIP window before WRITING: its end-of-window cleanup
        // restores the inline-style snapshot from invert time, which would overwrite geometry
        // written inside the window. Deliberately after the fail-guards — a fail-safe clear
        // writes nothing and must never queue behind motion.
        await me.play;

        if (me.maximizedNodeId !== nodeId || me.isDestroyed) {
            return
        }

        me.dismissRevealOverlays();
        me.suppressDragSources(tabContainer);

        if (animate) {
            await me.stampMarkers();
            host = await me.captureFirst();

            if (me.maximizedNodeId !== nodeId || me.isDestroyed) {
                return
            }
        }

        // wrapperStyle is the dock's geometry carrier (the reconciler writes split flex through
        // it) and a shallow-merge descriptor: only the four rect keys ride here, and `null`
        // removes — the `style` config cannot remove against the wrapperStyle/vdom mirror loop.
        tabContainer.set({
            cls: [...new Set([
                ...tabContainer.cls.filter(c => c !== 'neo-dock-maximize-restoring'),
                'neo-dock-maximized'
            ])],
            wrapperStyle: me.rectStyle(rect)
        });

        if (animate) {
            // The mutation→motion boundary must be deterministic: play() measures Last and
            // snapshots inline styles for its cleanup, so an un-flushed delta makes it capture
            // the OLD geometry — and its cleanup would then resurrect the stale inline values.
            try {
                await tabContainer.promiseUpdate?.()
            } catch (error) {/* destroyed mid-flight: the play gate below lands instantly */}

            me.playFlip(host)
        }

        me.syncActionPresentation(tabContainer, true);
        await me.registerResizeObserver(true)
    }

    /**
     * Restores the ordinary presentation: removes the class and the four inline rect values,
     * lifts the drag-source suppression, and (for gesture-driven restores) FLIP-glides the node
     * from the workspace rect back into its flow slot while `neo-dock-maximize-restoring` holds
     * its paint order above the re-expanded layout until the motion settles.
     * @param {Object} [options={}]
     * @param {Boolean} [options.animate=true]
     * @returns {Promise<void>}
     * @protected
     */
    async clearPresentation({animate=true}={}) {
        let me   = this,
            host = null,
            tabContainer;

        if (me.isDestroyed) {
            return
        }

        if (!me.restoreSnapshot) {
            // A failed superseding apply can clear the reactive id after the prior clear already
            // consumed the restore snapshot. The observer may still be live because its generation
            // guard correctly refused to unregister while that superseding id was non-null. Once the
            // id is null, this clear remains the lifecycle owner even without geometry left to restore.
            !me.maximizedNodeId && await me.registerResizeObserver(false);
            return
        }

        // Same serialization as the apply path: never mutate geometry inside a live FLIP
        // window whose cleanup will re-stamp its stale snapshot.
        await me.play;

        // An independent destroy while this waited has already reset the node.
        if (me.isDestroyed) {
            return
        }

        if (animate) {
            await me.stampMarkers();
            host = await me.captureFirst();

            if (me.isDestroyed) {
                return
            }
        }

        tabContainer = me.resetPresentation({animate});

        if (tabContainer && animate) {
            // Same deterministic boundary as the apply path: an un-flushed delta lets play()
            // snapshot the maximize rect as "inline styles to restore" — its cleanup would
            // stamp the fullscreen values back onto the restored node.
            try {
                await tabContainer.promiseUpdate?.()
            } catch (error) {/* destroyed mid-flight */}

            if (me.isDestroyed) {
                // No play will lift the paint-order hold: lift it now.
                !tabContainer.isDestroyed && (tabContainer.cls = tabContainer.cls.filter(c => c !== 'neo-dock-maximize-restoring'));
                return
            }

            me.playFlip(host).then(() => {
                !tabContainer.isDestroyed && (tabContainer.cls = tabContainer.cls.filter(c => c !== 'neo-dock-maximize-restoring'))
            })
        }

        await me.registerResizeObserver(false)
    }

    /**
     * The synchronous half of a restore: consumes the restore snapshot and lifts the class, the
     * four inline rect values, the drag-source suppression and the action's pressed state from
     * the live node. {@link #clearPresentation} runs it after its serialization awaits; an
     * independent destroy runs it directly, so a plugin removed from a living owner leaves no
     * geometry behind.
     * @param {Object} [options={}]
     * @param {Boolean} [options.animate=false] Keep the restoring marker on for a following FLIP play.
     * @returns {Neo.tab.Container|null} The restored node, or null when nothing was applied.
     * @protected
     */
    resetPresentation({animate=false}={}) {
        let me      = this,
            restore = me.restoreSnapshot,
            tabContainer, zone;

        if (!restore) {
            return null
        }

        me.restoreSnapshot = null;
        tabContainer       = me.owner.getDockHost()?.down?.({dockNodeId: restore.nodeId});

        if (!tabContainer || tabContainer.isDestroyed) {
            return null
        }

        zone = tabContainer.getTabBar?.()?.sortZone;

        if (restore.zone && zone && zone.id === restore.zoneId) {
            // One coherent batched mutation — the same idiom as the suppress direction.
            zone.set(restore.zone)
        }

        // Null values through the shallow-merge wrapperStyle descriptor are the house
        // removal idiom (the reconciler un-sets flex the same way).
        tabContainer.set({
            cls: [
                ...tabContainer.cls.filter(c => c !== 'neo-dock-maximized'),
                ...(animate ? ['neo-dock-maximize-restoring'] : [])
            ],
            wrapperStyle: {height: null, left: null, top: null, width: null}
        });

        me.syncActionPresentation(tabContainer, false);

        return tabContainer
    }

    /**
     * States whether the node is maximized. The action's own `pressed` handler
     * ({@link Neo.toolbar.ActionButton#afterSetPressed}) turns that into icon, accessible name and
     * tooltip in one update, from the pair the projection declared — so the glyph naming the NEXT
     * action is a property of the action, not of each caller that flips it.
     * @param {Neo.tab.Container|null} tabContainer
     * @param {Boolean} maximized
     */
    syncActionPresentation(tabContainer, maximized) {
        tabContainer?.getActionItem?.('maximize')?.set({pressed: maximized})
    }

    /**
     * Classifies a committed operation descriptor as confined to the maximized node — the ops
     * that must NOT pre-clear the transient: their effect stays inside the pane the user is
     * looking at, so the continuity rule ({@link #syncDockProjection}) decides from the committed
     * outcome instead (node survived ⇒ re-apply; collapsed away ⇒ clear). Everything else —
     * topology mutations, boundary crossings, whole-document applies (a `null` descriptor
     * included) — clears terminally before it applies.
     * @param {Object|null} descriptor
     * @returns {Boolean}
     * @protected
     */
    isNeutralOperation(descriptor) {
        let me                                            = this,
            nodeId                                        = me.maximizedNodeId,
            document                                      = me.owner.dockModel,
            {itemId, operation, tabsNodeId, targetNodeId} = descriptor || {};

        if (!operation || !nodeId) {
            return false
        }

        switch (operation) {
            case 'addTab': {
                // The addTab handler re-dispatches an already-contained item to moveItem, so a
                // descriptor targeting the maximized node can still RELOCATE the item out of a
                // sibling — that reaches beyond the node. Neutral only for a catalog-only item
                // or one already inside the maximized node.
                let source = WorkspaceDocument.findContainingTabsId(document, itemId);

                return tabsNodeId === nodeId && (!source || source === nodeId)
            }
            case 'closeItem':
                return WorkspaceDocument.findContainingTabsId(document, itemId) === nodeId;
            case 'moveItem':
                return targetNodeId === nodeId && WorkspaceDocument.findContainingTabsId(document, itemId) === nodeId;
            case 'setActiveItem':
                return tabsNodeId === nodeId;
            default:
                return false
        }
    }

    /**
     * The deterministic re-projection half of the transient contract, awaited by the owner's
     * refresh: after a refresh, the presentation is re-applied iff {@link #maximizedNodeId} still
     * resolves to a projected tabs node, and cleared otherwise — never a third outcome. Committed
     * operations that reach beyond the maximized node clear the transient BEFORE their refresh
     * runs, and that clear is terminal, so this continuity path only ever re-applies a transient
     * that survived.
     * @returns {Promise<void>}
     */
    async syncDockProjection() {
        let me      = this,
            {owner} = me,
            nodeId  = me.maximizedNodeId,
            tabContainer;

        if (!nodeId) {
            return
        }

        tabContainer = owner.getDockHost()?.down?.({dockNodeId: nodeId});

        if (tabContainer && owner.dockModel?.nodes?.[nodeId]?.type === 'tabs') {
            await me.applyPresentation(nodeId, {animate: false})
        } else {
            me.fail(nodeId);

            // This runs INSIDE the owner's refresh. A value-bearing transition may be waiting for
            // that same refreshPromise before it applies, so awaiting the transition here closes a
            // refresh → transition → refresh cycle. No projected node remains to restore in this
            // branch; clear the independently-owned observer now and let the queued reactive clear
            // drain after the refresh releases its tail.
            await me.registerResizeObserver(false)
        }
    }

    /**
     * Registers/unregisters the owner's root with the main-thread ResizeObserver addon — a NEW
     * observation scoped exactly to the maximize lifetime: no standing cost while un-maximized,
     * unregistered again on restore, node-clear, window change and destroy. The registration is
     * keyed on the owner's current window; the tuple it armed is kept for the release.
     * @param {Boolean} register
     * @returns {Promise<void>}
     * @protected
     */
    async registerResizeObserver(register) {
        let me      = this,
            {owner} = me,
            addon, generation;

        if (me.resizeObserved === register || me.isDestroyed) {
            return
        }

        if (register && !me.resizeListener) {
            me.resizeListener = {resize: me.onOwnerResize, scope: me};
            owner.addDomListeners(me.resizeListener)
        }

        generation = ++me.observationGeneration;
        addon      = await Neo.currentWorker.getAddon('ResizeObserver', owner.windowId);

        // A later register, release, window change or destroy owns the observer now: this await
        // belongs to a superseded generation and touches nothing.
        if (me.isDestroyed || !addon || generation !== me.observationGeneration) {
            return
        }

        if (register && me.maximizedNodeId) {
            me.observation    = {componentId: owner.id, id: owner.id, windowId: owner.windowId};
            me.resizeObserved = true;
            addon.register(me.observation)
        } else if (!register && me.observation && !me.maximizedNodeId) {
            // The generation guard: a restore's deferred unregister can land AFTER a newer
            // maximize registered — the observation is keyed on the one workspace id, so tearing
            // it down here would leave the newer presentation blind. While any maximize is live,
            // the observation stays; the final restore (transient null) tears down.
            addon.unregister(me.observation);
            me.observation    = null;
            me.resizeObserved = false
        }
    }

    /**
     * Unregisters the exact tuple this plugin armed, in the window it armed it, and forgets it —
     * synchronous, so a window change and destroy can call it; the addon proxy routes by the
     * tuple's `windowId`.
     * @protected
     */
    releaseObservation() {
        let me            = this,
            {observation} = me;

        if (observation) {
            me.observation    = null;
            me.resizeObserved = false;
            Neo.main.addon.ResizeObserver?.unregister(observation)
        }
    }

    /**
     * Re-measures and re-applies the maximize rect while the owner resizes — geometry only, no
     * motion. An unresolvable measurement takes the fail-safe restore path.
     * @param {Object} data
     * @protected
     */
    async onOwnerResize(data) {
        let me     = this,
            nodeId = me.maximizedNodeId,
            rect, tabContainer;

        if (!nodeId) {
            return
        }

        rect = await me.measureRect();

        if (!rect) {
            me.fail(nodeId);
            return
        }

        if (me.maximizedNodeId !== nodeId) {
            return
        }

        await me.play;

        if (me.maximizedNodeId !== nodeId) {
            return
        }

        tabContainer = me.owner.getDockHost()?.down?.({dockNodeId: nodeId});

        tabContainer && !tabContainer.isDestroyed && tabContainer.set({
            wrapperStyle: me.rectStyle(rect)
        })
    }

    /**
     * Releases the observation the plugin armed and retires every await still in flight; the
     * owner's destroy pass runs this, so a destroyed workspace holds no maximize observer and no
     * restore snapshot. A plugin removed from a LIVING owner leaves the owner as it found it: the
     * live node's presentation reset, the resize dom listener, the two owner listeners and the
     * `Escape` binding removed, the window observation released, and itself gone from `plugins`
     * so no projection or refresh consults a dead collaborator.
     * @param {...*} args
     */
    destroy(...args) {
        let me         = this,
            {owner}    = me,
            ownerAlive = !owner.isDestroying && !owner.isDestroyed;

        me.observationGeneration++;
        me.releaseObservation();
        me.unobserveOwnerWindowId?.();

        if (ownerAlive) {
            let shell = owner.getDockHost()?.items?.[owner.dockShellIndex];

            me.resetPresentation();
            me.resizeListener && owner.removeDomListeners(me.resizeListener);

            // Header actions ride retained instances, so a refresh would keep projecting a toggle
            // with no owner: hide it on every live node the way the reconciler varies an action.
            shell && Reconciler.collectProjectedTabs(shell).forEach(tab => tab.getActionItem?.('maximize')?.set({hidden: true}));

            owner.un({
                beforeDockZoneDocumentChange: me.onBeforeDockZoneDocumentChange,
                dockHeaderAction            : me.onDockHeaderAction,
                scope                       : me
            });

            owner.keys?.removeKey({fn: 'onEscape', key: 'Escape', scope: me.id});
            owner.plugins = owner.plugins.filter(plugin => plugin !== me)
        }

        me.restoreSnapshot = null;

        super.destroy(...args)
    }
}

export default Neo.setupClass(Maximize);
