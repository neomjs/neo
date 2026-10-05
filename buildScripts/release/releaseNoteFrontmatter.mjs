import matter from 'gray-matter';
import semver from 'semver';

/**
 * @module buildScripts.release.releaseNoteFrontmatter
 * @summary Stamps an authored release note with the frontmatter the Portal's release index dates it by, and splits
 * a note into the title and body its GitHub Release receives.
 *
 * The archived notes in `.github/RELEASE_NOTES` carry their GitHub Release's metadata as frontmatter, and
 * `buildScripts/docs/index/release.mjs` dates each release by its `publishedAt`. A note is authored without it, and
 * since the notes stay in the engine as the archive, nothing re-materializes it from GitHub. So `publish.mjs`
 * stamps the note before `prepare.mjs` rebuilds that index, and later hands GitHub the note without the block.
 */

/**
 * @summary The note's title and its body without frontmatter or title: what `gh release create` receives.
 *
 * gray-matter ends the frontmatter at a delimiter on its own line, so a title that contains `---` stays the title.
 * @param {String} content A release note, stamped or not
 * @returns {{body: String, title: String|null}}
 */
export function getReleaseNoteParts(content) {
    const
        body  = matter(content).content,
        title = body.match(/^#\s+(.+)$/m)?.[1].trim() || null;

    return {
        body: title ? body.replace(/^#\s+.+$/m, '').trim() : body,
        title
    }
}

/**
 * @summary Returns the note with its release frontmatter prepended, or unchanged when it already has frontmatter.
 *
 * Leaving an existing block alone keeps a re-run of the release from moving the date. The `name` is the title
 * {@link getReleaseNoteParts} gives the GitHub Release.
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
        name        : getReleaseNoteParts(content).title || `v${version}`,
        publishedAt : publishedAt.toISOString().replace(/\.\d{3}Z$/, 'Z'),
        isPrerelease: semver.prerelease(version) !== null,
        isDraft     : false
    })
}
