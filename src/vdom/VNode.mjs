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
         * @member {Number} scrollLeft
         */

        /**
         * @member {Number} scrollTop
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
            // A vtext node represents a pure text node. It should not be created from an innerHTML property.
            // For XSS Security, we escape the content when using the string-based renderer.
            me.textContent = Neo.config.useDomApiRenderer ? textContent : StringUtil.escapeHtml(textContent);
        } else {
            Object.assign(me, {
                attributes: config.attributes || {},
                className : normalizeClassName(config.className),
                nodeName  : config.nodeName   || 'div',
                scrollLeft: config.scrollLeft,
                scrollTop : config.scrollTop,
                style     : config.style      || {}
            });

            // Use vdom.html on your own risk, it is not fully XSS secure.
            if (hasInnerHtml) {
                me.innerHTML = config.innerHTML
            }

            // We only apply textContent, in case it has content
            else if (Object.hasOwn(config, 'textContent')) {
                me.textContent = Neo.config.useDomApiRenderer ? textContent : StringUtil.escapeHtml(textContent)
            }
        }

        // We only apply the static attribute, in case the value is true
        if (config.static) {
            me.static = true
        }
    }
}

/**
 * vdom cls definitions might contain spaces, especially when it comes to iconCls.
 * @example: myVdom = {cls: ['my-button', 'fa fa-user']}
 *
 * On DOM level, classList.add() will throw, in case it gets an input containing a space.
 *
 * This is a module-scoped utility function, not a method of the VNode class.
 * VNodes are transferred via structured cloning (e.g., in postMessage()), which strips methods.
 * Keeping this logic separate from the VNode class itself ensures conceptual purity and a cleaner data model,
 * as methods defined on the VNode instance would be lost during transfer anyway.
 *
 * @param {String|String[]} classNameInput
 * @returns {String[]}
 * @private
 */
function normalizeClassName(classNameInput) {
    let normalizedClasses = [];

    if (Neo.isString(classNameInput)) {
        normalizedClasses = classNameInput.split(' ').filter(Boolean)
    } else if (Array.isArray(classNameInput)) {
        classNameInput.forEach(cls => {
            if (Neo.isString(cls)) {
                if (cls.includes(' ')) {
                    normalizedClasses.push(...cls.split(' ').filter(Boolean))
                } else if (cls !== '') {
                    normalizedClasses.push(cls)
                }
            }
        })
    }

    // Remove duplicates if necessary
    return [...new Set(normalizedClasses)]
}

export default Neo.gatekeep(VNode, 'Neo.vdom.VNode');
