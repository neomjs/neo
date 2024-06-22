import Controller from '../../../src/controller/Component.mjs';

/**
 * @class Neo.examples.component.helix.ViewportController
 * @extends Neo.controller.Component
 */
class ViewportController extends Controller {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.helix.ViewportController'
         * @protected
         */
        className: 'Neo.examples.component.helix.ViewportController',
        /**
         * @member {Neo.component.Helix|null} helix_=null
         * @protected
         */
        helix_: null
    }

    /**
     * Triggered when accessing the helix config
     * @param {Neo.component.Helix|null} value
     * @protected
     */
    beforeGetHelix(value) {
        if (!value) {
            this._helix = value = this.getReference('helix')
        }

        return value
    }

    /**
     * {Object} data
     */
    onFlipItemsButtonClick(data) {
        this.helix.flipped = !this.helix.flipped
    }

    /**
     * {Object} data
     */
    onFollowSelectionButtonClick(data) {
        const button = data.component;

        if (button.iconCls === 'fa fa-square') {
            this.helix.followSelection = true;
            button.iconCls = 'fa fa-check-square'
        } else {
            this.helix.followSelection = false;
            button.iconCls = 'fa fa-square'
        }
    }

    /**
     * @param {Object} data
     */
    onLogDeltasCheckboxChange(data) {
        Neo.Main.setNeoConfig({
            key     : 'logDeltaUpdates',
            value   : data.value,
            windowId: data.component.windowId
        })
    }

    /**
     * @param {Object} data
     */
    onRangefieldChange(data) {
        const name = data.component.name;

        if (['deltaY', 'maxOpacity', 'minOpacity'].includes(name)) {
            data.value /= 100
        }

        this.helix[name] = data.value
    }

    /**
     * @param {String} id
     */
    onRangefieldMounted(id) {
        const field = Neo.getComponent(id);

        this.helix.on(field.eventName, function(value) {
            value = Math.min(Math.max(value, field.minValue), field.maxValue);
            field.value = value
        })
    }
}

Neo.setupClass(ViewportController);

export default ViewportController;
