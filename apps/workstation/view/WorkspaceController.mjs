import CommandPalette           from '../../../examples/workbench/CommandPalette.mjs';
import Controller               from '../../../src/controller/Component.mjs';
import DockProjectionReconciler from '../../../src/dashboard/dock/projection/Reconciler.mjs';
import TransactionManager       from '../../../src/manager/Transaction.mjs';
import NativeVesselTransaction  from '../../../src/dashboard/dock/window/NativeVesselTransaction.mjs';
import {resolveBootIntent}      from '../BootIntent.mjs';

/**
 * @summary Workstation actions, durable topology, window adoption and optional tour-controller activation.
 * @class Workstation.view.WorkspaceController
 * @extends Neo.controller.Component
 */
class WorkspaceController extends Controller {
    static config = {
        /** @member {String} className='Workstation.view.WorkspaceController' */
        className: 'Workstation.view.WorkspaceController'
    }

    /**
     * Cached `document.body` `keydown` listener descriptor bound to this controller while the workspace is mounted.
     * @member {Object|null} bodyKeyListener=null
     * @protected
     */
    bodyKeyListener = null
    /**
     * Window id on whose `Neo.main.DomEvents` `'F1'` `preventDefault` is currently registered.
     * @member {Number|String|null} registeredKeyWindowId=null
     * @protected
     */
    registeredKeyWindowId = null
    /** @member {Promise|null} tourControllerPromise=null */
    tourControllerPromise = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        Neo.currentWorker.on({connect: this.onWindowConnect, scope: this})
    }

    /**
     * @param {...*} args
     */
    destroy(...args) {
        this.syncBodyKeyCapture(false);
        Neo.currentWorker.un({connect: this.onWindowConnect, scope: this});

        super.destroy(...args)
    }

    /**
     * @summary Wires document-level command-palette shortcuts only while the workspace is mounted.
     */
    onComponentConstructed() {
        super.onComponentConstructed();

        if (this.component?.mounted) {
            this.syncBodyKeyCapture(true)
        }
    }

    /**
     * @summary Attaches or detaches the `document.body` `keydown` listener and `'F1'` `preventDefault` registration
     * in lockstep with the workspace's mount state so unmounted unit-test instances never retain global body listeners.
     * @param {Boolean} mounted
     */
    syncBodyKeyCapture(mounted) {
        const me        = this,
              workspace = me.component;

        if (!workspace || workspace.isDestroyed) {
            return
        }

        if (mounted) {
            if (!me.bodyKeyListener) {
                me.bodyKeyListener = {
                    keydown: me.onWorkspaceKeyDown,
                    scope  : me,
                    vnodeId: 'document.body'
                };
                workspace.addDomListeners?.(me.bodyKeyListener)
            }

            if (!Neo.config.unitTestMode && workspace.windowId && me.registeredKeyWindowId !== workspace.windowId) {
                if (me.registeredKeyWindowId) {
                    Neo.main?.DomEvents?.unregisterPreventDefaultKeys?.({
                        id      : 'document.body',
                        keys    : ['F1'],
                        windowId: me.registeredKeyWindowId
                    })
                }

                Neo.main?.DomEvents?.registerPreventDefaultKeys?.({
                    id      : 'document.body',
                    keys    : ['F1'],
                    windowId: workspace.windowId
                });
                me.registeredKeyWindowId = workspace.windowId
            }
        } else {
            if (me.bodyKeyListener) {
                workspace.removeDomListeners?.(me.bodyKeyListener);
                me.bodyKeyListener = null
            }

            if (me.registeredKeyWindowId) {
                if (!Neo.config.unitTestMode) {
                    Neo.main?.DomEvents?.unregisterPreventDefaultKeys?.({
                        id      : 'document.body',
                        keys    : ['F1'],
                        windowId: me.registeredKeyWindowId
                    })
                }
                me.registeredKeyWindowId = null
            }
        }
    }

    /**
     * @summary Lazily creates the workspace's contextual command palette instance.
     * @returns {Neo.examples.workbench.CommandPalette}
     */
    ensureCommandPalette() {
        const me        = this,
              workspace = me.component;

        if (!workspace.commandPalette || workspace.commandPalette.isDestroyed) {
            workspace.commandPalette = Neo.create(CommandPalette, {
                actionProvider : ({windowId}) => me.buildCommandPaletteActions(windowId),
                appName        : workspace.appName,
                parentComponent: workspace,
                placeholder    : 'Search arrangements, panes, or tour...',
                theme          : workspace.getTheme(),
                title          : 'Workstation Commands',
                windowId       : workspace.windowId
            })
        }

        return workspace.commandPalette
    }

    /**
     * @summary Opens or toggles the command palette from the TourToolbar `Commands` button.
     * @param {Object} [data]
     * @returns {Promise<Neo.examples.workbench.CommandPalette|Boolean>}
     */
    onOpenCommandPalette(data) {
        const me        = this,
              workspace = me.component,
              triggerId = me.getReference('command-palette-trigger')?.id ?? data?.component?.id ?? null;

        return me.ensureCommandPalette().toggle({
            context        : {windowId: workspace.windowId},
            fallbackFocusId: () => me.resolveFallbackFocusId(workspace.windowId),
            returnFocusId  : triggerId,
            theme          : workspace.getTheme(),
            windowId       : workspace.windowId
        })
    }

    /**
     * @summary Handles `Ctrl+K`, `Meta+K`, and `F1` across the main workspace window and open popup vessels.
     * @param {Object} data
     * @param {Number|String|null} [explicitWindowId=null]
     */
    onWorkspaceKeyDown(data, explicitWindowId = null) {
        if (!CommandPalette.isOpenShortcut(data)) {
            return
        }

        const me        = this,
              workspace = me.component;

        if (!workspace || workspace.isDestroyed) {
            return
        }

        data.cancelBubble = true;

        const windowId = explicitWindowId ?? workspace.windowId,
              originId = data.target?.id && data.target.id !== 'document.body' ? data.target.id : null;

        me.ensureCommandPalette().toggle({
            context        : {windowId},
            fallbackFocusId: () => me.resolveFallbackFocusId(windowId),
            returnFocusId  : originId,
            theme          : workspace.getTheme(),
            windowId
        })
    }

    /**
     * @summary Resolves a mounted fallback control in `windowId` (or the main `Commands` trigger when a popup closed).
     * @param {Number|String|null} windowId
     * @returns {String|null}
     * @protected
     */
    resolveFallbackFocusId(windowId) {
        const me        = this,
              workspace = me.component;

        if (!workspace || workspace.isDestroyed) {
            return null
        }

        if (windowId && windowId !== workspace.windowId) {
            const popupState = workspace.getPopupStates().find(state =>
                state.windowId === windowId && !state.disconnected && state.host && !state.host.isDestroyed
            );

            if (popupState?.host) {
                const shell = DockProjectionReconciler.liveShell(popupState.host.getDockHost(), popupState.host.dockShellIndex),
                      tabs  = DockProjectionReconciler.collectProjectedTabs(shell);

                for (const tabContainer of tabs.values()) {
                    const buttons = tabContainer.getTabButtons?.() || [],
                          button  = buttons[tabContainer.activeIndex ?? 0] || buttons[0];

                    if (button && !button.isDestroyed) {
                        return button.id
                    }
                }
            }
        }

        return me.getReference('command-palette-trigger')?.id ?? me.getReference('theme-toggle')?.id ?? null
    }

    /**
     * @summary Builds contextual Workstation actions for `windowId`, reflecting live arrangement, Group
     * history, projected dock panes, tour state, and workspace theme.
     * @param {Number|String|null} [windowId=this.component?.windowId]
     * @returns {Object[]}
     */
    buildCommandPaletteActions(windowId = this.component?.windowId) {
        const me            = this,
              workspace     = me.component,
              provider      = workspace.getStateProvider(),
              groupProvider = TransactionManager.getProvider(workspace.topologyGroupId),
              declared      = provider?.getData('dock.declaredPerspectives') || Object.keys(workspace.perspectives || {}),
              active        = workspace.activePerspective,
              modified      = Boolean(provider?.getData('dock.perspective.modified')),
              canUndo       = groupProvider?.getData('canUndo') === true,
              canRedo       = groupProvider?.getData('canRedo') === true,
              tourRunning   = Boolean(provider?.getData('tour.running')),
              gatePrompt    = provider?.getData('tour.gatePrompt') || null,
              isLight       = workspace.getTheme() === 'neo-theme-neo-light',
              actions       = [];

        if (declared.includes('shipped')) {
            actions.push({
                id               : 'arrangement:shipped',
                available        : active !== 'shipped',
                description      : 'Restore the dense 20-pane live operations workspace.',
                group            : 'Arrangements',
                handler          : () => me.onShowOperations(),
                iconCls          : 'fa fa-gauge-high',
                keywords         : ['operations', 'shipped', 'perspective', 'dense', 'matrix'],
                label            : 'Switch to Operations arrangement',
                unavailableReason: 'Operations arrangement is active'
            })
        }

        if (declared.includes('planning')) {
            actions.push({
                id               : 'arrangement:planning',
                available        : active !== 'planning',
                description      : 'Open the shared Team board, Release plan, and Team schedule.',
                group            : 'Arrangements',
                handler          : () => me.onShowPlanning(),
                iconCls          : 'fa fa-calendar-days',
                keywords         : ['planning', 'board', 'gantt', 'scheduler', 'perspective'],
                label            : 'Switch to Planning arrangement',
                unavailableReason: 'Planning arrangement is active'
            })
        }

        actions.push({
            id               : 'topology:reset',
            available        : modified,
            description      : 'Return the active arrangement and torn-out panes to their declared layout.',
            group            : 'Layout & History',
            handler          : () => workspace.resetTopology(),
            iconCls          : 'fa fa-rotate-left',
            keywords         : ['reset', 'default', 'restore', 'layout', 'topology'],
            label            : 'Reset arrangement to default',
            unavailableReason: 'Arrangement matches its default layout'
        }, {
            id         : 'topology:undo',
            available  : canUndo,
            description: 'Step back one committed layout or arrangement transaction.',
            group      : 'Layout & History',
            handler    : async () => {
                const result = await TransactionManager.undo({groupId: workspace.topologyGroupId});
                await Promise.resolve(workspace.refreshPromise).catch(() => {});
                return result
            },
            iconCls          : 'fa fa-rotate-left',
            keywords         : ['undo', 'back', 'history', 'transaction'],
            label            : 'Undo layout change',
            unavailableReason: 'Nothing to undo'
        }, {
            id         : 'topology:redo',
            available  : canRedo,
            description: 'Re-apply the most recently undone layout transaction.',
            group      : 'Layout & History',
            handler    : async () => {
                const result = await TransactionManager.redo({groupId: workspace.topologyGroupId});
                await Promise.resolve(workspace.refreshPromise).catch(() => {});
                return result
            },
            iconCls          : 'fa fa-rotate-right',
            keywords         : ['redo', 'forward', 'history', 'transaction'],
            label            : 'Redo layout change',
            unavailableReason: 'Nothing to redo'
        });

        for (const paneEntry of me.collectProjectedPanes(windowId)) {
            actions.push({
                id          : `pane:focus:${paneEntry.itemId}`,
                available   : true,
                description : `Activate and focus ${paneEntry.label} in ${paneEntry.locationLabel}.`,
                group       : 'Panes in Window',
                handler     : () => me.focusWorkspacePane(paneEntry.nodeId, paneEntry.tabIndex, paneEntry.label, windowId),
                iconCls     : 'fa fa-window-maximize',
                keywords    : ['pane', 'tab', 'focus', paneEntry.itemId, paneEntry.label],
                label       : `Focus ${paneEntry.label}`,
                managesFocus: true
            })
        }

        actions.push({
            id               : 'tour:start',
            available        : !tourRunning,
            description      : 'Run the deterministic guided tour across live panes and dock zones.',
            group            : 'Guided Tour',
            handler          : () => me.onStartTour(),
            iconCls          : 'fa fa-play',
            keywords         : ['tour', 'play', 'demo', 'guide'],
            label            : 'Start guided tour',
            unavailableReason: 'Guided tour is already running'
        }, {
            id               : 'tour:continue',
            available        : Boolean(gatePrompt),
            description      : gatePrompt ? `Advance pending gate: ${gatePrompt}.` : 'Advance a paused tour gate when prompted.',
            group            : 'Guided Tour',
            handler          : () => me.onContinueTour(),
            iconCls          : 'fa fa-forward',
            keywords         : ['tour', 'continue', 'gate', 'advance'],
            label            : 'Continue guided tour',
            unavailableReason: 'No tour gate is waiting'
        }, {
            id         : 'theme:toggle',
            available  : true,
            description: `Switch every Workstation window to ${isLight ? 'dark' : 'light'} theme tokens.`,
            group      : 'Appearance',
            handler    : () => workspace.toggleWorkspaceTheme(),
            iconCls    : isLight ? 'fa fa-moon' : 'fa fa-sun',
            keywords   : ['theme', 'dark', 'light', 'mode', 'color'],
            label      : isLight ? 'Switch to Dark mode' : 'Switch to Light mode'
        });

        return actions
    }

    /**
     * @summary Lists tabs declared in `type: 'tabs'` nodes of the committed `dockModel` for `windowId`
     * (excluding rail-collapsed items and remaining race-free while a staged shell swap is in flight).
     * @param {Number|String|null} windowId
     * @returns {Array<{itemId: String, label: String, locationLabel: String, nodeId: String, tabIndex: Number}>}
     * @protected
     */
    collectProjectedPanes(windowId) {
        const workspace = this.component,
              popup     = windowId && windowId !== workspace.windowId
                  ? workspace.getPopupStates().find(state => state.windowId === windowId && !state.disconnected && state.host && !state.host.isDestroyed)
                  : null,
              host          = popup?.host || workspace,
              locationLabel = popup ? 'this popup window' : 'the main workspace',
              doc           = host?.dockModel,
              nodes         = doc?.nodes || {},
              items         = doc?.items || {},
              entries       = [];

        for (const [nodeId, node] of Object.entries(nodes)) {
            if (node?.type !== 'tabs' || !Array.isArray(node.items)) {
                continue
            }

            node.items.forEach((itemId, tabIndex) => {
                if (!Object.hasOwn(items, itemId)) {
                    return
                }

                entries.push({
                    itemId,
                    label: workspace.getPaneHeaderText(itemId, items[itemId]),
                    locationLabel,
                    nodeId,
                    tabIndex
                })
            })
        }

        return entries
    }

    /**
     * @summary Waits for any in-flight dock projection on `host`, activates the target tab inside `nodeId`,
     * and focuses its `Neo.tab.header.Button`.
     * @param {String} nodeId
     * @param {Number} tabIndex
     * @param {String} label
     * @param {Number|String|null} windowId
     * @returns {Promise<Boolean>}
     */
    async focusWorkspacePane(nodeId, tabIndex, label, windowId) {
        const workspace = this.component,
              popup     = windowId && windowId !== workspace.windowId
                  ? workspace.getPopupStates().find(state => state.windowId === windowId && !state.disconnected && state.host && !state.host.isDestroyed)
                  : null,
              host      = popup?.host || workspace;

        if (!host || host.isDestroyed) {
            return false
        }

        await Promise.resolve(host.refreshPromise).catch(() => {});

        const dockHost = host.getDockHost?.();

        if (!dockHost || dockHost.isDestroyed) {
            return false
        }

        const shell        = DockProjectionReconciler.liveShell(dockHost, host.dockShellIndex),
              tabContainer = DockProjectionReconciler.collectProjectedTabs(shell).get(nodeId);

        if (!tabContainer || tabContainer.isDestroyed) {
            return false
        }

        const buttons       = tabContainer.getTabButtons?.() || [],
              matchedIndex  = buttons.findIndex(btn => btn?.text?.trim?.() === label),
              resolvedIndex = matchedIndex >= 0 ? matchedIndex : tabIndex;

        if (tabContainer.activeIndex !== resolvedIndex) {
            tabContainer.activeIndex = resolvedIndex;
            await Promise.all([
                tabContainer.promiseUpdate?.(),
                host.refreshPromise
            ].map(promise => Promise.resolve(promise).catch(() => {})))
        }

        const tabButton = tabContainer.getTabButtons?.()?.[resolvedIndex];

        if (tabButton && !tabButton.isDestroyed) {
            tabButton.focus(tabButton.id, false, false, 'keyboard');
            return true
        }

        return false
    }

    /**
     * @summary A window bound into this root's Group announced itself: the root adopts it.
     *
     * The worker publishes `connect` once the window's app and main view exist, so the render target is
     * live. The binding says which slot the window took; the window's own URL says what it came FOR, and
     * the two must agree — a non-matching arrival is ignored rather than adopted, the owner's half of the
     * fail-closed contract whose other half is the arriving viewport's refusal. Both halves read the URL
     * through `resolveBootIntent`, so neither can call an intent what the other calls none. Three arrivals
     * are adopted:
     *
     * - the root's own `main` slot (the one {@link Workstation.view.Workspace#registerMainWorkspace} binds
     *   under) rebound to a new window — a reload of the main window while this worker lives — so the root
     *   moves itself into the new render target;
     * - a restored `?workspace=<key>` window bound under `key`;
     * - a reloaded vessel window bound under a key opened for the item its URL names: the item's own key, or
     *   a later one the native registry records for that item.
     *
     * A vessel connecting for the first time belongs to the tear-out lifecycle, which registers its target
     * itself; this handler recognises an already-mounted host and leaves it alone.
     * @param {Object} data
     * @param {String} data.windowId
     * @returns {Promise<Boolean>} Whether this call adopted the window.
     */
    async onWindowConnect({windowId}) {
        const me = this, root = me.component;

        if (!root || root.isDestroyed || windowId === root.windowId) return false;

        const binding = TransactionManager.findByWindow(windowId);

        if (!binding || binding.groupId !== root.topologyGroupId) return false;

        const target = Neo.apps[windowId]?.mainView;

        if (!target || target.isDestroyed) return false;

        const intent = resolveBootIntent(windowId);

        if (binding.workspaceKey === 'main') {
            if (intent.mode !== 'default') return false;

            // The old render target is gone; detach silently before the ordinary cross-window add.
            root.parent?.remove(root, false, true);
            target.add(root);

            return true
        }

        const declared = intent.mode === 'workspace' ? binding.workspaceKey === intent.key
            : intent.mode === 'popout' && (binding.workspaceKey === root.tearOutWorkspaceKey(intent.key) ||
                root.nativeWindows?.getOwner(root.id, binding.workspaceKey)?.itemId === intent.key);

        if (!declared) return false;

        const state = root.getPopupState(binding.workspaceKey);

        if (!state || (state.windowId === windowId && state.host?.parent === target && !state.disconnected)) {
            return false
        }

        // A retained vessel whose stack went home holds an empty document: nothing to remount. A vessel window
        // arriving under its key is the item's NEXT tear-out, born pre-terminal — the tear-out lifecycle
        // stages the pane now and mounts this host at the terminal, once the transfer has filled it. Mounting
        // it here would seat an empty dock host beside the staged pane, each at half the window.
        if (intent.mode === 'popout' && !Object.keys(state.document?.items ?? {}).length) return false;

        return me.mountTopologyWorkspace(binding.workspaceKey, target)
    }

    /**
     * @summary Installs the optional playback controller on its real toolbar at first activation.
     * @returns {Promise<Workstation.view.TourController>}
     */
    async getTourController() {
        const me = this, bar = me.getReference('tour-bar');
        if (me.isDestroyed || !bar || bar.isDestroyed) throw Neo.isDestroyed;
        if (bar.controller && !bar.controller.isDestroyed) return bar.controller;
        return me.tourControllerPromise ??= (async () => {
            await me.trap(Promise.resolve(bar.controller?.settledPromise));
            const {default: TourController} = await me.trap(import('./TourController.mjs'));
            if (bar.isDestroyed) throw Neo.isDestroyed;
            bar.controller = {module: TourController, workspace: me.component};
            return bar.controller
        })().finally(() => {
            if (!me.isDestroyed) me.tourControllerPromise = null
        })
    }

    /** @summary Routes the declarative start action to the activated playback controller. @returns {Promise<Object>} */
    async onStartTour() {
        return (await this.getTourController()).startTour()
    }

    /**
     * @summary Resolves the running playback's pending viewer gate. The click that reaches this
     * handler is the user activation the gated window beat needs, so nothing is deferred here.
     * @returns {Boolean} False when no playback is waiting at a gate.
     */
    onContinueTour() {
        const controller = this.getReference('tour-bar')?.controller;
        return controller && !controller.isDestroyed ? controller.continueTour() : false
    }

    /** @summary Keeps the ordinary theme action independent of playback activation. @param {Object} data @returns {Promise<String>} */
    onToggleWorkspaceTheme(data) {
        return this.component.toggleWorkspaceTheme(data)
    }

    /** @summary Brings the viewer to the shipped operations arrangement. @returns {Promise<Object>|null} */
    onShowOperations() {
        return this.selectArrangement('shipped')
    }

    /** @summary Brings the viewer to the planning arrangement. @returns {Promise<Object>|null} */
    onShowPlanning() {
        return this.selectArrangement('planning')
    }

    /**
     * @summary Switches the workspace to a declared arrangement, as it was declared.
     *
     * @description Kept: every record and store, and each window's workspace, emptied but registered.
     * Reset: main's layout, to the declared document, so the arrangement being left does not keep its
     * edits, and every window's panes, which come home or leave with that arrangement; a window left
     * empty closes. It is one write, so undo restores the arrangement the viewer left, its windows included.
     * @param {String} name A declared perspective
     * @returns {Promise<Object>|null} The reset receipt, or null when `name` is already active
     */
    selectArrangement(name) {
        const workspace = this.component;

        return workspace.activePerspective === name ? null : workspace.resetTopology(name)
    }


    /**
     * @summary Presents an already hydrated participant without changing its document or history.
     * @param {String} workspaceKey
     * @param {Neo.container.Base} target A user-activated window or the root's inline fallback.
     * @returns {Promise<Boolean>}
     */
    async mountTopologyWorkspace(workspaceKey, target) {
        const state = this.component.getPopupState(workspaceKey);
        if (!state || !target || target.isDestroyed) return false;

        state.renderTarget = target;
        state.windowId = target.windowId;
        state.app = Neo.apps[target.windowId];
        await this.component.observeWindowGeometry(target.windowId);
        state.nativeRoute = Neo.manager.Window.get(target.windowId)?.nativeRoute ?? state.nativeRoute ?? null;
        if (TransactionManager.getBinding(this.component.topologyGroupId, workspaceKey)?.windowId === target.windowId) {
            await this.component.dockPlacement.restoreBinding(workspaceKey)
        }
        if (state.host && !state.host.isDestroyed) {
            state.host.parent?.remove(state.host, false, true);
            target.add(state.host);
            state.disconnected = false;
            return true
        }
        const mounted = await this.component.mountVesselWorkspace(workspaceKey);
        if (mounted) state.disconnected = false;
        return mounted
    }

    /**
     * @summary Requests a render target only from an explicit user action; refusal keeps its owner.
     * @param {String} workspaceKey
     * @returns {Promise<Object>} A separate native-effect receipt, never semantic restore success.
     */
    async openTopologyWorkspace(workspaceKey) {
        return NativeVesselTransaction.embodyWorkspace(this.component.workspaceSet, workspaceKey)
    }

    /**
     * @summary Durably saves before clearing every carried Group identity and releasing its windows.
     * @returns {Promise<Object>} Persistence or carrier refusal leaves the Workspace open.
     */
    async closeTopology() {
        const saved = await this.component.saveTopology();
        if (!saved.persisted || !saved.current) return {closed: false, errors: saved.errors};
        const group    = TransactionManager.get(this.component.topologyGroupId),
              queue    = group.queue,
              bindings = [...group.bindings.values()].filter(binding => binding.windowId).map(binding => ({...binding})),
              windows  = bindings.map(binding => binding.windowId);
        const cleared = await Promise.all(windows.map(windowId =>
            Neo.Main.clearTopologyIdentity({groupId: group.id, windowId}).then(value => value === true, () => false)
        ));
        if (cleared.some(value => value !== true) || group.queue !== queue) {
            await Promise.allSettled(bindings.filter((binding, index) => cleared[index] === true).map(binding =>
                Neo.Main.setTopologyIdentity({...binding, groupId: group.id, onlyIfEmpty: true})
            ));
            return {closed: false, errors: ['workspace changed or a window refused to clear its identity']}
        }

        windows.forEach(windowId => {
            Neo.Main.closeTopologyWindow({windowId}).catch(() => {});
        });
        return {closing: true, errors: []}
    }

    /**
     * @summary Reports semantic boot and persistence state without exposing live owner references.
     * @returns {Object}
     */
    getTopologyState() {
        const group = TransactionManager.get(this.component.topologyGroupId);
        return {
            groupId       : group.id,
            historyCount  : group.history?.count ?? 0,
            historyCursor : group.history?.cursor ?? -1,
            libraryVersion: this.component.topologyLibrary.version,
            snapshot      : group.snapshot ?? null,
            workspaceHosts: Object.fromEntries(this.component.getPopupStates().map(state => [state.workspaceId, {
                disconnected: state.disconnected,
                hostId      : state.host?.id ?? null,
                windowId    : state.windowId
            }])),
            workspaceKeys: this.component.workspaceSet.ids()
        }
    }

}

export default Neo.setupClass(WorkspaceController);
