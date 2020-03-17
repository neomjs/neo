import {default as ComponentController} from '../../../src/controller/Component.mjs';

/**
 * @class Covid.view.GalleryContainerController
 * @extends Neo.controller.Component
 */
class GalleryContainerController extends ComponentController {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.GalleryContainerController'
         * @private
         */
        className: 'Covid.view.GalleryContainerController',
        /**
         * @member {Neo.component.Gallery|null} gallery_=null
         * @private
         */
        gallery_: null
    }}

    /**
     * Triggered when accessing the gallery config
     * @param {Neo.component.Gallery|null} value
     * @private
     */
    beforeGetGallery(value) {
        if (!value) {
            this._gallery = value = this.getReference('gallery');
        }

        return value;
    }

    /**
     * {Object} data
     */
    onCollapseButtonClick(data) {
        const panel  = this.getReference('controls-panel'),
              expand = panel.width === 40;

        panel.width = expand ? 250 : 40;

        data.component.text = expand ? 'X' : '+';
    }

    /**
     *
     * @param {Object} data
     */
    onOrderButtonClick(data) {
        const gallery    = this.gallery,
              orderByRow = !gallery.orderByRow;

        data.component.text = orderByRow === true ? 'Order By Column' : 'Order by Row';

        gallery.orderByRow = orderByRow;
    }

    /**
     *
     * @param {Object} data
     */
    onRangefieldChange(data) {
        this.gallery[data.sender.name] = data.value;
    }

    /**
     *
     * @param {String} id
     */
    onRangefieldMounted(id) {
        const field = Neo.getComponent(id);

        this.gallery.on('change' + Neo.capitalize(field.name), function(value) {
            value = Math.min(Math.max(value, field.minValue), field.maxValue);
            field.value = value;
        });
    }

    /**
     *
     * @param {Object} data
     */
    onSortButtonClick(data) {
        this.gallery.store.sorters = [{
            property : data.component.field,
            direction: 'DESC'
        }];
    }
}

Neo.applyClassConfig(GalleryContainerController);

export {GalleryContainerController as default};