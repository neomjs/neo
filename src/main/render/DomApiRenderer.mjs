import {voidAttributes} from '../../vdom/domConstants.mjs';

const DomApiRenderer = {
    /**
     * Recursively creates a DOM element (or DocumentFragment) from a VNode tree.
     * This method handles two primary modes based on `isRoot`:
     * 1. If `isRoot` is true:
     *   a. Builds a detached DocumentFragment: if `parentNode` is null. Returns the fragment.
     *   b. Builds and inserts directly into a host DOM: if `parentNode` is provided. Inserts the fragment.
     * 2. If `isRoot` is false (default for recursive calls):
     *   Appends created DOM nodes directly to the provided `parentNode` (which is the DOM element of the direct parent VNode).
     *
     * @param {Object}      config
     * @param {Number}      [config.index]           The index within `parentNode` to insert the root fragment (used when `isRoot` is true).
     * @param {Boolean}     [config.isRoot=false]    If true, this is the root call for the VNode tree.
     * @param {HTMLElement} [config.parentNode=null] The parent DOM node to insert into. Its role changes based on `isRoot`.
     * @param {Object}      config.vnode             The VNode object to convert to a real DOM element.
     * @returns {DocumentFragment|HTMLElement|null}  The created DOM node, the root DocumentFragment, or null.
     * @private
     */
    createDomTree({index, isRoot=false, parentNode, vnode}) {
        let domNode;

        // No node or just a reference node, opt out
        if (!vnode || vnode.componentId) {
            return null
        }

        // Handle text nodes
        if (vnode.vtype === 'text') {
            domNode = document.createTextNode(vnode.textContent || '');

            // Wrap in comment for consistency with delta updates
            const
                commentStart = document.createComment(` ${vnode.id} `),
                commentEnd   = document.createComment(' /neo-vtext '),
                fragment     = document.createDocumentFragment();

            fragment.append(commentStart, domNode, commentEnd);
            domNode = fragment
        }
        // Handle regular elements
        else if (vnode.nodeName) {
            if (vnode.ns) { // For SVG, ensure correct namespace
                domNode = document.createElementNS(vnode.ns, vnode.nodeName)
            } else {
                domNode = document.createElement(vnode.nodeName)
            }

            // Apply the top-level 'id' property first (guaranteed to exist)
            domNode[Neo.config.useDomIds ? 'id' : 'data-neo-id'] = vnode.id;

            // Apply Attributes
            Object.entries(vnode.attributes).forEach(([key, value]) => {
                if (voidAttributes.has(key)) {
                    domNode[key] = (value === 'true' || value === true)
                } else if (key === 'value') {
                    domNode.value = value
                } else if (value !== null && value !== undefined) {
                    domNode.setAttribute(key, value)
                }
            });

            // Apply Classes
            if (vnode.className.length > 0) {
                domNode.classList.add(...vnode.className)
            }

            // Apply Styles
            if (Neo.isObject(vnode.style)) {
                Object.entries(vnode.style).forEach(([key, value]) => {
                    let important;

                    if (Neo.isString(value) && value.includes('!important')) {
                        value = value.replace('!important', '').trim();
                        domNode.style.setProperty(Neo.decamel(key), value, 'important');
                        important = 'important'
                    }

                    domNode.style.setProperty(Neo.decamel(key), value, important)
                })
            }

            // Handle innerHTML & textContent
            // This applies to elements that contain only plain text (e.g., <span>Hello</span>)
            // If the VNode has childNodes, this block is skipped, and content is handled recursively.
            if (vnode.childNodes.length < 1) {
                if (vnode.innerHTML) {
                    domNode.innerHTML = vnode.innerHTML
                } else if (vnode.textContent) {
                    domNode.textContent = vnode.textContent
                }
            }
        } else {
            console.error('Unhandled VNode type or missing nodeName:', vnode);
            return null
        }

        // Recursively process children
        vnode.childNodes.forEach(childVnode => {
            this.createDomTree({parentNode: domNode, vnode: childVnode})
        })

        // Final step: handle insertion based on `isRoot` and `parentNode`
        if (isRoot) {
            // This will be either HTMLElement or a DocumentFragment (for text vnodes)
            let nodeToInsert = domNode;

            if (nodeToInsert && parentNode && index !== -1) {
                // If a specific host and index are provided, perform the insertion directly
                if (index < parentNode.childNodes.length) {
                    parentNode.insertBefore(nodeToInsert, parentNode.childNodes[index])
                } else {
                    parentNode.appendChild(nodeToInsert)
                }

                // Return the actual root DOM node (or fragment for text) that was inserted
                return domNode
            } else {
                // If no specific host or index, return the detached nodeToInsert (HTMLElement or DocumentFragment)
                return nodeToInsert
            }
        } else {
            // For recursive calls (isRoot is false), append directly to the provided parentNode.
            if (parentNode) { // parentNode here is the intermediate DOM parent
                parentNode.append(domNode)
            }

            // Return the appended node (or null)
            return domNode
        }
    }
};

const ns = Neo.ns('Neo.main.render', true);
ns.DomApiRenderer = DomApiRenderer;

export default DomApiRenderer;
