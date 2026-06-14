import DockLayoutAdapter from '../../../src/dashboard/DockLayoutAdapter.mjs';
import Viewport          from '../../../src/container/Viewport.mjs';
import '../../../src/tab/Container.mjs'; // registers the `tab-container` ntype the projection emits for tab zones

/**
 * A representative dock-zone document (`neo.harness.dockZone.v1`): a horizontal split of a two-tab main zone and a
 * vertical side-split of two single-tab zones, over four items. The shape `Neo.dashboard.DockLayoutAdapter.project`
 * consumes — see its spec for the full contract.
 * @type {Object}
 */
const dockModel = {
    schema: 'neo.harness.dockZone.v1',
    root  : 'root',
    items : {
        strategy: {componentRef: 'Strategy', title: 'Strategy', kind: 'panel'},
        swarm   : {componentRef: 'Swarm',    title: 'Swarm',    kind: 'panel'},
        terminal: {componentRef: 'Terminal', title: 'Terminal', kind: 'terminal'},
        logs    : {componentRef: 'Logs',     title: 'Logs',     kind: 'panel'}
    },
    nodes: {
        root           : {type: 'split', orientation: 'horizontal', children: ['main-tabs', 'side-split'], sizes: [0.65, 0.35]},
        'main-tabs'    : {type: 'tabs',  items: ['strategy', 'swarm'], activeItemId: 'strategy'},
        'side-split'   : {type: 'split', orientation: 'vertical', children: ['terminal-tabs', 'logs-tabs'], sizes: [0.6, 0.4]},
        'terminal-tabs': {type: 'tabs',  items: ['terminal'], activeItemId: 'terminal'},
        'logs-tabs'    : {type: 'tabs',  items: ['logs'],     activeItemId: 'logs'}
    }
};

/**
 * Resolves a model `componentRef` to the component config rendered inside its dock zone. For this example, a simple
 * centered label per panel; a real app resolves each ref to its feature view.
 * @param {String} componentRef
 * @returns {Object}
 */
const resolveComponentRef = componentRef => ({
    ntype: 'component',
    style: {alignItems: 'center', color: '#888', display: 'flex', fontSize: '20px', justifyContent: 'center'},
    html : componentRef
});

/**
 * @summary Standalone example for the dashboard dock-zone layout system.
 *
 * Builds a representative {@link Neo.dashboard.DockZoneModel} document, then projects it through
 * {@link Neo.dashboard.DockLayoutAdapter} into a live container of split / tab zones with interactive resize
 * splitters — the missing standalone showcase + first *runtime* exercise of `DockLayoutAdapter.project`, which until
 * now was only unit-tested and never run in a live app's render path.
 * @class Neo.examples.dashboard.dock.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.dashboard.dock.MainContainer'
         * @protected
         */
        className: 'Neo.examples.dashboard.dock.MainContainer',
        /**
         * @member {Object} layout={ntype:'fit'}
         */
        layout: {ntype: 'fit'},
        /**
         * The dock layout: the model projected once into a live container — split + tab zones + interactive resize
         * splitters (the splitter affordances the projection emits drive `DockZoneModel.applyOperation('resizeSplit')`).
         * @member {Object[]} items
         */
        items: [
            DockLayoutAdapter.project(dockModel, {resolveComponentRef})
        ]
    }
}

export default Neo.setupClass(MainContainer);
