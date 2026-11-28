import '../../../src/component/Toast.mjs';
import ComponentController from '../../../src/controller/Component.mjs';

/**
 * @summary Switches the mounted specimen's theme and opens a native toast in the same theme scope.
 * @class Neo.examples.theme.specimen.ViewportController
 * @extends Neo.controller.Component
 */
class ViewportController extends ComponentController {
    static config = {
        /**
         * @member {String} className='Neo.examples.theme.specimen.ViewportController'
         * @protected
         */
        className: 'Neo.examples.theme.specimen.ViewportController'
    }

    /**
     * @summary Switches the live view so the Grid edits and picker selection survive the comparison.
     * @param {String} theme The selected registered theme class.
     */
    selectTheme(theme) {
        this.component.theme = theme;
        this.getReference('themes').items.forEach(button => {
            button.pressed = button.modelData.theme === theme
        })
    }

    /**
     * @summary Places the floating toast in the specimen's current theme.
     */
    showToast() {
        const {appName, windowId} = this.component;

        Neo.toast({appName, windowId, theme: this.component.getTheme(), msg: 'Specimen notification', closable: true})
    }
}

export default Neo.setupClass(ViewportController);
