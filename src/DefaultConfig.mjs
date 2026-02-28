const Neo = globalThis.Neo || {};

Neo.config = Neo.config || {};

/**
 * Config object for the neo.mjs framework which will get passed to all workers
 * You can change the configs, e.g. inside the index.html of your app
 * @memberOf module:Neo
 * @name config
 * @type Object
 */
const DefaultConfig = {
    /**
     * true will apply 'neo-body' to the document.body classList
     * @default true
     * @memberOf! module:Neo
     * @name config.applyBodyCls
     * @type Boolean
     */
    applyBodyCls: true,
    /**
     * true will apply 'position: fixed' to the html tag itself
     * See: https://github.com/neomjs/neo/issues/6429
     * @default true
     * @memberOf! module:Neo
     * @name config.applyFixedPositionToHtmlTag
     * @type Boolean
     */
    applyFixedPositionToHtmlTag: true,
    /**
     * Path to your app.mjs file. You can create multiple apps there if needed.
     * @default null
     * @memberOf! module:Neo
     * @name config.appPath
     * @type String|null
     */
    appPath: null,
    /**
     * Path to the neo.mjs directory
     * @default './'
     * @memberOf! module:Neo
     * @name config.basePath
     * @type String
     */
    basePath: './',
    /**
     * Pass a token in case you are using the CesiumJS main thread addon
     * See: https://github.com/neomjs/neo/blob/dev/src/main/addon/CesiumJS.mjs
     * @default undefined
     * @memberOf! module:Neo
     * @name config.cesiumJsToken
     * @type String|null
     */

    /**
     * Set this config to false to disable the component logging using Ctrl-Right-Click
     * @default true
     * @memberOf! module:Neo
     * @name config.enableComponentLogger
     * @type Boolean
     */
    enableComponentLogger: true,
    /**
     * Set this config to true to enable util.Logger (Neo.log()) based logs in production
     * @default false
     * @memberOf! module:Neo
     * @name config.enableLogsInProduction
     * @type Boolean
     */
    enableLogsInProduction: false,
    /**
     * The current environment. Valid values: 'development', 'dist/development', 'dist/production'
     * This config will get auto-generated
     * @default 'dist/production'
     * @memberOf! module:Neo
     * @name config.environment
     * @type String
     */
    environment: 'dist/production',
    /**
     * In case you are using the GoogleMaps main thread addon, you can pass the API key here.
     * @default undefined
     * @memberOf! module:Neo
     * @name config.googleMapsApiKey
     * @type String
     */

    /**
     * In case you are using the GoogleAnalytics main thread addon or useGoogleAnalytics: true,
     * you can change the gtag id here. Required for the online examples (gh pages)
     * @default undefined
     * @memberOf! module:Neo
     * @name config.gtagId
     * @type String
     */

    /**
     * Flag for running on https://neomjs.github.io/pages/
     * => to use local images paths instead of raw.githubusercontent.com
     * @default false
     * @memberOf! module:Neo
     * @name config.isGitHubPages
     * @type Boolean
     */
    isGitHubPages: false,
    /**
     * Flag for running Neo.mjs inside the middleware Node.js process.
     * @default false
     * @memberOf! module:Neo
     * @name config.isMiddleware
     * @type Boolean
     */
    isMiddleware: false,
    /**
     * delay in ms for the worker.Manager:loadApplication() call
     * @default 20
     * @memberOf! module:Neo
     * @name config.loadApplicationDelay
     * @type Number
     */
    loadApplicationDelay: 20,
    /**
     * Used by Intl.DateTimeFormat, for details take a look at:
     * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DateTimeFormat
     * @default 'default'
     * @memberOf! module:Neo
     * @name config.locale
     * @type String
     */
    locale: 'default',
    /**
     * true will log the delta updates inside the main thread(s) as well as the requestAnimation frames
     * @default false
     * @memberOf! module:Neo
     * @name config.logDeltaUpdates
     * @type Boolean
     */
    logDeltaUpdates: false,
    /**
     * true will log console warnings, in case a component tries to update() while a parent update is running.
     * A parent update results in a short delay, so you might want to resolve these collisions.
     * @default false
     * @memberOf! module:Neo
     * @name config.logVdomUpdateCollisions
     * @type Boolean
     */
    logVdomUpdateCollisions: false,
    /**
     * Add addons for the main thread
     * ./src/main/addon/ contains all framework related options.
     * You can also create your own addons within your workspace scope. Make sure to put them inside 'src/main/addon/'
     * and prefix them with 'WS/' inside your neo-config.json file.
     * Example: ['DragDrop', 'Stylesheet', 'WS/MyAddon']
     * @default ['DragDrop', 'Navigator', 'Stylesheet']
     * @memberOf! module:Neo
     * @name config.mainThreadAddons
     * @type String[]
     */
    mainThreadAddons: ['DragDrop', 'Navigator', 'Stylesheet'],
    /**
     * The URL for the Neural Link WebSocket connection.
     * @default 'ws://127.0.0.1:8081'
     * @memberOf! module:Neo
     * @name config.neuralLinkUrl
     * @type String
     */

    /**
     * This config is auto-detected inside `Neo.Main.mjs` based on the user's system preference
     * using `window.matchMedia('(prefers-color-scheme: dark)')`. It defaults to `false` and
     * is updated before the App Worker is initialized, allowing apps to default to the
     * correct theme mode on startup.
     * @default false
     * @memberOf! module:Neo
     * @name config.prefersDarkTheme
     * @type Boolean
     */
    prefersDarkTheme: false,
    /**
     * Pass the URL of a JSON-file, which contains the services and methods from your backend,
     * which you want to expose to the client.
     * See: https://github.com/neomjs/neo/projects/32
     * @default null
     * @memberOf! module:Neo
     * @name config.remotesApiUrl
     * @type String|null
     */
    remotesApiUrl: null,
    /**
     * You can visually show the amount of delta updates per second using this config.
     * It expects a dom node with the id "neo-delta-updates" as the rendering target.
     * @default false
     * @memberOf! module:Neo
     * @name config.renderCountDeltas
     * @type Boolean
     */
    renderCountDeltas: false,
    /**
     * Add themes you want to use here. The first theme will get applied.
     * @default ['neo-theme-light','neo-theme-dark','neo-theme-neo-light']
     * @memberOf! module:Neo
     * @name config.themes
     * @type String[]
     */
    themes: ['neo-theme-light', 'neo-theme-dark', 'neo-theme-neo-light'],
    /**
     * Flag for standalone Siesta module tests => prevent registerRemote worker messages
     * @default false
     * @memberOf! module:Neo
     * @name config.unitTestMode
     * @type Boolean
     */
    unitTestMode: false,
    /**
     * When unitTestMode is true, this flag can be enabled to allow VDOM-related
     * operations like initVnode() and update() to proceed. This is useful for integration-style
     * tests that need to verify component lifecycle and DOM output.
     * @default false
     * @memberOf! module:Neo
     * @name config.allowVdomUpdatesInTests
     * @type Boolean
     */
    allowVdomUpdatesInTests: false,
    /**
     * Set this to true to establish a WebSocket connection to the Neural Link MCP Server.
     * This enables bidirectional communication between the App Worker and external AI Agents.
     *
     * You can also use a string or array of strings to specify the target environment(s).
     * Example: 'development' or ['development', 'dist/production']
     * @default false
     * @memberOf! module:Neo
     * @name config.useAiClient
     * @type Boolean|String|String[]
     */
    useAiClient: false,
    /**
     * Experimental flag if an offscreen canvas worker should get created.
     * @default false
     * @memberOf! module:Neo
     * @name config.useCanvasWorker
     * @type Boolean
     */
    useCanvasWorker: false,
    /**
     * Set this to true in case your app has a canvas.mjs entry point.
     * Only relevant if useCanvasWorker is set to true.
     * @default false
     * @memberOf! module:Neo
     * @name config.useCanvasWorkerStartingPoint
     * @type Boolean
     */
    useCanvasWorkerStartingPoint: false,
    /**
     * `true` will enable the advanced, secure, and performant direct DOM API rendering strategy (recommended).
     * In this mode, `Neo.vdom.Helper` will create and send structured VNode object graphs to the Main Thread.
     * `Neo.main.DeltaUpdates` will then use `Neo.main.render.DomApiRenderer` to directly manipulate the DOM.
     * Crucially, `Neo.main.render.DomApiRenderer` builds new **DOM subtrees** (from the received VNode object graphs)
     * as detached DocumentFragments or elements, entirely outside the live DOM tree.
     * These fully constructed fragments are then inserted into the live document in a **single, atomic operation**.
     * This approach inherently minimizes costly browser reflows/repaints, drastically reduces Cross-Site Scripting (XSS) risks,
     * and optimizes for surgical, atomic DOM updates for unparalleled performance.
     *
     * `false` will enable the legacy string-based rendering strategy.
     * In this mode, `Neo.vdom.Helper` will generate complete HTML strings (`outerHTML`) for VNode subtrees.
     * `Neo.main.DeltaUpdates` will then use `Neo.main.render.StringBasedRenderer` to insert these
     * strings into the DOM using methods like `parentNode.insertAdjacentHTML()`.
     * While performant for large insertions, this mode is generally less secure due to potential XSS vectors
     * and relies on browser HTML parsing, which can be less efficient for granular updates.
     *
     * This configuration affects both the initial painting of your applications and the creation
     * of new component trees at runtime.
     * @default true
     * @memberOf! module:Neo
     * @name config.useDomApiRenderer
     * @type Boolean
     */
    useDomApiRenderer: true,
    /**
     * Flag if vdom ids should get mapped into DOM element ids.
     * false will convert them into a "data-neo-id" attribute.
     * @default true
     * @memberOf! module:Neo
     * @name config.useDomIds
     * @type Boolean
     */
    useDomIds: true,
    /**
     * True will automatically include the stylesheet
     * @default true
     * @memberOf! module:Neo
     * @name config.useFontAwesome
     * @type Boolean
     */
    useFontAwesome: true,
    /**
     * Intended for the online examples where we need an easy way to add GA to every generated app
     * @default false
     * @memberOf! module:Neo
     * @name config.useGoogleAnalytics
     * @type Boolean
     */
    useGoogleAnalytics: false,
    /**
     * True will add the ServiceWorker main thread addon to support caching of assets (PWA)
     * See: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
     *
     * You can also use a string to specify the target environment => 'dist/production'.
     * Using 'dist/production' will also use the service worker for 'dist/esm'
     * @default false
     * @memberOf! module:Neo
     * @name config.useServiceWorker
     * @type Boolean|String
     */
    useServiceWorker: false,
    /**
     * Creates App, Data & VDom as SharedWorkers.
     * Set this one to true in case you want to connect multiple main threads.
     * @default false
     * @memberOf! module:Neo
     * @name config.useSharedWorkers
     * @type Boolean
     */
    useSharedWorkers: false,
    /**
     * True will generate a new task worker, which can get filled with own expensive remote methods
     * @default false
     * @memberOf! module:Neo
     * @name config.useTaskWorker
     * @type Boolean
     */
    useTaskWorker: false,
    /**
     * False will create the vdom.Helper within the App worker (experimental!)
     * @default true
     * @memberOf! module:Neo
     * @name config.useVdomWorker
     * @type Boolean
     */
    useVdomWorker: true,
    /**
     * buildScripts/injectPackageVersion.mjs will update this value
     * @default '12.0.0'
     * @memberOf! module:Neo
     * @name config.version
     * @type String
     */
    version: '12.0.0'
};

Object.assign(DefaultConfig, {
    /**
     * Path to the top level neo.mjs resources folder
     * @default Neo.config.basePath + 'resources/'
     * @memberOf! module:Neo
     * @name config.resourcesPath
     * @type String
     */
    resourcesPath: `${Neo.config.basePath || DefaultConfig.basePath}resources/`,
    /**
     * The default base URL for web worker entry points (App, Data, Vdom)
     * @default Neo.config.basePath + 'src/worker/'
     * @memberOf! module:Neo
     * @name config.workerBasePath
     * @type String
     */
    workerBasePath: `${Neo.config.basePath || DefaultConfig.basePath}src/worker/`,
});

export default DefaultConfig;
