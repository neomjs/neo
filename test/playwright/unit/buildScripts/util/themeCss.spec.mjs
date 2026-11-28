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
    });

    test('reads declarations of the Global.css the build emits, never text in a value, a condition or a descendant rule', () => {
        const [pkg, workspace] = ['pkg', 'workspace'].map(name => fs.mkdtempSync(path.join(os.tmpdir(), `theme-schemes-${name}-`))),
              write            = (root, css) => {
                  fs.mkdirSync(path.join(root, 'theme-fog'), {recursive: true});
                  fs.writeFileSync(path.join(root, 'theme-fog', 'Global.css'), css)
              },
              themes           = {'neo-theme-fog-ink': ['theme-fog'], 'neo-theme-fog-paper': ['theme-fog']};

        write(pkg, [
            '.neo-theme-fog-ink {--neo-color-scheme: dark}',
            '.neo-theme-fog-ink {--neo-font-family-mono: "--neo-color-scheme: light"}',
            '@media (prefers-contrast: more) {.neo-theme-fog-ink {--neo-color-scheme: light}}',
            '.neo-theme-fog-ink .neo-panel {--neo-color-scheme: light}',
            '@layer neo.theme {.neo-theme-fog-paper {--neo-color-scheme: light}}'
        ].join('\n'));

        expect(resolveThemeSchemes({cssRoots: [pkg], themes})).toEqual({'neo-theme-fog-ink': 'dark', 'neo-theme-fog-paper': 'light'});

        // A workspace sheet in the same folder replaces the package's, and declares no scheme
        write(workspace, '.neo-theme-fog-ink, .neo-theme-fog-paper {--neo-fog-ground: #000}');

        expect(resolveThemeSchemes({cssRoots: [pkg, workspace], themes})).toEqual({});

        [pkg, workspace].forEach(root => fs.rmSync(root, {recursive: true, force: true}))
    })
});
