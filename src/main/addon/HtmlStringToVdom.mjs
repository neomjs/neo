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
     * @param {Array}           [opts.values] Dynamic values to replace placeholders
     * @returns {Object|Object[]} The vdom object or array of vdom objects
     */
    createVdom(opts) {
        let arrayParam = true;

        if (!Array.isArray(opts)) {
            arrayParam = false;
            opts       = [opts];
        }

        const
            me          = this,
            {mimeTypes} = HtmlStringToVdom,
            returnValue = [];

        for (const {type = 'text/html', value, values = []} of opts) {
            if (!mimeTypes.includes(type)) {
                throw new Error(`Invalid mimeType: ${type}. Supported values are: ${mimeTypes.join(', ')}`);
            }

            const doc = me.domParser.parseFromString(value, type);

            // If the parser returns an error document, handle it
            if (doc.querySelector('parsererror')) {
                console.error('Error parsing HTML string:', doc.querySelector('parsererror').textContent);
                returnValue.push({
                    tag : 'div',
                    html: 'Error parsing HTML'
                });
                continue;
            }

            let nodes = Array.from(doc.body.childNodes);

            // If there are no nodes in the body, check the head (e.g., for SVG)
            if (nodes.length === 0 && doc.head.childNodes.length > 0) {
                nodes = Array.from(doc.head.childNodes);
            }

            if (nodes.length === 1) {
                returnValue.push(me.domNodeToVdom(nodes[0], values));
            } else {
                const fragment = [];
                for (const node of nodes) {
                    // Ignore whitespace-only text nodes between elements
                    if (node.nodeType === 3 && node.textContent.trim() === '') {
                        continue;
                    }
                    fragment.push(me.domNodeToVdom(node, values));
                }
                returnValue.push(fragment);
            }
        }

        return arrayParam ? returnValue : returnValue[0];
    }

    /**
     * Recursively converts a DOM node to a VDOM object.
     * @param {Node} node The DOM node to convert.
     * @param {Array} values The array of dynamic values.
     * @returns {Object|String} The VDOM object or a string for text nodes.
     * @private
     */
    domNodeToVdom(node, values) {
        // Text Node
        if (node.nodeType === 3) { // TEXT_NODE
            const text = node.textContent.trim();
            const match = text.match(/^__DYNAMIC_VALUE_(\d+)__$/);

            // If the text node is exclusively a placeholder, return the raw value
            if (match) {
                return values[parseInt(match[1], 10)];
            }

            // For regular text nodes (which might still contain placeholders for string values)
            return node.textContent.replace(/__DYNAMIC_VALUE_(\d+)__/g, (m, index) => {
                return values[parseInt(index, 10)];
            });
        }

        // Element Node
        if (node.nodeType === 1) { // ELEMENT_NODE
            const vdom = {
                tag: node.tagName.toLowerCase()
            };

            // Attributes
            if (node.hasAttributes()) {
                for (const attr of node.attributes) {
                    let attrName = attr.name;
                    let attrValue = attr.value;

                    // Replace placeholders in attribute values
                    attrValue = attrValue.replace(/__DYNAMIC_VALUE_(\d+)__/g, (match, index) => {
                        return values[parseInt(index, 10)];
                    });

                    if (attrName === 'class') {
                        attrName = 'cls';
                    } else if (attrName === 'style') {
                        vdom.style = this.parseStyle(attrValue);
                        continue;
                    }
                    vdom[attrName] = attrValue;
                }
            }

            // Children
            if (node.hasChildNodes()) {
                vdom.cn = [];
                for (const child of node.childNodes) {
                    // Ignore whitespace-only text nodes that are not placeholders
                    if (child.nodeType === 3 && child.textContent.trim() === '') {
                        continue;
                    }
                    const childVdom = this.domNodeToVdom(child, values);
                    vdom.cn.push(childVdom);
                }
            }

            return vdom;
        }

        return null; // Should not happen for valid HTML
    }

    /**
     * Parses a style attribute string into an object.
     * @param {String} styleString The style string (e.g., "color: red; font-size: 16px").
     * @returns {Object} The style object.
     * @private
     */
    parseStyle(styleString) {
        const style = {};
        styleString.split(';').forEach(declaration => {
            if (declaration.trim() !== '') {
                const [property, value] = declaration.split(':');
                style[property.trim()] = value.trim();
            }
        });
        return style;
    }
}

export default Neo.setupClass(HtmlStringToVdom);
