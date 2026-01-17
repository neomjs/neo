import Component from '../../../src/controller/Component.mjs';

/**
 * @class Portal.view.HeaderToolbarController
 * @extends Neo.controller.Component
 */
class HeaderToolbarController extends Component {
    static config = {
        /**
         * @member {String} className='Portal.view.HeaderToolbarController'
         * @protected
         */
        className: 'Portal.view.HeaderToolbarController'
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

export default Neo.setupClass(HeaderToolbarController);
