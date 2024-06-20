import Component from '../Base.mjs';

/**
 * Convenience class to render a CesiumJS component
 * Requires adding the CesiumJS main thread addon
 * @class Neo.component.wrapper.CesiumJS
 * @extends Neo.component.Base
 */
class CesiumJS extends Component {
    static config = {
        /**
         * @member {String} className='Neo.component.wrapper.CesiumJS'
         * @protected
         */
        className: 'Neo.component.wrapper.CesiumJS',
        /**
         * @member {String} ntype='cesiumjs-component'
         * @protected
         */
        ntype: 'cesiumjs-component',
        /**
         * @member {Boolean} createOsmBuildings=true
         */
        createOsmBuildings: true,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {style: {position: 'relative', height: '100%', width: '100%'}, cn: [
            {style: {position: 'absolute', height: '100%', width: '100%'}, }
        ]}
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        let me = this,
            {appName, createOsmBuildings, id, windowId} = me;

        if (value === false && oldValue !== undefined) {
            Neo.main.addon.CesiumJS.destroy({appName, id, windowId})
        }

        super.afterSetMounted(value, oldValue);

        if (value) {
            let opts = {appName, createOsmBuildings, id, windowId};

            setTimeout(() => {
                Neo.main.addon.CesiumJS.create(opts).then(() => {
                    me.onComponentMounted()
                })
            }, 50)
        }
    }

    /**
     * @param {Object} data
     * @param {Number[]} data.destination
     * @param {Number} data.heading
     * @param {Number} data.pitch
     */
    flyTo(data) {
        Neo.main.addon.CesiumJS.flyTo({
            ...data,
            id: this.id
        })
    }

    /**
     *
     */
    getVdomRoot() {
        return this.vdom.cn[0]
    }

    /**
     *
     */
    getVnodeRoot() {
        return this.vnode.childNodes[0]
    }

    /**
     *
     */
    onComponentMounted() {
        console.log('onComponentMounted', this.id)
    }
}

Neo.setupClass(CesiumJS);

export default CesiumJS;
