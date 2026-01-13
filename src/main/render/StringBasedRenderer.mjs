const StringBasedRenderer = {
    /**
     * @param {Object}      data
     * @param {String}      data.outerHTML The HTML string of the node to create.
     * @returns {DocumentFragment}
     */
    createNode({outerHTML}) {
        const template = document.createElement('template');
        template.innerHTML = outerHTML;
        return template.content
    }
};

const ns = Neo.ns('Neo.main.render', true);
ns.StringBasedRenderer = StringBasedRenderer;

export default StringBasedRenderer;