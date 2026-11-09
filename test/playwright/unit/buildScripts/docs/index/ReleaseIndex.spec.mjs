import {test, expect}     from '@playwright/test';
import fs                 from 'fs-extra';
import os                 from 'os';
import path               from 'path';
import createReleaseIndex from '../../../../../../buildScripts/docs/index/release.mjs';

/**
 * @summary Verifies the Portal release index dates a note only by its stamped `publishedAt`,
 * so an unreleased note is indexed without a date on every machine.
 */

/**
 * @param {Object} data
 * @returns {String}
 */
function note(data = {}) {
    const lines = Object.entries(data).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);

    return [...(lines.length ? ['---', ...lines, '---'] : []), '', '# Notes'].join('\n')
}

test.describe('buildScripts/docs/index/release.mjs', () => {
    let tempDir;

    test.beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-release-index-'))
    });

    test.afterEach(async () => {
        await fs.remove(tempDir)
    });

    /**
     * @param {String} name
     * @param {Object<String, String>} files
     * @returns {Promise<Object[]>}
     */
    async function index(name, files) {
        const releaseNotesRoot = path.join(tempDir, name),
              outputFile       = path.join(tempDir, `${name}.json`);

        for (const [fileName, content] of Object.entries(files)) {
            await fs.outputFile(path.join(releaseNotesRoot, fileName), content)
        }

        await createReleaseIndex({releaseNotesRoot, outputFile});

        return fs.readJSON(outputFile)
    }

    test('an unstamped note carries no date, so the index is the same on any machine', async () => {
        const files = {
            'v13.3.0.md': note({tagName: '13.3.0', publishedAt: '2026-11-01T10:00:00Z'}),
            'v13.4.0.md': note({tagName: '13.4.0'})
        };

        const first = await index('first', files);

        // A second checkout writes the same notes later, so each file has a different birthtime.
        await new Promise(resolve => setTimeout(resolve, 20));
        const second = await index('second', files);

        const unreleased = first.find(entry => entry.id === '13.4.0');

        expect(unreleased).toBeDefined();
        expect(Object.hasOwn(unreleased, 'date')).toBe(false);
        expect(second).toEqual(first)
    });

    test('a stamped note keeps its publishedAt date and the list stays ordered by version', async () => {
        const releases = await index('ordered', {
            'v12.9.0.md' : note({tagName: '12.9.0', publishedAt: '2026-10-01T09:00:00Z'}),
            'v13.3.0.md' : note({tagName: '13.3.0', publishedAt: '2026-11-01T10:00:00Z'}),
            'v13.10.0.md': note({tagName: '13.10.0'}),
            'v13.4.0.md' : note()
        });

        expect(releases.map(entry => entry.id)).toEqual(['v13', '13.10.0', '13.4.0', '13.3.0', 'v12', '12.9.0']);
        expect(releases.find(entry => entry.id === '13.3.0').date).toBe('2026-11-01T10:00:00Z');
        expect(releases.find(entry => entry.id === '12.9.0').date).toBe('2026-10-01T09:00:00Z');
        expect(Object.hasOwn(releases.find(entry => entry.id === '13.4.0'), 'date')).toBe(false)
    })
});
