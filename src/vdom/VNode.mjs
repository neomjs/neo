import StringUtil from '../util/String.mjs';

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
         * Not set for vtype='text' nodes
         * @member {Object} attributes={}
         */

        /**
         * @member {Array} childNodes=[]
         */

        /**
         * Not set for vtype='text' nodes
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
         * Not set for vtype='text' nodes
         * @member {Object} style
         */

        /**
         * @member {String} textContent
         */

        /**
         * Valid values are "root", "text" & "vnode"
         * @member {String} vtype='vnode'
         */

        let me            = this,
            {textContent} = config,
            hasInnerHtml  = Object.hasOwn(config, 'innerHTML'),
            isVText       = config.vtype === 'text';

        Object.assign(me, {
            childNodes: config.childNodes || [],
            id        : config.id         || Neo.getId(isVText ? 'vtext' : 'vnode'),
            vtype     : config.vtype      || 'vnode'
        });

        if (isVText) {
            // XSS Security: a pure text node is not supposed to contain HTML
            me.textContent = StringUtil.escapeHtml(hasInnerHtml ? config.innerHTML : textContent)
        } else {
            Object.assign(me, {
                attributes: config.attributes || {},
                className : config.className  || [],
                nodeName  : config.nodeName   || 'div',
                style     : config.style
            });

            // Use vdom.html on your own risk, it is not fully XSS secure.
            if (hasInnerHtml) {
                me.innerHTML = config.innerHTML
            }

            // We only apply textContent, in case it has content
            else if (Object.hasOwn(config, 'textContent')) {
                me.textContent = Neo.config.useStringBasedMounting ? StringUtil.escapeHtml(textContent) : textContent
            }
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
