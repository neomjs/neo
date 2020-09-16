import App from '../../../src/worker/App.mjs';

/**
 * We need a custom entry point for builds outside the framework (e.g. a workspace created via npx neo-app)
 * @class Neo.AppWorker
 * @extends Neo.worker.App
 * @singleton
 */
class AppWorker extends App {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.AppWorker'
         * @protected
         */
        className: 'Neo.AppWorker',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }}
    /**
     *
     * @param {String} path
     * @returns {Promise}
     */
    importApp(path) {
        if (!Neo.config.isExperimental) {
            return import(
                /* webpackInclude: /\/app.mjs$/ */
                /* webpackExclude: /\/node_modules/ */
                /* webpackChunkName: "chunks/[request]" */
                /* webpackMode: "lazy" */
                `../../../../${path}`
            );
        } else {
            return import(
                /* webpackIgnore: true */
                `../../${path}`
            );
        }
    }
}

Neo.applyClassConfig(AppWorker);

let instance = Neo.create(AppWorker);

Neo.applyToGlobalNs(instance);

export default instance;