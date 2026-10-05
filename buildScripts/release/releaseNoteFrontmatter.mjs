import matter from 'gray-matter';

/**
 * @module buildScripts.release.releaseNoteFrontmatter
 * @summary Stamps an authored release note with the frontmatter the Portal's release index dates it by.
 *
 * The archived notes in `.github/RELEASE_NOTES` carry their GitHub Release's metadata as frontmatter, and
 * `buildScripts/docs/index/release.mjs` dates each release by its `publishedAt`. A note is authored without it, and
 * since the notes stay in the engine as the archive, nothing re-materializes it from GitHub. So `publish.mjs`
 * stamps the note before `prepare.mjs` rebuilds that index.
 */

/**
 * @summary Returns the note with its release frontmatter prepended, or unchanged when it already has frontmatter.
 *
 * Leaving an existing block alone keeps a re-run of the release from moving the date. The `name` is the note's
 * first heading, which `publish.mjs` also makes the GitHub Release's title.
 * @param {String} content The authored note
 * @param {Object} release
 * @param {Date}   release.publishedAt
 * @param {String} release.version The version `gh release create` tags, e.g. `13.2.0`
 * @returns {String}
 */
export function stampReleaseNote(content, {publishedAt, version}) {
    if (matter.test(content)) {
        return content
    }

    return matter.stringify(content, {
        tagName     : version,
        name        : content.match(/^#\s+(.+)$/m)?.[1].trim() || `v${version}`,
        publishedAt : publishedAt.toISOString().replace(/\.\d{3}Z$/, 'Z'),
        isPrerelease: version.includes('-'),
        isDraft     : false
    })
}
