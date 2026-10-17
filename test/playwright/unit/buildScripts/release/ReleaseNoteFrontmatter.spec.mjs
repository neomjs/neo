import {test, expect} from '@playwright/test';
import matter         from 'gray-matter';
import {
    getReleaseNoteParts,
    stampReleaseNote
} from '../../../../../buildScripts/release/releaseNoteFrontmatter.mjs';

/**
 * @summary Pins the frontmatter `publish.mjs` stamps into an authored release note: the fields the release
 * index dates a release by, in the shape the archived notes carry, and the title and body GitHub receives.
 */

const
    note        = '# Neo.mjs v13.2.0 Release Notes\n\nThe body.\n',
    publishedAt = new Date('2026-10-05T12:40:00.123Z');

test.describe('stampReleaseNote (#19409)', () => {
    test('prepends the GitHub Release frontmatter and keeps the note itself', () => {
        const {content, data} = matter(stampReleaseNote(note, {publishedAt, version: '13.2.0'}));

        expect(data).toEqual({
            tagName     : '13.2.0',
            name        : 'Neo.mjs v13.2.0 Release Notes',
            publishedAt : '2026-10-05T12:40:00Z',
            isPrerelease: false,
            isDraft     : false
        });
        expect(content).toBe(note)
    });

    // The frontmatter of an archived note (v13.1.0, as the corpus holds it): the shape a stamp must produce.
    test('carries the keys an archived note carries', () => {
        const archived = matter([
            '---',
            'tagName: 13.1.0',
            'name: Neo.mjs v13.1.0 Release Notes',
            "publishedAt: '2026-07-03T21:40:28Z'",
            'isPrerelease: false',
            'isDraft: false',
            '---',
            '# Neo.mjs v13.1.0 Release Notes'
        ].join('\n')).data;

        expect(Object.keys(matter(stampReleaseNote(note, {publishedAt, version: '13.2.0'})).data)).toEqual(Object.keys(archived))
    });

    test('marks a SemVer prerelease as one, and build metadata as none', () => {
        const isPrerelease = version => matter(stampReleaseNote(note, {publishedAt, version})).data.isPrerelease;

        expect([isPrerelease('13.2.0-beta.1'), isPrerelease('13.2.0+build-1'), isPrerelease('13.2.0')]).toEqual([true, false, false])
    });

    test('returns a note that already has frontmatter unchanged, so a re-run keeps its date', () => {
        const stamped = stampReleaseNote(note, {publishedAt, version: '13.2.0'});

        expect(stampReleaseNote(stamped, {publishedAt: new Date('2027-01-01T00:00:00Z'), version: '13.2.0'})).toBe(stamped)
    });

    test('hands the GitHub Release the authored title and body, without the stamp', () => {
        expect(getReleaseNoteParts(stampReleaseNote(note, {publishedAt, version: '13.2.0'}))).toEqual({
            body : 'The body.',
            title: 'Neo.mjs v13.2.0 Release Notes'
        })
    });

    test('keeps a title that contains --- as the title, and the stamp out of the body', () => {
        const stamped = stampReleaseNote('# Release --- maintenance\n\nThe body.\n', {publishedAt, version: '13.2.1'});

        expect(matter(stamped).data.name).toBe('Release --- maintenance');
        expect(getReleaseNoteParts(stamped)).toEqual({body: 'The body.', title: 'Release --- maintenance'})
    })
});
