import Component from '../component/Base.mjs';
import Base      from '../core/Base.mjs';

/**
 * @summary Preserves live tab-chrome identity across dock-layout projections.
 *
 * {@link Neo.dashboard.DockLayoutAdapter} deliberately remains a stateless document-to-config
 * projector. This class owns the complementary live-component handoff: it keys projected tab
 * containers by `dockNodeId`, stages retained ancestors behind geometry-equivalent placeholders,
 * and moves each pane/button pair before its owning tab container moves. Callers must commit those
 * descendant and ancestor ownership layers separately so the main-thread delta cannot retire a
 * child after its retained ancestor has landed.
 *
 * The reconciler owns no workspace document or pane cache. Each docking workspace supplies its
 * item resolver and controls its own animation and app-specific overflow/menu readiness.
 *
 * @class Neo.dashboard.DockProjectionReconciler
 * @extends Neo.core.Base
 * @see Neo.dashboard.DockLayoutAdapter
 * @see learn/agentos/HarnessDockZoneModel.md
 */
class DockProjectionReconciler extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.DockProjectionReconciler'
         * @protected
         */
        className: 'Neo.dashboard.DockProjectionReconciler'
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
     * @param {*} options.nextConfig Fresh {@link Neo.dashboard.DockLayoutAdapter} projection.
     * @param {Map<String,Neo.component.Base>} options.placeholders Item placeholders created by the caller.
     * @param {Function} options.resolveItem Resolves one live pane by dock item id.
     * @param {Function|null} [options.onProjectionStaged=null]
     * @param {Number} [options.shellIndex=0]
     * @param {Function|null} [options.waitForOverflowProjection=null]
     * @returns {Promise<{currentTabs: Map, nextShell: Neo.component.Base, overflowPlugins: Object[], plans: Map}>}
     * @static
     */
    static async reconcileProjection({
        host,
        nextConfig,
        placeholders,
        resolveItem,
        onProjectionStaged=null,
        shellIndex=0,
        waitForOverflowProjection=null
    }) {
        const oldShell = host?.items?.[shellIndex];

        if (!oldShell) {
            throw new Error(`Dock projection could not find a current shell at index ${shellIndex}`)
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

        this.reconcileTabChrome(plans, placeholders, currentTabs, nextShell, resolveItem);

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

        const retainedRoot = oldShell === nextShell;

        if (!retainedRoot) {
            oldShell.setSilent({hideMode: 'visibility', hidden: true});
            nextShell.setSilent({hidden: false})
        }

        host.updateDepth = -1;
        host.update();
        await host.promiseUpdate();

        if (!retainedRoot) {
            host.remove(oldShell, true, true);
            host.updateDepth = -1;
            host.update();
            await host.promiseUpdate()
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

        return {currentTabs, nextShell, overflowPlugins, plans}
    }

    /**
     * @summary Moves retained tab-container ancestors into their staged projected slots silently.
     *
     * Cross-tab card/button moves must commit before this method runs. The distinct ancestor commit
     * prevents the main-thread delta from retiring a child after its retained ancestor has landed.
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
                cls      : plan.config.cls,
                flex     : plan.config.flex,
                listeners: plan.config.listeners,
                style    : plan.config.style,
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
     * before invoking {@link Neo.dashboard.DockProjectionReconciler.moveRetainedTabChrome}.
     * @param {Map<String,Object>} plans
     * @param {Map<String,Neo.component.Base>} placeholders
     * @param {Map<String,Neo.tab.Container>} currentTabs
     * @param {Neo.container.Base} nextShell
     * @param {Function} resolveItem Resolves one live pane by dock item id.
     * @returns {Map<String,Object>}
     * @static
     */
    static reconcileTabChrome(plans, placeholders, currentTabs, nextShell, resolveItem) {
        const
            nextTabs      = this.collectProjectedTabs(nextShell),
            allTabs       = new Set([...currentTabs.values(), ...nextTabs.values()]),
            liveItems     = new Map(),
            resolvedItems = new Map();

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
                        button: tab.getTabBar().items[index],
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

                if (!pane) {
                    throw new Error(`Dock projection could not resolve live item "${itemId}"`)
                }

                if (placeholder?.parent) {
                    const placeholderIndex = targetBody.indexOf(placeholder);

                    if (placeholder.parent !== targetBody || placeholderIndex < 0) {
                        throw new Error(`Dock projection placed item "${itemId}" into the wrong tab body`)
                    }

                    targetBody.removeAt(placeholderIndex, true, true);
                    targetBar.removeAt(placeholderIndex, true, true);
                    placeholders.delete(itemId)
                }

                const state = findItemState(pane);

                if (!state) {
                    targetTab.insert(targetIndex, pane, true);
                    return
                }

                if (state.tab === targetTab && state.index === targetIndex) return;

                state.body.removeAt(state.index, false, true, true);
                state.bar.removeAt(state.index, false, true, true);
                targetBody.insert(targetIndex, pane, true, false);
                targetBar.insert(targetIndex, state.button, true, false)
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
                || bar.items.length !== plan.desiredItems.length) {
                throw new Error(`Dock projection tab chrome "${nodeId}" has an inexact item set`)
            }

            tab._activeIndex         = activeIndex;
            body.layout._activeIndex = activeIndex;
            bar.setSilent({sortZoneConfig: sortConfig});
            bar.sortZone?.setSilent?.({
                dockItemIds     : [...plan.desiredItems],
                dockSourceNodeId: sortConfig.dockSourceNodeId,
                dockWorkspaceId : sortConfig.dockWorkspaceId,
                sortGroup       : sortConfig.sortGroup
            });

            plan.desiredItems.forEach((itemId, index) => {
                const
                    pane   = resolve(itemId),
                    button = bar.items[index],
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

export default Neo.setupClass(DockProjectionReconciler);
