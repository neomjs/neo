import Base from './Base.mjs';

/**
 * Converts string-based HTML representations to their matching VDOM equivalents.
 * @class Neo.main.addon.HtmlStringToVdom
 * @extends Neo.main.addon.Base
 */
class HtmlStringToVdom extends Base {
    /**
     * Valid values DOMParser mimeType
     * @member {String[]} mimeTypes=['application/xhtml+xml','application/xml','image/svg+xml','text/html','text/xml']
     * @protected
     * @static
     */
    static mimeTypes = ['application/xhtml+xml', 'application/xml', 'image/svg+xml', 'text/html', 'text/xml']

    static config = {
        /**
         * @member {String} className='Neo.main.addon.HtmlStringToVdom'
         * @protected
         */
        className: 'Neo.main.addon.HtmlStringToVdom',
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         * @reactive
         */
        remote: {
            app: [
                'createVdom'
            ]
        }
    }

    /**
     * Storing an instance for re-use
     * @member {DOMParser} domParser=new DOMParser()
     * @protected
     */
    domParser = new DOMParser()

    /**
     * You can either pass an object containing value (string) and optionally type (the DOMParser mimeType),
     * or you can pass an array of objects.
     * @param {Object|Object[]}  opts
     * @param {String}          [opts.type=text/html]
     * @param {String}           opts.value
     * @returns {Object|Object[]} The vdom object or array of vdom objects
     */
    createVdom(opts) {
        let arrayParam = true;

        if (!Array.isArray(opts)) {
            arrayParam = false;
            opts       = [opts]
        }

        const
            me          = this,
            {mimeTypes} = HtmlStringToVdom,
            returnValue = [];

        for (const {type='text/html', value} of opts) {
            if (!mimeTypes.includes(type)) {
                throw new Error(`Invalid mimeType: ${type}. Supported values are: ${mimeTypes.join(', ')}`)
            }

            const tree = me.domParser.parseFromString(value, type);
        }

        return arrayParam ? returnValue : returnValue[0]
    }
}

export default Neo.setupClass(HtmlStringToVdom);
