import Base from '../../component/Base.mjs';

/**
 * @class Neo.component.wrapper.GoogleMaps
 * @extends Neo.component.Base
 */
class GoogleMaps extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.component.wrapper.GoogleMaps'
         * @protected
         */
        className: 'Neo.component.wrapper.GoogleMaps',
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {}
    }}

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        let me = this;

        if (value === false && oldValue !== undefined) {
            Neo.main.addon.GoogleMaps.destroy({
                appName: me.appName,
                id     : me.id
            });
        }

        super.afterSetMounted(value, oldValue);

        if (value) {
            let opts = {
                appName: me.appName,
                id     : me.id
            };

            setTimeout(() => {
                Neo.main.addon.GoogleMaps.create(opts).then(() => {
                    me.onComponentMounted();
                });
            }, 50);
        }
    }

    /**
     *
     */
    onComponentMounted() {
        console.log('onComponentMounted', this.id);
    }
}

Neo.applyClassConfig(GoogleMaps);

export default GoogleMaps;
