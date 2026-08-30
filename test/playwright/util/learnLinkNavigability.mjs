import fs   from 'fs';
import path from 'path';

/**
 * @summary Classifies a rendered anchor `href` by whether the portal's learn section can navigate to it.
 *
 * The distinction this module exists to make: **a link target existing on disk is not the same
 * property as the portal being able to reach it.** `Portal.view.learn.MainContainerController`
 * resolves a page with `store.get(itemId)` against `learn/tree.json` — an exact id lookup with no
 * normalization — so a target file can be present in the repository and still be unreachable in the
 * rendered app. A guard that checks the filesystem answers the GitHub reader's question; this module
 * answers the portal reader's.
 *
 * Grounded in a measured run: a bare `benefits.body.ConfigSystem` anchor resolves against the
 * document URL to `/apps/portal/benefits.body.ConfigSystem` and returns 404, and `#/learn/benefits.Quick`
 * renders an empty article because the dotted id misses the store.
 */

/**
 * Every id in `learn/tree.json` is slash-separated. `Portal.view.learn.Component#getContentPath`
 * still calls `record.id.replaceAll('.', '/')`, but that transform is a no-op on every current id —
 * it is a compatibility shim for a dotted scheme that no longer exists, not evidence that dotted ids
 * are accepted. Reading it as support for both forms is what put three unreachable links into the
 * corpus, so the fixture below pins the dotted form as NOT navigable on purpose.
 * @type {String}
 */
export const LEARN_ROUTE_PREFIX = '#/learn/';

/**
 * @enum {String}
 */
export const LinkKind = {
    /** `#/learn/<id>` whose id resolves via `store.get` — the only cross-page form that navigates */
    ROUTE_HIT: 'route-hit',
    /** `#/learn/<id>` whose id misses the store — renders an empty article */
    ROUTE_MISS: 'route-miss',
    /** `#section` — an in-page anchor, navigable without touching the router */
    IN_PAGE: 'in-page',
    /** absolute `http(s)` — leaves the app by design; liveness is a separate question */
    EXTERNAL: 'external',
    /** a repository file with no content route — source, build script, example entry point */
    REPO_FILE: 'repo-file',
    /** anything else: resolves against the document URL and leaves the SPA (bare token, relative path) */
    UNROUTED: 'unrouted'
};

/**
 * Extensions that identify a link into the repository tree rather than the content tree. A guide
 * pointing at `../../../src/foo.mjs` is unreachable in the app, but no route exists for source files,
 * so it is a different question from a broken content link and is reported rather than failed.
 *
 * Matched on the extension, deliberately not as "anything that is not .md": a bare portal-ish token
 * like `benefits.body.ConfigSystem` is also not `.md`, and that negative would quietly absolve the
 * exact defect this module exists to catch.
 * @type {RegExp}
 */
const regexRepoFile = /\.(mjs|js|cjs|json|html|s?css|ts|yml|yaml|sh|txt)($|#|\?)/;

/**
 * @summary Reads the portal's own routing authority.
 * @param {String} [repoRoot=process.cwd()]
 * @returns {Set<String>} every navigable learn item id
 */
export function loadLearnItemIds(repoRoot = process.cwd()) {
    const file = path.join(repoRoot, 'learn', 'tree.json');
    return new Set(JSON.parse(fs.readFileSync(file, 'utf8')).data.map(record => record.id))
}

/**
 * @summary Classifies one rendered `href` against the portal's routing rule.
 * @param {String} href the value of a rendered anchor's `href` attribute, verbatim
 * @param {Set<String>} itemIds from {@link loadLearnItemIds}
 * @returns {{kind: String, itemId: String|null}}
 */
export function classifyHref(href, itemIds) {
    if (/^https?:\/\//.test(href)) {
        return {kind: LinkKind.EXTERNAL, itemId: null}
    }

    if (href.startsWith(LEARN_ROUTE_PREFIX)) {
        // A deep link may carry a section anchor; the router only ever sees the part before it.
        const itemId = href.slice(LEARN_ROUTE_PREFIX.length).split('#')[0];

        return {
            kind  : itemIds.has(itemId) ? LinkKind.ROUTE_HIT : LinkKind.ROUTE_MISS,
            itemId
        }
    }

    if (href.startsWith('#')) {
        return {kind: LinkKind.IN_PAGE, itemId: null}
    }

    if (regexRepoFile.test(href)) {
        return {kind: LinkKind.REPO_FILE, itemId: null}
    }

    return {kind: LinkKind.UNROUTED, itemId: null}
}

/**
 * @summary True when a rendered link can reach content in the portal.
 *
 * `EXTERNAL` counts as navigable here: it leaves the app deliberately, and proving the far end is
 * alive needs a network call rather than the routing table. Keeping that a separate question stops
 * this predicate from returning a plausible pass for a check it cannot perform.
 *
 * @param {String} href
 * @param {Set<String>} itemIds
 * @returns {Boolean}
 */
export function isNavigable(href, itemIds) {
    const {kind} = classifyHref(href, itemIds);

    return kind === LinkKind.ROUTE_HIT || kind === LinkKind.IN_PAGE || kind === LinkKind.EXTERNAL
}
