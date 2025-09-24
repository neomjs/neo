import Component from './Base.mjs';

/**
 * @summary A component to render an `<img>` tag with reactive `src` and `alt` attributes.
 *
 * This component provides a simple, object-oriented wrapper for the native `<img>` element,
 * allowing its `src` and `alt` text to be updated dynamically via the config system.
 *
 * This is a key component for data-binding scenarios, such as displaying an image from a store record
 * or implementing lazy-loading by updating the `src` config at runtime.
 *
 * @example
 * // Basic usage
 * Neo.create({
 *     module: Image,
 *     alt   : 'A beautiful landscape',
 *     src   : 'https://www.neomjs.com/resources/images/logo.png'
 * });
 *
 * @class Neo.component.Image
 * @extends Neo.component.Base
 */
class Image extends Component {
    static config = {
        /**
         * @member {String} className='Neo.component.Image'
         * @protected
         */
        className: 'Neo.component.Image',
        /**
         * @member {String} ntype='image'
         * @protected
         */
        ntype: 'image',
        /**
         * The alt attribute for the image.
         * @member {String|null} alt_=null
         * @reactive
         */
        alt_: null,
        /**
         * The src attribute for the image.
         * @member {String|null} src_=null
         * @reactive
         */
        src_: null,
        /**
         * The HTML tag for this component.
         * @member {String} tag='img'
         * @reactive
         */
        tag: 'img'
    }

    /**
     * Hook that fires after the `alt` config has been changed.
     * Updates the `alt` attribute in the component's VDOM.
     * @param {String|null} value The new value
     * @param {String|null} oldValue The old value
     * @protected
     */
    afterSetAlt(value, oldValue) {
        this.changeVdomRootKey('alt', value)
    }

    /**
     * Hook that fires after the `src` config has been changed.
     * Updates the `src` attribute in the component's VDOM.
     * @param {String|null} value The new value
     * @param {String|null} oldValue The old value
     * @protected
     */
    afterSetSrc(value, oldValue) {
        this.changeVdomRootKey('src', value)
    }
}

export default Neo.setupClass(Image);
