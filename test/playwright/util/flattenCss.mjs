import postcss from 'postcss';

const CONDITIONAL = new Set(['container', 'layer', 'media', 'scope', 'supports', '-moz-document']);

/**
 * @summary Flattens native CSS nesting into flat rules, so a spec can read full selectors and their specificity.
 *
 * A nested selector resolves against its parent list by cross product: `&` stands for the parent, and a selector
 * without one is its descendant. A browser reads the parent list as one `:is()`, which takes the list's highest
 * specificity; the cross product keeps each entry's own. The two agree wherever a parent list is uniform in
 * specificity, which the theme sources guarantee (a rule nested under a mixed list is stored flattened). A rule's
 * declarations are emitted before its nested rules, which the sources also guarantee (no declaration follows a
 * nested rule). Conditional group rules (`@media`, `@supports`, `@container`) keep wrapping what they held.
 * @param {String} css
 * @returns {String} Flat CSS.
 */
export default function flattenCss(css) {
    const output = postcss.root();

    /**
     * @summary Appends a node inside clones of the wrapping at-rules, reusing the last open wrapper chain.
     * @param {Object[]} wrappers
     * @param {Object} node
     */
    function emit(wrappers, node) {
        let target = output;

        for (const wrapper of wrappers) {
            const last = target.last;

            target = last?.type === 'atrule' && last.name === wrapper.name && last.params === wrapper.params
                ? last
                : target.append(wrapper.clone({nodes: []})).last
        }

        target.append(node)
    }

    /**
     * @param {Object} container
     * @param {String[]|null} selectors The resolved selector list of the enclosing rule.
     * @param {Object[]} wrappers The enclosing conditional group rules.
     */
    function visit(container, selectors, wrappers) {
        container.each(node => {
            if (node.type === 'rule') {
                const own      = postcss.list.comma(node.selector),
                      resolved = selectors
                          ? selectors.flatMap(parent => own.map(part => part.includes('&') ? part.replaceAll('&', parent) : `${parent} ${part}`))
                          : own,
                      decls    = node.nodes.filter(child => child.type === 'decl');

                decls.length && emit(wrappers, postcss.rule({selector: resolved.join(', '), nodes: decls.map(decl => decl.clone())}));
                visit(node, resolved, wrappers)
            } else if (node.type === 'atrule' && node.nodes && CONDITIONAL.has(node.name)) {
                const decls = node.nodes.filter(child => child.type === 'decl'),
                      chain = [...wrappers, node];

                decls.length && selectors && emit(chain, postcss.rule({selector: selectors.join(', '), nodes: decls.map(decl => decl.clone())}));
                visit(node, selectors, chain)
            } else if (node.type !== 'decl' && node.type !== 'comment') {
                emit(wrappers, node.clone())
            }
        })
    }

    visit(postcss.parse(css), null, []);

    return output.toString()
}
