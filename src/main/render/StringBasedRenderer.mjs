const StringBasedRenderer = {
    /**
     * @param {String} html representing a single element
     * @returns {DocumentFragment}
     */
    htmlStringToElement(html) {
        const template = document.createElement('template');
        template.innerHTML = html;
        return template.content
    },

    /**
     * Handles string-based insertion of a new node into the DOM.
     * This method is called by `insertNode()` when `NeoConfig.useDomApiRenderer` is false.
     *
     * @param {Object}      data
     * @param {Boolean}     data.hasLeadingTextChildren Flag to honor leading comments.
     * @param {Number}      data.index                  The index at which to insert the new node.
     * @param {String}      data.outerHTML              The HTML string of the node to insert.
     * @param {HTMLElement} data.parentNode             The parent DOM node to insert into.
     * @private
     */
    insertNodeAsString({hasLeadingTextChildren, index, outerHTML, parentNode}) {
        let me = this;

        // If comments detected, parse HTML string to a node and use insertBefore/appendChild on childNodes.
        if (hasLeadingTextChildren) {
            let node = me.htmlStringToElement(outerHTML);

            if (index < parentNode.childNodes.length) {
                parentNode.insertBefore(node, parentNode.childNodes[index])
            } else {
                parentNode.appendChild(node)
            }
        }
        // If no comments detected, use insertAdjacentHTML for element nodes.
        else {
            let countChildren = parentNode.children.length; // Use `children` for `insertAdjacentHTML` context

            if (index > 0 && index >= countChildren) {
                parentNode.insertAdjacentHTML('beforeend', outerHTML);
                return
            }
            if (countChildren > 0 && countChildren > index) {
                parentNode.children[index].insertAdjacentHTML('beforebegin', outerHTML)
            } else if (countChildren > 0) {
                parentNode.children[countChildren - 1].insertAdjacentHTML('afterend', outerHTML)
            } else {
                parentNode.insertAdjacentHTML('beforeend', outerHTML)
            }
        }
    }
};

const ns = Neo.ns('Neo.main.render', true);
ns.StringBasedRenderer = StringBasedRenderer;

export default StringBasedRenderer;
