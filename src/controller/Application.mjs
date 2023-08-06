import Base            from './Base.mjs';
import ClassSystemUtil from '../util/ClassSystem.mjs';
import Logger          from '../util/Logger.mjs';

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
         * @member {String|null} appThemeFolder=null
         */
        appThemeFolder: null,
        /**
         * @member {Neo.component.Base} mainView_=null
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
         * @member {Boolean} rendered=false
         * @protected
         */
        rendered: false,
        /**
         * @member {Boolean} rendering=false
         * @protected
         */
        rendering: false
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        // to guarantee that the main view can access Neo.apps at any point,
        // we need to trigger its assignment at the end of the ctor.
        let mainView = config.mainView;
        delete config.mainView;

        super.construct(config);

        let me = this;

        Neo.apps = Neo.apps || {};

        Neo.apps[me.name] = me;

        Neo.currentWorker.registerApp(me.name);

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
            let me = this;

            // short delay to ensure changes from onHashChange() got applied
            await Neo.timeout(Neo.config.hash ? 200 : 10);

            Logger.addContextMenuListener(me.mainView);

            value.render(true)
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
            return ClassSystemUtil.beforeSetInstance(value, null, {
                appName : this.name,
                parentId: this.parentId
            })
        }

        return null
    }

    /**
     * Unregister the app from the CSS map
     * @param args
     */
    destroy(...args) {
        Neo.currentWorker.removeAppFromThemeMap(this.name);
        super.destroy(...args)
    }
}

Neo.applyClassConfig(Application);

// convenience shortcut
Neo.app = config => Neo.create({
    module: Application,
    ...config
});

export default Application;
