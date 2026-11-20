import Controller from '../../../src/controller/Component.mjs';

/**
 * @class Neo.examples.component.coronaGallery.ViewportController
 * @extends Neo.controller.Component
 */
class ViewportController extends Controller {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.coronaGallery.ViewportController'
         * @protected
         */
        className: 'Neo.examples.component.coronaGallery.ViewportController',
        /**
         * @member {Neo.component.Gallery|null} gallery_=null
         * @protected
         * @reactive
         */
        gallery_: null
    }

    /**
     * Triggered when accessing the gallery config
     * @param {Neo.component.Gallery|null} value
     * @protected
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
     * @param {Object} data
     */
    onOrderButtonClick(data) {
        const gallery    = this.gallery,
              orderByRow = !gallery.orderByRow;

        data.component.text = orderByRow === true ? 'Order By Column' : 'Order by Row';

        gallery.orderByRow = orderByRow;
    }

    /**
     * @param {Object} data
     */
    onRangefieldChange(data) {
        this.gallery[data.component.name] = data.value
    }

    /**
     * @param {String} id
     */
    onRangefieldMounted(id) {
        const field = Neo.getComponent(id);

        this.gallery.on('change' + Neo.capitalize(field.name), function(value) {
            value = Math.min(Math.max(value, field.minValue), field.maxValue);
            field.value = value
        })
    }

    /**
     * @param {Object} data
     */
    onSortButtonClick(data) {
        let {field} = data.component;

        // Countries read A to Z, every figure largest first
        this.gallery.store.sorters = [{
            property : field,
            direction: field === 'country' ? 'ASC' : 'DESC'
        }]
    }
}

export default Neo.setupClass(ViewportController);
