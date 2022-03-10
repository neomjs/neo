import Component from '../../../src/component/Base.mjs';

/**
 * @class Neo.examples.preloadingAssets.view.ImageComponent
 * @extends Neo.component.Base
 */
class ImageComponent extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.examples.preloadingAssets.view.ImageComponent'
         * @protected
         */
        className: 'Neo.examples.preloadingAssets.view.ImageComponent',
        /**
         * @member {String} src_=null
         */
        src_: null,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {tag: 'img'}
    }}

    /**
     * Triggered after the src config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetHeight(value, oldValue) {
        this.changeVdomRootKey('src', value);
    }
}

Neo.applyClassConfig(ImageComponent);

export default ImageComponent;
