import Base                   from '../../../src/core/Base.mjs';
import DockTopologyReconciler from '../../../src/dashboard/dock/model/TopologyReconciler.mjs';
import Persistence            from '../../../src/dashboard/dock/model/Persistence.mjs';
import WorkspaceDocument      from '../../../src/dashboard/dock/model/WorkspaceDocument.mjs';

/**
 * @class Neo.examples.dashboard.crossWindow.DemoBPerspectiveHost
 * @extends Neo.core.Base
 * @summary Connects the demo's perspective capture, restore and switching to its live workspace.
 *
 * Mixed into the workspace without constructing another owner. Stores, topology collections,
 * reports, documents, subscriptions and teardown remain host-owned. Calls between these
 * methods resolve the host's current facades; the restore facade supplies semantic IDs.
 */
class DemoBPerspectiveHost extends Base {
    static config = {
        /** @member {String} className='Neo.examples.dashboard.crossWindow.DemoBPerspectiveHost' */
        className: 'Neo.examples.dashboard.crossWindow.DemoBPerspectiveHost'
    }

    /**
     * @summary Captures the CURRENT committed workspace state as a named perspective through the real
     * §2.2 path. Window scope persists the primary document; topology scope persists the
     * Group's registered workspace documents with one composed fingerprint.
     * `replace: true` keeps tour reruns idempotent — re-capturing your own name is the
     * demo's update flow, not a collision dispute.
     * @param {String} name
     * @param {Object} [options={}]
     * @param {'window'|'topology'} [options.scope='window']
     * @returns {{saved: Boolean, errors: String[]}}
     */
    capturePerspective(name, {scope = 'window'} = {}) {
        let me       = this,
            metadata = {
                layoutId       : `demo-b-${name.toLowerCase()}`,
                perspectiveName: name,
                title          : name
            },
            created;

        if (scope !== 'window' && scope !== 'topology') {
            return {errors: [`unknown perspective capture scope "${scope}"`], saved: false}
        }

        created = scope === 'topology'
            ? Persistence.captureTopologyPerspective(
                Object.fromEntries(me.workspaceSet.ids().map(key => [key, me.workspaceSet.getDocument(key)])),
                {...metadata, placementHints: me.getPlacementHints()}
            )
            : Persistence.createSavedLayout(me.dockModel, metadata);

        if (created.errors.length) {
            return {errors: created.errors, saved: false}
        }

        if (scope === 'topology') {
            const topologies = {
                    ...me.topologyCollection.topologies,
                    [created.topology.layoutId]: created.topology
                },
                result = Persistence.createTopologyCollection(topologies, {
                    activeLayoutId: created.topology.layoutId,
                    metadata      : me.topologyCollection.metadata,
                    ...(Object.hasOwn(me.topologyCollection, 'revision') && {
                        revision: me.topologyCollection.revision
                    })
                });

            if (result.errors.length) {
                return {errors: result.errors, saved: false}
            }

            me.topologyCollection = result.collection;
            return {errors: [], saved: true}
        }

        let result = me.perspectiveStore.savePerspective(created.layout, {replace: true});

        return {errors: result.errors, saved: result.saved}
    }

    /**
     * @summary Creates the bar whose perspective buttons are rebuilt from store lifecycle events.
     * The label is present immediately; the host's switcher callback adds the stored perspectives.
     * @returns {Object}
     */
    createSwitcherBar() {
        let me = this;

        return {
            cls      : ['agentos-dockdemo-switcher'],
            flex     : 'none',
            layout   : {ntype: 'hbox', align: 'center'},
            ntype    : 'toolbar',
            reference: 'switcher-bar',
            items    : [{
                cls  : ['agentos-dockdemo-switcher-label'],
                html : 'Perspectives',
                ntype: 'component',
                style: {marginRight: '8px', opacity: 0.7, whiteSpace: 'nowrap'}
            }]
        }
    }

    /**
     * @summary Loads a stored perspective. Window-scope records commit the restored primary document;
     * topology-scope records go through the changed-topology reconciler and expose its remainder.
     * @param {String} name
     * @returns {Promise<Object>} The committed result, including any topology remainder.
     */
    async loadPerspectiveByName(name) {
        let me       = this,
            topology = Object.values(me.topologyCollection?.topologies || {})
                .find(record => record.perspectiveName === name || record.layoutId === name);

        // Reconcile BEFORE `loadPerspective` advances the store's active id. A malformed
        // topology record or live document must leave both layout truth and selection truth
        // untouched — fail-closed means more than avoiding a document assignment.
        if (topology) {
            let preview = await me.restoreTopologyPerspective(topology, {commit: false});

            if (!preview.loaded) return preview;

            let activated = Persistence.createTopologyCollection(me.topologyCollection.topologies, {
                activeLayoutId: topology.layoutId,
                metadata      : me.topologyCollection.metadata,
                ...(Object.hasOwn(me.topologyCollection, 'revision') && {
                    revision: me.topologyCollection.revision
                })
            });

            if (activated.errors.length) {
                return {errors: activated.errors, loaded: false, report: preview.report}
            }

            try { await me.commitTopologyRestore(preview) } catch (error) {
                return {errors: [error.message], loaded: false, report: preview.report}
            }
            me.topologyCollection = activated.collection;
            me.restoreReport = preview.report;
            me.renderRestoreReport();

            return {errors: [], loaded: true, report: preview.report}
        }

        const result = await me.dockService.restorePerspective({componentId: me.id, name});
        return {errors: result.errors, loaded: result.switched}
    }

    /**
     * @summary Commits a validated topology result while preserving panes that remain owner-held
     * but cannot be projected because their captured window is not live.
     * @param {Object} result
     * @param {Object<String,Object>} result.workspaces Reconciled documents keyed by workspace.
     * @param {Boolean} result.hasLivePopup Whether a second render target currently exists.
     * @param {Object} result.report Structured reconciliation remainder.
     * @returns {Promise}
     * @protected
     */
    commitTopologyRestore({workspaces, hasLivePopup, report}) {
        let me              = this,
            liveDocuments   = Object.values(workspaces),
            liveItemIds     = new Set(liveDocuments.flatMap(document => Object.keys(document?.items || {}))),
            preserveItemIds = (report?.unrestored || [])
                .map(entry => entry.itemId)
                .filter(itemId => !liveItemIds.has(itemId));

        return me.workspaceSet.write(workspaces, {
            cause: 'restore-topology', provenance: {origin: 'human'}, descriptor: {preserveItemIds}
        })
    }

    /**
     * @summary Reconciles one topology record onto the currently live workspace documents.
     * A connected/detached popup contributes its worker-owned document; otherwise the live
     * topology is intentionally one window. Validation errors mutate neither document.
     * @param {Object} topology A keyed topology record.
     * @param {Object} [options={}]
     * @param {Boolean} [options.commit=true] Commit reconciled documents; false is a preflight.
     * @param {Object} workspaceIds Host-owned semantic workspace identities.
     * @param {String} workspaceIds.mainWorkspaceId
     * @param {String} workspaceIds.popupWorkspaceId
     * @returns {Promise<Object>} The result without a Group write when commit is false; invalid
     * reconciliation still publishes its error report to the host's visible strip.
     */
    async reconcileTopologyPerspective(topology, {commit = true} = {}, {mainWorkspaceId, popupWorkspaceId}) {
        let me             = this,
            hasLivePopup   = Object.keys(me.detachedPanes).length > 0,
            liveWorkspaces = {
                [mainWorkspaceId]: me.dockModel,
                ...(hasLivePopup && {[popupWorkspaceId]: me.popupDocument})
            },
            result        = DockTopologyReconciler.reconcile(topology, liveWorkspaces),
            report        = WorkspaceDocument.clone({
                applied        : result.applied,
                displaced      : result.displaced,
                errors         : result.errors,
                noWindowSpawned: true,
                unmatchedLive  : result.unmatchedLive,
                unrestored     : result.unrestored
            });

        if (result.errors.length) {
            me.restoreReport = report;
            me.renderRestoreReport();
            return {workspaces: result.workspaces, errors: result.errors, hasLivePopup, loaded: false, report}
        }

        if (commit) {
            try { await me.commitTopologyRestore({workspaces: result.workspaces, hasLivePopup, report}) } catch (error) {
                return {workspaces: result.workspaces, errors: [error.message], hasLivePopup, loaded: false, report}
            }
            me.restoreReport = report;
            me.renderRestoreReport()
        }

        return {workspaces: result.workspaces, errors: [], hasLivePopup, loaded: true, report}
    }

    /**
     * @summary Renders the structured topology remainder into a dedicated visible strip.
     * Item ids are escaped because saved layouts are data, not trusted markup.
     * @protected
     */
    renderRestoreReport() {
        let me     = this,
            target = me.getReference('restore-report-b'),
            report = me.restoreReport,
            escape = value => String(value)
                .replaceAll('&', '&amp;')
                .replaceAll('<', '&lt;')
                .replaceAll('>', '&gt;'),
            entries = values => values.length
                ? values.map(entry => `${escape(entry.itemId)} (${escape(entry.reason)})`).join(', ')
                : 'none';

        if (!target || !report) return;

        target.html = report.errors.length
            ? `<strong>Topology restore rejected.</strong> Validation failed; live documents stayed untouched. ${report.errors.map(escape).join('; ')}`
            : `<strong>Topology restore — no window spawned.</strong> Unrestored: ${entries(report.unrestored)}. Displaced: ${report.displaced.length ? report.displaced.map(entry => escape(entry.itemId)).join(', ') : 'none'}. Unmatched live workspaces: ${report.unmatchedLive.length ? report.unmatchedLive.join(', ') : 'none'}.`;
        target.hidden = false
    }

    /**
     * @summary Rebuilds the switcher buttons from the store's current collection — fired by every
     * store lifecycle event; buttons load their perspective through the same path the tour
     * cues use (one code path, human- and agent-driven alike).
     * @protected
     */
    syncSwitcher() {
        let me  = this,
            bar = me.getReference('switcher-bar');

        if (!bar) return;

        let collection = me.perspectiveStore.collection,
            layouts    = collection?.layouts ?? {},
            names      = Object.values(layouts).map(record => record.perspectiveName ?? record.layoutId);

        // children after the label are the perspective buttons — rebuild in place
        while (bar.items.length > 1) {
            bar.removeAt(bar.items.length - 1)
        }

        names.forEach(name => {
            bar.add({
                cls            : ['agentos-dockdemo-switcher-btn'],
                handler        : () => me.loadPerspectiveByName(name),
                ntype          : 'button',
                text           : name,
                useRippleEffect: false
            })
        })
    }
}

Neo.setupClass(DemoBPerspectiveHost);

export default DemoBPerspectiveHost;
