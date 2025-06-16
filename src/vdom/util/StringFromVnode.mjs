import NeoString                      from '../../util/String.mjs';
import {voidAttributes, voidElements} from '../domConstants.mjs';

const StringFromVnode = {
    /**
     * @param {Object} vnode
     * @protected
     */
    createCloseTag(vnode) {
        return voidElements.has(vnode.nodeName) ? '' : '</' + vnode.nodeName + '>'
    },

    /**
     * @param {Object} vnode
     * @protected
     */
    createOpenTag(vnode) {
        let string       = '<' + vnode.nodeName,
            {attributes} = vnode,
            cls          = vnode.className,
            style;

        if (vnode.style) {
            style = Neo.createStyles(vnode.style);

            if (style !== '') {
                string += ` style="${style}"`
            }
        }

        if (cls) {
            if (Array.isArray(cls)) {
                cls = cls.join(' ')
            }

            if (cls !== '') {
                string += ` class="${cls}"`
            }
        }

        if (vnode.id) {
            if (Neo.config.useDomIds) {
                string += ` id="${vnode.id}"`
            } else {
                string += ` data-neo-id="${vnode.id}"`
            }
        }

        Object.entries(attributes).forEach(([key, value]) => {
            if (voidAttributes.has(key)) {
                if (value === 'true') { // vnode attribute values get converted into strings
                    string += ` ${key}`
                }
            } else if (key !== 'removeDom') {
                if (key === 'value') {
                    value = NeoString.escapeHtml(value)
                }

                string += ` ${key}="${value?.replaceAll?.('"', '&quot;') ?? value}"`
            }
        });

        return string + '>'
    },

    /**
     * @param {Neo.vdom.VNode} vnode
     * @param {Map}            [movedNodes]
     */
    create(vnode, movedNodes) {
        let me = this,
            id = vnode?.id;

        // If a content node will get moved by a delta update OP, there is no need to regenerate it. Opt out.
        if (id && movedNodes?.get(id)) {
            return ''
        }

        switch (vnode.vtype) {
            case 'root':
                return me.create(vnode.childNodes[0], movedNodes)
            case 'text':
                // For text VNodes, `vnode.textContent` holds the HTML-escaped content.
                // Add the comment wrappers here for string output, aligning with main.mixin.DeltaUpdates.createDomTree().
                // `vnode.textContent || ''` ensures robustness in case vnode.textContent is not a string (e.g., a number or null).
                return `<!-- ${vnode.id} -->${vnode.textContent}<!-- /neo-vtext -->`
            case 'vnode':
                return me.createOpenTag(vnode) + me.createTagContent(vnode, movedNodes) + me.createCloseTag(vnode)
            default:
                return ''
        }
    },

    /**
     * @param {Neo.vdom.VNode} vnode
     * @param {Map}            [movedNodes]
     * @protected
     */
    createTagContent(vnode, movedNodes) {
        const hasContent = vnode.innerHTML || vnode.textContent;

        if (hasContent) {
            return hasContent
        }

        let string = '',
            len    = vnode.childNodes ? vnode.childNodes.length : 0,
            i      = 0,
            childNode;

        for (; i < len; i++) {
            childNode = vnode.childNodes[i];
            string += this.create(childNode, movedNodes)
        }

        return string
    }
};

const ns = Neo.ns('Neo.vdom.util', true);
ns.StringFromVnode = StringFromVnode;

export default StringFromVnode;
