---
id: 6785
title: Vnode Tree to DOM Element Mapping
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-06-13T01:53:29Z'
updatedAt: '2025-06-16T15:59:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6785'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues:
  - 6795
  - 6797
  - 6798
  - 6799
  - 6800
  - 6802
  - 6803
  - 6804
  - 6805
  - 6806
  - 6807
  - 6808
  - 6809
  - 6810
  - 6812
  - 6813
  - 6814
  - 6815
  - 6817
  - 6818
subIssuesCompleted: 20
subIssuesTotal: 20
closedAt: '2025-06-16T15:59:18Z'
---
# Vnode Tree to DOM Element Mapping

**Reported by:** @tobiu on 2025-06-13

---

**Sub-Issues:** #6795, #6797, #6798, #6799, #6800, #6802, #6803, #6804, #6805, #6806, #6807, #6808, #6809, #6810, #6812, #6813, #6814, #6815, #6817, #6818
**Progress:** 20/20 completed (100%)

---

I have been reasoning with Gemini about this topic.

To get you up to speed:
* Historically, it has been faster for the initial rendering to apply big HTML string, since it gets processed via native code
* Example: `parentNode.insertAdjacentHTML('beforeend', delta.outerHTML)`
* We need to pass the vnode tree (required for future updates) and the string based version, which does lead to a messaging overhead inside the x-worker communication.
* Strings are also vulnerable for XSS (potential security issue).
* We need to re-evaluate if strings are still faster (my last benchmarks were 6 years ago)
* We need a new `Neo.config` to optionally switch to a version completely without strings
* Depending on the value of the new config, main and `vdom.Helper` should dynamically import the related logic (reducing overhead).
* `vdom.Vnode` needs a new `textContent` attribute

Here is a draft version for the new main thread part from Gemini:

```javascript
// File: src/main/VdomRenderer.mjs (or integrated into DomTools)

// No 'import Neo from '../Neo.mjs';' here, as per your instruction.
// Assuming Neo, Neo.vdom.Helper.voidAttributes, and the DOM helper methods
// (getElement, getElementOrBody) are available through the framework's internal mechanisms.

class VdomRenderer {
    static config = {
        className: 'Neo.main.VdomRenderer'
    }

    /**
     * Recursively creates a real DOM element (or DocumentFragment) from a VNode tree.
     * This method is intended for initial renders or for inserting large, new VNode subtrees
     * directly into the DOM without string serialization/parsing.
     * @param {Object} vnode The VNode object to convert to a real DOM element.
     * @param {HTMLElement|DocumentFragment} [parentNode] The parent DOM node to append the created element to.
     * If not provided, a DocumentFragment is used as a temporary root.
     * @returns {HTMLElement|Text|Comment|DocumentFragment} The created DOM node or DocumentFragment.
     */
    createDomTree(vnode, parentNode) {
        let domNode;

        // 1. Handle VNode types (nodeName, vtype: 'text', vtype: 'comment')
        if (vnode.nodeName) { // It's an HTML/SVG element node (based on nodeName)
            if (vnode.ns) { // For SVG, ensure correct namespace
                domNode = document.createElementNS(vnode.ns, vnode.nodeName);
            } else {
                domNode = document.createElement(vnode.nodeName);
            }

            // 2. Apply Attributes
            // Assuming vnode.attributes is an object {key: value} for direct DOM creation
            if (vnode.attributes) {
                Object.entries(vnode.attributes).forEach(([key, value]) => {
                    if (Neo.vdom.Helper.voidAttributes.has(key)) {
                        domNode[key] = (value === 'true' || value === true);
                    } else if (key === 'value') {
                        domNode.value = value;
                    } else if (key === 'id') {
                        domNode[Neo.config.useDomIds ? 'id' : 'data-neo-id'] = value;
                    } else if (value !== null && value !== undefined) {
                        domNode.setAttribute(key, value);
                    }
                });
            }

            // 3. Apply Classes
            if (vnode.className && vnode.className.length > 0) {
                domNode.className = vnode.className.join(' ');
            }

            // 4. Apply Styles
            if (vnode.style && Neo.isObject(vnode.style)) {
                Object.entries(vnode.style).forEach(([key, value]) => {
                    if (Neo.isString(value) && value.includes('!important')) {
                        const valClean = value.replace('!important', '').trim();
                        domNode.style.setProperty(Neo.decamel(key), valClean, 'important');
                    } else {
                        domNode.style.setProperty(Neo.decamel(key), value);
                    }
                });
            }

            // 5. Handle text content (now using vnode.textContent)
            // This applies to elements that contain only plain text (e.g., <span>Hello</span>)
            // If the VNode has childNodes, this block is skipped, and content is handled recursively.
            if (vnode.textContent !== undefined && (!vnode.childNodes || vnode.childNodes.length === 0)) {
                domNode.textContent = vnode.textContent;
            }

        } else if (vnode.vtype === 'text') {
            // Text nodes now use vnode.textContent for their content
            domNode = document.createTextNode(vnode.textContent || '');
            if (vnode.id) { // Wrap in comment if it has an ID, for consistency with delta updates
                const commentStart = document.createComment(` ${vnode.id} `);
                const commentEnd = document.createComment(' /neo-vtext ');
                const fragment = document.createDocumentFragment();
                fragment.appendChild(commentStart);
                fragment.appendChild(domNode);
                fragment.appendChild(commentEnd);
                domNode = fragment; // The fragment containing comment + text node becomes the "node" to append
            }
        } else if (vnode.vtype === 'comment') {
             // Assuming comment content would also be on vnode.textContent for consistency
             domNode = document.createComment(vnode.textContent || '');
        } else {
            Neo.logError('Unhandled VNode type or missing nodeName:', vnode);
            return null;
        }

        // 6. Recursively process children (using vnode.childNodes)
        if (vnode.childNodes && vnode.childNodes.length > 0) {
            vnode.childNodes.forEach(childVnode => {
                this.createDomTree(childVnode, domNode); // Recurse
            });
        }

        // 7. Append to parent or return as fragment
        if (parentNode) {
            parentNode.appendChild(domNode);
            return domNode;
        } else {
            // If no parentNode was provided for the initial call,
            // return a DocumentFragment containing the top-level element.
            const fragment = document.createDocumentFragment();
            if (domNode) { // Ensure domNode was actually created
                fragment.appendChild(domNode);
            }
            return fragment;
        }
    }

    /**
     * Public method to initiate the creation and append a full Vnode tree to a target DOM element.
     * @param {Object} vnode The root VNode object.
     * @param {String} targetId The ID of the real DOM element to append the tree to.
     */
    renderVnodeTree(vnode, targetId) {
        const targetElement = this.getElementOrBody(targetId);
        if (targetElement) {
            // Clear existing content to ensure a fresh render
            targetElement.innerHTML = '';
            const fragment = this.createDomTree(vnode);
            if (fragment) {
                targetElement.appendChild(fragment);
            }
            // Post-render hooks like attaching events would go here
        } else {
            Neo.logError('VdomRenderer: Target element not found for ID:', targetId);
        }
    }

    // Placeholder for DOM element retrieval methods (would be mixed in or defined elsewhere)
    getElement(id) { /* ... */ }
    getElementOrBody(id) { /* ... */ }
}
```

## Comments

### @tobiu - 2025-06-13 02:01

Tobi:
minor detail:
`if (Neo.vdom.Helper.voidAttributes.has(key)) {`

=> we can not access vdom.Helper from within the main thread. so we need to duplicate the Set, or put it into a separate file, which different threads can import.

Gemini:
You are absolutely correct! That's a critical detail related to Neo.mjs's multi-threaded architecture. My apologies for overlooking that in the draft.

Neo.vdom.Helper resides in the worker thread, meaning its properties, including voidAttributes, cannot be directly accessed from the main thread where VdomRenderer and createDomTree operate.

Duplicating the voidAttributes Set would work but is generally not ideal as it creates two sources of truth that could get out of sync.

The best solution is indeed to create a separate, shared file for such constants that are needed by logic running in different threads.

Proposed Solution: Shared Constants Module
Create a new file:
src/shared/VdomConstants.mjs (or a similar path like src/core/VdomConstants.mjs)

Content of src/shared/VdomConstants.mjs:

```javascript
/**
 * @module Neo.shared.VdomConstants
 * Shared constants related to VDOM processing, accessible by both main and worker threads.
 */
const VdomConstants = {
    /**
     * A Set of HTML attribute names that are "void" attributes (e.g., checked, selected, disabled).
     * These are boolean attributes where their mere presence implies true, and absence implies false.
     * @member {Set<String>} voidAttributes
     */
    voidAttributes: new Set([
        'allowfullscreen', 'allowpaymentrequest', 'async', 'autofocus', 'autoplay', 'checked', 'controls',
        'default', 'defer', 'disabled', 'formnovalidate', 'hidden', 'ismap', 'loop', 'multiple', 'muted',
        'novalidate', 'open', 'playsinline', 'readonly', 'required', 'reversed', 'selected', 'truespeed' // Assuming 'truespeed' is custom/specific
    ])
    // Add any other shared VDOM constants here
};

export default VdomConstants;
```

Update src/main/VdomRenderer.mjs (Main Thread):

```javascript
// File: src/main/VdomRenderer.mjs

// IMPORTANT: No 'import Neo from '../Neo.mjs';' here, as per your instruction.
// Assuming Neo global object is injected by the framework.
// Import the shared constants:
import VdomConstants from '../shared/VdomConstants.mjs'; // Adjust path as needed

class VdomRenderer {
    static config = {
        className: 'Neo.main.VdomRenderer'
    }

    createDomTree(vnode, parentNode) {
        let domNode;

        if (vnode.nodeName) {
            // ... (previous code for element creation) ...

            // 2. Apply Attributes
            if (vnode.attributes) {
                Object.entries(vnode.attributes).forEach(([key, value]) => {
                    // Use the imported voidAttributes Set
                    if (VdomConstants.voidAttributes.has(key)) { // <--- MODIFIED LINE
                        domNode[key] = (value === 'true' || value === true);
                    } else if (key === 'value') {
                        domNode.value = value;
                    } else if (key === 'id') {
                        domNode[Neo.config.useDomIds ? 'id' : 'data-neo-id'] = value;
                    } else if (value !== null && value !== undefined) {
                        domNode.setAttribute(key, value);
                    }
                });
            }
            // ... (rest of the createDomTree method) ...
        }
        // ... (rest of the createDomTree and VdomRenderer class) ...
    }
}
// export default Neo.setupClass(VdomRenderer);
```

Update src/vdom/Helper.mjs (Worker Thread):
This file would also need to import VdomConstants and update its internal reference to voidAttributes to use the shared constant.

This approach ensures consistency and avoids the pitfalls of code duplication across different thread contexts.

### @tobiu - 2025-06-16 15:59

done.

