import {test, expect}  from '@playwright/test';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

const
    __filename = fileURLToPath(import.meta.url),
    __dirname  = path.dirname(__filename),
    modulePath = path.resolve(__dirname, '../../../../../buildScripts/util/check-theme-surfaces.mjs');

/**
 * check-theme-surfaces.mjs — Workstation theme contract.
 *
 * The guard runs in its own workflow and via `npm run check-theme-surfaces`, and it carried no unit
 * coverage at all between `c623b2f63c` and this file. The spec deleted there is deliberately NOT
 * restored: it described a 734-line guard that owned five checks across the Institution token
 * language, and the Institution product took four fifths of that with it. What survives is a
 * 217-line Engine guard over one surface, so this covers the guard that exists rather than the one
 * that was deleted.
 *
 * Every case drives the real `collectThemeSurfaceFailures` through its injected `surface` argument
 * against SCSS written to a temp tree. Nothing here reads the repository's own theme files: a guard
 * asserted against the tree it guards passes for as long as the tree is clean and stops testing the
 * guard the moment someone fixes the tree.
 *
 * The load-bearing case is `an alias whose referent differs is not byte-identical`. Parity's whole
 * job is catching a skin that re-copied the other skin's values, and the cheap version of that check
 * — string equality — condemns the correct idiom of pointing both skins at one alias name. A guard
 * that fires on the right answer gets switched off, so the escape hatch is the part worth pinning.
 */
test.describe('check-theme-surfaces.mjs — Workstation theme contract (#17922)', () => {
    let collectThemeSurfaceFailures, tmpRoot;

    test.beforeAll(async () => {
        ({collectThemeSurfaceFailures} = await import(modulePath))
    });

    test.beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-surfaces-'))
    });

    test.afterEach(() => {
        tmpRoot && fs.rmSync(tmpRoot, {force: true, recursive: true})
    });

    /**
     * Writes one fixture surface and returns the shape the guard accepts.
     * `views` maps a file name below the view root to its SCSS body.
     */
    const surface = ({dark = '', light = '', modeInvariant = [], views = {}} = {}) => {
            const
                darkPath  = path.join(tmpRoot, 'dark.scss'),
                lightPath = path.join(tmpRoot, 'light.scss'),
                viewDir   = path.join(tmpRoot, 'views');

            fs.writeFileSync(darkPath,  dark,  'utf8');
            fs.writeFileSync(lightPath, light, 'utf8');
            fs.mkdirSync(viewDir, {recursive: true});

            for (const [name, body] of Object.entries(views)) {
                const file = path.join(viewDir, name);

                fs.mkdirSync(path.dirname(file), {recursive: true});
                fs.writeFileSync(file, body, 'utf8')
            }

            return {darkPath, lightPath, modeInvariant: new Set(modeInvariant), viewDir}
        },

        // A surface that satisfies all three checks at once, so every negative case below differs
        // from a PASSING baseline by exactly the defect it names.
        clean = {
            dark : ':root {\n    --workstation-bg: #101014;\n    --workstation-ink: #f5f5f7;\n}\n',
            light: ':root {\n    --workstation-bg: #ffffff;\n    --workstation-ink: #101014;\n}\n',
            views: {'Viewport.scss': '.neo-workstation {\n    background: var(--workstation-bg);\n    color: var(--workstation-ink);\n}\n'}
        };

    test('a surface satisfying parity, token-only and completeness reports nothing', () => {
        // Non-vacuity: this fixture defines tokens, consumes them, and differs per skin. A fixture
        // that merely omitted everything would also report nothing, and would prove nothing.
        expect(collectThemeSurfaceFailures(surface(clean))).toEqual([])
    });

    test.describe('[surface]', () => {
        test('two empty skins fail closed rather than reporting a clean surface', () => {
            const failures = collectThemeSurfaceFailures(surface({dark: '', light: '', views: {}}));

            expect(failures.some(f => f.startsWith('[surface]')), failures.join('\n')).toBe(true)
        })
    });

    test.describe('[parity]', () => {
        test('a token defined only in the dark skin is reported against the light skin', () => {
            const failures = collectThemeSurfaceFailures(surface({
                ...clean,
                light: ':root {\n    --workstation-ink: #101014;\n}\n'
            }));

            expect(failures).toContain('[parity] --workstation-bg present in dark skin, missing in light skin')
        });

        test('a token defined only in the light skin is reported against the dark skin', () => {
            const failures = collectThemeSurfaceFailures(surface({
                ...clean,
                dark: ':root {\n    --workstation-ink: #f5f5f7;\n}\n'
            }));

            expect(failures).toContain('[parity] --workstation-bg present in light skin, missing in dark skin')
        });

        test('a byte-identical color token is the skin-copy defect and fails', () => {
            const failures = collectThemeSurfaceFailures(surface({
                ...clean,
                light: ':root {\n    --workstation-bg: #101014;\n    --workstation-ink: #101014;\n}\n'
            }));

            expect(failures).toContain('[parity] --workstation-bg is byte-identical dark↔light (#101014)')
        });

        test('a mode-invariant token is byte-identical by contract and exempt', () => {
            const shared = '    --workstation-font-mono: monospace;\n';

            const failures = collectThemeSurfaceFailures(surface({
                dark         : ':root {\n    --workstation-bg: #101014;\n' + shared + '}\n',
                light        : ':root {\n    --workstation-bg: #ffffff;\n' + shared + '}\n',
                modeInvariant: ['--workstation-font-mono'],
                views        : clean.views
            }));

            expect(failures.filter(f => f.includes('--workstation-font-mono'))).toEqual([])
        });

        test('an alias whose referent differs is not byte-identical', () => {
            // Both skins say `var(--workstation-base)`. String equality calls that a copied skin;
            // it is the correct idiom, and the guard must resolve through the alias to see it.
            const alias = '    --workstation-panel: var(--workstation-base);\n';

            const failures = collectThemeSurfaceFailures(surface({
                dark : ':root {\n    --workstation-base: #101014;\n' + alias + '}\n',
                light: ':root {\n    --workstation-base: #ffffff;\n' + alias + '}\n',
                views: {'Viewport.scss': '.neo-workstation {\n    background: var(--workstation-panel);\n}\n'}
            }));

            expect(failures).toEqual([])
        });

        test('an alias whose referent is identical in both skins still fails', () => {
            // The falsifier for the case above: same alias shape, referent no longer differing.
            const alias = '    --workstation-panel: var(--workstation-base);\n',
                  body  = ':root {\n    --workstation-base: #101014;\n' + alias + '}\n';

            const failures = collectThemeSurfaceFailures(surface({
                dark : body,
                light: body,
                views: {'Viewport.scss': '.neo-workstation {\n    background: var(--workstation-panel);\n}\n'}
            }));

            expect(failures.some(f => f.includes('--workstation-panel') && f.includes('byte-identical'))).toBe(true)
        })
    });

    test.describe('[token-only]', () => {
        const withView = body => collectThemeSurfaceFailures(surface({...clean, views: {'Viewport.scss': body}})),
              tokenOnly = failures => failures.filter(f => f.startsWith('[token-only]'));

        test('a bare hex literal is rejected and carries file:line', () => {
            const failures = tokenOnly(withView('.neo-workstation {\n    color: #ff0000;\n}\n'));

            expect(failures.length).toBe(1);
            expect(failures[0]).toContain('Viewport.scss:2');
            expect(failures[0]).toContain('#ff0000')
        });

        test('a CSS color function is rejected', () => {
            expect(tokenOnly(withView('.a {\n    color: oklch(0.7 0.1 200);\n}\n')).length).toBe(1)
        });

        test('a named color is rejected', () => {
            expect(tokenOnly(withView('.a {\n    border-color: rebeccapurple;\n}\n')).length).toBe(1)
        });

        test('a literal inside a var() fallback is the sanctioned defensive idiom and is allowed', () => {
            expect(tokenOnly(withView('.a {\n    color: var(--workstation-ink, #101014);\n}\n'))).toEqual([])
        });

        test('a custom-property declaration may hold a literal — that is the token layer itself', () => {
            expect(tokenOnly(withView('.a {\n    --workstation-local: #101014;\n    color: var(--workstation-local);\n}\n'))).toEqual([])
        });

        test('a color inside a line comment is not a declaration', () => {
            expect(tokenOnly(withView('.a {\n    // was #ff0000 before the token layer\n    color: var(--workstation-ink);\n}\n'))).toEqual([])
        });

        test('a color inside a block comment is not a declaration', () => {
            expect(tokenOnly(withView('.a {\n    /* #ff0000 */\n    color: var(--workstation-ink);\n}\n'))).toEqual([])
        });

        test('a color word inside a quoted string is content, not a color', () => {
            expect(tokenOnly(withView('.a {\n    content: "red";\n}\n'))).toEqual([])
        });

        test('every SCSS file below the view root is walked, not just the top level', () => {
            const failures = tokenOnly(collectThemeSurfaceFailures(surface({
                ...clean,
                views: {'nested/deep/Panel.scss': '.a {\n    color: #ff0000;\n}\n'}
            })));

            expect(failures.length).toBe(1);
            expect(failures[0]).toContain('Panel.scss:2')
        })
    });

    test.describe('[completeness]', () => {
        test('a consumed token undefined in either skin is reported for both', () => {
            const failures = collectThemeSurfaceFailures(surface({
                ...clean,
                views: {'Viewport.scss': '.a {\n    color: var(--workstation-missing);\n}\n'}
            }));

            expect(failures).toContain('[completeness] --workstation-missing is undefined in the dark skin');
            expect(failures).toContain('[completeness] --workstation-missing is undefined in the light skin')
        });

        test('a token defined in only one skin is reported against the other', () => {
            const failures = collectThemeSurfaceFailures(surface({
                dark : ':root {\n    --workstation-bg: #101014;\n    --workstation-only: #202024;\n}\n',
                light: ':root {\n    --workstation-bg: #ffffff;\n}\n',
                views: {'Viewport.scss': '.a {\n    background: var(--workstation-only);\n}\n'}
            }));

            expect(failures).toContain('[completeness] --workstation-only is undefined in the light skin')
        });

        test('a component-local token is defined by its own view and exempt', () => {
            const failures = collectThemeSurfaceFailures(surface({
                ...clean,
                views: {'Viewport.scss': '.a {\n    --workstation-local: 4px;\n    padding: var(--workstation-local);\n}\n'}
            }));

            expect(failures.filter(f => f.startsWith('[completeness]'))).toEqual([])
        })
    })
});
