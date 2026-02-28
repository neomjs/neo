import Controller from '../../controller/Component.mjs';

/**
 * @class Neo.app.header.ToolbarController
 * @extends Neo.controller.Component
 */
class ToolbarController extends Controller {
    static config = {
        /**
         * @member {String} className='Neo.app.header.ToolbarController'
         * @protected
         */
        className: 'Neo.app.header.ToolbarController'
    }

    /**
     * @param {Object} data
     */
    onButtonClick(data) {
        this.getReference('header-canvas')?.onClick(data)
    }

    /**
     * @param {Object} data
     */
    onButtonMouseEnter(data) {
        let headerCanvas = this.getReference('header-canvas');

        if (headerCanvas) {
            headerCanvas.hoverId = data.path[0].id
        }
    }

    /**
     * @param {Object} data
     */
    onButtonMouseLeave(data) {
        let headerCanvas = this.getReference('header-canvas');

        if (headerCanvas) {
            headerCanvas.hoverId = null
        }
    }

    /**
     * @param {Object} data
     */
    onMouseLeave(data) {
        this.getReference('header-canvas')?.onMouseLeave(data)
    }

    /**
     * @param {Object} data
     */
    onMouseMove(data) {
        this.getReference('header-canvas')?.onMouseMove(data)
    }
}

export default Neo.setupClass(ToolbarController);
