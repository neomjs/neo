import BaseContainer from './BaseContainer.mjs';
import ContentBox    from '../ContentBox.mjs';

/**
 * @class Portal.view.home.parts.Features
 * @extends Portal.view.home.parts.BaseContainer
 */
class Features extends BaseContainer {
    static config = {
        /**
         * @member {String} className='Portal.view.home.parts.Features'
         * @protected
         */
        className: 'Portal.view.home.parts.Features',
        /**
         * @member {String[]} cls=['portal-home-features']
         * @reactive
         */
        cls: ['portal-home-features'],
        /**
         * @member {Object|String} layout='grid'
         * @reactive
         */
        layout: 'grid',
        /**
         * @member {Object} itemDefaults
         */
        itemDefaults: {
            module: ContentBox
        },
        /**
         * @member {Object[]} items
         */
        items: [{
            header: 'Threading Subsystem',
            route : '#/learn/benefits/OffTheMainThread',

            content: [
                'True Multithreading: App, Data, VDOM, and Canvas live in separate workers.',
                'The Main Thread is treated as a "dumb" renderer, ensuring 60fps fluidity.',
                'Eliminates UI jank by isolating logic from rendering.',
                'Includes a dedicated Task Worker for background processing.'
            ]
        }, {
            header: 'Rendering Pipeline',
            route : '#/learn/benefits/OffTheMainThread',

            content: [
                'Asymmetric VDOM: Diffing happens off-thread.',
                'Sends compressed JSON deltas to the Main Thread.',
                'Faster, more secure, and AI-friendly than main-thread diffing.',
                'Supports over 40,000 delta updates per second.'
            ]
        }, {
            header: 'The Scene Graph',
            route : '#/learn/guides/fundamentals/CodebaseOverview',

            content: [
                'Components are persistent objects, not ephemeral render results.',
                'Retain state and identity even when detached from the DOM.',
                'Enables Runtime Permutation: Drag active dashboards between windows.',
                'The "Lego Technic" model vs. "Melted Plastic" (other frameworks).'
            ]
        }, {
            header: 'State Subsystem',
            route : '#/learn/guides/datahandling/StateProviders',

            content: [
                'Built-in, hierarchical State Providers.',
                'Push and Pull reactivity models.',
                'Components bind declaratively to state changes.',
                'Updates are handled efficiently off the main thread.'
            ]
        }, {
            header: 'Multi-Window Orchestration',
            route : '#/learn/benefits/MultiWindow',

            content: [
                'A single engine instance powers multiple browser windows.',
                'SharedWorkers enable real-time state synchronization.',
                'Move components between windows without losing state.',
                'Ideal for Trading Platforms and Control Rooms.'
            ]
        }, {
            header: 'Zero-Build System',
            route : '#/learn/benefits/Quick',

            content: [
                'Runs as native ES Modules directly in the browser.',
                'No transpilation or bundling required in Dev Mode.',
                'Instant reloads: What you write is what you debug.',
                '100% aligned with modern Web Standards.'
            ]
        }]
    }
}

export default Neo.setupClass(Features);
