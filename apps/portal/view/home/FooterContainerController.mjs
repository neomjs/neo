import Component from '../../../../src/controller/Component.mjs';

/**
 * @class Portal.view.home.FooterContainerController
 * @extends Neo.controller.Component
 */
class FooterContainerController extends Component {
    static config = {
        /**
         * @member {String} className='Portal.view.home.FooterContainerController'
         * @protected
         */
        className: 'Portal.view.home.FooterContainerController'
    }

    /**
     * @param {Object} data
     */
    onButtonMouseEnter(data) {
        let canvas = this.getReference('footer-canvas');
        if (canvas) {
            canvas.hoverId = data.path[0].id
        }
    }

    /**
     * @param {Object} data
     */
    onButtonMouseLeave(data) {
        let canvas = this.getReference('footer-canvas');
        if (canvas) {
            canvas.hoverId = null
        }
    }
}

export default Neo.setupClass(FooterContainerController);
