import Base              from '../../../src/core/Base.mjs';
import PreviewContract   from '../../../src/dashboard/dock/model/PreviewContract.mjs';
import WorkspaceDocument from '../../../src/dashboard/dock/model/WorkspaceDocument.mjs';

/**
 * @class Neo.examples.dashboard.crossWindow.DemoBKeyboardHost
 * @extends Neo.core.Base
 * @summary Connects the cross-window demo's keyboard command machine to its live host.
 *
 * Mixed into the workspace without constructing a second owner. Commands, origin-window
 * state, highlight generations, documents and announcement regions remain on that host.
 * Internal calls resolve its current methods; host facades supply semantic IDs and grammar.
 */
class DemoBKeyboardHost extends Base {
    static config = {
        /** @member {String} className='Neo.examples.dashboard.crossWindow.DemoBKeyboardHost' */
        className: 'Neo.examples.dashboard.crossWindow.DemoBKeyboardHost'
    }

    /**
     * @summary Render a keyboard command outcome into EVERY live announcement region — the
     * announcement seam of the keyboard command machine. TEXT only (`.text` is inert by
     * construction); the message is the machine's complete terminal-derived sentence.
     *
     * Both windows carry the same terminal-derived truth: a command's outcome must be audible
     * wherever the operator's focus ends up (a committed transfer moves focus ACROSS windows,
     * so announcing only in the origin window would announce into the window they just left).
     * @param {Object} announcement `{command, itemId, terminal, focusTransferred, message}`.
     * @protected
     */
    announceKeyboardOutcome({message}) {
        let me     = this,
            main   = me.getReference('kbd-live-b'),
            popup  = me.kbdLivePopup,
            popup2 = me.kbdLivePopup2;

        main && (main.text = message);
        popup && !popup.isDestroyed && (popup.text = message);
        popup2 && !popup2.isDestroyed && (popup2.text = message)
    }

    /**
     * @summary The keyboard command surface's key routing. Entry chords on a focused dock tab
     * header: Ctrl+Shift+D detaches it to its own OS window; Ctrl+Shift+M starts the move cycle.
     * While a cycle is active, Ctrl+Shift+ArrowRight/ArrowLeft cycle the candidates,
     * Ctrl+Shift+Enter commits, and Escape (alone — no native meaning on a header) cancels.
     * Outside a cycle every key keeps its native meaning; the machine's `getActiveCycle()` is
     * the single routing gate.
     * @param {Object} data The keydown DomEvent payload.
     * @param {Object} options Host-owned semantic identity and cycle grammar.
     * @param {String} options.mainWorkspaceId
     * @param {String} options.instructions
     * @returns {Promise<void>}
     * @protected
     */
    async routeKeyboardInput(data, {mainWorkspaceId, instructions}) {
        let me       = this,
            commands = me.keyboardCommands,
            chorded  = data.ctrlKey && data.shiftKey;

        // the routing host that caught this keydown names the ORIGIN window — the directional
        // fact focus mechanics need (a popup focuses its opener; the opener focuses by name)
        me.lastKeyboardOriginWindowId = data.component?.windowId ?? me.windowId;

        if (commands.getActiveCycle()) {
            if (data.key === 'Escape') {
                commands.cycleCancel();
                return
            }

            if (chorded) {
                switch (data.key) {
                    case 'ArrowRight':
                        commands.cycleNext();
                        return
                    case 'ArrowLeft':
                        commands.cyclePrev();
                        return
                    case 'Enter':
                        await commands.cycleCommit();
                        return
                }
            }

            return
        }

        if (!chorded || !['d', 'm'].includes(data.key?.toLowerCase?.())) {
            return
        }

        let focused = me.resolveFocusedDockItem(data);

        if (!focused) return;

        if (data.key.toLowerCase() === 'd') {
            // detach parity with the pointer projection's arming rule: tear-out arms on the
            // MAIN workspace only — a tear-out FROM a vessel window is popup-over-popup
            // territory, deliberately not wired on either input path
            if (focused.workspaceId !== mainWorkspaceId) return;

            await commands.detachItem(focused)
        } else {
            commands.cycleStart({...focused, instructions: instructions})
        }
    }

    /**
     * @summary Resolve the dock item the keydown acted on: the event path's tab-header button →
     * its `dockItemId` STAMP when present (structural identity — the projection writes it into
     * every header config it builds, so identity never depends on header order ≡ document
     * order), else the positional fallback: header toolbar index → the owning projected
     * tab-container's `dockNodeId` → its WORKSPACE's document tabs node items at that index.
     * The document is the authority on purpose: DemoB's panes are LIVE instances, which the
     * adapter's item decoration deliberately passes through untouched — only freshly-projected
     * CONTAINER configs carry dock metadata, so the container's node id + the committed document
     * answer identity where the card cannot. Which document is answered by host containment
     * ({@link #resolveDockWorkspaceId}), so a popup-origin keydown resolves against the popup
     * workspace's truth.
     * @param {Object} data The keydown DomEvent payload (carries the component path).
     * @returns {Object|null} `{itemId, itemLabel, workspaceId}` or `null` when the focus is not a dock tab header.
     * @protected
     */
    resolveFocusedDockItem(data) {
        let me     = this,
            button = (data.path || [])
                .map(node => Neo.getComponent(node.id))
                .find(component => component?.ntype === 'tab-header-button');

        if (!button) return null;

        let toolbar      = button.up({ntype: 'tab-header-toolbar'}) || button.parent,
            tabContainer = toolbar?.up({ntype: 'tab-container'}),
            workspaceId  = me.resolveDockWorkspaceId(tabContainer),
            document     = workspaceId ? me.getWorkspaceDocument(workspaceId) : null;

        // structural identity first: the projection's own stamp, immune to any future
        // pinning/reorder/hidden-class change in header order
        if (button.dockItemId) {
            return {
                itemId   : button.dockItemId,
                itemLabel: document?.items?.[button.dockItemId]?.title ?? button.dockItemId,
                workspaceId
            }
        }

        let index = toolbar?.items?.indexOf(button) ?? -1,
            // the projection filters rail-hidden items out of the tab flow — mirror it so the
            // header index maps to the same list the strip renders
            nodeItems = document?.nodes?.[tabContainer?.dockNodeId]?.items?.filter(id =>
                document.items?.[id]?.autoHidden !== true
            ),
            itemId    = index > -1 && Array.isArray(nodeItems) ? nodeItems[index] : null;

        if (!itemId) return null;

        return {
            itemId,
            itemLabel: document?.items?.[itemId]?.title ?? itemId,
            workspaceId
        }
    }

    /**
     * @summary Resolve which registered workspace a projected component belongs to, by walking
     * its parent chain up to a live host in {@link Neo.examples.dashboard.crossWindow.DemoBWorkspace#crossWindowHosts}. Containment is the
     * identity mechanism on purpose: the adapter stamps `dockWorkspaceId` on SortZone configs
     * (created lazily on first drag), while the host registry is live from composition time —
     * one mechanism that answers for every projected child in either window, drag-armed or not.
     * @param {Neo.component.Base|null} component
     * @returns {String|null} The workspace id, or `null` when the component is outside every host.
     * @protected
     */
    resolveDockWorkspaceId(component) {
        let current = component;

        while (current) {
            for (const [workspaceId, host] of this.crossWindowHosts) {
                if (host === current) return workspaceId
            }

            current = current.parent
        }

        return null
    }

    /**
     * @summary Enumerate the legal keyboard-transfer targets across the registered workspaces —
     * every tabs zone in STABLE registry order, excluding the item's current tabs, labeled with
     * the workspace's human name (+ a zone ordinal when a workspace has several).
     * @param {Object} data
     * @param {String} data.itemId
     * @param {Object<String,String>} labels Host-owned workspace labels.
     * @returns {Object[]} `[{workspaceId, tabsId, label}]`
     * @protected
     */
    collectKeyboardTargets({itemId}, labels) {
        let me = this;

        return me.workspaceSet.ids().flatMap(workspaceId => {
            // only workspaces with a LIVE render target are legal keyboard targets: a registered
            // popup workspace whose window never opened cannot show the highlight, cannot take
            // focus, and would leave the operator committing into the invisible
            let host = me.crossWindowHosts.get(workspaceId);

            if (!host || host.isDestroyed) return [];

            let document     = me.workspaceSet.getDocument(workspaceId),
                nodes        = document?.nodes || {},
                sourceTabsId = document?.items?.[itemId]
                    ? WorkspaceDocument.findContainingTabsId(document, itemId)
                    : null,
                tabsIds      = Object.keys(nodes).filter(nodeId =>
                    nodes[nodeId].type === 'tabs' && nodeId !== sourceTabsId
                );

            // itemId rides every candidate: the highlight seam renders through the shared
            // dockPreview contract, whose payloads are item-scoped by schema
            return tabsIds.map((tabsId, index) => ({
                itemId,
                label: tabsIds.length > 1
                    ? `${labels[workspaceId] ?? workspaceId}, zone ${index + 1}`
                    : (labels[workspaceId] ?? workspaceId),
                tabsId,
                workspaceId
            }))
        })
    }

    /**
     * @summary Render (or clear) the keyboard cycle's current-candidate highlight through the
     * SHARED drag-affordance consumer: a hand-built `tab-into` dockPreview payload (the contract
     * module is the pure SSOT; the fail-closed renderer validates it) drives the target host's
     * {@link Neo.dashboard.dock.interaction.Preview} — the same overlay, geometry conversion, and skin the
     * pointer hover renders through, so one affordance model serves both input paths. The
     * indicator MENU stays pointer-owned: its semantics are within-zone position choice, which
     * the keyboard cycle's zone-target grammar deliberately does not offer.
     *
     * The overlay's whole-zone band is shape+position — inherently paired with a non-color
     * carrier, the WCAG 1.4.1 duty the command machine's seam documents.
     *
     * Async by necessity (a popup target may need a first geometry measure); the generation
     * token makes it supersession-safe — a stale measure never paints over a newer candidate
     * or a clear. The machine treats the seam as fire-and-forget, so ordering is owned here.
     * @param {Object|null} target `{workspaceId, tabsId, itemId}` or `null` to clear.
     * @returns {Promise<void>}
     * @protected
     */
    async setKeyboardTargetHighlight(target) {
        let me         = this,
            generation = ++me.keyboardHighlightGeneration;

        // every flip clears BOTH windows' overlays first: the previous candidate may render
        // in the other window, and a clear (null) must reach it too
        me.crossWindowHosts.forEach((host, workspaceId) => me.clearWorkspaceAffordances(workspaceId));

        if (!target) return;

        let host = me.crossWindowHosts.get(target.workspaceId);

        if (!host || host.isDestroyed) return;

        let geometry = me.crossWindowGeometry.get(target.workspaceId)
                || await me.measureWorkspaceGeometry(target.workspaceId);

        if (generation !== me.keyboardHighlightGeneration || !geometry || me.isDestroyed) return;

        let renderer = host.down({ntype: 'dock-preview'}),
            zone     = geometry.zones.find(entry => entry.nodeId === target.tabsId);

        if (!renderer || !zone) return;

        renderer.dockPreview = {
            feedback : {state: 'accepted'},
            itemId   : target.itemId,
            placement: {kind: 'tab-into'},
            schema   : PreviewContract.PREVIEW_SCHEMA,
            target   : {nodeId: target.tabsId}
        };
        renderer.applyTargetGeometry(me.localDockRect(zone.rect, geometry.hostRect))
    }

    /**
     * @summary Commits a keyboard transfer through the Group and awaits the resulting projection.
     * The Group re-reads both documents at its queue head, preserving intervening accepted edits.
     * @param {Object} data
     * @param {String} data.itemId
     * @param {Object} data.target `{workspaceId, tabsId}` — the committed cycle candidate.
     * @returns {Promise<{errors: String[]}>}
     * @protected
     */
    async commitKeyboardTransfer({itemId, target}) {
        let me                = this,
            sourceWorkspaceId = me.workspaceSet.ids().find(id =>
                !!me.workspaceSet.getDocument(id)?.items?.[itemId]
            );

        if (!sourceWorkspaceId) {
            return {errors: [`unknown item "${itemId}"`]}
        }

        let pair = {sourceWorkspaceId, targetWorkspaceId: target.workspaceId,
            descriptor: {operation: 'transferItem', itemId, sourceWorkspaceId, targetWorkspaceId: target.workspaceId,
                target: {operation: 'addTab', tabsNodeId: target.tabsId}}};

        if (!await me.adoptCommittedTransferPair(pair)) {
            return {errors: pair.errors ?? ['workspace-set adoption refused the pair']}
        }

        await me.awaitProjectionIdle();

        return {errors: []}
    }

    /**
     * @summary Focus a named popup window through the Main verb — Boolean admission (the
     * `windowOpen` discipline applied to focus): the answer is the verified outcome, and `false`
     * is a legitimate degraded terminal for the command machine to announce, never a throw.
     * @param {String} windowName
     * @returns {Promise<Boolean>}
     * @protected
     */
    async focusNamedWindow(windowName) {
        try {
            return !!(await Neo.Main.windowFocus({windowName, windowId: this.windowId}))
        } catch (error) {
            return false
        }
    }

    /**
     * @summary Transfer focus to the window rendering a workspace — the command machine's
     * `focusWorkspace` seam, DIRECTIONAL because focus-stealing rules are: a window may focus a
     * popup it opened (the named handle lives in its Main actor), and a popup may focus its
     * OPENER (it holds the keystroke's user activation) — so the route is picked from the
     * command's recorded origin window. Same Boolean-admission discipline on every branch; a
     * platform decline is the machine's announced degraded terminal, never a throw.
     * @param {String} workspaceId
     * @param {Object} options Host-owned popup identities and window names.
     * @param {String} options.popup2WorkspaceId
     * @param {String} options.popup2WindowName
     * @param {String} options.popupWindowName
     * @returns {Promise<Boolean>}
     * @protected
     */
    async focusKeyboardWorkspace(workspaceId, {popup2WorkspaceId, popup2WindowName, popupWindowName}) {
        let me   = this,
            host = me.crossWindowHosts.get(workspaceId);

        if (!host || host.isDestroyed) return false;

        let targetWindowId = host.windowId,
            originWindowId = me.lastKeyboardOriginWindowId ?? me.windowId;

        // the command ran in the target's own window — focus is already there
        if (targetWindowId === originWindowId) return true;

        // popup-workspace target: the MAIN window opened it, so ITS Main actor holds the handle
        if (targetWindowId !== me.windowId) {
            return me.focusNamedWindow(workspaceId === popup2WorkspaceId
                ? popup2WindowName
                : popupWindowName)
        }

        // main-window target from a popup origin: route the verb to the POPUP's main thread
        // (windowId routing) — omitting windowName makes it focus its opener
        try {
            return !!(await Neo.Main.windowFocus({windowId: originWindowId}))
        } catch (error) {
            return false
        }
    }
}

export default Neo.setupClass(DemoBKeyboardHost);
