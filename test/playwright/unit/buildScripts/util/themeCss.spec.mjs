import {test, expect}  from '@playwright/test';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

import {
    resolveThemeClassMap,
    resolveThemeSchemes
} from '../../../../../buildScripts/util/themeCss.mjs';

const cssRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../resources/css');

/**
 * @summary Unit suite for `buildScripts/util/themeCss.mjs`: each theme's declared light or dark scheme.
 */
test.describe('themeCss — resolveThemeSchemes', () => {
    test('reads the scheme each shipped theme declares for its own class', () => {
        const themes  = resolveThemeClassMap({cssRoots: [cssRoot], includeWorkspaceMap: false}),
              schemes = resolveThemeSchemes({cssRoots: [cssRoot], themes});

        expect(schemes).toMatchObject({
            'neo-theme-cyberpunk': 'dark',
            'neo-theme-dark'     : 'dark',
            'neo-theme-light'    : 'light',
            'neo-theme-neo-dark' : 'dark',
            'neo-theme-neo-light': 'light'
        })
    });

    test('resolves a theme no component names, per class in a shared folder, and leaves out a theme that declares none', () => {
        const root  = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-schemes-')),
              write = (folder, css) => {
                  fs.mkdirSync(path.join(root, folder), {recursive: true});
                  fs.writeFileSync(path.join(root, folder, 'Global.css'), css)
              };

        write('theme-ocean', [
            '/* .neo-theme-ocean-light {--neo-color-scheme: dark} is a comment, not a declaration */',
            '.neo-theme-ocean-light {--neo-color-scheme: light}',
            '.neo-theme-ocean-dark  {--neo-color-scheme: dark}',
            '.neo-theme-ocean-dark-contrast {--neo-color-scheme: light}'
        ].join('\n'));
        write('theme-plain', ':root .neo-theme-plain {--neo-plain-ground: #fff}');

        expect(resolveThemeSchemes({
            cssRoots: [root],
            themes  : {
                'neo-theme-ocean-dark' : ['theme-ocean'],
                'neo-theme-ocean-light': ['theme-ocean'],
                'neo-theme-plain'      : ['theme-plain']
            }
        })).toEqual({
            'neo-theme-ocean-dark' : 'dark',
            'neo-theme-ocean-light': 'light'
        });

        fs.rmSync(root, {recursive: true, force: true})
    })
});
