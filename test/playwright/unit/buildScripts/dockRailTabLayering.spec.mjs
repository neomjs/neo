import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {readdirSync}  from 'node:fs';
import {join}         from 'node:path';

/**
 * The layering invariant for the dock rail tab: the ENGINE paints it, apps supply values.
 *
 * Asserted on SCSS **source** rather than built CSS, so the guard holds without a build step and
 * fails in review rather than after a theme rebuild someone may not run.
 *
 * Why this is a guard and not a one-off: both apps independently discovered the same fix for the
 * generic button skin and each wrote it into its own stylesheet. That is the shape that recurs —
 * the next app to adopt the dock will hit the identical problem and reach for the identical local
 * patch. The rule below is what makes the engine the obvious place to look instead.
 *
 * @see https://github.com/neomjs/neo/issues/17522
 */
test.describe('dock rail tab — the engine paints it, apps only set values', () => {
    const
        APP_SCSS_ROOT = 'resources/scss/src/apps',
        ENGINE_RULE   = 'resources/scss/src/dashboard/Container.scss',
        // Paint the engine owns. `padding` is deliberately absent: rail orientation genuinely
        // differs per app (the workstation's horizontal rails need caption breathing room), so it
        // stays an app concern and this guard must not forbid it.
        ENGINE_PAINT  = ['background', 'background-color', 'border', 'box-shadow', 'color', 'min-width'];

    /** Every `.scss` under a root, recursively. */
    const scssFiles = (dir, out = []) => {
        for (const entry of readdirSync(dir, {withFileTypes: true})) {
            const path = join(dir, entry.name);

            entry.isDirectory() ? scssFiles(path, out) : entry.name.endsWith('.scss') && out.push(path)
        }

        return out
    };

    /**
     * Declarations inside a rail-tab selector block, excluding nested descendant blocks — a
     * `.neo-button-text { font-family }` inside is app VOICE and legitimate, while a
     * `font-family` on the tab itself is engine paint.
     */
    const railTabOwnDeclarations = source => {
        const found = [];

        for (const match of source.matchAll(/([^\n{}]*neo-dashboard-dock-rail-tab[^\n{}]*)\{/g)) {
            let depth = 1, i = match.index + match[0].length, body = '';

            while (i < source.length && depth > 0) {
                const ch = source[i];

                if (ch === '{') depth++;
                if (ch === '}') depth--;
                if (depth > 0) body += ch;
                i++
            }

            // Keep only depth-0 text. A regex like /[^{}]*\{[^{}]*\}/ looks equivalent and is not:
            // its leading `[^{}]*` swallows the declarations that PRECEDE a nested block, so a
            // `color` sitting above a `.neo-button-text { … }` disappears before inspection. That
            // version passed its own mutation, which is how this scan came to exist.
            let own = '', d = 0;

            for (const ch of body) {
                if (ch === '{') { d++; continue }
                if (ch === '}') { d--; continue }
                if (d === 0) own += ch
            }

            // A nested block leaves its selector behind at depth 0; a selector carries no colon
            // before the brace, so the property split below discards it naturally — except when it
            // trails a declaration, hence the newline-aware split.
            own = own.split('\n').map(line => line.trim()).filter(line => line.includes(':')).join(';');

            for (const decl of own.split(';')) {
                const property = decl.split(':')[0]?.trim();

                property && found.push({selector: match[1].trim(), property})
            }
        }

        return found
    };

    test('no application stylesheet paints a rail tab — it may only set tokens', () => {
        const offenders = [];

        for (const file of scssFiles(APP_SCSS_ROOT)) {
            for (const {selector, property} of railTabOwnDeclarations(readFileSync(file, 'utf8'))) {
                // A custom property IS the sanctioned mechanism; anything else is re-painting.
                if (!property.startsWith('--') && ENGINE_PAINT.includes(property)) {
                    offenders.push(`${file.replace(`${APP_SCSS_ROOT}/`, '')} → ${property} on ${selector}`)
                }
            }
        }

        expect(offenders, 'apps override tokens; they do not re-declare engine paint').toEqual([])
    });

    test('the engine declares that paint, reading tokens for the per-consumer values', () => {
        // Non-vacuity: without this, deleting the engine rule outright would satisfy the arm above
        // while leaving every consumer unpainted.
        const engine = readFileSync(ENGINE_RULE, 'utf8');

        for (const property of ['background', 'border', 'box-shadow', 'color', 'min-width']) {
            expect(engine, `engine must own ${property}`)
                .toMatch(new RegExp(`\\n\\s*${property}\\s*:`))
        }

        for (const token of ['--dock-rail-tab-background', '--dock-rail-tab-color',
                             '--dock-rail-tab-color-hover', '--dock-rail-tab-font-family']) {
            // The block-alignment linter pads declarations, so the colon is not adjacent.
            expect(engine, `${token} must be declared with a neutral default`)
                .toMatch(new RegExp(`${token}\\s*:`));
            expect(engine, `${token} must be consumed`).toContain(`var(${token})`)
        }
    });

    test('a consumer that sets no tokens still gets a legible tab', () => {
        // The neutral default must not be "invisible". `inherit` keeps the tab readable against
        // whatever ground the host provides — a palette value here would be the engine guessing.
        const engine = readFileSync(ENGINE_RULE, 'utf8');

        expect(engine).toMatch(/--dock-rail-tab-color\s*:\s*inherit/);
        expect(engine).toMatch(/--dock-rail-tab-font-family\s*:\s*inherit/);
        expect(engine, 'resting ground stays transparent — a rail tab is navigation, not an action')
            .toMatch(/--dock-rail-tab-background\s*:\s*transparent/)
    });
});
