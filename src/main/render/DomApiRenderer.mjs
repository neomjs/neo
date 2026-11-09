import {voidAttributes} from '../../vdom/domConstants.mjs';

const
    HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml',
    /**
     * The elements that open a foreign namespace for their subtree, as the HTML parser switches on `<svg>` and
     * `<math>`. Every other element is created in the namespace it inherits.
     */
    namespaceRoots = new Map([
        ['math', 'http://www.w3.org/1998/Math/MathML'],
        ['svg',  'http://www.w3.org/2000/svg']
    ]);

const DomApiRenderer = {
    /**
     * @summary Recursively creates a DOM element (or DocumentFragment) from a VNode tree, each element in its namespace.
     * An element is created in the namespace it inherits from its parent unless it opens its own (`svg`, `math`), so an
     * SVG subtree becomes SVG elements and draws; the VNode carries no namespace, the tree position decides it.
     * This method handles two primary modes based on `isRoot`:
     * 1. If `isRoot` is true:
     *   a. Builds a detached DocumentFragment: if `parentNode` is null. Returns the fragment.
     *   b. Builds and inserts directly into a host DOM: if `parentNode` is provided. Inserts the fragment.
     * 2. If `isRoot` is false (default for recursive calls):
     *   Appends created DOM nodes directly to the provided `parentNode` (which is the DOM element of the direct parent VNode).
     *
     * In addition, this method handles post-processing for nodes that require a live DOM context (e.g., applying scroll state).
     * It collects these nodes in `postMountUpdates` during the recursive build phase and applies the updates immediately
     * after the root element is inserted into the document.
     *
     * @param {Object}      config
     * @param {Number}      [config.index]               The index within `parentNode` to insert the root fragment (used when `isRoot` is true).
     * @param {Boolean}     [config.isRoot=false]        If true, this is the root call for the VNode tree.
     * @param {String|null} [config.namespace=null]      The namespace inherited from the parent, `null` for HTML.
     *                                                   A root call passes {@link #getChildNamespace} of its insertion parent.
     * @param {Element}     [config.parentNode=null]     The parent DOM node to insert into. Its role changes based on `isRoot`.
     * @param {Object[]}    [config.postMountUpdates=[]] Array to store nodes that need post-mount updates (e.g. scroll state).
     * @param {Object}      config.vnode                 The VNode object to convert to a real DOM element.
     * @returns {DocumentFragment|Element|null}  The created DOM node, the root DocumentFragment, or null.
     * @private
     */
    createDomTree({index, isRoot=false, namespace=null, parentNode, postMountUpdates=[], vnode}) {
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
        // Handle Fragments
        else if (vnode.nodeName === 'fragment') {
            domNode = document.createDocumentFragment();
            domNode.append(document.createComment(` ${vnode.id}-start `))
        }
        // Handle regular elements
        else if (vnode.nodeName) {
            const elementNamespace = namespaceRoots.get(vnode.nodeName) || namespace;

            domNode = elementNamespace ?
                document.createElementNS(elementNamespace, vnode.nodeName) :
                document.createElement(vnode.nodeName);

            // Apply the top-level 'id' property first (guaranteed to exist)
            domNode[Neo.config.useDomIds ? 'id' : 'data-neo-id'] = vnode.id;

            // Apply Attributes
            for (const key in vnode.attributes) {
                const value = vnode.attributes[key];
                if (voidAttributes.has(key)) {
                    domNode.toggleAttribute(key, value === 'true' || value === true)
                } else if (key === 'value') {
                    domNode.value = value
                } else if (value !== null && value !== undefined) {
                    domNode.setAttribute(key, value)
                }
            }

            // Apply Classes
            if (vnode.className.length > 0) {
                domNode.classList.add(...vnode.className)
            }

            // Apply Styles
            if (Neo.isObject(vnode.style)) {
                for (const key in vnode.style) {
                    let value = vnode.style[key];
                    let important;

                    if (Neo.isString(value) && value.includes('!important')) {
                        value = value.replace('!important', '').trim();
                        domNode.style.setProperty(Neo.decamel(key), value, 'important');
                        important = 'important'
                    }

                    domNode.style.setProperty(Neo.decamel(key), value, important)
                }
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

        if (vnode.nodeName && (vnode.scrollTop || vnode.scrollLeft)) {
            postMountUpdates.push({node: domNode, vnode})
        }

        // Recursively process children. A fragment is transparent: its children inherit what it inherited.
        const childNamespace = vnode.nodeName === 'fragment' ? namespace : this.getChildNamespace(domNode);

        vnode.childNodes.forEach(childVnode => {
            this.createDomTree({namespace: childNamespace, parentNode: domNode, postMountUpdates, vnode: childVnode})
        })

        if (vnode.nodeName === 'fragment') {
            domNode.append(document.createComment(` ${vnode.id}-end `))
        }

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

                postMountUpdates.forEach(({node, vnode}) => {
                    if (vnode.scrollLeft) {node.scrollLeft = vnode.scrollLeft}
                    if (vnode.scrollTop)  {node.scrollTop  = vnode.scrollTop}
                });

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
    },

    /**
     * @summary Returns the namespace the children of a live DOM element are created in, `null` for HTML.
     * An SVG or MathML element passes its own namespace down. SVG's `foreignObject` holds HTML content, like every
     * HTML element. {@link Neo.main.DeltaUpdates} reads it off the insertion parent, so a subtree inserted into an
     * existing `<svg>` lands in the SVG namespace even when its own root is a `<g>` or a `<circle>`.
     * @param {Element|DocumentFragment|null} element
     * @returns {String|null}
     */
    getChildNamespace(element) {
        const namespace = element?.namespaceURI;

        return !namespace || namespace === HTML_NAMESPACE || element.localName === 'foreignObject' ? null : namespace
    }
};

const ns = Neo.ns('Neo.main.render', true);
ns.DomApiRenderer = DomApiRenderer;

export default DomApiRenderer;
