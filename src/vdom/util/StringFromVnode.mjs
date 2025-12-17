import NeoString                      from '../../util/String.mjs';
import {voidAttributes, voidElements} from '../domConstants.mjs';

/**
 * @summary Utility to convert VNode trees into HTML strings.
 *
 * This singleton provides the core logic for the string-based rendering path. It traverses
 * a VNode tree and generates the corresponding `outerHTML` string. This is used when the
 * `Neo.config.useDomApiRenderer` is set to false, or for server-side rendering (SSR) scenarios.
 *
 * In addition to string generation, it acts as a visitor to collect nodes that require
 * special handling after being mounted to the DOM (e.g., restoring scroll state), as these
 * properties cannot be set via HTML attributes.
 *
 * @class Neo.vdom.util.StringFromVnode
 * @singleton
 */
const StringFromVnode = {
    /**
     * @param {Object} vnode
     * @returns {String}
     * @protected
     */
    createCloseTag(vnode) {
        return voidElements.has(vnode.nodeName) ? '' : '</' + vnode.nodeName + '>'
    },

    /**
     * @param {Object} vnode
     * @returns {String}
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
     * Creates an HTML string from a VNode tree.
     * Skips nodes present in the optional movedNodes map.
     *
     * Uses a visitor pattern to collect `postMountUpdates`:
     * As it traverses the tree to build the string, it identifies nodes with properties
     * that cannot be represented in HTML (like `scrollTop` and `scrollLeft`).
     * These are pushed into the passed `postMountUpdates` array, allowing the main thread
     * renderer to apply them after the HTML has been inserted into the document.
     *
     * @param {Neo.vdom.VNode} vnode
     * @param {Map}            [movedNodes]
     * @param {Object[]}       [postMountUpdates=[]]
     * @returns {String}
     */
    create(vnode, movedNodes, postMountUpdates=[]) {
        let me = this,
            id = vnode?.id;

        // If a content node will get moved by a delta update OP, there is no need to regenerate it. Opt out.
        if (id && movedNodes?.get(id)) {
            return ''
        }

        switch (vnode.vtype) {
            case 'root':
                return me.create(vnode.childNodes[0], movedNodes, postMountUpdates)
            case 'text':
                // For text VNodes, `vnode.textContent` holds the HTML-escaped content.
                // Add the comment wrappers here for string output, aligning with main.mixin.DeltaUpdates.createDomTree().
                // `vnode.textContent || ''` ensures robustness in case vnode.textContent is not a string (e.g., a number or null).
                return `<!-- ${vnode.id} -->${vnode.textContent}<!-- /neo-vtext -->`
            case 'vnode':
                if (vnode.scrollTop || vnode.scrollLeft) {
                    let update = {id};

                    if (vnode.scrollLeft) {update.scrollLeft = vnode.scrollLeft}
                    if (vnode.scrollTop)  {update.scrollTop  = vnode.scrollTop}

                    postMountUpdates.push(update)
                }

                return me.createOpenTag(vnode) + me.createTagContent(vnode, movedNodes, postMountUpdates) + me.createCloseTag(vnode)
            default:
                return ''
        }
    },

    /**
     * Creates the inner HTML content for a VNode tag.
     * @param {Neo.vdom.VNode} vnode
     * @param {Map}            [movedNodes]
     * @param {Object[]}       [postMountUpdates]
     * @returns {String}
     * @protected
     */
    createTagContent(vnode, movedNodes, postMountUpdates) {
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
            string += this.create(childNode, movedNodes, postMountUpdates)
        }

        return string
    }
};

const ns = Neo.ns('Neo.vdom.util', true);
ns.StringFromVnode = StringFromVnode;

export default StringFromVnode;
