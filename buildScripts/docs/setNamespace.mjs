/**
 * @module buildScripts/docs/setNamespace
 * @summary Writes a dotted namespace path into a plain-object tree.
 *
 * Extracted from `generateDocsJson.mjs` so the traversal can be covered directly: that module runs a
 * documentation build as a top-level side effect, so importing it to test one pure function is not
 * available. One function, one purpose — deliberately not folded into `docletPipeline/utils.mjs`,
 * which is a 768-line default-export aggregate.
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
    const segments = Array.isArray(names) ? names : names.split('.');

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

export default setNamespace;
