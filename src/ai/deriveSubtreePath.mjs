/**
 * @summary Derive the absolute root→node component-id path for a component, for topological-lock enforcement.
 *
 * `Neo.ai.LockRegistry.pathsOverlap` decides whether two locked subtrees overlap by prefix-containment, which
 * is sound *only* for **absolute** root→node paths — a relative path would let two unrelated subtrees that
 * happen to share a head id false-overlap (or nested ones false-disjoin). This is the function the in-heap
 * enforcement layer uses to turn a live component id into that absolute `subtreePath`.
 *
 * It is pure: the parent lookup is **injected** as `parentOf`, so the derivation is unit-testable against a
 * mock tree with no live-heap or Bridge dependency. The wiring supplies the live lookup
 * (`id => Neo.getComponent(id)?.parentId`, built on `Neo.component.Base#parentId` / `#up`).
 *
 * The walk climbs from `componentId` to the root, stopping at a falsy parent or Neo's top-level sentinel
 * `'document.body'` (the top-most component is the subtree root; the body element is not a component). It is
 * cycle-guarded and fails closed (`null`) on a malformed id or a cyclic chain rather than looping or
 * returning a partial path that could be mistaken for absolute.
 *
 * @param {String} componentId          The id of the target component (the subtree's node).
 * @param {Function} parentOf           `(id: String) => String|null|undefined` — the parent id of `id`, or a
 *                                      falsy value at the root.
 * @returns {String[]|null} The absolute path `[rootId, …, componentId]`, or `null` if the id is malformed or
 *                          the chain contains a cycle.
 */
export function deriveSubtreePath(componentId, parentOf) {
    if (typeof componentId !== 'string' || componentId === '' || componentId === 'document.body') {
        return null
    }

    const path = [],
          seen = new Set();

    let current = componentId;

    while (current && current !== 'document.body') {
        if (seen.has(current)) {
            return null // cyclic chain — fail closed rather than loop or return a corrupt path
        }

        seen.add(current);
        path.unshift(current);

        current = parentOf(current)
    }

    return path
}
