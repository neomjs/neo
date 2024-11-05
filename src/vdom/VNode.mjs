/**
 * Wrapper class for vnode objects. See the tutorials for further infos.
 * @class Neo.vdom.VNode
 */
class VNode {
    /**
     * @param {Object} config
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
         * @member {String} [componentId]
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

        let me = this;

        Object.assign(me, {
            attributes: config.attributes || [],
            childNodes: config.childNodes || [],
            className : config.className  || [],
            id        : config.id         || Neo.getId('vnode'),
            innerHTML : config.innerHTML,
            nodeName  : config.nodeName,
            style     : config.style,
            vtype     : config.vtype      || 'vnode'
        });

        if (config.componentId) {
            me.componentId = config.componentId
        }

        // We only apply the static attribute, in case the value is true
        if (config.static) {
            me.static = true
        }
    }
}

const ns = Neo.ns('Neo.vdom', true);
ns['VNode'] = VNode;

export default VNode;
