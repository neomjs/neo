import Base            from './Base.mjs';
import ClassSystemUtil from '../util/ClassSystem.mjs';

/**
 * @class Neo.controller.Application
 * @extends Neo.controller.Base
 */
class Application extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.controller.Application'
         * @protected
         */
        className: 'Neo.controller.Application',
        /**
         * @member {Neo.component.Base} mainView_=null
         */
        mainView_: null,
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
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        Neo.currentWorker.registerApp(config.name || Application.prototype.name);

        super(config);

        Neo.apps = Neo.apps || {};

        Neo.apps[this.name] = this;
    }

    /**
     * Triggered after the mainView config got changed
     * @param {Neo.component.Base} value
     * @param {Neo.component.Base|null} oldValue
     * @protected
     */
    afterSetMainView(value, oldValue) {
        // short delay to ensure changes from onHashChange() got applied
        setTimeout(() => {
            value.render(true);
        }, Neo.config.hash ? 200 : 10);
    }

    /**
     * Triggered before the mainView config gets changed.
     * @param {Object} value
     * @param {Object} oldValue
     * @returns {Neo.component.Base}
     * @protected
     */
    beforeSetMainView(value, oldValue) {
        if (value) {
            return ClassSystemUtil.beforeSetInstance(value, null, {
                appName : this.name,
                parentId: this.parentId
            });
        }

        return null;
    }
}

Neo.applyClassConfig(Application);

// shortcut
Neo.app = config => Neo.create({
    module: Application,
    ...config || {}
});

export {Application as default};