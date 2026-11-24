import {setup} from '../../../../setup.mjs';

setup({
    appConfig: {
        name: 'PortalExampleModelTest'
    }
});

import {test, expect}                     from '@playwright/test';
import path                               from 'node:path';
import {fileURLToPath}                    from 'node:url';
import Neo                                from '../../../../../../src/Neo.mjs';
import * as core                          from '../../../../../../src/core/_export.mjs';
import Example                            from '../../../../../../apps/portal/model/Example.mjs';
import {EXAMPLES_DIR, readExampleCatalog} from '../../../../../../buildScripts/util/exampleCatalog.mjs';

/**
 * @summary Pins `Portal.model.Example.href` on published catalog records: a local link carries the catalog's theme
 * as one `?theme=`, a theme a record pins is replaced and never doubled, a hash stays behind the query, and an
 * external link stays as the record names it.
 *
 * A doubled parameter does not degrade quietly: `?theme=a?theme=b` reads as the theme `a?theme=b`, which matches no
 * configured theme, so the example falls back to its first theme and a dark card opens light.
 */
const
    directory = path.dirname(fileURLToPath(import.meta.url)),
    examples  = (await readExampleCatalog(path.resolve(directory, '../../../../../../', EXAMPLES_DIR))).records,
    record    = id => examples.find(example => example.id === id),
    baseUrl   = 'https://neomjs.com/',
    dark      = 'neo-theme-neo-dark',
    light     = 'neo-theme-neo-light';

test.describe('Portal.model.Example href', () => {
    test('adds the theme to a plain local link', () => {
        expect(record('grid-countries').urls.dist_prod).toBe('dist/production/examples/grid/countries/index.html');

        expect(Example.href(record('grid-countries'), 'dist_prod', {theme: dark}))
            .toBe(`${baseUrl}dist/production/examples/grid/countries/index.html?theme=${dark}`)
    });

    test('replaces a theme the record pins, never doubling it', () => {
        const pinned = record('scheduler-basic'),
              href   = Example.href(pinned, 'devmode', {theme: light});

        expect(pinned.urls.devmode).toContain(`?theme=${dark}`);
        expect(href).toBe(`${baseUrl}${pinned.urls.devmode.replace(dark, light)}`);
        expect(new URL(href).searchParams.getAll('theme')).toEqual([light])
    });

    test('keeps a hash behind the query', () => {
        expect(Example.href(record('shared-covid'), 'devmode', {theme: dark}))
            .toBe(`${baseUrl}apps/sharedcovid/index.html?theme=${dark}#mainview=table`)
    });

    test('leaves an external link as the record names it', () => {
        const external = record('devindex');

        ['devmode', 'dist_dev', 'dist_esm', 'dist_prod'].forEach(mode => {
            expect(external.urls[mode].startsWith('http'), mode).toBe(true);
            expect(Example.href(external, mode, {theme: dark}), mode).toBe(external.urls[mode])
        })
    });

    test('without a theme, keeps the record\'s link and honours baseUrl', () => {
        const pinned = record('scheduler-basic');

        expect(Example.href(pinned, 'devmode')).toBe(baseUrl + pinned.urls.devmode);
        expect(Example.href(record('grid-countries'), 'devmode', {baseUrl: 'http://localhost:8080/', theme: dark}))
            .toBe(`http://localhost:8080/examples/grid/countries/index.html?theme=${dark}`)
    });

    test('returns null when the mode cannot open the record', () => {
        expect(Example.href({urls: {devmode: 'examples/a/index.html'}}, 'dist_prod', {theme: dark})).toBeNull();
        expect(Example.href({}, 'devmode')).toBeNull()
    })
});

test.describe('Portal.model.Example matchesQuery', () => {
    test('matches mobile-qualified records on the mobile search term without tagging desktop-only records', () => {
        const mobileQualified = examples.filter(rec => rec.kind !== 'component' && rec.environments?.includes('Mobile'));

        expect(mobileQualified.length).toBeGreaterThan(0);

        for (const rec of mobileQualified) {
            expect(Example.matchesQuery(rec, ['mobile']), rec.id).toBe(true);
            expect(Example.matchesQuery(rec, ['mob']), rec.id).toBe(true)
        }

        expect(Example.matchesQuery({
            id          : 'desktop-only-probe',
            name        : 'Workstation',
            feature     : 'Multi-window workspace',
            lookFor     : 'Drag panels to a second display',
            environments: ['Desktop']
        }, ['mobile'])).toBe(false)
    })
});
