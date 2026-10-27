import Base            from './Base.mjs';
import ClassSystemUtil from '../util/ClassSystem.mjs';
import NeoArray        from '../util/Array.mjs';

/**
 * @class Neo.controller.Application
 * @extends Neo.controller.Base
 */
class Application extends Base {
    /**
     * True automatically applies the core.Observable mixin
     * @member {Boolean} observable=true
     * @static
     */
    static observable = true

    static config = {
        /**
         * @member {String} className='Neo.controller.Application'
         * @protected
         */
        className: 'Neo.controller.Application',
        /**
         * @member {String} ntype='application'
         * @protected
         */
        ntype: 'application',
        /**
         * @member {String|null} appThemeFolder=null
         */
        appThemeFolder: null,
        /**
         * @member {Neo.component.Base} mainView_=null
         * @reactive
         */
        mainView_: null,
        /**
         * @member {Boolean} mounted=false
         * @protected
         */
        mounted: false,
        /**
         * @member {String} name='MyApp'
         */
        name: 'MyApp',
        /**
         * @member {String} parentId='document.body'
         */
        parentId: 'document.body',
        /**
         * @member {Boolean} vnodeInitialising=false
         * @protected
         */
        vnodeInitialising: false,
        /**
         * @member {Boolean} vnodeInitialized=false
         * @protected
         */
        vnodeInitialized: false,
        /**
         * @member {Number|null} windowId=null
         */
        windowId: null
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        // to guarantee that the main view can access Neo.apps at any point,
        // we need to trigger its assignment at the end of the ctor.
        let {mainView} = config;
        delete config.mainView;

        super.construct(config);

        let me     = this,
            {name} = me;

        me.windowId = config.windowId || Neo.bootingWindowId || Neo.config.windowId;

        Neo.apps[me.windowId] = me;

        Neo.appsByName[name] ??= [];
        Neo.appsByName[name].push(me);

        Neo.currentWorker.registerApp(name, me.windowId);

        if (mainView) {
            me.mainView = mainView
        }
    }

    /**
     * Triggered after the mainView config got changed
     * @param {Neo.component.Base} value
     * @param {Neo.component.Base|null} oldValue
     * @protected
     */
    async afterSetMainView(value, oldValue) {
        if (value) {
            let me       = this,
                {config} = Neo;

            // Short delay to ensure changes from onHashChange() got applied
            await me.timeout(config.hash ? 200 : 10);

            if (config.useSSR && config.vnode) {
                // SSR Takeover Path => once vnode and mounted are set, delta-updates can start
                value.onInitVnode(config.vnode, true);

                // Clean up the config to prevent re-use
                delete config.vnode;

                // Self-healing: if there happen to be different ids within vdom and vnode,
                // the vdom worker will create patches as needed.
                value.updateDepth = -1;
                value.update()
            } else {
                // Standard Client-Side Rendering Path
                await value.initVnode(true)
            }
        }
    }

    /**
     * Triggered before the mainView config gets changed.
     * @param {Object} value
     * @param {Object} oldValue
     * @returns {Neo.component.Base|null}
     * @protected
     */
    beforeSetMainView(value, oldValue) {
        if (value) {
            let me       = this,
                {config} = Neo,
                instanceConfig = {
                    appName : me.name,
                    parentId: me.parentId,
                    windowId: me.windowId
                };

            if (config.useSSR && config.vnode) {
                instanceConfig.autoInitVnode = false;
                instanceConfig.autoMount     = false
            }

            return ClassSystemUtil.beforeSetInstance(value, null, instanceConfig)
        }

        return null
    }

    /**
     * @summary Destroys the app together with its main view, and hands its window's slot in `Neo.apps` to another
     * app the window still hosts.
     *
     * The main view goes first, while `Neo.apps` still names this app for any component resolving it on the way out.
     * Whatever the tree still holds goes with it: an owner keeps a component by moving it out first.
     * @param args
     */
    destroy(...args) {
        let me                         = this,
            {mainView, name, windowId} = me;

        mainView && !mainView.isDestroyed && mainView.destroy();

        Neo.appsByName?.[name] && NeoArray.remove(Neo.appsByName[name], me);

        if (Neo.apps[windowId] === me) {
            const sibling = Object.values(Neo.appsByName).flat().find(app => app.windowId === windowId);

            sibling ? (Neo.apps[windowId] = sibling) : delete Neo.apps[windowId]
        }

        super.destroy(...args)
    }
}

Application = Neo.setupClass(Application);

// convenience shortcut
Neo.app = config => Neo.create({
    module: Application,
    ...config
});

export default Application;
