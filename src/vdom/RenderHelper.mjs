import BaseRenderHelper from './BaseRenderHelper.mjs';

/**
 * VDom Worker helper class to create vnodes => rendering component trees
 * @class Neo.vdom.RenderHelper
 * @extends Neo.core.Base
 * @singleton
 */
class RenderHelper extends BaseRenderHelper {
    static config = {
        /**
         * @member {String} className='Neo.vdom.RenderHelper'
         * @protected
         */
        className: 'Neo.vdom.RenderHelper',
        /**
         * Remote method access for other workers
         * @member {Object} remote={app:['create']}
         * @protected
         */
        remote: {
            app: [
                'create'
            ]
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }
}

export default Neo.setupClass(RenderHelper);
