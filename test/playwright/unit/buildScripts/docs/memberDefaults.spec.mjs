import {test, expect}           from '@playwright/test';
import {publishedMemberDefault} from '../../../../../buildScripts/docs/docletPipeline/memberDefaults.mjs';

/**
 * @summary Where the published default's slice STARTS, which is a separate question from its layout.
 *
 * `docletCompactJsdoc.spec.mjs` covers the layout axis — compact against multiline, and the two forms
 * `.github/CODING_GUIDELINES.md` §12 forbids for arrays and objects. Those arms run the real JSDoc
 * parser over fixture source, which is what that question needs.
 *
 * This file covers the other axis, and it needs no parser: the value is re-derived from the comment
 * TEXT, so a doclet-shaped object exercises the real decision. The function is imported rather than
 * re-implemented, because its own docblock says a re-implementation cannot fail when it changes.
 *
 * The defect these arms pin: the slice used to start at the comment's FIRST `=`, so a `=>` or `==` in
 * the prose above the tag won it. `Neo.plugin.Resizable`'s "Directions into which you want to drag =>
 * resize" published `> resize` as `validDirections`, and 18 other members published prose the same way.
 *
 * Every arm carries its authored value literally, so a failure prints the prose it regressed to rather
 * than a diff between two derived strings.
 */
const
    /**
     * A doclet as the pipeline sees it at this stage. `defaultvalue` must be truthy for re-derivation
     * to run at all, and it is deliberately WRONG here — the parser's value is not what this stage
     * publishes, so an arm that accepted it would pass without exercising the re-derivation. Seeing
     * `PARSER_VALUE` in a failure means the branch was never entered.
     *
     * The type is the PARSER'S spelling, not the authored one: JSDoc normalises `{String[]}` to
     * `Array.<String>`, and the stage matches on `'array'`, which `'string[]'` does not contain. A
     * fixture carrying the authored spelling falls straight through and every arm goes vacuous.
     * @param {String} comment The raw comment block.
     * @param {String} [type='Array.<String>'] Only array and object types re-derive.
     * @returns {Object}
     */
    doclet = (comment, type = 'Array.<String>') => ({
        comment,
        defaultvalue: 'PARSER_VALUE',
        type        : {names: [type]}
    }),
    /** The operator list from `Neo.collection.Filter`: a real value that is itself full of `=`. */
    OPERATORS = `['==','===','!=','!==','<','<=','>','>=','doesNotStartWith','endsWith','excluded','included','isDefined','isUndefined','like','startsWith']`;

test.describe('publishedMemberDefault — the slice is anchored at the @member tag', () => {
    test('a prose arrow above the tag does not win the slice', () => {
        // Neo.plugin.Resizable, verbatim. This published `> resize` before the anchor existed.
        const published = publishedMemberDefault(doclet(
            `/**\n * Directions into which you want to drag => resize\n * @member {String[]} directions_=['b','bl','br','l','r','t','tl','tr']\n * @protected\n */`
        ));

        expect(published).toBe(`['b','bl','br','l','r','t','tl','tr']`)
    });

    test('a prose == above the tag does not win the slice', () => {
        // Neo.component.Base's `style`, shortened: the prose compares two things with ==.
        const published = publishedMemberDefault(doclet(
            `/**\n * Only applied when el == vdomRoot, the wrapperStyle mechanism takes over otherwise.\n * @member {Object} style={a:1}\n */`,
            'Object'
        ));

        expect(published).toBe(`{a:1}`)
    });

    test('a prose key => value description does not win the slice', () => {
        // Neo.component.wrapper.MapboxGL, which had FIVE members published as prose fragments.
        const published = publishedMemberDefault(doclet(
            `/**\n * key => map id, value => {Array} layers\n * @member {Object} layers={}\n */`,
            'Object'
        ));

        expect(published).toBe(`{}`)
    });

    test('a description that NAMES the tag does not anchor the slice', () => {
        // A description may legitimately name the tag it belongs to. Anchoring on the first `@member`
        // anywhere in the comment lets that mention win, and the `=>` after it takes the slice back —
        // the same defect one line along. The anchor matches a TAG: `@member` opening its line.
        const published = publishedMemberDefault(doclet(
            `/**\n * The @member declaration below maps key => value.\n * @member {String[]} inlineMention=['safe']\n */`
        ));

        expect(published, 'the prose mention must not win').toBe(`['safe']`)
    });

    test('the same docblock without the mention is the control', () => {
        // What makes the arm above discriminating: identical shape, one variable removed. Without it,
        // an arm that passed for an unrelated reason would look like proof that the anchor works.
        const published = publishedMemberDefault(doclet(
            `/**\n * The declaration below maps key => value.\n * @member {String[]} inlineMention=['safe']\n */`
        ));

        expect(published).toBe(`['safe']`)
    });

    test('a value whose own contents are full of = survives intact', () => {
        // Neo.collection.Filter#operators. The anchor must find the TAG's `=`, and then stop caring:
        // every `=` inside the value is part of the value.
        const published = publishedMemberDefault(doclet(
            `/**\n * Valid values for the operator config\n * @member {String[]} operators=${OPERATORS}\n * @protected\n */`
        ));

        expect(published).toBe(OPERATORS);
        expect(published, 'the 16th operator is the one the old doc comment omitted').toContain('doesNotStartWith')
    });

    test('the multiline repair the function exists for still happens', () => {
        // The reason this stage exists: JSDoc's `[name=default]` syntax eats a value's trailing `]`.
        // An anchor that broke this would have fixed the prose case by disabling the whole function.
        const published = publishedMemberDefault(doclet(
            `/**\n * @member {String[]} baseCls=['neo-fieldset','neo-container']\n * @protected\n */`
        ));

        expect(published).toBe(`['neo-fieldset','neo-container']`)
    });

    test('@memberOf does not anchor, so a @default doclet keeps its documented behaviour', () => {
        // `Neo.config.mainThreadAddons` uses `@memberOf!` + `@name` + `@type`, never `@member`. The
        // anchor is word-bounded so it does not match here, and the third documented edge is preserved
        // rather than silently changed: that form is FORBIDDEN by §12 and pinned in
        // `docletCompactJsdoc.spec.mjs`, so repairing it is a guidelines change, not a slice change.
        const published = publishedMemberDefault(doclet(
            `/**\n * Add addons for the main thread\n * @default ['DragDrop','Navigator','Stylesheet']\n * @memberOf! module:Neo\n * @name config.mainThreadAddons\n */`
        ));

        expect(published, 'unchanged: still the comment marker').toBe('/**')
    });

    test('a one-line block keeps its documented behaviour too', () => {
        // The second documented edge: no newline after `=`, so the slice empties. Also FORBIDDEN by §12
        // and pinned elsewhere. Named here because the anchor sits on the same line and could have
        // changed it by accident.
        const published = publishedMemberDefault(doclet(
            `/** @member {String[]} lastErrors=[] */`
        ));

        expect(published, 'unchanged: still empty').toBe('')
    });

    test('a type that is neither array nor object is returned by the parser, untouched', () => {
        // The guard that keeps every String member out of the re-derivation entirely. Without it the
        // prose-anchor question would apply to hundreds more members.
        const published = publishedMemberDefault(doclet(
            `/**\n * A label that reads x => y\n * @member {String} label='hello'\n */`,
            'String'
        ));

        expect(published).toBe('PARSER_VALUE')
    });

    test('the fixture type is the spelling the real parser emits, not the authored one', () => {
        // The guard for this file's own fixture. `{String[]}` normalises to `Array.<String>`, and the
        // stage matches on `'array'` — so a fixture spelled `String[]` never enters the branch and
        // every arm above passes for the wrong reason. Written after that happened: six arms returned
        // the parser value and the only reason it surfaced was that the expectations were not vacuous.
        expect(doclet('/** */').type.names[0].toLowerCase()).toContain('array');

        expect(
            publishedMemberDefault(doclet(`/**\n * @member {String[]} a=['x']\n */`, 'String[]')),
            'the authored spelling must NOT re-derive — that is the trap this arm names'
        ).toBe('PARSER_VALUE')
    });

    test('a doclet with no tag and no = falls back to the parser rather than throwing', () => {
        // `search` returns -1 and `indexOf('=', -1)` behaves as `indexOf('=', 0)`, so this stays on the
        // existing path. Asserted because a naive anchor implementation throws on the -1 instead.
        const published = publishedMemberDefault(doclet(`/**\n * Just prose, no tag.\n */`));

        expect(published).toBe('/**')
    })
});
