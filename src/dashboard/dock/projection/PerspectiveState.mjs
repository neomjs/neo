import Base         from '../../../core/Base.mjs';
import Authoring    from '../model/Authoring.mjs';
import Document     from '../model/WorkspaceDocument.mjs';
import TopologyDiff from '../model/TopologyDiff.mjs';

/**
 * @summary Projects declared-perspective truth onto the Workspace's existing provider.
 * Selection owns names and request serials; this helper owns only the provider representation.
 * Committed leaves are published beside header truth, while pending is written by request lifecycle.
 * @class Neo.dashboard.dock.projection.PerspectiveState
 * @extends Neo.core.Base
 */
class PerspectiveState extends Base {
    static config = {
        /** @member {String} className='Neo.dashboard.dock.projection.PerspectiveState' @protected */
        className: 'Neo.dashboard.dock.projection.PerspectiveState'
    }

    /**
     * @summary Compares documents under the perspective modification contract, without planner semantics.
     * Only edge resizability is excluded. Missing extents differ from present extents; finite edge
     * extents and split fractions within the size tolerance compare equal. Inputs remain untouched.
     * @param {Object|null} document
     * @param {Object|null} baseline
     * @param {Number} sizeEpsilon=TopologyDiff.SIZE_EPSILON
     * @returns {Boolean}
     */
    static isModified(document, baseline, sizeEpsilon=TopologyDiff.SIZE_EPSILON) {
        if (!baseline) return false;
        const before = Document.clone(baseline), after = Document.clone(document);
        for (const source of [before, after]) {
            for (const node of Object.values(source?.nodes ?? {})) {
                if (node.type === 'edge-zone') {
                    for (const zone of Object.values(node.zones)) delete zone.resizable
                }
            }
        }
        for (const [id, node] of Object.entries(before.nodes)) {
            const other = after?.nodes?.[id];
            if (node.type !== other?.type) continue;
            if (node.type === 'edge-zone') {
                for (const [edge, zone] of Object.entries(node.zones)) {
                    const target = other.zones[edge];
                    if (Number.isFinite(zone.extent) && Number.isFinite(target?.extent) &&
                        Math.abs(zone.extent - target.extent) <= sizeEpsilon) target.extent = zone.extent
                }
            } else if (node.type === 'split' && node.sizes.length === other.sizes.length) {
                other.sizes = other.sizes.map((size, index) =>
                    Math.abs(size - node.sizes[index]) <= sizeEpsilon ? node.sizes[index] : size)
            }
        }
        return !Neo.isEqual(before, after)
    }

    /**
     * @summary Reads the name carried into projection, never inferring identity from document equality.
     * Before declaration capture, the initial config or first declared name supplies the seed.
     * @param {Neo.dashboard.dock.Workspace} workspace
     * @param {Object|null} document=workspace.dockModel
     * @returns {{active:(String|null), modified:Boolean, pending:(String|null)}}
     */
    static read(workspace, document=workspace.dockModel) {
        const selection = workspace.perspectiveSelection,
              names     = Object.keys(workspace.perspectives ??
                  (workspace.panes != null || workspace.zones != null ? {[Authoring.defaultPerspectiveName]: null} : {})),
              active = selection?.publishedName ?? (names.includes(workspace.activePerspective)
                  ? workspace.activePerspective : names[0] ?? null);
        return {active, modified: this.isModified(document, selection?.document(active)), pending: selection?.pendingName ?? null}
    }

    /**
     * @summary Seeds the owned namespace before a configured provider runs formulas, retaining consumer data.
     * A supplied instance has already constructed; it receives the same local namespace immediately.
     * @param {Neo.dashboard.dock.Workspace} workspace
     * @param {Object|Neo.state.Provider|Neo.core.Base|null} value
     * @returns {Object|Neo.state.Provider|null}
     */
    static seedProvider(workspace, value) {
        if (!value) return value;
        const state = this.read(workspace), type = Neo.typeOf(value);
        if (type === 'NeoInstance') {
            value.setDataAtSameLevel('dock.perspective', state);
            return value
        }
        if (type === 'NeoClass') value = {module: value};
        const data = value.data ?? {}, dock = data.dock ?? {};
        return {...value, data: {...data, dock: {...dock, perspective: {...dock.perspective, ...state}}}}
    }

    /**
     * @summary Publishes committed leaves together; request state is never derived from projection completion.
     * @param {Neo.dashboard.dock.Workspace} workspace
     * @param {Object|null} document
     */
    static publishDocument(workspace, document) {
        const {active, modified} = this.read(workspace, document);
        workspace.stateProvider?.setDataAtSameLevel('dock.perspective', {active, modified})
    }

    /**
     * @summary Publishes the request owner's already-fenced pending name at its lifecycle boundary.
     * @param {Neo.dashboard.dock.Workspace} workspace
     * @param {String|null} name
     */
    static publishPending(workspace, name) {
        workspace.stateProvider?.setDataAtSameLevel('dock.perspective.pending', name)
    }
}

export default Neo.setupClass(PerspectiveState);
