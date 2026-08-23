import Base                from '../../../src/core/Base.mjs';
import DockZoneModel       from '../../../src/dashboard/DockZoneModel.mjs';
import CockpitDockDocument from './CockpitDockDocument.mjs';

/**
 * Static factory for the Fleet Cockpit perspective collection.
 * @class AgentOS.util.CockpitPresets
 * @extends Neo.core.Base
 */
class CockpitPresets extends Base {
    static config = {
        /**
         * @member {String} className='AgentOS.util.CockpitPresets'
         * @protected
         */
        className: 'AgentOS.util.CockpitPresets'
    }

    /**
     * The Fleet Cockpit's seeded perspective presets — the §01 duty variants as pure
     * `dockLayoutCollection.v1` data over the landed saved-layout wrappers:
     *
     * - **Overview** — the default mission-control split (the authored dock document, unchanged).
     *   Named so the preset reads as a LAYOUT control: the former "Fleet" name collided with the
     *   Fleet keeper tab while meaning something else entirely.
     * - **Focus** — the fleet zone dominant: the ranked roster takes nearly the full column, the
     *   activity stream stays a thin live strip (watching the fleet, not the feed).
     * - **Review** — one agent under review: the right chrome band opens on the agent-detail pane
     *   and the primary split leans toward the activity stream (the review evidence trail).
     *
     * Presets are **workspace-scope** captures (one cockpit document per record — the landed
     * wrapper; the multi-window topology tier is its own schema and out of scope here). This is a
     * data leaf only: a factory returning a FRESH validated collection per call — never a shared
     * mutable singleton — so the consuming store's clone discipline never aliases an authored
     * default. Every document round-trips the model validator by construction; a factory error is
     * thrown loudly (an authored preset that fails validation is a build-time defect, not a
     * runtime condition).
     *
     * @returns {Object} a fresh `neo.harness.dockLayoutCollection.v1` collection, `overview` active
     */
    static create() {
        const overviewDoc = CockpitDockDocument.create();

        const focusDoc = CockpitDockDocument.create();
        focusDoc.nodes['primary-split'].sizes = [0.85, 0.15];

        const reviewDoc = CockpitDockDocument.create();
        reviewDoc.nodes['primary-split'].sizes = [0.45, 0.55];
        reviewDoc.items.detail.autoHidden      = false;

        const layouts = [
            {document: overviewDoc, layoutId: 'overview', perspectiveName: 'Overview', title: 'Overview — mission control'},
            {document: focusDoc,    layoutId: 'focus',    perspectiveName: 'Focus',    title: 'Focus — roster dominant'},
            {document: reviewDoc,   layoutId: 'review',   perspectiveName: 'Review',   title: 'Review — one agent + the trail'}
        ].map(({document, layoutId, perspectiveName, title}) => {
            const {layout, errors} = DockZoneModel.createSavedLayout(document, {
                layoutId,
                perspectiveName,
                title,
                metadata: {source: 'fm-cockpit-presets'}
            });

            if (errors.length) {
                throw new Error(`cockpitPresetCollection: preset "${layoutId}" failed validation: ${errors.join('; ')}`)
            }

            return layout
        });

        const {collection, errors} = DockZoneModel.createSavedLayoutCollection(layouts, {
            activeLayoutId: 'overview',
            metadata      : {owner: 'fm-cockpit'}
        });

        if (errors.length) {
            throw new Error(`cockpitPresetCollection: collection failed validation: ${errors.join('; ')}`)
        }

        return collection
    }
}

export default Neo.setupClass(CockpitPresets);
