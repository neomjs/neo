<details>
<summary>Multi-Window Applications</summary>

- Neo.mjs uniquely allows you to create multi-window applications
- Application logic, state, data, and component instances are seamlessly shared

This is possible because Neo.mjs components can be rendered to the DOM for any shared web worker. Your app logic listeners to events, maintains state, and shares data, without caring where the component is rendering, even if it's to another browser window.

</details>

<details>
<summary>Extremely High Performance</summary>

- Multi-threaded via web workers
- Very fast rendering -- easily handling over 40,000 DOM updates per second
- Neo.mjs applications follow the _off the main thread_ (OMT) paradigm

Neo.mjs runs key processes in separate web workers, each running in parallel threads: one thread for app logic, one for managing DOM updates, and one for communicating with the backend. And if you have specialized or processor-intensive tasks, you can easily spawn additional threads. Apps written using traditional main-thread libraries must compete for resources, which results in bottlenecks and user interfaces freezes. 

The good UI performance is due to the DOM updates logic being run in its own thread, and in addition, the logic is very
efficient in tracking and applying delta updates.
</details>


<details>
<summary>Reduced Development Costs</summary>

- Standard ECMAscript
- No proprietary extensions or file types, no special WebPack processes

Neo.mjs apps are written in standard ECMAscript modular JavaScript. That means your team doesn't need to learn about specialized language extensions or file types, and there are no special transpilation processes. This also means debugging is simpler: logic runs as well in the debugger console as it does in your source code.
</details>

<details>
<summary>Powerful Framework Features</summary>

- Property lifecycle hooks
- Elegant state management
- Component-based, declaratively configured 
Neo.mjs components are abstract, and configured declaratively. This means you don't need to be an HTML expert to write your user interface. The library also has features that make it each to detect property updates, through lifecycle-hooks, events, and data binding. Debugging is easy too: it's easy to inspect and update components and state directly on the debugger command line.
</details>


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
         * @member {Object} layout={ntype:'hbox',align:'stretch',wrap:'wrap'}
         */
        layout: {ntype: 'hbox', align: 'stretch', wrap: 'wrap'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: ContentBox,
            header: 'Multi-Window Apps',
            route : '#/learn/WhyNeo-Quick',

            content: [
                'No need for a Native Shell (e.g. Electron)',
                'Sharing Data across Windows',
                'Sharing State across Windows',
                'Moving Components across Windows while keeping the same JS instances'
            ]
        }, {
            module: ContentBox,
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
            module: ContentBox,
            header: 'Modern JavaScript directly in your Browser',
            route : '#/learn/WhyNeo-Quick',

            content: [
                'The Dev-Mode runs without the need for Transpilations or Compilations',
                'Using the latest ECMAScript Features, as soon as the Browser Support is there',
                'Simple and powerful Debugging',
                'Reduced Development Costs'
            ]
        }, {
            module: ContentBox,
            header: 'Powerful Component-Library',
            route : '#/learn/WhyNeo-Quick',

            content: [
                'Declarative Component-Trees',
                'High Order Components',
                'Many out-of-the-box Components, including nested lazy-loaded forms',
                'Multiple themes, which can get nested'
            ]
        }, {
            module: ContentBox,
            header: 'Elegant State Management',
            route : '#/learn/WhyNeo-Speed',

            content: [
                'Multiple communicating State-Providers',
                'Observable',
                'Supporting different architectures like MVVM without enforcing them'
            ]
        }, {
            module: ContentBox,
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
