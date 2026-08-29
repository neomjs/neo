import Base from './Base.mjs';

/**
 * @summary A data normalizer that turns path-addressed entries into flat `parentId` records.
 *
 * Plugin and module architectures address hierarchy by **path**, not by parent key. A contributor
 * declares where it belongs — `'Group'`, `'A/B/C'` — without knowing which siblings exist or which
 * of them already created the intermediate groups. Two properties make that awkward against a
 * `parentId` store, and this class owns both:
 *
 * 1. **Intermediate nodes have no declaring record.** `'A/B/C'` implies that `A` and `A/B` exist,
 *    but nobody declares them. They are synthesized here.
 * 2. **Materialization must be idempotent and order-independent.** Two contributors declaring
 *    `'Group/A'` and `'Group/B'`, in either order, must converge on **one** `Group` node.
 *
 * This is the sibling of {@link Neo.data.normalizer.Tree}: the same category of transform against a
 * different input encoding. `Tree` flattens nested `children` arrays; `Path` expands path strings.
 * Both emit the flat `parentId` shape a `Neo.data.TreeStore` consumes.
 *
 * ### Ancestor identity is the path prefix
 * The id of every node is its own raw path, so `'A/B/C'` yields the ids `'A'`, `'A/B'` and `'A/B/C'`.
 * Identity is therefore a deterministic function of the prefix: whoever materializes a prefix first,
 * every later contributor resolves to that same node. Ids derived from insertion counters would let
 * two contributors racing the same prefix produce two nodes, which is the defect this class removes.
 *
 * A caller-supplied key on the leaf payload does **not** override this — the path always wins, because
 * the store lookup that follows materialization addresses the leaf by its path.
 *
 * ### Emission order is load-bearing
 * Records are emitted strictly ancestors-first. `Neo.data.TreeStore#splice` resolves `depth` from the
 * parent record and re-parents a node whose parent it cannot find to `'root'`, so a child arriving
 * before its parent — even inside the same batch — is silently detached. Preserve this ordering when
 * post-processing the output.
 *
 * ### Escaping
 * A segment may legitimately contain the separator. `escapeChar` (default `\`) escapes the next
 * character, so the JS literal `'a\\/b/c'` is the two-level path `a/b` → `c`. The escaped form is
 * retained in the id and removed from the display name, which keeps `a\/b` distinct from the
 * two-level path `a` → `b`.
 *
 * ### Invariants this class does not write
 * `depth`, `childCount`, `siblingIndex` and `siblingCount` are owned by the `TreeStore`'s Structural
 * Layer and derived on ingestion. Writing them here would produce a store that renders correctly and
 * reports ARIA incorrectly, so only `parentId` and `isLeaf` are set.
 *
 * @class Neo.data.normalizer.Path
 * @extends Neo.data.normalizer.Base
 * @see Neo.data.TreeStore
 * @see Neo.data.normalizer.Tree
 */
class Path extends Base {
    static config = {
        /**
         * @member {String} className='Neo.data.normalizer.Path'
         * @protected
         */
        className: 'Neo.data.normalizer.Path',
        /**
         * @member {String} ntype='normalizer-path'
         * @protected
         */
        ntype: 'normalizer-path',
        /**
         * Escapes the following character, allowing a segment to contain the separator itself.
         * @member {String} escapeChar='\\'
         */
        escapeChar: '\\',
        /**
         * The property name used for the primary key. Must match the consuming store's keyProperty.
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * The property that receives a synthesized ancestor's unescaped segment.
         * Matches `Neo.list.Base#displayField`, so synthesized groups render without extra mapping.
         * @member {String} nameProperty='name'
         */
        nameProperty: 'name',
        /**
         * The property on a raw entry that carries its path. Only used by `normalize()`.
         * @member {String} pathProperty='path'
         */
        pathProperty: 'path',
        /**
         * @member {String} separator='/'
         */
        separator: '/'
    }

    /**
     * Reshapes an array of path-addressed entries into a flat 1D array with parentId relationships.
     *
     * Ancestors shared by several entries are emitted exactly once, and an entry whose path was
     * already emitted is skipped rather than duplicated — so a batch is idempotent within itself.
     *
     * @param {Object|Object[]} data Raw entries, each carrying its path under `pathProperty`.
     * @returns {Object} An object containing the flattened `data` array and the `totalCount`.
     */
    normalize(data) {
        let me                          = this,
            {keyProperty, pathProperty} = me,
            items                       = Array.isArray(data) ? data : (data ? [data] : []),
            flattened                   = [],
            seen                        = new Set(),
            item, record, records;

        for (item of items) {
            records = me.materialize(item[pathProperty], item, id => seen.has(id));

            for (record of records) {
                seen.add(record[keyProperty]);
                flattened.push(record)
            }
        }

        return {
            data      : flattened,
            totalCount: flattened.length
        }
    }

    /**
     * Expands one path into the records needed to reach its leaf, ancestors first.
     *
     * Nodes the `exists` predicate accepts are omitted, which is what makes repeated materialization
     * a no-op rather than a source of duplicates. When the leaf itself already exists the result is
     * empty: an existing node keeps the payload it was created with, and a later declaration of the
     * same path does not merge into it.
     *
     * The input object is never mutated; every emitted record is newly allocated.
     *
     * @param {String} path
     * @param {Object} [data={}] Fields for the leaf. The key and `parentId` are always derived from
     * the path and therefore override anything supplied here.
     * @param {Function|null} [exists=null] Optional `(id) => Boolean` predicate identifying nodes
     * that are already present and must not be emitted again.
     * @returns {Object[]} Ancestors first, leaf last. Empty when nothing is missing.
     */
    materialize(path, data={}, exists=null) {
        let me                                        = this,
            {keyProperty, nameProperty, pathProperty} = me,
            segments                                  = me.splitPath(path),
            lastIndex                                 = segments.length - 1,
            result                                    = [],
            parentId                                  = 'root',
            i, isLeaf, record, segment;

        for (i = 0; i <= lastIndex; i++) {
            segment = segments[i];
            isLeaf  = i === lastIndex;

            if (!exists?.(segment.id)) {
                record = isLeaf ? {...data} : {};

                delete record[pathProperty];

                record[keyProperty]  = segment.id;
                record[nameProperty] = isLeaf && Object.hasOwn(data, nameProperty) ? data[nameProperty] : segment.name;
                record.isLeaf        = isLeaf ? data.isLeaf !== false : false;
                record.parentId      = parentId;

                result.push(record)
            }

            parentId = segment.id
        }

        return result
    }

    /**
     * Splits a path into one descriptor per level, from the outermost ancestor to the leaf.
     *
     * Each descriptor carries the raw prefix as `id` — which is what makes ancestor identity a pure
     * function of the path — and the unescaped segment as `name`.
     *
     * @param {String} path
     * @returns {Object[]} `[{id, name}]`, one entry per level.
     * @throws {Error} If the path is not a non-empty string, or contains an empty segment. A leading,
     * trailing or doubled separator addresses no node, and resolving it to a guess is exactly the
     * silent divergence this class exists to prevent.
     */
    splitPath(path) {
        let me                      = this,
            {escapeChar, separator} = me,
            result                  = [],
            segment                 = '',
            i                       = 0,
            char, len;

        if (!path || !Neo.isString(path)) {
            throw new Error(`${me.className}: path must be a non-empty string, got ${JSON.stringify(path)}`)
        }

        len = path.length;

        for (; i < len; i++) {
            char = path[i];

            if (char === escapeChar && i + 1 < len) {
                segment += path[++i]
            } else if (char === separator) {
                if (segment === '') {
                    throw new Error(`${me.className}: "${path}" contains an empty segment`)
                }

                result.push({id: path.slice(0, i), name: segment});
                segment = ''
            } else {
                segment += char
            }
        }

        if (segment === '') {
            throw new Error(`${me.className}: "${path}" contains an empty segment`)
        }

        result.push({id: path, name: segment});

        return result
    }
}

export default Neo.setupClass(Path);
