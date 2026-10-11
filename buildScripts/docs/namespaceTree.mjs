/**
 * @module buildScripts/docs/namespaceTree
 * @summary Reads and writes dotted namespace paths in a plain-object tree.
 *
 * **Both directions live here because the safety property is only true when both obey it.** Hardening
 * the writer alone left the defect fully reachable through the reader: `getNamespace` returned an
 * INHERITED value, the caller adopted it as `namespace`, and the generator then attached `classData`
 * to it. Measured on that intermediate state — for a class named `Neo.Foo.toString` whose parent node
 * already existed, `getNamespace` returned `Object.prototype.toString` itself, `classData` landed on
 * the global, and the docs leaf serialized as `undefined`. A get-before-set sequence is only as safe
 * as its weaker half.
 *
 * Extracted from `generateDocsJson.mjs` so the traversal can be covered directly: that module runs a
 * documentation build as a top-level side effect, so importing it to test these functions is not
 * available. Deliberately not folded into `docletPipeline/utils.mjs`, which is a 768-line
 * default-export aggregate.
 */

/**
 * Segments that must never be traversed or created. Writing through any of them mutates state shared
 * by every object in the process rather than the caller's tree.
 * @type {Set<String>}
 */
const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * @summary Sets `value` at a dotted path, creating intermediate nodes.
 *
 * **The existence check is `Object.hasOwn`, not truthiness, and that is the defect this function was
 * extracted to fix.** `if (!current[segment])` consults INHERITED properties, so a segment naming
 * anything on `Object.prototype` reads as already-present: the walker skips creating a node and
 * descends into the global instead. Measured on the previous implementation — `a.constructor.b`
 * created no own property and wrote to `Object.prototype.constructor.b`; `toString.x` mutated
 * `Object.prototype.toString`; `__proto__.polluted` reached every object in the process.
 *
 * Only `__proto__` needs an adversary. `constructor` and `toString` collide with nothing but an
 * unlucky class name, and the failure is silent — the value lands on a global and the tree quietly
 * lacks the node, so the first symptom is a missing docs entry pointing nowhere near here.
 *
 * A Neo namespace segment is never legitimately one of {@link FORBIDDEN_SEGMENTS}, so those throw
 * rather than being skipped or sanitised: an impossible input is an authoring error worth surfacing
 * at build time, and a silently-correct tree is the outcome this function exists to prevent.
 *
 * @param {Object} tree Root object to write into.
 * @param {String|String[]} names Dotted path, or its already-split segments.
 * @param {*} value Value to set at the leaf.
 * @returns {void}
 * @throws {Error} When any segment is `__proto__`, `constructor`, or `prototype`.
 */
export function setNamespace(tree, names, value) {
    // Coerce BEFORE the guard, and traverse with the coerced values. A property write stringifies its
    // key while `Set.has` compares raw values, so an unnormalized check and the write it protects can
    // disagree about which key is being used — measured: a segment object whose `toString` returned
    // `'__proto__'` passed the denylist, then replaced the tree's prototype on assignment. The tree
    // then serialized as `{}` while property reads returned the injected value.
    const segments = (Array.isArray(names) ? names : String(names).split('.')).map(String);

    let current = tree;

    for (const segment of segments) {
        if (FORBIDDEN_SEGMENTS.has(segment)) {
            throw new Error(
                `setNamespace: refusing to traverse '${segment}' in namespace '${segments.join('.')}' — ` +
                'writing through it would mutate shared prototype state rather than the docs tree.'
            );
        }
    }

    for (let i = 0; i < segments.length - 1; i++) {
        const segment = segments[i];

        // hasOwn, not truthiness: an inherited property must not read as an existing node.
        if (!Object.hasOwn(current, segment)) {
            current[segment] = {}
        }

        current = current[segment]
    }

    current[segments[segments.length - 1]] = value
}

/**
 * @summary Resolves a dotted path, returning `null` when any segment is not an OWN property.
 *
 * The read half of the same contract, and it carries the same defect history: `if (!current[name])`
 * consulted inherited properties, so a legal-but-inherited leaf name resolved to the global rather
 * than to a docs node. The caller's `getNamespace(...) || {}` idiom then adopted that global as the
 * namespace object and attached class data to it.
 *
 * `Object.hasOwn` is sufficient here and no denylist is needed: `__proto__`, `constructor` and
 * `prototype` are never own properties of a freshly-built node, so they resolve to `null` naturally.
 * A miss returning `null` — rather than throwing as the writer does — preserves the existing read
 * contract that callers rely on, and a read that resolves nothing cannot mutate anything.
 *
 * @param {Object} tree Root object to read from.
 * @param {String|String[]} names Dotted path, or its already-split segments.
 * @returns {*|null} The value at the path, or `null` if any segment is absent as an own property.
 */
export function getNamespace(tree, names) {
    const segments = (Array.isArray(names) ? names : String(names).split('.')).map(String);

    let current = tree;

    for (const segment of segments) {
        if (current === null || typeof current !== 'object' || !Object.hasOwn(current, segment)) {
            return null
        }

        current = current[segment]
    }

    return current
}

export default setNamespace;
