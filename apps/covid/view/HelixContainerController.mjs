import {default as ComponentController} from '../../../src/controller/Component.mjs';

/**
 * @class Covid.view.HelixContainerController
 * @extends Neo.controller.Component
 */
class HelixContainerController extends ComponentController {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.HelixContainerController'
         * @private
         */
        className: 'Covid.view.HelixContainerController',
        /**
         * @member {Neo.component.Helix|null} helix_=null
         * @private
         */
        helix_: null
    }}

    /**
     * Triggered when accessing the helix config
     * @param {Neo.component.Helix|null} value
     * @private
     */
    beforeGetHelix(value) {
        if (!value) {
            this._helix = value = this.getReference('helix');
        }

        return value;
    }

    /**
     *
     * @param {Object} data
     */
    onRangefieldChange(data) {
        const name = data.sender.name;

        if (['deltaY', 'maxOpacity', 'minOpacity'].includes(name)) {
            data.value /= 100;
        }

        this.helix[name] = data.value;
    }

    /**
     *
     * @param {String} id
     */
    onRangefieldMounted(id) {
        const field = Neo.getComponent(id);

        this.helix.on(field.eventName, function(value) {
            value = Math.min(Math.max(value, field.minValue), field.maxValue);
            field.value = value;
        });
    }

    /**
     *
     * @param {Object} data
     */
    onSortButtonClick(data) {
        this.helix.store.sorters = [{
            property : data.component.field,
            direction: 'DESC'
        }];
    }
}

Neo.applyClassConfig(HelixContainerController);

export {HelixContainerController as default};