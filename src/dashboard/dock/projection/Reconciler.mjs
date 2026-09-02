import Component from '../../../component/Base.mjs';
import Base      from '../../../core/Base.mjs';

const projectionNodeTypes = new Set(['edge-zone', 'split', 'tabs']);

/**
 * @summary Preserves live tab-chrome identity across dock-layout projections.
 *
 * {@link Neo.dashboard.dock.projection.LayoutAdapter} deliberately remains a stateless document-to-config
 * projector. This class owns the complementary live-component handoff: it keys projected tab
 * containers by `dockNodeId`, stages retained ancestors behind geometry-equivalent placeholders,
 * and moves each pane/button pair before its owning tab container moves. Callers must commit those
 * descendant and ancestor ownership layers separately so the main-thread delta cannot retire a
 * child after its retained ancestor has landed.
 *
 * The reconciler owns no workspace document or pane cache. Each docking workspace supplies its
 * item resolver and controls its own animation and app-specific overflow/menu readiness.
 *
 * @class Neo.dashboard.dock.projection.Reconciler
 * @extends Neo.core.Base
 * @see Neo.dashboard.dock.projection.LayoutAdapter
 * @see learn/agentos/DockZoneModel.md
 */
class Reconciler extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.projection.Reconciler'
         * @protected
         */
        className: 'Neo.dashboard.dock.projection.Reconciler'
    }

    /**
     * @summary The classes a retained tab container derives from its OWN configs.
     *
     * A projected `cls` is the projection's own constant and knows nothing about these, so replacing
     * the array on a retained container dropped every one of them: `ui: 'inline'` lost its 32px
     * density, the tab-bar position lost its orientation class, and a plain container lost its body
     * border. A freshly constructed sibling kept them, because construction re-runs the hooks that
     * add them — which is why the defect only ever showed on containers that survived.
     *
     * **Re-derived, never unioned with the live `cls`.** A union also preserves classes carrying
     * STATE the projection is responsible for clearing: `dashboard.dock.Workspace` removes
     * `neo-dock-maximized` by filtering `cls`, so keeping the live array made maximize sticky and
     * broke its terminal-clear contract.
     *
     * Enumerated rather than inferred, each row naming the hook that owns it. There is no runtime
     * marker separating a config-derived class from a state-carrying one, so a new derivation has to
     * be added here deliberately — the alternative is a heuristic that silently guesses wrong in one
     * direction or the other.
     * @param {Neo.tab.Container} tab
     * @returns {String[]}
     * @static
     */
    static configDerivedClasses(tab) {
        const classes = [];

        // component.Base#afterSetUi
        tab.ui && classes.push(`neo-${tab.ntype}-${tab.ui}`);
        // tab.Container#afterSetTabBarPosition
        tab.tabBarPosition && classes.push(`neo-${tab.tabBarPosition}`);
        // tab.Container#afterSetPlain
        tab.plain && classes.push(`${tab.tabContainerCls}-plain`);

        return classes
    }

    /**
     * @summary Collects keyed tab-chrome owners below one projected dock shell.
     * @param {Neo.component.Base|null} root
     * @returns {Map<String,Neo.tab.Container>}
     * @static
     */
    static collectProjectedTabs(root) {
        const tabs = new Map();

        const visit = component => {
            if (!component || component.isDestroyed) return;

            if (component.dockNodeType === 'tabs') {
                tabs.set(component.dockNodeId, component);
                return
            }

            component.items?.forEach(visit)
        };

        visit(root);

        return tabs
    }

    /**
     * @summary Collects the dock-node topology below one projected shell.
     *
     * Pane descendants stop the traversal at tabs nodes: application content may itself contain
     * `dockNodeId` metadata, but only the projected shell's structural nodes belong to this
     * reconciliation boundary. Synthetic affordances and wrappers stay traversal-transparent.
     * Duplicate or incomplete structural identities fail closed because they cannot prove a
     * one-to-one live projection.
     * @param {Neo.component.Base|Object|null} root
     * @returns {Map<String, Object>|null}
     * @static
     */
    static collectProjectionTopology(root) {
        const nodes = new Map();
        let   valid = true;

        const visit = (node, parentNodeId=null) => {
            if (!valid || !node || node.isDestroyed) return;

            let ownerNodeId = parentNodeId;

            const structural = projectionNodeTypes.has(node.dockNodeType);

            if (structural) {
                if (!node.dockNodeId || nodes.has(node.dockNodeId)
                    || parentNodeId && !nodes.has(parentNodeId)) {
                    valid = false;
                    return
                }

                ownerNodeId = node.dockNodeId;
                nodes.set(ownerNodeId, {
                    childNodeIds: [],
                    node,
                    parentNodeId,
                    type        : node.dockNodeType
                });

                if (parentNodeId) {
                    nodes.get(parentNodeId)?.childNodeIds.push(ownerNodeId)
                }

                if (node.dockNodeType === 'tabs') return
            }

            node.items?.forEach(child => visit(child, ownerNodeId))
        };

        visit(root);

        return valid ? nodes : null
    }

    /**
     * @summary Reconciles a geometry-only projection without moving live dock chrome.
     *
     * The fast path is deliberately strict: dock-node ancestry/order, split orientation, tab item
     * order, and active selection must all be unchanged. Only then may projected child geometry
     * (`flex`, `width`, and `height`) be applied to the retained shell in place. Any structural or
     * ownership delta defers to the staged descendant → ancestor transaction in
     * {@link #reconcileProjection}.
     * @param {Neo.component.Base} oldShell
     * @param {Object} nextConfig
     * @param {Map<String,Neo.component.Base>} placeholders
     * @param {Object} [options={}]
     * @param {Boolean} [options.reconcileItems=false] Admit tab item/active deltas while retaining
     *     the proven-identical structural shell.
     * @param {Iterable<String>} [options.preserveItemIds=[]]
     * @param {Function|null} [options.resolveItem=null]
     * @returns {{currentTabs:Map,nextShell:Neo.component.Base,plans:Map}|null}
     * @static
     */
    static reconcileStableTopology(
        oldShell,
        nextConfig,
        placeholders,
        {preserveItemIds=[], reconcileItems=false, resolveItem=null}={}
    ) {
        const
            currentNodes = this.collectProjectionTopology(oldShell),
            nextNodes    = this.collectProjectionTopology(nextConfig);

        if (!currentNodes || !nextNodes || !currentNodes.size || currentNodes.size !== nextNodes.size) return null;

        for (const [nodeId, current] of currentNodes) {
            const
                next                 = nextNodes.get(nodeId),
                currentLayoutNtype   = String(current.node.layout?.ntype || '').replace(/^layout-/, ''),
                projectedLayoutNtype = String(next?.node.layout?.ntype || '').replace(/^layout-/, '');

            if (!next
                || current.type !== next.type
                || current.parentNodeId !== next.parentNodeId
                || current.type === 'split' && currentLayoutNtype !== projectedLayoutNtype
                || current.childNodeIds.join('\0') !== next.childNodeIds.join('\0')) {
                return null
            }

            if (current.type === 'tabs') {
                const
                    currentItems = current.node.getTabBar()?.sortZoneConfig?.dockItemIds || [],
                    nextItems    = next.node.headerToolbar?.sortZoneConfig?.dockItemIds || [];

                if (!reconcileItems && (current.node.activeIndex !== next.node.activeIndex
                    || currentItems.join('\0') !== nextItems.join('\0'))) {
                    return null
                }
            }
        }

        const
            currentTabs = this.collectProjectedTabs(oldShell),
            plans       = new Map();

        nextNodes.forEach((next, nodeId) => {
            const
                current    = currentNodes.get(nodeId).node,
                dimensions = {};

            if (Object.hasOwn(next.node, 'flex')) {
                current.setSilent({
                    flex        : next.node.flex,
                    wrapperStyle: {...current.wrapperStyle, flex: next.node.flex ?? null}
                })
            }

            for (const key of ['height', 'width']) {
                if (Object.hasOwn(next.node, key) && current[key] !== next.node[key]) {
                    dimensions[key] = next.node[key]
                }
            }

            Object.keys(dimensions).length && current.set(dimensions);

            if (next.type === 'tabs') {
                plans.set(nodeId, {
                    activeIndex : next.node.activeIndex,
                    config      : next.node,
                    desiredItems: [...(next.node.headerToolbar?.sortZoneConfig?.dockItemIds || [])],
                    placeholder : null,
                    tab         : current
                })
            }
        });

        const commitBars = new Set();

        if (reconcileItems) {
            this.reconcileTabChrome(
                plans,
                placeholders,
                currentTabs,
                oldShell,
                resolveItem,
                preserveItemIds,
                commitBars
            )
        }

        placeholders.forEach(placeholder => {
            !placeholder.parent && !placeholder.isDestroyed && placeholder.destroy()
        });
        placeholders.clear();

        return {currentTabs, commitBars, nextShell: oldShell, plans, reconciledItems: reconcileItems}
    }

    /**
     * @summary Replaces retained projected tab configs with geometry-equivalent staging placeholders.
     *
     * Each plan captures the projected active/item state while the placeholder reserves the retained
     * tab container's destination. New and removed logical tab nodes remain ordinary projected instances.
     * @param {*} config
     * @param {Map<String,Neo.tab.Container>} currentTabs
     * @param {Map<String,Object>} plans
     * @returns {*}
     * @static
     */
    static prepareTabChromeProjection(config, currentTabs, plans) {
        if (Array.isArray(config)) {
            return config.map(item => this.prepareTabChromeProjection(item, currentTabs, plans))
        }

        if (config?.constructor !== Object) return config;

        if (config.dockNodeType === 'tabs') {
            const
                nodeId       = config.dockNodeId,
                currentTab   = currentTabs.get(nodeId) || null,
                desiredItems = [...(config.headerToolbar?.sortZoneConfig?.dockItemIds || [])],
                plan         = {
                    activeIndex: config.activeIndex,
                    config,
                    desiredItems,
                    placeholder: null,
                    tab        : currentTab
                };

            plans.set(nodeId, plan);

            if (currentTab) {
                plan.placeholder = Neo.create({
                    module  : Component,
                    cls     : ['neo-dashboard-dock-projection-placeholder'],
                    flex    : config.flex,
                    hidden  : true,
                    hideMode: 'visibility',
                    style   : config.style
                });

                return plan.placeholder
            }

            return config
        }

        return Array.isArray(config.items)
            ? {...config, items: this.prepareTabChromeProjection(config.items, currentTabs, plans)}
            : config
    }

    /**
     * @summary Stages and commits one identity-preserving dock projection.
     *
     * The host keeps its current shell rendered while a visibility-hidden projection is inserted
     * beside it. Four explicit ownership phases follow: mount the target tree, move pane/button
     * descendants, move retained tab ancestors plus swap shell visibility, then destroy the empty
     * source shell. Each phase receives its own host update so renderer cleanup cannot overtake a
     * native reparent. Floating Overflow controls are reprojected only after final ownership settles.
     *
     * Workspace-specific FLIP capture/play, animation timing, pane creation, and menu readiness stay
     * outside this method. `onProjectionStaged` can decorate retained chrome before the first commit.
     * @param {Object} options
     * @param {Neo.container.Base} options.host Dock host containing the current shell.
     * @param {Boolean} [options.geometryOnly=false] Explicitly admits strict in-place geometry reconciliation.
     * @param {Boolean} [options.retainTopology=false] Explicitly admits in-place item reconciliation
     *     only when every structural dock node retains its identity, ancestry, order, and orientation.
     * @param {*} options.nextConfig Fresh {@link Neo.dashboard.dock.projection.LayoutAdapter} projection.
     * @param {Map<String,Neo.component.Base>} options.placeholders Item placeholders created by the caller.
     * @param {Iterable<String>} [options.preserveItemIds=[]] Owner-held panes which are absent
     * from this projection but must survive without their obsolete tab buttons.
     * @param {Function} options.resolveItem Resolves one live pane or materializable config by dock item id.
     * @param {Function|null} [options.onProjectionStaged=null]
     * @param {Number} [options.shellIndex=0]
     * @param {Function|null} [options.waitForOverflowProjection=null]
     * @returns {Promise<{currentTabs: Map, nextShell: Neo.component.Base, overflowPlugins: Object[], plans: Map}>}
     * @static
     */
    static async reconcileProjection({
        geometryOnly=false,
        host,
        nextConfig,
        placeholders,
        preserveItemIds=[],
        retainTopology=false,
        resolveItem,
        onProjectionStaged=null,
        shellIndex=0,
        waitForOverflowProjection=null
    }) {
        const oldShell = host?.items?.[shellIndex];

        if (!oldShell) {
            throw new Error(`Dock projection could not find a current shell at index ${shellIndex}`)
        }

        const stableProjection = geometryOnly || retainTopology
            ? this.reconcileStableTopology(oldShell, nextConfig, placeholders, {
                preserveItemIds,
                reconcileItems: retainTopology,
                resolveItem
            })
            : null;

        if (stableProjection) {
            stableProjection.reconciledItems &&
                await onProjectionStaged?.({
                    currentTabs: stableProjection.currentTabs,
                    nextShell  : oldShell,
                    oldShell,
                    plans      : stableProjection.plans
                });
            await Promise.all([...stableProjection.commitBars].map(bar => {
                bar.sortZone?.adjustItemCls(true);
                bar.updateDepth = -1;
                return bar.promiseUpdate()
            }));
            host.updateDepth = -1;
            host.update();
            await host.promiseUpdate();

            const overflowPlugins = [...new Set([...stableProjection.plans.values()]
                .map(plan => plan.tab?.getTabBar()?.getPlugin('tab-overflow'))
                .filter(Boolean))];

            await Promise.all(overflowPlugins.map(plugin => plugin.project(true)));

            if (waitForOverflowProjection) {
                await Promise.all(overflowPlugins.map(plugin => waitForOverflowProjection(plugin)))
            }

            // `landedInPlace` reports the path this call ACTUALLY took, so a caller never has to
            // predict it. `geometryOnly` is only an admission REQUEST — `reconcileStableTopology`
            // returns null on any node/type/ancestry/order/orientation delta and falls through to
            // the staged transaction below — so a consumer whose contract needs "no topology swap
            // happened" (rather than "one was not expected") must read this instead of the request.
            return {...stableProjection, landedInPlace: true, overflowPlugins}
        }

        const
            currentTabs    = this.collectProjectedTabs(oldShell),
            plans          = new Map(),
            preparedConfig = this.prepareTabChromeProjection(nextConfig, currentTabs, plans);

        // Pane placeholders inside a discarded config for a retained tab node never enter a parent.
        // Retire them now; only genuinely new tab nodes need projected placeholders for pairing.
        plans.forEach(plan => {
            if (!plan.tab) return;

            plan.desiredItems.forEach(itemId => {
                const placeholder = placeholders.get(itemId);

                if (placeholder && !placeholder.parent) {
                    placeholder.destroy();
                    placeholders.delete(itemId)
                }
            })
        });

        preparedConfig.setSilent
            ? preparedConfig.setSilent({hidden: true, hideMode: 'visibility'})
            : Object.assign(preparedConfig, {hidden: true, hideMode: 'visibility'});

        let nextShell = host.insert(shellIndex + 1, preparedConfig, true);

        await onProjectionStaged?.({currentTabs, nextShell, oldShell, plans});

        host.updateDepth = -1;
        host.update();
        await host.promiseUpdate();

        const commitBars = new Set();

        // Phases 2-4 are the window in which the host holds TWO shells, and every one of them ends in
        // an awaited flight that can reject: a landing ancestor update whose stored vnode still
        // references chrome a phase destroyed silently is enough (`util.VNode.getVnode` throws on a
        // reference whose component has left the registry). Without this guard the rejection unwinds
        // out of the whole method and the host keeps both shells — the outgoing one visible and
        // populated, the staged one hidden and half-built — and since every later commit reconciles
        // against `host.items[shellIndex]` again, that state never self-heals.
        //
        // `VdomLifecycle#executeVdomUpdate` already promises the half this method needs: a rejected
        // flight adopts no vnode and rejects every parked promise, "so the next cycle re-diffs
        // cleanly". The dock is the caller that has to USE that cleanliness — settle the host back to
        // exactly one shell, then let the workspace re-project from the committed document.
        let retainedRoot = false,
            swapped      = false;

        try {
            this.reconcileTabChrome(
                plans,
                placeholders,
                currentTabs,
                nextShell,
                resolveItem,
                preserveItemIds,
                commitBars
            );

        // Existing pane/button pairs move through the host's common-ancestor transaction below.
        // A parked pane has no surviving button DOM to move, so its newly materialized pair needs
        // one explicit toolbar commit while the destination shell is still staged/hidden. This is
        // the same owner a normal non-silent toolbar insert updates; committing its parent tab can
        // leave the toolbar's VDOM change invisible to the main-thread delta boundary. Silent
        // insertion also bypasses the SortZone's insert listener, so restore its delegated marker
        // before that one owner commit.
            await Promise.all([...commitBars].map(bar => {
                bar.sortZone?.adjustItemCls(true);
                bar.updateDepth = -1;
                return bar.promiseUpdate()
            }));

            // A removed logical tab can be the source of a returning pane. Hide that now-empty source in
            // the descendant commit; the ancestor/cleanup phases destroy it with its retiring shell once.
            currentTabs.forEach((tab, nodeId) => {
                if (!plans.has(nodeId)) {
                    tab.setSilent({hideMode: 'visibility', hidden: true})
                }
            });
            host.updateDepth = -1;
            host.update();
            await host.promiseUpdate();

            this.moveRetainedTabChrome(plans);

            // A tabs node may itself be the projected root. In that case its staging placeholder has
            // disappeared and the retained tab is both old and new shell; never retire it as source chrome.
            nextShell = nextShell.isDestroyed ? host.items[shellIndex] : nextShell;

            retainedRoot = oldShell === nextShell;

            if (!retainedRoot) {
                oldShell.setSilent({hideMode: 'visibility', hidden: true});
                nextShell.setSilent({hidden: false})
            }

            host.updateDepth = -1;
            host.update();
            // The swap is only true once this flight LANDS: a rejection here leaves the visibility
            // change unadopted, so recovery must treat the outgoing shell as the one still on screen.
            await host.promiseUpdate();

            swapped = !retainedRoot;

            if (!retainedRoot) {
                host.remove(oldShell, true, true);
                host.updateDepth = -1;
                host.update();
                await host.promiseUpdate()
            }
        } catch (error) {
            const settlement = await this.settleFailedProjection({
                host, nextShell, oldShell, retainedRoot, shellIndex, swapped
            });

            error.isDockProjectionFailure = true;
            error.projectionRecovery      = settlement.recovery;
            // Handed to the caller because only IT knows when the shell is safe to destroy: not
            // here, where it still holds the panes the repair has yet to re-parent out.
            error.retiredShell            = settlement.retiredShell;

            // Re-thrown rather than wrapped: the original message and stack ARE the diagnostic (the
            // live report that produced this guard read `Component not found for id: …` out of
            // `syncVnodeTree`), and a wrapper buries the one line that names the stale reference.
            throw error
        }

        const overflowPlugins = [...new Set([...plans.values()]
            .map(plan => plan.tab?.getTabBar()?.getPlugin('tab-overflow'))
            .filter(Boolean))];

        // Overflow controls float outside the dock host. Restore their visible state only after every
        // retained toolbar owns final geometry, then let each plugin recapture its natural widths.
        overflowPlugins.forEach(plugin => {
            plugin.control?.hidden && (plugin.control.hidden = false)
        });
        await Promise.all(overflowPlugins.map(plugin => plugin.project(true)));

        if (waitForOverflowProjection) {
            await Promise.all(overflowPlugins.map(plugin => waitForOverflowProjection(plugin)))
        }

        // The staged transaction replaced the shell, so any downstream contract keyed on
        // "no topology swap can be pending" must NOT be told otherwise, however the call was
        // admitted. See the in-place return above.
        return {currentTabs, landedInPlace: false, nextShell, overflowPlugins, plans}
    }

    /**
     * @summary Settles a host back to exactly one visible shell after a projection phase rejected.
     *
     * The transaction's whole hazard is the interval where the host holds two shells. This does NOT
     * try to restore the outgoing shell's contents — chrome has already moved and leavers are already
     * destroyed by the time most rejections land, and reconstructing that by hand would be a second
     * unaudited projection. It restores the only invariant later commits depend on: **one shell, at
     * `shellIndex`, visible.** Recovering the CONTENT is the follow-up re-projection's job, which is
     * sound because a rejected flight adopts no vnode, the committed document is untouched by a
     * failed projection, and a consumer's `resolveItem` re-materializes a pane whose instance is gone.
     *
     * Which shell survives follows the last landed flight rather than intent: before the visibility
     * swap commits, the outgoing shell is the one on screen and the staged one is retired; after it
     * commits, the staged shell is the survivor and the swap is simply finished.
     *
     * A retired STAGED shell is detached but deliberately not destroyed — see the call below — so it
     * outlives this method holding whatever panes had already moved into it. **Detached is not
     * unreferenced:** `Neo.manager.Instance.unregister` is reached only from `core.Base#destroy`, so
     * the manager keeps a strong reference to a merely-detached component for the life of the app.
     * That is why the shell is RETURNED rather than dropped — the caller destroys it once the repair
     * re-projection has re-parented the panes out and it demonstrably holds nothing.
     *
     * The recovery commits too, so it can reject in turn. That is reported, never thrown: the caller
     * re-throws the ORIGINAL failure, whose message names the actual cause.
     * @param {Object}  data
     * @param {Neo.container.Base} data.host The dock host holding both shells.
     * @param {Neo.component.Base} data.nextShell The staged shell inserted at `shellIndex + 1`.
     * @param {Neo.component.Base} data.oldShell The outgoing shell at `shellIndex`.
     * @param {Boolean} data.retainedRoot The projected root was the retained tab; nothing was staged.
     * @param {Number}  data.shellIndex Index the surviving shell must occupy.
     * @param {Boolean} data.swapped The visibility swap LANDED, so the staged shell is on screen.
     * @returns {Promise<Object>} `{recovery, retiredShell}` — recovery is `retained-root` |
     * `retired-staged` | `completed-swap` | `unrecoverable`; `retiredShell` is the detached-but-alive
     * staged shell awaiting the caller's post-repair destroy, or `null` when nothing outlives this call.
     * @static
     */
    static async settleFailedProjection({host, nextShell, oldShell, retainedRoot, shellIndex, swapped}) {
        // A retained root never staged a second shell, so the host was never in the two-shell window.
        if (retainedRoot) return {recovery: 'retained-root', retiredShell: null};

        const survivor = swapped ? nextShell : oldShell,
              casualty = swapped ? oldShell  : nextShell;

        try {
            if (casualty && !casualty.isDestroyed && host.indexOf(casualty) > -1) {
                // Destroy ONLY the outgoing shell, which the success path destroys anyway. The staged
                // shell must be detached WITHOUT destroying it: by the time most rejections land,
                // `reconcileTabChrome` has already moved live pane/button pairs into it, and
                // destroying it would take them with it — the precise opposite of the
                // reparent-never-recreate promise this transaction exists to keep. Detached, those
                // panes stay alive and the repair re-projection re-parents them out by identity,
                // because `resolveItem` returns the consumer's own instances.
                host.remove(casualty, swapped, true)
            }

            if (survivor && !survivor.isDestroyed) {
                survivor.setSilent({hidden: false})
            }

            host.updateDepth = -1;
            host.update();
            await host.promiseUpdate();

            // Positional, not incidental: every later commit reconciles against `host.items[shellIndex]`,
            // so a survivor that settled anywhere else would send the next projection at the wrong node.
            return {
                recovery    : host.items?.[shellIndex] === survivor ? (swapped ? 'completed-swap' : 'retired-staged') : 'unrecoverable',
                // Only the un-swapped case detaches a live shell; the swapped case destroyed it above.
                retiredShell: swapped ? null : (casualty?.isDestroyed ? null : casualty ?? null)
            }
        } catch (recoveryError) {
            console.warn('Dock projection recovery failed; the host may still hold two shells', host?.id, recoveryError);
            return {recovery: 'unrecoverable', retiredShell: null}
        }
    }

    /**
     * @summary Moves retained tab-container ancestors into their staged projected slots silently.
     *
     * Cross-tab card/button moves must commit before this method runs. The distinct ancestor commit
     * prevents the main-thread delta from retiring a child after its retained ancestor has landed.
     * The destination projection also owns fixed `width` / `height`: retained edge-band chrome must
     * take those values (or clear obsolete ones) instead of carrying source geometry across the move.
     * @param {Map<String,Object>} plans
     * @returns {Map<String,Object>}
     * @static
     */
    static moveRetainedTabChrome(plans) {
        plans.forEach((plan, nodeId) => {
            const
                tab          = plan.tab,
                placeholder  = plan.placeholder,
                sourceParent = tab?.parent,
                targetParent = placeholder?.parent,
                sourceIndex  = sourceParent?.indexOf(tab) ?? -1,
                targetIndex  = targetParent?.indexOf(placeholder) ?? -1;

            if (!placeholder) return;

            if (!sourceParent || !targetParent || targetIndex < 0) {
                throw new Error(`Dock projection could not stage surviving tab chrome "${nodeId}"`)
            }

            // A floating overflow control is aligned outside the dock host. Its target toolbar briefly
            // leaves the main-thread DOM during native reparenting, and the align layer hides the control.
            // Visibility mode keeps that exact DOM node mounted until the destination target is present.
            tab.getTabBar()?.getPlugin('tab-overflow')?.control?.setSilent({hideMode: 'visibility'});
            targetParent.remove(placeholder, true, true);
            sourceParent.remove(tab, false, true, true);
            tab.setSilent({
                cls      : [...(plan.config.cls || []), ...Reconciler.configDerivedClasses(tab)],
                flex     : plan.config.flex,
                listeners: plan.config.listeners,
                style    : plan.config.style,
                height   : Object.hasOwn(plan.config, 'height') ? plan.config.height : null,
                width    : Object.hasOwn(plan.config, 'width')  ? plan.config.width  : null,
                // Flexbox stores parent-owned sizing on the child's wrapper. A retained tab
                // otherwise carries its source split ratio into the destination projection.
                wrapperStyle: {...tab.wrapperStyle, flex: plan.config.flex ?? null}
            });
            targetParent.insert(
                sourceParent === targetParent && sourceIndex < targetIndex ? targetIndex - 1 : targetIndex,
                tab,
                true,
                false
            )
        });

        return plans
    }

    /**
     * @summary Reconciles paired live cards/buttons before their retained tab ancestors move.
     *
     * Both shells must be mounted. Cross-tab transfers move each pane and its existing header button
     * as a pair while their tab-container ancestors remain stationary. The caller commits this layer
     * before invoking {@link Neo.dashboard.dock.projection.Reconciler.moveRetainedTabChrome}.
     * @param {Map<String,Object>} plans
     * @param {Map<String,Neo.component.Base>} placeholders
     * @param {Map<String,Neo.tab.Container>} currentTabs
     * @param {Neo.container.Base} nextShell
     * @param {Function} resolveItem Resolves one live pane or materializable config by dock item id.
     * @param {Iterable<String>} [preserveItemIds=[]] Owner-held panes to park instead of destroy.
     * @param {Set<Neo.tab.header.Toolbar>} [commitBars=new Set()] Output set for toolbars whose
     * membership changed SILENTLY and therefore require one awaited direct-owner commit. Two kinds
     * qualify: a bar that materialized a fresh pane/button pair, and both bars of a cross-bar move —
     * the source's removal and the target's insertion are each silent, so neither publishes on its own.
     * @returns {Map<String,Object>}
     * @static
     */
    static reconcileTabChrome(
        plans,
        placeholders,
        currentTabs,
        nextShell,
        resolveItem,
        preserveItemIds=[],
        commitBars=new Set()
    ) {
        const
            nextTabs       = this.collectProjectedTabs(nextShell),
            allTabs        = new Set([...currentTabs.values(), ...nextTabs.values()]),
            desiredItemIds = new Set([...plans.values()].flatMap(plan => plan.desiredItems)),
            liveItems      = new Map(),
            preservedItems = new Set(preserveItemIds),
            resolvedItems  = new Map();

        if (typeof resolveItem !== 'function') {
            throw new Error('Dock projection reconciliation requires a live item resolver')
        }

        currentTabs.forEach(tab => {
            const
                bar     = tab.getTabBar(),
                body    = tab.getCardContainer(),
                itemIds = bar.sortZoneConfig?.dockItemIds || [];

            itemIds.forEach((itemId, index) => {
                body.items[index] && liveItems.set(itemId, body.items[index])
            })
        });

        const resolve = itemId => {
            if (!resolvedItems.has(itemId)) {
                resolvedItems.set(itemId, liveItems.get(itemId) || resolveItem(itemId) || null)
            }

            return resolvedItems.get(itemId)
        };

        plans.forEach((plan, nodeId) => {
            plan.tab = nextTabs.get(nodeId) || plan.tab;

            if (!plan.tab) {
                throw new Error(`Dock projection did not create tab chrome "${nodeId}"`)
            }
        });

        const findItemState = pane => {
            for (const tab of allTabs) {
                if (tab.isDestroyed) continue;

                const
                    body  = tab.getCardContainer(),
                    index = body?.items.indexOf(pane) ?? -1;

                if (index > -1) {
                    return {
                        bar   : tab.getTabBar(),
                        body,
                        button: tab.getTabButtons()[index],
                        index,
                        tab
                    }
                }
            }

            return null
        };

        plans.forEach(plan => {
            const
                targetTab  = plan.tab,
                targetBar  = targetTab.getTabBar(),
                targetBody = targetTab.getCardContainer();

            plan.desiredItems.forEach((itemId, targetIndex) => {
                const
                    pane        = resolve(itemId),
                    placeholder = placeholders.get(itemId);
                let stagedButton = null;

                if (!pane) {
                    throw new Error(`Dock projection could not resolve live item "${itemId}"`)
                }

                if (placeholder?.parent) {
                    const placeholderIndex = targetBody.indexOf(placeholder);

                    if (placeholder.parent !== targetBody || placeholderIndex < 0) {
                        throw new Error(`Dock projection placed item "${itemId}" into the wrong tab body`)
                    }

                    stagedButton = targetBar.getTabButtons()[placeholderIndex];

                    if (!stagedButton) {
                        throw new Error(`Dock projection could not stage tab chrome for item "${itemId}"`)
                    }

                    targetBody.removeAt(placeholderIndex, true, true);
                    placeholders.delete(itemId)
                }

                const state = findItemState(pane);

                if (!state) {
                    const
                        inserted     = targetBody.insert(targetIndex, pane, true),
                        buttonConfig = targetTab.getTabButtonConfig(inserted.header, targetIndex);

                    // The projected placeholder body/button are one disposable pair. Reusing only
                    // its already-mounted button leaves that DOM lifecycle coupled to the destroyed
                    // placeholder pane. Materialize the live pair together, then commit its toolbar
                    // explicitly through the direct-owner transaction above. Silent insertion skips
                    // SortZone#onItemInsert, so the commitBars commit below reapplies the same
                    // semantic membership predicate used by every ordinary insert. The commitBars set
                    // below carries every bar whose membership changed silently, materialization included.
                    if (stagedButton) {
                        targetBar.remove(stagedButton, true, true)
                    }

                    targetBar.insertTab(targetIndex, buttonConfig, true);
                    commitBars.add(targetBar);

                    resolvedItems.set(itemId, inserted);
                    return
                }

                // A live source pair will move into this slot. Retire only the staged target
                // button; its body placeholder was already removed above.
                if (stagedButton) {
                    targetBar.remove(stagedButton, true, true)
                }

                if (state.tab === targetTab && state.index === targetIndex) return;

                state.body.removeAt(state.index, false, true, true);
                state.bar.removeTabAt(state.index, false, true, true);
                targetBody.insert(targetIndex, pane, true, false);
                targetBar.insertTab(targetIndex, state.button, true, false);

                // Both sides of a cross-bar move are silent, so neither publishes on its own. The
                // target renders anyway when it is freshly mounted, which leaves the SOURCE as the one
                // side nothing flushes: its removal stays unpublished and the moved button's old node
                // survives in the source header. One element id then renders under two bars, and the
                // stale node keeps the `pressed` class it left with — the reported two-active-tabs
                // header. Enrolling both bars in the awaited commit publishes the removal beside the
                // insertion; the set makes it idempotent when several items move between the same pair.
                if (state.bar !== targetBar) {
                    commitBars.add(state.bar);
                    commitBars.add(targetBar)
                }
            })
        });

        // Items absent from every projected tabs node are either true retirements or panes whose
        // owner explicitly preserves them outside the current render topology. Resolve their
        // post-transfer positions from pane identity while the body/button/item-id triple is still
        // exact, then remove each pair in descending index order so sibling positions stay valid.
        // Preserved panes lose only their obsolete button; ordinary retirements destroy both.
        // Items desired anywhere in the next projection are excluded because their pair moved above.
        const retirementsByBody = new Map();

        [...liveItems]
            .filter(([itemId]) => !desiredItemIds.has(itemId))
            .map(([itemId, pane]) => ({itemId, pane, state: findItemState(pane)}))
            .filter(retirement => retirement.state)
            .forEach(retirement => {
                const bodyRetirements = retirementsByBody.get(retirement.state.body) || [];

                bodyRetirements.push(retirement);
                retirementsByBody.set(retirement.state.body, bodyRetirements)
            });

        retirementsByBody.forEach(retirements => {
            retirements.sort((a, b) => b.state.index - a.state.index).forEach(({itemId, state}) => {
                if (!state.button) {
                    throw new Error(`Dock projection could not retire item "${itemId}" without its tab button`)
                }

                state.body.removeAt(state.index, !preservedItems.has(itemId), true);
                state.bar.removeTabAt(state.index, true, true)
            })
        });

        plans.forEach((plan, nodeId) => {
            const
                tab                 = plan.tab,
                bar                 = tab.getTabBar(),
                body                = tab.getCardContainer(),
                activeIndex         = plan.activeIndex,
                projectedSortConfig = plan.config.headerToolbar?.sortZoneConfig || {},
                sortConfig          = {
                    ...bar.sortZoneConfig,
                    ...projectedSortConfig,
                    dockItemIds: [...plan.desiredItems]
                };

            if (body.items.length !== plan.desiredItems.length
                || bar.getTabButtons().length !== plan.desiredItems.length) {
                throw new Error(`Dock projection tab chrome "${nodeId}" has an inexact item set`)
            }

            tab._activeIndex         = activeIndex;
            body.layout._activeIndex = activeIndex;
            bar.setSilent({sortZoneConfig: sortConfig});
            bar.sortZone?.set({
                dockItemIds     : [...plan.desiredItems],
                dockSourceNodeId: sortConfig.dockSourceNodeId,
                dockWorkspaceId : sortConfig.dockWorkspaceId,
                sortGroup       : sortConfig.sortGroup
            });

            plan.desiredItems.forEach((itemId, index) => {
                const
                    pane   = resolve(itemId),
                    button = bar.getTabButtons()[index],
                    header = tab.getTabButtonConfig(pane?.header, index);

                if (body.items[index] !== pane || !button) {
                    throw new Error(`Dock projection tab chrome "${nodeId}" lost item "${itemId}"`)
                }

                body.layout.applyChildAttributes(pane, index, true);
                button.setSilent({
                    domListeners: header.domListeners,
                    index,
                    pressed     : index === activeIndex,
                    text        : header.text
                })
            })
        });

        return plans
    }
}

export default Neo.setupClass(Reconciler);
