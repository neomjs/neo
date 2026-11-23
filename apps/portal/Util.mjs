const
    // Kept in step with Neo.app.content.Component#rewriteLinks, which runs first: a scheme, an anchor or hash
    // route, or a root-absolute path is navigable as authored.
    regexExternal   = /^(?:[a-z][a-z0-9+.-]*:|#|\/)/i,
    // GitHub's own link to a file from an issue, pull request or discussion page.
    regexGitHubFile = /^(?:\.\.\/)*(blob|tree)\/([^/]+)\/(.+)$/,
    regexHref       = /(\shref\s*=\s*)(["'])([^"']+)\2/i,
    regexCommit     = /^[0-9a-f]{7,40}$/i,
    // The top-level entries of neomjs/neo, plus `ai`, which moved to neomjs/neo-agent-brain.
    repoRoots       = new Set([
        '.agents', '.claude', '.codex', '.gitattributes', '.github', '.gitignore', '.husky', '.kimi-code', '.npmignore',
        'AGENTS.md', 'BACKERS.md', 'CONTRIBUTING.md', 'LICENSE', 'README.md', 'ROADMAP.md', 'ServiceWorker.mjs', 'ai',
        'apps', 'buildScripts', 'docs', 'examples', 'learn', 'package-lock.json', 'package.json', 'resources', 'src', 'test'
    ]);

/**
 * @summary Parses a browser query string for Portal consumers such as Learning deck selection.
 * @param {String|null} searchString The browser's `location.search` value
 * @returns {Object} Decoded query values. Repeated keys retain their last value.
 */
export function getSearchParams(searchString) {
    return Object.fromEntries(new URLSearchParams(searchString ?? ''))
}

/**
 * @summary The GitHub URL of a repository file or folder, in the repository that holds it today.
 * @param {String} kind `blob` or `tree`
 * @param {String} ref
 * @param {String} path
 * @returns {String}
 */
function getGitHubUrl(kind, ref, path) {
    // A commit pinned before the move still holds `ai/` in neomjs/neo.
    const repo = /^ai(\/|$)/.test(path) && !regexCommit.test(ref) ? 'neo-agent-brain' : 'neo';

    return `https://github.com/neomjs/${repo}/${kind}/${ref}/${path}`
}

/**
 * @summary Resolves one relative href to a Portal route or a GitHub URL.
 * @param {String} href
 * @param {String|null} filePath see rewriteRepoLinks()
 * @returns {String|null} null leaves the link as authored
 */
function resolveRepoLink(href, filePath) {
    if (regexExternal.test(href)) {
        return null
    }

    const index    = href.indexOf('#'),
          target   = index < 0 ? href : href.slice(0, index),
          hash     = index < 0 ? ''   : href.slice(index),
          gitHub   = !filePath && target.match(regexGitHubFile),
          segments = filePath ? filePath.split('/').slice(0, -1) : [];

    if (gitHub) {
        return getGitHubUrl(gitHub[1], gitHub[2], gitHub[3]) + hash
    }

    for (const part of target.split('/')) {
        if (part === '..') {
            // Above the repository root, the path names nothing
            if (!segments.length) {
                return null
            }

            segments.pop()
        } else if (part && part !== '.') {
            segments.push(part)
        }
    }

    const path = segments.join('/');

    if (/^learn\/.+\.md$/i.test(path)) {
        const id = path.slice('learn/'.length, -'.md'.length);

        return (id.startsWith('blog/') ? `#/news/${id}` : `#/learn/${id}`) + hash
    }

    return repoRoots.has(segments[0]) ? getGitHubUrl(target.endsWith('/') ? 'tree' : 'blob', 'dev', path) + hash : null
}

/**
 * @summary Points the relative links of rendered repository Markdown where they lead from the file's folder:
 * a `learn/` page opens its Portal route, any other repository file opens on GitHub.
 *
 * Runs after {@link Neo.app.content.Component#rewriteLinks}, which routes the `.md` links inside a view's content
 * root and leaves every other relative href alone. Resolved by the browser, those land under `/apps/portal/`,
 * where nothing is served. A path that climbs above the repository root, or whose first segment is no top-level
 * entry of it, stays as authored: no destination beats a wrong one.
 *
 * @param {String} html Rendered Markdown HTML.
 * @param {String|null} [filePath=null] The repository path of the Markdown file, e.g. `learn/benefits/Introduction.md`.
 * `null` for text written on GitHub (issue, pull request and discussion bodies), where a relative path names a
 * repository file from the root and `../blob/<ref>/<path>` is GitHub's own link to one.
 * @returns {String}
 */
export function rewriteRepoLinks(html, filePath=null) {
    return html.replace(/<a\b[^>]*>/gi, tag => {
        const href = tag.match(regexHref)?.[3],
              url  = href && resolveRepoLink(href, filePath);

        if (!url) {
            return tag
        }

        // A function replacement: a `$` inside the url is content, not a substitution pattern
        tag = tag.replace(regexHref, (match, attribute, quote) => attribute + quote + url + quote);

        // GitHub is outside the app. An authored target wins.
        return url.startsWith('#') || /\starget\s*=/i.test(tag) ? tag : tag.replace(/>$/, ' target="_blank">')
    })
}
