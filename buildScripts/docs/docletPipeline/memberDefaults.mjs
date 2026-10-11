/**
 * @module buildScripts/docs/docletPipeline/memberDefaults
 * @summary The published default for a member doclet — the stage that decides what the docs app shows.
 *
 * The parser's `defaultvalue` is not what ships. For an array or object type this re-derives the value
 * from the comment text, and its edges are all reachable from ordinary authored JSDoc:
 *
 * - **it repairs a trailing bracket.** JSDoc's optional-parameter syntax is `[name=default]`, so a
 *   value ending in `]` loses it at the parser. Re-deriving from the comment restores it.
 *   `docletCompactJsdoc.spec.mjs` pins this as the supported multiline form.
 * - **it empties a one-line block.** With no newline after `=`, `indexOf` returns `-1` and
 *   `substr(0, -1)` is the empty string, so the member documents with no default at all.
 * - **it publishes the comment marker when there is no `=` after the tag.** A separate `@default` tag
 *   has none, so the slice starts at the comment's first character — yielding `/**` up to the newline.
 *
 * The last two are why `.github/CODING_GUIDELINES.md` §12 forbids those forms for arrays and objects;
 * both are pinned as FORBIDDEN and THE TRAP in `docletCompactJsdoc.spec.mjs`, and neither is repaired
 * here — a fix would loosen §12 and belongs with that document rather than in this function.
 *
 * The search for `=` is ANCHORED AT THE TAG, which is the one edge not on that list because no authored
 * form triggers it and nothing forbade it: a `=>` or `==` in the prose ABOVE the tag would otherwise win
 * the slice and publish that prose as the default. `Neo.plugin.Resizable`'s "Directions into which you
 * want to drag => resize" published `> resize`, and 18 other members published prose fragments the same
 * way.
 *
 * The anchor matches a TAG, never a mention. `@member` must open its line — after the indent and either
 * the `*` of a continuation line or the `/**` that opens the block — because a description is free to
 * name the tag it belongs to: *"The @member declaration below maps key => value"* anchors on the prose
 * and hands the slice straight back to the `=>`, which is the original defect wearing the fix's clothes.
 * `\b` keeps `@memberOf` from anchoring, so those doclets keep the third edge's behaviour.
 *
 * Lifted out of `generateDocsJson.mjs` so the behaviour has ONE definition. A test that re-implements
 * it cannot fail when this changes, which is the only way a regression here would ever be caught:
 * every edge above is silent — nothing throws, and the docs build stays green.
 */

// A `@member` that OPENS its line: the indent, then either a continuation line's `*` or the block's
// own opener, then the tag. Matching the tag ANYWHERE would let a description that names it anchor
// the slice, which is the defect this module exists to remove, one line further along.
const TAG_ANCHOR = /^[^\S\n]*(?:\/\*\*|\*)?[^\S\n]*@member\b/m;

/**
 * @summary The default as published, which may differ from the parser's `defaultvalue`.
 * @param {Object} item A doclet whose `kind` is `member`.
 * @returns {*}
 */
export function publishedMemberDefault(item) {
    if (item.defaultvalue && item.type?.names) {
        const type = item.type.names[0].toLowerCase();

        if (type.indexOf('array') > -1 || type.indexOf('object') > -1) {
            let defaultValue = item.comment.substr(item.comment.indexOf('=', item.comment.search(TAG_ANCHOR)) + 1);

            return defaultValue.substr(0, defaultValue.indexOf('\n'))
        }
    }

    return item.defaultvalue
}
