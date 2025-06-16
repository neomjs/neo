/**
 * Wrapper class for vnode objects.
 * For convenience, a VNode instance will always contain a childNodes array, which can be empty.
 * A VNode can optionally have `innerHTML` xor `textContent`
 * `textContent` is better from a XSS security perspective.
 * If by accident both are set, `innerHTML` will get the priority.
 *
 * @class Neo.vdom.VNode
 */
class VNode {
    /**
     * @param {Object} config
     */
    constructor(config) {
        /**
         * @member {Object} attributes={}
         */

        /**
         * @member {Array} childNodes=[]
         */

        /**
         * @member {Array} className=[]
         */

        /**
         * @member {String} id=Neo.getId('vnode')
         */

        /**
         * @member {String} innerHTML
         */

        /**
         * @member {String} nodeName
         */

        /**
         * true excludes the node from delta-updates
         * @member {Boolean} static
         */

        /**
         * @member {Object} style
         */

        /**
         * @member {String} textContent
         */

        /**
         * Valid values are "root", "text" & "vnode"
         * @member {String} vtype='vnode'
         */

        let me = this;

        Object.assign(me, {
            attributes: config.attributes || {},
            childNodes: config.childNodes || [],
            className : config.className  || [],
            id        : config.id         || Neo.getId('vnode'),
            nodeName  : config.nodeName,
            style     : config.style,
            vtype     : config.vtype      || 'vnode'
        });

        // We only apply innerHTML, in case it has content
        if (config.innerHTML) {
            me.innerHTML = config.innerHTML
        }

        // We only apply textContent, in case it has content
        else if (config.textContent) {
            me.textContent = config.textContent
        }

        // We only apply the static attribute, in case the value is true
        if (config.static) {
            me.static = true
        }
    }
}

const ns = Neo.ns('Neo.vdom', true);
ns.VNode = VNode;

export default VNode;
