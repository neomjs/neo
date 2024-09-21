import Button from '../../../../src/button/Base.mjs';

/**
 * @class Portal.view.learn.CubeLayoutButton
 * @extends Neo.button.Base
 */
class CubeLayoutButton extends Button {
    static config = {
        /**
         * @member {String} className='Portal.view.learn.CubeLayoutButton'
         * @protected
         */
        className: 'Portal.view.learn.CubeLayoutButton',
        /**
         * @member {String|null} activeLayout_=null
         */
        activeLayout_: null,
    }

    /**
     * @member {Object} activateText='Activate Cube-Layout'
     */
    activateText = 'Activate Cube-Layout'
    /**
     * @member {Object} deactivateText='Deactivate Cube-Layout'
     */
    deactivateText = 'Deactivate Cube-Layout'

    /**
     * @member {Portal.view.ViewportController} viewportController
     */
    get viewportController() {
        return this.getController('viewport-controller')
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.activeLayout = me.viewportController.mainContentLayout;
        me.handler      = me.changeLayout.bind(me)
    }

    /**
     * Triggered after the activeLayout config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetActiveLayout(value, oldValue) {
        let me = this;

        if (value) {
            me.viewportController.mainContentLayout = value;

            if (value === 'card') {
                me.text = me.activateText
            } else if (value === 'mixed') {
                me.text = me.deactivateText
            }
        }
    }

    /**
     * @param {Object} data
     */
    changeLayout(data) {
        let me = this;

        me.activeLayout = me.text === me.activateText ? 'mixed' : 'card'
    }
}

export default Neo.setupClass(CubeLayoutButton);
