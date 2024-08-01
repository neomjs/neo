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
         */
        cls: ['portal-home-features'],
        /**
         * @member {Object|String} layout='grid'
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
            header: 'Multi-Window Apps',
            route : '#/learn/WhyNeo-Quick',

            content: [
                'No need for a Native Shell (e.g. Electron)',
                'Sharing Data across Windows',
                'Sharing State across Windows',
                'Moving Components across Windows while keeping the same JS instances'
            ]
        }, {
            header: 'Multi-threading',
            route : '#/learn/WhyNeo-Quick',

            content: [
                'Following the OMT (Off the Main-Thread) paradigm',
                'Your Apps & the Framework live within an Application Worker',
                'Non-blocking, no-freeze, user interaction responses, even for heavy data i/o, processing, and intensive, complex screen updating',
                'Additional Workers for OffscreenCanvas, Data, Delta-Updates & Tasks',
                'A ServiceWorker connected to the App Worker for predictive Caching'
            ]
        }, {
            header: 'Modern JavaScript directly in your Browser',
            route : '#/learn/WhyNeo-Quick',

            content: [
                'The Dev-Mode runs without the need for Transpilations or Compilations',
                'Using the latest ECMAScript Features, as soon as the Browser Support is there',
                'Simple and powerful Debugging',
                'Reduced Development Costs'
            ]
        }, {
            header: 'Powerful Component-Library',
            route : '#/learn/WhyNeo-Quick',

            content: [
                'Declarative Component-Trees',
                'High Order Components',
                'Many out-of-the-box Components, including nested lazy-loaded forms',
                'Multiple themes, which can get nested'
            ]
        }, {
            header: 'Elegant State Management',
            route : '#/learn/WhyNeo-Speed',

            content: [
                'Multiple communicating State-Providers',
                'Observable',
                'Supporting different architectures like MVVM without enforcing them'
            ]
        }, {
            header: 'Core Features',
            route : '#/learn/WhyNeo-Speed',

            content: [
                'RPC Layer (cross-realm, including Backends)',
                'Extensibility',
                'Scalability',
                'Class Config System',
                'Drag & Drop',
                'Mixins, Plugins & Main-Thread Addons'
            ]
        }]
    }
}

Neo.setupClass(Features);

export default Features;
