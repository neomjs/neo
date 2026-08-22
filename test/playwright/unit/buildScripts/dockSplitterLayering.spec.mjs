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
        ENGINE_RULE   = 'resources/scss/src/dashboard/Container.scss',
        // `padding` and per-axis geometry are absent on purpose: rail orientation is an app concern.
        SPLITTER_PAINT = ['background', 'background-color', 'border-radius', 'box-shadow', 'opacity'];

    const scssFiles = (dir, out = []) => {
        for (const entry of readdirSync(dir, {withFileTypes: true})) {
            const path = join(dir, entry.name);

            entry.isDirectory() ? scssFiles(path, out) : entry.name.endsWith('.scss') && out.push(path)
        }

        return out
    };

    /**
     * Declarations belonging to a splitter block itself, excluding nested descendant blocks.
     *
     * A depth scan rather than a regex: `/[^{}]*\{[^{}]*\}/` looks equivalent and swallows the
     * declarations PRECEDING a nested block, so a `background` sitting above an `&:hover { … }`
     * disappears before inspection — a guard written that way passes its own mutation.
     */
    const splitterOwnDeclarations = source => {
        const found = [];

        for (const match of source.matchAll(/([^\n{}]*neo-dashboard-dock-splitter[^\n{}]*)\{/g)) {
            let depth = 1, i = match.index + match[0].length, body = '';

            while (i < source.length && depth > 0) {
                const ch = source[i];

                if (ch === '{') depth++;
                if (ch === '}') depth--;
                if (depth > 0) body += ch;
                i++
            }

            let own = '', d = 0;

            for (const ch of body) {
                if (ch === '{') { d++; continue }
                if (ch === '}') { d--; continue }
                if (d === 0) own += ch
            }

            for (const line of own.split('\n').map(entry => entry.trim())) {
                const property = line.includes(':') ? line.split(':')[0].trim() : '';

                property && found.push({selector: match[1].trim(), property})
            }
        }

        return found
    };

    test('no application stylesheet paints a splitter — it may only set tokens', () => {
        const offenders = [];

        for (const file of scssFiles(APP_SCSS_ROOT)) {
            for (const {selector, property} of splitterOwnDeclarations(readFileSync(file, 'utf8'))) {
                if (!property.startsWith('--') && SPLITTER_PAINT.includes(property)) {
                    offenders.push(`${file.replace(`${APP_SCSS_ROOT}/`, '')} → ${property} on ${selector}`)
                }
            }
        }

        expect(offenders, 'the splitter affordance is engine capability; apps set values').toEqual([])
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

    test('opting OUT of the handle is expressible without re-declaring the rule', () => {
        // FM is flat by choice. `--dock-splitter-handle-size: 0` makes that a design statement that
        // greps, instead of an absence that reads as an oversight — and it survives the engine
        // gaining a handle, which is what just happened.
        const fm = readFileSync('resources/scss/src/apps/agentos/fleet/FleetCockpit.scss', 'utf8');

        expect(fm, 'FM declares flat rather than omitting the handle')
            .toMatch(/--dock-splitter-handle-size\s*:\s*0/)
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
