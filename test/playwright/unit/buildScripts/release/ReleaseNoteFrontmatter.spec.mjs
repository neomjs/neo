import {test, expect}     from '@playwright/test';
import fs                 from 'node:fs';
import path               from 'node:path';
import matter             from 'gray-matter';
import {stampReleaseNote} from '../../../../../buildScripts/release/releaseNoteFrontmatter.mjs';

/**
 * @summary Pins the frontmatter `publish.mjs` stamps into an authored release note: the fields the release
 * index dates a release by, in the shape the archived notes carry.
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

    test('carries the keys an archived note carries', () => {
        const archived = matter(fs.readFileSync(path.join(process.cwd(), '.github/RELEASE_NOTES/v13.1.0.md'), 'utf8')).data;

        expect(Object.keys(matter(stampReleaseNote(note, {publishedAt, version: '13.2.0'})).data)).toEqual(Object.keys(archived))
    });

    test('marks a prerelease version as one', () => {
        expect(matter(stampReleaseNote(note, {publishedAt, version: '13.2.0-beta.1'})).data.isPrerelease).toBe(true)
    });

    test('returns a note that already has frontmatter unchanged, so a re-run keeps its date', () => {
        const stamped = stampReleaseNote(note, {publishedAt, version: '13.2.0'});

        expect(stampReleaseNote(stamped, {publishedAt: new Date('2027-01-01T00:00:00Z'), version: '13.2.0'})).toBe(stamped)
    });

    test('leaves no trace in the body publish.mjs hands to the GitHub Release', () => {
        // Step 5 strips frontmatter with this expression before `gh release create`
        expect(stampReleaseNote(note, {publishedAt, version: '13.2.0'}).replace(/^---[\s\S]+?---\s*/, '')).toBe(note)
    })
});
