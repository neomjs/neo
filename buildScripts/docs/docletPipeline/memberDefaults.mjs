/**
 * @module buildScripts/docs/docletPipeline/memberDefaults
 * @summary The published default for a member doclet — the stage that decides what the docs app shows.
 *
 * The parser's `defaultvalue` is not what ships. For an array or object type this re-derives the value
 * from the comment text, and its three edges are all reachable from ordinary authored JSDoc:
 *
 * - **it repairs a trailing bracket.** JSDoc's optional-parameter syntax is `[name=default]`, so a
 *   value ending in `]` loses it at the parser. Re-deriving from the comment restores it.
 * - **it empties a one-line block.** With no newline after `=`, `indexOf` returns `-1` and
 *   `substr(0, -1)` is the empty string, so the member documents with no default at all.
 * - **it publishes the comment marker when there is no `=`.** A separate `@default` tag has none, so
 *   `indexOf` returns `-1`, `-1 + 1` is `0`, and the slice starts at the comment's first character —
 *   yielding `/**` up to the first newline.
 *
 * Lifted out of `generateDocsJson.mjs` so the behaviour has ONE definition. A test that re-implements
 * it cannot fail when this changes, which is the only way a regression here would ever be caught:
 * every edge above is silent — nothing throws, and the docs build stays green.
 *
 * @param {Object} item A doclet whose `kind` is `member`.
 * @returns {*} The default as published, which may differ from `item.defaultvalue`.
 */
export function publishedMemberDefault(item) {
    if (item.defaultvalue && item.type?.names) {
        const type = item.type.names[0].toLowerCase();

        if (type.indexOf('array') > -1 || type.indexOf('object') > -1) {
            let defaultValue = item.comment.substr(item.comment.indexOf('=') + 1);

            return defaultValue.substr(0, defaultValue.indexOf('\n'))
        }
    }

    return item.defaultvalue
}
