import {test, expect}              from '@playwright/test';
import {readFileSync, readdirSync} from 'node:fs';
import {join}                      from 'node:path';
import * as sass                   from 'sass';

/**
 * The layering invariant for the dock rail tab: the ENGINE paints it, apps supply values.
 *
 * Why this is a guard and not a one-off: both apps independently discovered the same fix for the
 * generic button skin and each wrote it into its own stylesheet. That is the shape that recurs —
 * the next app to adopt the dock will hit the identical problem and reach for the identical local
 * patch. The rule below is what makes the engine the obvious place to look instead.
 *
 * **The first version of this file asserted on SCSS source only, and that was not enough.** Source
 * text cannot see the cascade. Moving a declaration to the correct owner does not preserve its
 * winning specificity, and the promotion this guard protects did exactly that: both apps had been
 * carrying a higher-specificity `min-width: 0` to escape a tie with the theme's 48px button floor,
 * and lifting the paint engine-side without also outranking the theme would have handed every
 * consumer the empty-pill regression those app rules existed to prevent. @neo-gpt-emmy caught it
 * in review on [PR 17524](https://github.com/neomjs/neo/pull/17524); the compiled arm below is
 * the oracle that would have caught it here.
 *
 * The compilation is done in-process rather than read from `dist/`: CI never runs `build-themes`,
 * so a `dist/`-reading guard would find no files, match nothing, and report green.
 *
 * @see https://github.com/neomjs/neo/issues/17522
 */
test.describe('dock rail tab — the engine paints it, apps only set values', () => {
    const
        SCSS_ROOT   = 'resources/scss',
        ENGINE_FILE = 'resources/scss/src/dashboard/Container.scss',
        // Every root an application stylesheet can live under. The first version scanned only
        // `src/apps` and would not have seen a rail tab repainted from `theme-neo-dark/apps`.
        APP_ROOTS   = ['resources/scss/src/apps',      'resources/scss/theme-dark/apps',
                       'resources/scss/theme-light/apps', 'resources/scss/theme-neo-dark/apps',
                       'resources/scss/theme-neo-light/apps'],
        TOKENS      = ['--dock-rail-tab-background', '--dock-rail-tab-background-hover',
                       '--dock-rail-tab-color',      '--dock-rail-tab-color-hover',
                       '--dock-rail-tab-font-family'],
        // Paint the engine owns. `padding` is deliberately absent from the app denylist: rail
        // orientation genuinely differs per app (the workstation's horizontal rails need caption
        // breathing room), so it stays an app concern and this guard must not forbid it.
        ENGINE_PAINT = ['background', 'background-color', 'border', 'box-shadow', 'color',
                        'font-family', 'min-width', 'transition'],
        // Longhands collapse into the shorthand that would override them. Without this the guard
        // compares `background` against `background-color` as if they were unrelated properties.
        FAMILY = {
            'background-color': 'background', 'background-image': 'background',
            'border-color'    : 'border', 'border-style': 'border', 'border-width': 'border',
            'font'            : 'font-family', 'transition-property': 'transition'
        },
        // Classes the tab element itself carries, and the ancestors it sits under.
        OWN_CLASSES = ['neo-button', 'neo-dashboard-dock-rail-tab'],
        ANCESTORS   = ['neo-dashboard', 'neo-theme-neo-dark', 'neo-theme-neo-light',
                       'neo-theme-dark', 'neo-theme-light',
                       'neo-dashboard-dock-edge-rail-left',  'neo-dashboard-dock-edge-rail-right',
                       'neo-dashboard-dock-edge-rail-top',   'neo-dashboard-dock-edge-rail-bottom'];

    /** Every `.scss` under a root, recursively. */
    const scssFiles = (dir, out = []) => {
        for (const entry of readdirSync(dir, {withFileTypes: true})) {
            const path = join(dir, entry.name);

            entry.isDirectory() ? scssFiles(path, out) : entry.name.endsWith('.scss') && out.push(path)
        }

        return out
    };

    /** [ids, classes, types] for the flat selectors Sass emits here. */
    const specificity = selector => {
        const s = selector.replace(/::[\w-]+/g, '');

        return [
            (s.match(/#[\w-]+/g)                   || []).length,
            (s.match(/\.[\w-]+/g)                  || []).length +
            (s.match(/:(?!:)[\w-]+/g)              || []).length +
            (s.match(/\[[^\]]+\]/g)                || []).length,
            (s.match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) || []).length
        ]
    };

    const rank   = spec => spec[0] * 10000 + spec[1] * 100 + spec[2],
          show   = spec => `(${spec.join(',')})`,
          family = property => FAMILY[property] || property;

    /**
     * Could this selector's rightmost compound match a rail tab, with every ancestor reachable?
     * Descendant targets (`… .neo-button-text`) are excluded — they are a different element.
     */
    const canReachRailTab = selector => {
        const parts   = selector.trim().split(/\s*[>\s+~]\s*/).filter(Boolean),
              last    = parts.at(-1),
              lastCls = (last.match(/\.[\w-]+/g) || []).map(c => c.slice(1));

        if (!lastCls.length || !lastCls.every(c => OWN_CLASSES.includes(c))) return false;
        if (/::(?:before|after)/.test(last))                                 return false;

        return parts.slice(0, -1).every(part => {
            if (part === ':root') return true;

            const cls = (part.match(/\.[\w-]+/g) || []).map(c => c.slice(1));

            return cls.length > 0 && cls.every(c => OWN_CLASSES.includes(c) || ANCESTORS.includes(c))
        })
    };

    /** Compile every stylesheet that mentions a button, and collect the rules reaching a rail tab. */
    const reachingRules = () => {
        const rules = [];

        for (const file of scssFiles(SCSS_ROOT)) {
            const source = readFileSync(file, 'utf8');

            if (!/neo-button|neo-dashboard-dock-rail-tab/.test(source)) continue;

            const css = sass.compile(file, {
                silenceDeprecations: ['import', 'global-builtin', 'color-functions', 'slash-div']
            }).css;

            for (const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
                for (const selector of block[1].split(',').map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean)) {
                    if (!canReachRailTab(selector)) continue;

                    for (const declaration of block[2].split(';')) {
                        const property = declaration.split(':')[0]?.trim();

                        property && !property.startsWith('--') && rules.push({
                            file, selector, property, family: family(property),
                            spec: specificity(selector), isEngine: file === ENGINE_FILE
                        })
                    }
                }
            }
        }

        return rules
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

            own = own.split('\n').map(line => line.trim()).filter(line => line.includes(':')).join(';');

            for (const decl of own.split(';')) {
                const property = decl.split(':')[0]?.trim();

                property && found.push({selector: match[1].trim(), property})
            }
        }

        return found
    };

    test('the engine outranks every other rule that can reach a rail tab', () => {
        const rules  = reachingRules(),
              engine = rules.filter(r => r.isEngine),
              others = rules.filter(r => !r.isEngine);

        // Non-vacuity, both directions. A selector bug that matched nothing would otherwise sail
        // through this arm reporting a clean cascade, and a competitor list of zero would make the
        // comparison below trivially true.
        expect(engine.length, 'the engine rule must be found at all').toBeGreaterThan(0);
        expect(others.length, 'competitors must be found — a census of one proves nothing')
            .toBeGreaterThan(0);
        expect(others.some(r => r.family === 'min-width'),
            "the theme's button min-width floor is the competitor this guard exists for")
            .toBe(true);

        // The engine's own resting rule is the floor every competitor must sit below.
        const engineBase = {};

        for (const rule of engine) {
            const current = engineBase[rule.family];

            if (!current || rank(rule.spec) < rank(current)) engineBase[rule.family] = rule.spec
        }

        const losses = [];

        for (const rule of others) {
            const base = engineBase[rule.family];

            if (base && rank(rule.spec) >= rank(base)) {
                losses.push(
                    `${rule.family}: ${rule.selector} ${show(rule.spec)} ties or beats the engine ` +
                    `${show(base)}  [${rule.file}]`
                )
            }
        }

        // An equal-specificity load-order bet is a loss, not a draw: Neo emits one CSS file per
        // source file and does not pin their order, so a tie is a regression waiting for a
        // rebuild to surface it.
        expect(losses, 'every engine-owned property must win outright').toEqual([])
    });

    test('no application stylesheet paints a rail tab — it may only set tokens', () => {
        const offenders = [];

        for (const root of APP_ROOTS) {
            for (const file of scssFiles(root)) {
                for (const {selector, property} of railTabOwnDeclarations(readFileSync(file, 'utf8'))) {
                    // A custom property IS the sanctioned mechanism; anything else is re-painting.
                    if (!property.startsWith('--') && ENGINE_PAINT.includes(property)) {
                        offenders.push(`${file} → ${property} on ${selector}`)
                    }
                }
            }
        }

        expect(offenders, 'apps override tokens; they do not re-declare engine paint').toEqual([])
    });

    test('the engine declares that paint, reading tokens for the per-consumer values', () => {
        // Non-vacuity: without this, deleting the engine rule outright would satisfy the arm above
        // while leaving every consumer unpainted.
        const engine = readFileSync(ENGINE_FILE, 'utf8');

        for (const property of ['background', 'border', 'box-shadow', 'color', 'min-width']) {
            expect(engine, `engine must own ${property}`)
                .toMatch(new RegExp(`\\n\\s*${property}\\s*:`))
        }

        for (const token of TOKENS) {
            // The block-alignment linter pads declarations, so the colon is not adjacent.
            expect(engine, `${token} must be declared with a neutral default`)
                .toMatch(new RegExp(`${token}\\s*:`));
            expect(engine, `${token} must be consumed`).toContain(`var(${token})`)
        }
    });

    test('a consumer that sets no tokens still gets a legible tab', () => {
        // The neutral default must not be "invisible". `inherit` keeps the tab readable against
        // whatever ground the host provides — a palette value here would be the engine guessing.
        const engine = readFileSync(ENGINE_FILE, 'utf8');

        expect(engine).toMatch(/--dock-rail-tab-color\s*:\s*inherit/);
        expect(engine).toMatch(/--dock-rail-tab-font-family\s*:\s*inherit/);
        expect(engine, 'resting ground stays transparent — a rail tab is navigation, not an action')
            .toMatch(/--dock-rail-tab-background\s*:\s*transparent/)
    });

    test('an app token value cannot escape the app that sets it', () => {
        // "Only that app changes" is the property the token layering exists to buy. It holds
        // because every app-side declaration sits under that app's own root class — assert that,
        // rather than the weaker fact that the declarations are custom properties.
        const escapees = [];

        for (const root of APP_ROOTS) {
            for (const file of scssFiles(root)) {
                const css = sass.compile(file, {
                    silenceDeprecations: ['import', 'global-builtin', 'color-functions', 'slash-div']
                }).css;

                for (const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
                    if (!TOKENS.some(t => block[2].includes(`${t}:`))) continue;

                    for (const selector of block[1].split(',').map(s => s.trim())) {
                        // `:root`-only or bare-element scoping would leak an app's identity into
                        // every other consumer sharing the document.
                        const classes = (selector.match(/\.[\w-]+/g) || []).map(c => c.slice(1)),
                              scoped  = classes.some(c => !OWN_CLASSES.includes(c) && !ANCESTORS.includes(c));

                        scoped || escapees.push(`${file} → ${selector}`)
                    }
                }
            }
        }

        expect(escapees, 'app token values must sit under an app-owned ancestor').toEqual([])
    });
});
