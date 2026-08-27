import {test, expect}              from '@playwright/test';
import {readFileSync, readdirSync} from 'node:fs';
import {join}                      from 'node:path';

/**
 * The layering invariant for the dock splitter: the ENGINE ships a discoverable affordance, apps
 * supply identity values.
 *
 * The splitter is the sharper half of the dock promotion. The engine previously had **no paint** —
 * `flex-shrink`, `position`, `touch-action`, `z-index` and a hit-target `::before` — so both apps
 * owned the entire visual language and a consumer that adopted the dock got an *invisible* drag
 * target. That is a reported defect, not a neutral default, and it is why the engine's floor here
 * is discoverability rather than blankness.
 *
 * Three layers, and the middle one is the whole design: structure (engine, untokened) → affordance
 * floor (engine token DEFAULTS) → identity (app token values). The pill ring and outer glow live in
 * the third, not the second: they were born reading an app's accent token, so shipping them as the
 * engine default would push one consumer's identity onto every other.
 *
 * Asserted on SCSS source so the guard holds without a build step.
 *
 * @see https://github.com/neomjs/neo/issues/17241
 */
test.describe('dock splitter — the engine ships the affordance, apps set identity', () => {
    const
        APP_SCSS_ROOT = 'resources/scss/src/apps',
        ENGINE_RULE   = 'resources/scss/src/dashboard/Container.scss';

    /**
     * The only non-custom properties an application may declare on a splitter surface, each with
     * the deviation it documents.
     *
     * An ALLOWLIST, not a denylist, and that inversion is the point. The first version named five
     * paint properties — `background`, `background-color`, `border-radius`, `box-shadow`,
     * `opacity` — so `filter`, `outline`, `color` and every property nobody had thought of yet
     * could re-enter undetected. A guard that only catches what its author enumerated cannot
     * catch a regression; it can only confirm a memory.
     */
    const STRUCTURAL_DEVIATIONS = {
        // FleetCockpit's vessel-narrow container query stacks a horizontal split, which makes the
        // splitter's drag axis wrong — so it leaves the flow. Layout, not paint.
        display: 'takes the splitter out of flow when its drag axis no longer applies'
    };

    const scssFiles = (dir, out = []) => {
        for (const entry of readdirSync(dir, {withFileTypes: true})) {
            const path = join(dir, entry.name);

            entry.isDirectory() ? scssFiles(path, out) : entry.name.endsWith('.scss') && out.push(path)
        }

        return out
    };

    const withoutComments = source => source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

    /**
     * The `{ selector, body }` pairs at one nesting level, brace-matched rather than regex-matched.
     *
     * `/[^{}]*\{[^{}]*\}/` looks equivalent and swallows the declarations PRECEDING a nested
     * block, so a `background` sitting above an `&:hover { … }` disappears before inspection — a
     * guard written that way passes its own mutation.
     */
    const blocksIn = source => {
        const blocks = [];

        let i = 0, selectorStart = 0;

        while (i < source.length) {
            const ch = source[i];

            if (ch === '{') {
                let depth = 1, j = i + 1;

                while (j < source.length && depth > 0) {
                    if (source[j] === '{') depth++;
                    if (source[j] === '}') depth--;
                    j++
                }

                blocks.push({
                    selector: source.slice(selectorStart, i).trim(),
                    body    : source.slice(i + 1, j - 1),
                    start   : selectorStart,
                    end     : j
                });

                i = selectorStart = j;
                continue
            }

            if (ch === '}' || ch === ';') selectorStart = i + 1;
            i++
        }

        return blocks
    };

    /**
     * The property names declared directly in `body`, with nested blocks excised BY INDEX.
     *
     * Reconstructing `selector{body}` to string-replace it does not work: the source carries
     * whitespace between the selector and its brace, the replace silently misses, and the nested
     * block's own text is then read as declarations of the parent.
     *
     * Split on `;` rather than newlines — that is the declaration separator, so a value wrapped
     * across lines stays one declaration instead of becoming a phantom second one.
     */
    const declarationsOf = body => {
        let own = '', cursor = 0;

        for (const block of blocksIn(body)) {
            own   += body.slice(cursor, block.start);
            cursor = block.end
        }

        return (own + body.slice(cursor))
            .split(';')
            .map(chunk => chunk.split(':')[0].trim())
            .filter(property => /^(--)?[a-z][a-z\d-]*$/i.test(property))
    };

    const isSplitterSelector = selector => selector.includes('neo-dashboard-dock-splitter');

    /**
     * A nested block that is still the SAME element: `&:hover`, `&::after`, `&:active::after`.
     *
     * `&:active::after` is a state of the splitter itself, not a descendant, and the first version
     * of this census discarded every nested block wholesale — so an app could paint the handle in
     * its active state while the "no app paint" arm stayed green. That exact shape shipped in
     * `Workspace.scss` and CI called it clean. A part carrying a descendant combinator (whitespace,
     * `>`, `+`, `~`) addresses a different element and correctly stays out of scope.
     */
    const isSelfState = selector => selector.length > 0 && selector.split(',').every(part => {
        const trimmed = part.trim();

        return trimmed.startsWith('&') && !/[\s>+~]/.test(trimmed.slice(1))
    });

    /** Every property declared on the splitter's own surface, own block and self-states alike. */
    const surfaceDeclarations = (body, selector, found = []) => {
        for (const property of declarationsOf(body)) found.push({selector, property});

        for (const nested of blocksIn(body)) {
            isSelfState(nested.selector) &&
                surfaceDeclarations(nested.body, `${selector} ${nested.selector}`, found)
        }

        return found
    };

    /** Splitter surfaces at any depth, so an at-rule or ancestor block never hides one. */
    const splitterSurfaces = (source, found = []) => {
        for (const {selector, body} of blocksIn(source)) {
            isSplitterSelector(selector) ? surfaceDeclarations(body, selector, found)
                                         : splitterSurfaces(body, found);
        }

        return found
    };

    const offendersIn = source => splitterSurfaces(withoutComments(source))
        .filter(({property}) => !property.startsWith('--') && !(property in STRUCTURAL_DEVIATIONS))
        .map(({selector, property}) => `${property} on ${selector}`);

    test('no application stylesheet paints a splitter — it may only set tokens', () => {
        const offenders = [];

        for (const file of scssFiles(APP_SCSS_ROOT)) {
            for (const offender of offendersIn(readFileSync(file, 'utf8'))) {
                offenders.push(`${file.replace(`${APP_SCSS_ROOT}/`, '')} → ${offender}`)
            }
        }

        expect(offenders, 'the splitter affordance is engine capability; apps set values').toEqual([])
    });

    test('the census SEES nested self-state paint — the instrument proves itself', () => {
        // The arm above means nothing unless a violation would actually redden it. This is the
        // exact shape @neo-gpt found live at `Workspace.scss:50` while the guard passed.
        expect(offendersIn(`
            .neo-dashboard-dock-splitter {
                --dock-splitter-background: red;

                &:active::after {
                    background: var(--workstation-signal);
                }
            }`), 'nested active paint is app-layer paint')
            .toEqual(['background on .neo-dashboard-dock-splitter &:active::after']);

        // The paired control, without which the rule above could simply be "flag everything
        // nested": a real descendant is a different element and stays out of scope.
        expect(offendersIn(`
            .neo-dashboard-dock-splitter {
                .neo-button { background: red }
            }`), 'a descendant element is not the splitter surface').toEqual([]);

        // And a declaration sitting ABOVE a nested block still survives the walk.
        expect(offendersIn(`
            .neo-dashboard-dock-splitter {
                outline: 1px solid red;

                &:hover { --dock-splitter-ring: none }
            }`), 'a declaration preceding a nested block is not swallowed')
            .toEqual(['outline on .neo-dashboard-dock-splitter']);
    });

    test('an unlisted property is an offence even when nobody enumerated it', () => {
        expect(offendersIn('.neo-dashboard-dock-splitter { filter: blur(2px) }'), 'filter was on no denylist')
            .toEqual(['filter on .neo-dashboard-dock-splitter']);
        expect(offendersIn('.neo-dashboard-dock-splitter { color: red }'), 'nor was color')
            .toEqual(['color on .neo-dashboard-dock-splitter']);

        // Custom properties are the sanctioned channel, and the one documented structural
        // deviation stays legal — an allowlist that rejected it would just be a broken guard.
        expect(offendersIn('.neo-dashboard-dock-splitter { --dock-splitter-radius: 0 }')).toEqual([]);
        expect(offendersIn('.neo-dashboard-dock-splitter { display: none }')).toEqual([]);
    });

    test('a splitter nested under an at-rule is still censused', () => {
        // A nested consumer rule must not evade the census merely by living inside an at-rule.
        expect(offendersIn(`
            @container consumer-cockpit (max-width: 570px) {
                .neo-dashboard-dock-split-horizontal {
                    > .neo-dashboard-dock-splitter-horizontal { box-shadow: none }
                }
            }`), 'depth does not confer immunity')
            .toEqual(['box-shadow on > .neo-dashboard-dock-splitter-horizontal']);
    });

    test('the engine floor is DISCOVERABLE with no app tokens set', () => {
        // The criterion option 2 failed. A consumer that overrides nothing must get a findable
        // target, not a transparent one. `currentColor` mixes rather than a literal grey: the engine
        // cannot know the host palette, and a guess reads wrong on half of them.
        const engine = readFileSync(ENGINE_RULE, 'utf8');

        expect(engine, 'a visible band by default')
            .toMatch(/--dock-splitter-background\s*:\s*color-mix[^;]*currentColor/);
        expect(engine, 'a real grab handle by default')
            .toMatch(/--dock-splitter-handle-size\s*:\s*36px/);
        expect(engine, 'the handle is painted by default')
            .toMatch(/--dock-splitter-handle-color\s*:\s*color-mix[^;]*currentColor/);
    });

    test('identity slots ship EMPTY — the engine never fills them', () => {
        // Ring and glow are consumer signal-language. Defaulting them to a value would make one
        // app's identity every consumer's default, which is this promotion's own defect inverted.
        const engine = readFileSync(ENGINE_RULE, 'utf8');

        for (const slot of ['--dock-splitter-ring', '--dock-splitter-ring-hover',
                            '--dock-splitter-ring-active', '--dock-splitter-handle-glow-hover']) {
            expect(engine, `${slot} is an identity slot and must default to none`)
                .toMatch(new RegExp(`${slot}\\s*:\\s*none`))
        }
    });

    test('the promoted rule carries no !important', () => {
        // The workstation active state used `opacity: 1 !important` — something was being fought.
        // The engine owns this selector at its own specificity, so the conflict does not exist at
        // this layer; carrying the escape hatch across would launder a specificity defect into the
        // engine under a no-visual-change banner.
        const engine = readFileSync(ENGINE_RULE, 'utf8')
            .split('\n')
            .filter(line => !line.trim().startsWith('//'))
            .join('\n');

        expect(engine, 'the engine default must never need !important').not.toContain('!important')
    });
});
