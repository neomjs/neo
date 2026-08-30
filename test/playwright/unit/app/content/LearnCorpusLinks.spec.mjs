import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'LearnCorpusLinksTest'
    }
});

import {execSync}                                 from 'child_process';
import fs                                         from 'fs';
import {test, expect}                             from '@playwright/test';
import Neo                                        from '../../../../../src/Neo.mjs';
import * as core                                  from '../../../../../src/core/_export.mjs';
import {marked}                                   from '../../../../../node_modules/marked/lib/marked.esm.js';
import ContentComponent                           from '../../../../../src/app/content/Component.mjs';
import {classifyHref, LinkKind, loadLearnItemIds} from '../../../util/learnLinkNavigability.mjs';

/**
 * Every link in a portal-served guide must be reachable from the portal.
 *
 * The sibling component-tier arm pins the routing *rule* against a rendered fixture in a real
 * browser. This one applies that same rule — the shared predicate, not a second copy of it — to the
 * whole corpus, so a guide that acquires an unreachable link fails here rather than in a reader's
 * browser.
 *
 * Extraction is `marked`, the parser `Neo.component.Markdown` renders with, run over the real files
 * and queried on its OUTPUT. A hand-rolled markdown link regex would eventually disagree with the
 * renderer about what a link is, and the corpus would rot in that gap. Anchors come from generated
 * HTML, which is why a pattern over `<a href="…">` is safe here and would not be over markdown.
 *
 * Scope is deliberate: only files the portal actually serves. A guide absent from `learn/tree.json`
 * is read on GitHub, where a relative path is the correct form — holding it to the router's contract
 * would enforce the wrong consumer's rule.
 */

const ITEM_IDS  = loadLearnItemIds(),
      isServed  = path => path.startsWith('learn/') && ITEM_IDS.has(path.slice('learn/'.length).replace(/\.md$/, '')),
      // Both globs: `learn/**/*.md` does not match top-level files, so a `learn/*.md` guide sits
      // outside the population and its links go unchecked while the run still reports clean.
      FILES     = execSync("git ls-files 'learn/*.md' 'learn/**/*.md'", {encoding: 'utf8'})
                      .trim().split('\n').filter(isServed),
      regexHref = /<a\s[^>]*href="([^"]*)"/g;

/**
 * Renders one guide the way the portal does: `marked`, then the content component's own link
 * rewrite, with the route the portal view declares.
 *
 * `rewriteLinks` is invoked through the prototype rather than a live instance because setting
 * `record` on a real one triggers `afterSetRecord` -> `doFetchContent` -> `fetch`. Borrowing the
 * method keeps this the production implementation; re-deriving the rewrite here would let the test
 * pass while the shipped one is broken.
 *
 * @param {String} id the record id of the guide being rendered
 * @param {String} content
 * @returns {String}
 */
const renderFor = (id, content) => ContentComponent.prototype.rewriteLinks.call({
    contentRoute    : '#/learn/',
    record          : {id},
    resolveContentId: ContentComponent.prototype.resolveContentId
}, marked.parse(content));

test.describe('learn corpus link reachability', () => {
    test('every link in a portal-served guide is reachable from the portal', () => {
        // Control: an empty corpus, or a `git ls-files` that silently returned nothing, would make
        // the assertion below pass while proving nothing.
        expect(FILES.length).toBeGreaterThan(50);

        const unreachable = [],
              repoFiles   = [];
        let linksSeen = 0;

        for (const file of FILES) {
            const id   = file.slice('learn/'.length).replace(/\.md$/, ''),
                  html = renderFor(id, fs.readFileSync(file, 'utf8'));

            for (const match of html.matchAll(regexHref)) {
                const href = match[1];

                linksSeen++;

                const {kind} = classifyHref(href, ITEM_IDS);

                if (kind === LinkKind.ROUTE_MISS || kind === LinkKind.UNROUTED) {
                    unreachable.push(`${file}\n      ${kind.padEnd(11)} ${href}`)
                } else if (kind === LinkKind.REPO_FILE) {
                    repoFiles.push(`${file} -> ${href}`)
                }
            }
        }

        // Second control: a parser that emitted no anchors would report a spotless corpus.
        expect(linksSeen).toBeGreaterThan(100);

        // Reported, never silently absolved: these are links into the repository tree, unreachable in
        // the app because no route exists for source files. Whether guides should link to source at
        // all is a live question; printing them keeps it visible instead of letting the count settle.
        repoFiles.length && console.log(
            `\n  ${repoFiles.length} link(s) into the repository tree (no content route exists; not failed here):\n    ` +
            repoFiles.join('\n    ') + '\n'
        );

        expect(
            unreachable,
            `${unreachable.length} unreachable link(s) across ${FILES.length} portal-served guide(s). ` +
            'A portal reader cannot follow these; only `#/learn/<id>` (id from learn/tree.json), an ' +
            'in-page `#anchor`, or an absolute URL can be navigated:\n\n  ' + unreachable.join('\n  ')
        ).toEqual([])
    })
});
