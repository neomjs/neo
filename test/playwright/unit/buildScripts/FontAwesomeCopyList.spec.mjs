import {test, expect}          from '@playwright/test';
import fs                      from 'node:fs';
import path                    from 'node:path';
import {FONTAWESOME_COPY_LIST} from '../../../../buildScripts/webpack/fontAwesomeCopyList.mjs';

/**
 * The dist builds copy only FONTAWESOME_COPY_LIST out of `@fortawesome/fontawesome-free`. This spec reads the
 * installed `all.min.css` and fails when it references a file the list does not cover, so a Font Awesome upgrade
 * that adds a font file fails here instead of shipping broken icons.
 */
const packageRoot = path.resolve(process.cwd(), 'node_modules/@fortawesome/fontawesome-free'),
      stylesheet  = path.join(packageRoot, 'css/all.min.css');

/** Relative package paths of every `url(...)` in the stylesheet (data URIs and fragments ignored). */
function stylesheetReferences() {
    const css = fs.readFileSync(stylesheet, 'utf8');

    return [...css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)]
        .map(match => match[1].split(/[?#]/)[0])
        .filter(url => url && !url.startsWith('data:'))
        .map(url => path.posix.normalize(path.posix.join('css', url)));
}

/** Whether a relative package path is a listed file or sits inside a listed folder. */
function isCovered(relativePath) {
    return FONTAWESOME_COPY_LIST.some(item => relativePath === item || relativePath.startsWith(item + '/'));
}

test.describe('buildScripts/webpack — Font Awesome copy list', () => {
    test('the list keeps the stylesheet and the licence', () => {
        expect(FONTAWESOME_COPY_LIST).toContain('css/all.min.css');
        expect(FONTAWESOME_COPY_LIST).toContain('LICENSE.txt');
    });

    test('every listed path exists in the installed package', () => {
        for (const item of FONTAWESOME_COPY_LIST) {
            expect(fs.existsSync(path.join(packageRoot, item)), item).toBe(true);
        }
    });

    test('every url(...) in all.min.css is covered by the list and exists', () => {
        const references = stylesheetReferences();

        expect(references.length).toBeGreaterThan(0);

        for (const reference of references) {
            expect(isCovered(reference), `${reference} is not in FONTAWESOME_COPY_LIST`).toBe(true);
            expect(fs.existsSync(path.join(packageRoot, reference)), `${reference} is missing`).toBe(true);
        }
    });
});
