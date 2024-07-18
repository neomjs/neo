/**
 * Wrapper class for vnode objects. See the tutorials for further infos.
 * @class Neo.vdom.VNode
 */
class VNode {
    /**
     * @param config
     */
    constructor(config) {
        /**
         * @member {Array} attributes=[]
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
         * Valid values are "root", "text" & "vnode"
         * @member {String} vtype='vnode'
         */

        Object.assign(this, {
            attributes: config.attributes || [],
            childNodes: config.childNodes || [],
            className : config.className  || [],
            id        : config.id         || Neo.getId('vnode'),
            innerHTML : config.innerHTML,
            nodeName  : config.nodeName,
            style     : config.style,
            vtype     : config.vtype      || 'vnode'
        });

        // We only apply the static attribute, in case the value is true
        if (config.static) {
            this.static = true
        }
    }
}

const ns = Neo.ns('Neo.vdom', true);
ns['VNode'] = VNode;

export default VNode;
