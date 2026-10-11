import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'LinkPredicateParityTest'
    }
});

import {test, expect}   from '@playwright/test';
import Neo              from '../../../../../src/Neo.mjs';
import * as core        from '../../../../../src/core/_export.mjs';
import ContentComponent from '../../../../../src/app/content/Component.mjs';
import {classifyTarget} from '../../../../../buildScripts/util/check-relative-links.mjs';

/**
 * @summary Pins the build-time guard and the runtime rewriter to ONE out-of-scope predicate.
 *
 * These implement the same contract from opposite ends: `check-relative-links.mjs` decides which
 * hrefs it may call dead, and `app/content/Component.mjs#rewriteLinks` decides which it may rewrite.
 * Nothing forced them to agree, and they drifted twice — first on quote style, then on scheme case.
 *
 * The scheme failure was silent and two-directional. URI schemes are case-insensitive (RFC 3986
 * §3.1) and both readers honour that, but both sides tested case-sensitively: the guard classified
 * `HTTPS://example.com/docs/Foo.md` as a repository path and reported a live URL dead, while the
 * renderer failed to skip it and rewrote an absolute URL into `#/learn/…`. `MailTo:a@b.c` classified
 * as a portal ref.
 *
 * **The renderer is driven through its real `rewriteLinks`, not a copy of its regex.** The first
 * version of this spec duplicated the predicate as a local helper and compared two literals both
 * written here — it passed with the production regex reverted to the buggy form, because it never
 * touched the production code. An arm that cannot witness the thing it is named after is worse than
 * no arm: it reports the divergence as covered.
 */

/** Renders one raw-HTML anchor through the shipped rewrite and reports whether it was left alone. */
const rendererLeavesAlone = href => {
    const html = `<a href="${href}">x</a>`;

    return ContentComponent.prototype.rewriteLinks.call({
        contentRoute    : '#/learn/',
        record          : {id: 'guides/uibuildingblocks/DockLayouts'},
        resolveContentId: ContentComponent.prototype.resolveContentId
    }, html) === html
};

/**
 * Every case carries a `.md` tail so the renderer's separate "is this a content link at all" clause
 * cannot mask the scheme decision. Without that, `tel:+123` is skipped for having no `.md` and the
 * arm proves nothing about schemes.
 */
const outOfScope = [
    {href: 'https://example.com/docs/Foo.md',              why: 'absolute URL'},
    {href: 'HTTPS://example.com/docs/Foo.md',              why: 'scheme case is not significant'},
    {href: 'HtTpS://example.com/docs/Foo.md',              why: 'mixed-case scheme'},
    {href: 'mailto:a@b.c?subject=Foo.md',                  why: 'non-content scheme'},
    {href: 'MailTo:a@b.c?subject=Foo.md',                  why: 'classified portal before this'},
    {href: 'ftp://files.example.com/Foo.md',               why: 'any scheme, not an enumerated list'},
    {href: '#Foo.md',                                      why: 'in-page anchor'},
    {href: '/learn/comparisons/Overview.md',               why: 'root-absolute: renderer leaves it'}
];

const inScope = [
    {href: './Splitters.md',              why: 'relative content link'},
    {href: '../fundamentals/Boot.md',     why: 'relative content link'},
    {href: './Splitters.MD',              why: 'extension case is not significant either'}
];

test.describe('link predicate parity — guard and renderer agree on what is out of scope', () => {
    for (const {href, why} of outOfScope) {
        test(`renderer never rewrites ${href} (${why})`, () => {
            expect(rendererLeavesAlone(href)).toBe(true)
        })
    }

    for (const {href, why} of inScope) {
        test(`renderer rewrites ${href} (${why})`, () => {
            expect(rendererLeavesAlone(href)).toBe(false)
        })
    }

    test('the guard calls every absolute URI external, in any scheme case', () => {
        for (const {href} of outOfScope.filter(c => !c.href.startsWith('/'))) {
            expect(classifyTarget(href).kind, href).toBe('external')
        }
    });

    // The ONE legitimate divergence, made explicit so it is not mistaken for drift. A root-absolute
    // href is left alone by the renderer (that keeps it correct for a file-tree reader) but is IN
    // scope for the guard, which reports it: neither reader resolves a leading slash against the
    // repository, so it is a finding rather than something to wave through.
    test('root-absolute is renderer-skipped but guard-REPORTED — deliberate, not drift', () => {
        expect(classifyTarget('/learn/comparisons/Overview.md').kind).toBe('path');
        expect(rendererLeavesAlone('/learn/comparisons/Overview.md')).toBe(true)
    });

    test('a dotted token is not a scheme — both sides still see it as content', () => {
        expect(classifyTarget('benefits.body.ConfigSystem').kind).toBe('portal');
        // The renderer leaves it alone for lacking `.md`, not for looking like a URI.
        expect(rendererLeavesAlone('benefits.body.ConfigSystem')).toBe(true)
    })
});
