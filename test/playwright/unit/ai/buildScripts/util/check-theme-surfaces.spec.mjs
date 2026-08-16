import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';

import {
    collectShellSeamFailures,
    collectThemeSurfaceFailures
} from '../../../../../../buildScripts/util/check-theme-surfaces.mjs';

/**
 * check-theme-surfaces.mjs — the dual-mode theme guard. These isolated fixtures drive the
 * exported collector with temp skins/views so each defect class fails independently of the real tree:
 * parity (byte-identical / missing), token-only (a bare CSS-color literal past the var() fallback), and
 * completeness (a consumed token a skin fails to supply — the empty/truncated-palette false-green that a
 * pure symmetry check would pass). Positive cases pin the sanctioned var() fallback + component-local
 * alias so the guard cannot regress into false rejections.
 */
test.describe('check-theme-surfaces.mjs', () => {
    let tempDir;

    test.beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-fm-theme-'));
    });

    test.afterEach(() => {
        fs.rmSync(tempDir, {recursive: true, force: true});
    });

    // Materialize a skin/view fixture set in the temp dir and run the collector against it.
    const run = ({dark, light, views = {}, contractedTokens = new Set(), ...rest}) => {
        const darkPath  = path.join(tempDir, 'dark.scss'),
              lightPath = path.join(tempDir, 'light.scss'),
              viewDir   = path.join(tempDir, 'views');

        fs.writeFileSync(darkPath, dark, 'utf8');
        fs.writeFileSync(lightPath, light, 'utf8');
        fs.mkdirSync(viewDir, {recursive: true}); // idempotent — a test may call run() more than once
        for (const [name, content] of Object.entries(views)) {
            fs.writeFileSync(path.join(viewDir, name), content, 'utf8');
        }

        return collectThemeSurfaceFailures({darkPath, lightPath, viewDir, contractedTokens, ...rest});
    };

    // A surface is a TOKEN LANGUAGE, so these drive the collector under a foreign namespace.
    const WS_PATTERN = /^\s*(--(?:workstation|agent-dock)-[a-z0-9-]+)\s*:\s*(.+?);\s*$/,
          WS_FONTS   = new Set(['--workstation-font-mono']);

    test('#17200: parity passes an ALIAS that resolves differently per skin', () => {
        // `--agent-dock-preview-accept: var(--workstation-signal)` is byte-identical in both skins
        // PRECISELY because the token layer works — the difference lives one hop down. Comparing the
        // written expression reports six such tokens as violations on the real workstation surface.
        const failures = run({
            dark         : ':root .x {\n    --workstation-signal      : #5eead4;\n    --agent-dock-preview-accept : var(--workstation-signal);\n}\n',
            light        : ':root .x {\n    --workstation-signal      : #0f766e;\n    --agent-dock-preview-accept : var(--workstation-signal);\n}\n',
            views        : {'a.scss': '.a { color: var(--agent-dock-preview-accept); }\n'},
            tokenPattern : WS_PATTERN,
            modeInvariant: WS_FONTS
        });

        expect(failures, 'the alias is the token layer working, not a copied skin').toEqual([]);
    });

    test('#17200: an alias whose referent is IDENTICAL in both skins still fails parity', () => {
        // The guard against the alias rule becoming a blanket escape for anything containing `var(`.
        const failures = run({
            dark         : ':root .x {\n    --workstation-signal      : #5eead4;\n    --agent-dock-preview-accept : var(--workstation-signal);\n}\n',
            light        : ':root .x {\n    --workstation-signal      : #5eead4;\n    --agent-dock-preview-accept : var(--workstation-signal);\n}\n',
            views        : {'a.scss': '.a { color: var(--agent-dock-preview-accept); }\n'},
            tokenPattern : WS_PATTERN,
            modeInvariant: WS_FONTS
        });

        expect(failures.some(f => f.includes('--workstation-signal') && f.includes('[parity]')),
            'the referent itself is copied, so the light skin really does carry the dark value').toBe(true);
    });

    test('#17200: a foreign namespace extracts tokens — the vacuous-green control', () => {
        // The failure this parameter exists to stop: run a surface under the WRONG pattern and the
        // extractor yields zero tokens, so every parity check passes over an empty map and reports a
        // clean surface because it looked at nothing. Same fixture, two patterns, opposite verdicts.
        const fixture = {
            dark : ':root .x {\n    --workstation-ink : #d6dce6;\n}\n',
            light: ':root .x {\n    --workstation-ink : #d6dce6;\n}\n',
            views: {}
        };

        expect(run({...fixture, tokenPattern: WS_PATTERN, modeInvariant: new Set()}).length,
            'the right namespace SEES the copied skin').toBeGreaterThan(0);

        // This assertion USED TO READ `.toBe(0)` — the spec demonstrated the vacuous green and then
        // pinned it as expected. It proved the class existed for the registered pair while leaving the
        // collector free to keep reporting it as clean for every future one. Inverted now: the wrong
        // pattern FAILS instead of passing over an empty map.
        expect(run({...fixture}).some(failure => failure.startsWith('[surface]')),
            'the --fm-* default extracts nothing here — that is a registry defect, not a clean surface').toBe(true);
    });

    test('#17230: both skins empty fails; one empty skin stays with the completeness check', () => {
        // BOTH empty is the discriminator. One empty skin is a real, reportable state that the parity
        // and completeness checks already describe better than a generic "unread surface" would, so
        // widening this to `||` would swallow their sharper message behind a vaguer one.
        const oneSideEmpty = run({
            dark : ':root .x {\n    --fm-ink: #d6dce6;\n}\n',
            light: ':root .x {\n}\n'
        });

        expect(oneSideEmpty.some(failure => failure.startsWith('[surface]')),
            'the dark skin extracted fine — this is not an unread surface').toBe(false);
        expect(oneSideEmpty.some(failure => failure.includes('[parity]')),
            'and the existing parity check still owns it').toBe(true);
    });

    test('#17230: the surface failure names the pattern that matched nothing', () => {
        // The message has to carry the diagnosis, because the author's next question is always "which
        // field is wrong" — and a registry entry has several.
        const [failure] = run({
            dark : ':root .x {\n    --workstation-ink: #111;\n}\n',
            light: ':root .x {\n    --workstation-ink: #eee;\n}\n'
        });

        expect(failure).toContain('[surface]');
        expect(failure).toContain('token pattern');
        expect(failure).toContain('unchecked rather than clean');
    });

    test('#17200: a bare color literal in a view fails token-only — #14618 AC-2, at the layer that owns it', () => {
        // The seeded off-token change, proven without pixels: deterministic, no baseline, no
        // threshold, no platform drift. Both arms, because a guard that rejects everything passes a
        // one-sided corpus just as well as a correct one.
        const seeded = run({
            dark         : ':root .x {\n    --workstation-ground : #0b0e13;\n}\n',
            light        : ':root .x {\n    --workstation-ground : #f6f8fa;\n}\n',
            views        : {'v.scss': '.a { background: #ff0080; }\n'},
            tokenPattern : WS_PATTERN,
            modeInvariant: WS_FONTS
        });

        expect(seeded.some(f => f.includes('[token-only]') && f.includes('#ff0080'))).toBe(true);

        const reverted = run({
            dark         : ':root .x {\n    --workstation-ground : #0b0e13;\n}\n',
            light        : ':root .x {\n    --workstation-ground : #f6f8fa;\n}\n',
            views        : {'v.scss': '.a { background: var(--workstation-ground); }\n'},
            tokenPattern : WS_PATTERN,
            modeInvariant: WS_FONTS
        });

        expect(reverted, 'the token consumption is clean — the guard is not reject-everything').toEqual([]);
    });

    const DARK  = ':root .x {\n    --fm-ink       : #d6dce6;\n    --fm-font-mono : mono;\n}\n';
    const LIGHT = ':root .x {\n    --fm-ink       : #1f2733;\n    --fm-font-mono : mono;\n}\n';
    const VIEW  = '.a { color: var(--fm-ink); }\n';

    test('clean fixture passes', () => {
        expect(run({dark: DARK, light: LIGHT, views: {'a.scss': VIEW}})).toEqual([]);
    });

    test('byte-identical --fm-* color value fails parity', () => {
        const failures = run({dark: DARK, light: DARK, views: {'a.scss': VIEW}});
        expect(failures.some(m => m.startsWith('[parity]') && m.includes('--fm-ink'))).toBe(true);
    });

    test('mode-invariant font token identical across skins is allowed', () => {
        const failures = run({dark: DARK, light: LIGHT, views: {'a.scss': VIEW}});
        expect(failures.some(m => m.includes('--fm-font-mono'))).toBe(false);
    });

    test('token missing from one skin fails parity and completeness', () => {
        const lightMissing = ':root .x {\n    --fm-font-mono : mono;\n}\n',
              failures     = run({dark: DARK, light: lightMissing, views: {'a.scss': VIEW}});

        expect(failures.some(m => m.startsWith('[parity]') && m.includes('--fm-ink'))).toBe(true);
        expect(failures.some(m => m.startsWith('[completeness]') && m.includes('--fm-ink'))).toBe(true);
    });

    test('symmetrically empty palettes still fail completeness', () => {
        const empty    = ':root .x {\n}\n',
              failures = run({dark: empty, light: empty, views: {'a.scss': VIEW}});

        expect(failures.some(m => m.startsWith('[completeness]') && m.includes('--fm-ink'))).toBe(true);
    });

    test('nested var() fallback (incl. rgba) is allowed', () => {
        const failures = run({dark: DARK, light: LIGHT, views: {'a.scss': '.a { background: var(--fm-ink, rgba(1, 2, 3, 0.4)); }\n'}});
        expect(failures.some(m => m.startsWith('[token-only]'))).toBe(false);
    });

    test('bare oklch() literal fails token-only', () => {
        const failures = run({dark: DARK, light: LIGHT, views: {'a.scss': '.a { color: oklch(0.7 0.1 200); }\n'}});
        expect(failures.some(m => m.startsWith('[token-only]'))).toBe(true);
    });

    test('bare hex literal fails token-only', () => {
        const failures = run({dark: DARK, light: LIGHT, views: {'a.scss': '.a { color: #ff0000; }\n'}});
        expect(failures.some(m => m.startsWith('[token-only]'))).toBe(true);
    });

    test('component-local --fm-* alias is exempt from completeness', () => {
        const failures = run({dark: DARK, light: LIGHT, views: {'a.scss': '.a { --fm-dot: var(--fm-ink); box-shadow: 0 0 0 2px var(--fm-dot); }\n'}});
        expect(failures.some(m => m.includes('--fm-dot'))).toBe(false);
    });

    test('symmetric deletion of an UNCONSUMED contracted token is caught (not a vacuous parity pass)', () => {
        // --fm-ink is contracted but consumed by no view here; deleting it from BOTH skins passes parity
        // and completeness, so only the contracted-vocabulary check can catch the design-contract break.
        const noInk    = ':root .x {\n    --fm-font-mono : mono;\n}\n',
              failures = run({dark: noInk, light: noInk, contractedTokens: new Set(['--fm-ink'])});

        expect(failures.some(m => m.startsWith('[contract]') && m.includes('--fm-ink'))).toBe(true);
    });

    test('a bare named CSS color fails token-only; transparent/currentColor and quoted strings do not', () => {
        const bad = run({dark: DARK, light: LIGHT, views: {'a.scss': '.a { color: crimson; }\n'}}),
              ok  = run({dark: DARK, light: LIGHT, views: {'a.scss': '.a { background: transparent; border-color: currentColor; content: "red alert"; color: var(--fm-ink); }\n'}});

        expect(bad.some(m => m.startsWith('[token-only]'))).toBe(true);
        expect(ok.some(m => m.startsWith('[token-only]'))).toBe(false);
    });

    // check 4 — text-safe ink. `--fm-ink-faint` is below the 4.5:1 text floor on every surface in both
    // skins, so it may fill surfaces/borders but never text. A prose "no live consumer" note did not hold
    // the line (four text sites re-adopted it after an earlier cleanup), hence the mechanical rule.
    const FAINT_DARK  = ':root .x {\n    --fm-ink       : #d6dce6;\n    --fm-ink-faint : #5a6575;\n    --fm-font-mono : mono;\n}\n';
    const FAINT_LIGHT = ':root .x {\n    --fm-ink       : #1f2733;\n    --fm-ink-faint : #8494a7;\n    --fm-font-mono : mono;\n}\n';

    test('--fm-ink-faint filling text fails text-contrast', () => {
        const failures = run({dark: FAINT_DARK, light: FAINT_LIGHT, views: {'a.scss': '.a { color: var(--fm-ink-faint); }\n'}});

        expect(failures.some(m => m.startsWith('[text-contrast]') && m.includes('--fm-ink-faint'))).toBe(true);
    });

    test('--fm-ink-faint as a NON-text value stays legal — it survives as the non-text floor', () => {
        const failures = run({
            dark : FAINT_DARK,
            light: FAINT_LIGHT,
            views: {'a.scss': '.a { background: var(--fm-ink-faint); border-color: var(--fm-ink-faint); color: var(--fm-ink); }\n'}
        });

        expect(failures.some(m => m.startsWith('[text-contrast]'))).toBe(false);
    });

    test('the inline multi-declaration form is caught (the shape that regressed)', () => {
        const failures = run({
            dark : FAINT_DARK,
            light: FAINT_LIGHT,
            views: {'a.scss': '.a {\n    &.is-pending { color: var(--fm-ink-faint); font-style: italic; }\n}\n'}
        });

        expect(failures.some(m => m.startsWith('[text-contrast]'))).toBe(true);
    });

    // A pseudo-class puts a colon in the SELECTOR. Resolving the property from the first colon on the
    // line therefore read a selector fragment as the property and skipped the check entirely — and
    // `&:hover { color: … }` is the single likeliest place a sub-floor ink returns.
    for (const [shape, view] of Object.entries({
        'element pseudo-class'   : '.a:hover { color: var(--fm-ink-faint); }\n',
        'nested ampersand hover' : '.a {\n    &:hover { color: var(--fm-ink-faint); }\n}\n',
        'functional pseudo-class': '.a:not(.b) { color: var(--fm-ink-faint); }\n'
    })) {
        test(`text-contrast survives a ${shape} on the declaration line`, () => {
            const failures = run({dark: FAINT_DARK, light: FAINT_LIGHT, views: {'a.scss': view}});

            expect(failures.some(m => m.startsWith('[text-contrast]'))).toBe(true);
        });
    }

    test('an uppercase/mixed-case property is caught (CSS property names are case-insensitive)', () => {
        const upper = run({dark: FAINT_DARK, light: FAINT_LIGHT, views: {'a.scss': '.a { COLOR: var(--fm-ink-faint); }\n'}}),
              mixed = run({dark: FAINT_DARK, light: FAINT_LIGHT, views: {'a.scss': '.a { Color: var(--fm-ink-faint); }\n'}});

        expect(upper.some(m => m.startsWith('[text-contrast]'))).toBe(true);
        expect(mixed.some(m => m.startsWith('[text-contrast]'))).toBe(true);
    });

    test('a pseudo-class line with a NON-text property stays legal (no over-rejection)', () => {
        const failures = run({
            dark : FAINT_DARK,
            light: FAINT_LIGHT,
            views: {'a.scss': '.a:hover { background: var(--fm-ink-faint); border-color: var(--fm-ink-faint); color: var(--fm-ink); }\n'}
        });

        expect(failures.some(m => m.startsWith('[text-contrast]'))).toBe(false);
    });

    // check 5 — the drawer shell/pane frame seam. Every fixture below encodes a bypass or regression
    // demonstrated on an exact head before being fixed: the logical-longhand hole, the split-line
    // selector, the nested-rule ownership migration, and the dual-mount double frame.
    test.describe('shell seam (check 5)', () => {
        // Listed pane files are MANDATORY (fail closed), so the base seam lists only the pane every
        // fixture writes; dual-mount cases carry their own seam.
        const SEAM = {
            slotFile    : 'fleet/Slot.scss',
            slotSelector: '.slot',
            paneRoots   : [
                ['fleet/Pane.scss', '.pane']
            ]
        };

        const DUAL_SEAM = {
            slotFile    : 'fleet/Slot.scss',
            slotSelector: '.slot',
            paneRoots   : [
                ['fleet/Dual.scss', '.dual', {dualMount: true}]
            ]
        };

        const CLEAN_SLOT = '.host {\n    .slot {\n        background: var(--fm-rail);\n        padding   : 12px;\n\n        > * {\n            gap: 10px;\n        }\n    }\n}\n';

        // Materialize seam fixtures under views/fleet and run the exported check-5 collector.
        const runSeam = (files, seam = SEAM) => {
            const viewDir = path.join(tempDir, 'views');

            fs.mkdirSync(path.join(viewDir, 'fleet'), {recursive: true});
            for (const [name, content] of Object.entries(files)) {
                fs.writeFileSync(path.join(viewDir, name), content, 'utf8');
            }

            return collectShellSeamFailures(seam, viewDir);
        };

        test('clean seam passes: frame on the slot, pane root frame-free', () => {
            const failures = runSeam({
                'fleet/Slot.scss': CLEAN_SLOT,
                'fleet/Pane.scss': '.pane {\n    gap: 10px;\n\n    .pane-rows {\n        padding: 4px;\n    }\n}\n'
            });

            expect(failures, 'inner (nested) padding is internal semantics, not the drawer frame').toEqual([]);
        });

        test('a pane root shorthand frame property fails', () => {
            const failures = runSeam({
                'fleet/Slot.scss': CLEAN_SLOT,
                'fleet/Pane.scss': '.pane {\n    padding: 12px;\n}\n'
            });

            expect(failures.some(m => m.startsWith('[shell-seam]') && m.includes('.pane') && m.includes('padding'))).toBe(true);
        });

        test('a LOGICAL LONGHAND on the pane root fails — the exact-head bypass', () => {
            // padding: 1px failed, padding-inline-start: 1px passed the shorthand-only list.
            const failures = runSeam({
                'fleet/Slot.scss': CLEAN_SLOT,
                'fleet/Pane.scss': '.pane {\n    padding-inline-start: 1px;\n}\n'
            });

            expect(failures.some(m => m.startsWith('[shell-seam]') && m.includes('padding-inline-start'))).toBe(true);
        });

        test('a SPLIT-LINE root selector is still recognized — the line-parser bypass', () => {
            const failures = runSeam({
                'fleet/Slot.scss': CLEAN_SLOT,
                'fleet/Pane.scss': '.pane\n{\n    margin-block-end: 2px;\n}\n'
            });

            expect(failures.some(m => m.startsWith('[shell-seam]') && m.includes('margin-block-end'))).toBe(true);
        });

        test('slot frame declarations MOVED INTO A NESTED RULE do not count as ownership', () => {
            // background+padding live only under `> *` — the containment scan counted them as the
            // slot's own; declaration-depth ownership does not.
            const failures = runSeam({
                'fleet/Slot.scss': '.host {\n    .slot {\n        > * {\n            background: var(--fm-rail);\n            padding   : 12px;\n        }\n    }\n}\n',
                'fleet/Pane.scss': '.pane {\n    gap: 10px;\n}\n'
            });

            expect(failures.some(m => m.startsWith('[shell-seam]') && m.includes('does not declare background'))).toBe(true);
            expect(failures.some(m => m.startsWith('[shell-seam]') && m.includes('does not declare padding'))).toBe(true);
        });

        test('a dual-mount pane keeping its root frame WITHOUT a reveal override fails — the double-frame regression', () => {
            const failures = runSeam({
                'fleet/Slot.scss': CLEAN_SLOT,
                'fleet/Dual.scss': '.dual {\n    padding: 10px 12px;\n}\n'
            }, DUAL_SEAM);

            expect(failures.some(m => m.startsWith('[shell-seam]') && m.includes('.dual') && m.includes('reveal override'))).toBe(true);
        });

        test('the same dual-mount pane WITH the slot-side reveal override passes — the ownership split', () => {
            const failures = runSeam({
                'fleet/Slot.scss': '.host {\n    .slot {\n        background: var(--fm-rail);\n        padding   : 12px;\n\n        > .dual {\n            padding: 0;\n        }\n    }\n}\n',
                'fleet/Dual.scss': '.dual {\n    padding: 10px 12px;\n}\n'
            }, DUAL_SEAM);

            expect(failures, 'pinned/vessel keep the root frame; the reveal mount is neutralized slot-side').toEqual([]);
        });

        test('a SUBSTRING selector does not satisfy the dual-mount override — boundary-aware matching', () => {
            // Found by this repair's own red control: renaming the override to `.dual-x` (effectively
            // removing it) still passed, because a bare includes() matched `.dual` inside `.dual-x`.
            const failures = runSeam({
                'fleet/Slot.scss': '.host {\n    .slot {\n        background: var(--fm-rail);\n        padding   : 12px;\n\n        > .dual-x {\n            padding: 0;\n        }\n    }\n}\n',
                'fleet/Dual.scss': '.dual {\n    padding: 10px 12px;\n}\n'
            }, DUAL_SEAM);

            expect(failures.some(m => m.startsWith('[shell-seam]') && m.includes('reveal override'))).toBe(true);
        });

        test('a slot file that no longer styles the slot selector reports the frame as ownerless', () => {
            const failures = runSeam({
                'fleet/Slot.scss': '.host {\n    .elsewhere {\n        padding: 12px;\n    }\n}\n',
                'fleet/Pane.scss': '.pane {\n    gap: 10px;\n}\n'
            });

            expect(failures.some(m => m.startsWith('[shell-seam]') && m.includes('no longer styles'))).toBe(true);
        });

        test('a MISSING slot file fails closed — the exact-head omission probe', () => {
            // Removing the configured slot file returned an empty list: the owner audit was
            // conditional on existsSync. Absence of the owner IS the ownerless state.
            const failures = runSeam({
                'fleet/Pane.scss': '.pane {\n    gap: 10px;\n}\n'
            });

            expect(failures.some(m => m.startsWith('[shell-seam]') && m.includes('is missing'))).toBe(true);
        });

        test('a MISSING listed pane skin file fails closed — the exact-head omission probe (round 4)', () => {
            // Omitting a configured pane file exited 0: the row silently stopped applying while the
            // pane it governs renders unskinned. A listed root is a contract row; absence fails.
            const failures = runSeam({
                'fleet/Slot.scss': CLEAN_SLOT
            });

            expect(failures.some(m => m.startsWith('[shell-seam]') && m.includes('fleet/Pane.scss') && m.includes('no skin file'))).toBe(true);
        });

        test('a NON-ZERO reveal override does not satisfy the dual-mount demand — neutralization, not presence (round 4)', () => {
            // `padding: 99px` satisfied a presence-only check while double-framing the reveal mount.
            const failures = runSeam({
                'fleet/Slot.scss': '.host {\n    .slot {\n        background: var(--fm-rail);\n        padding   : 12px;\n\n        > .dual {\n            padding: 99px;\n        }\n    }\n}\n',
                'fleet/Dual.scss': '.dual {\n    padding: 10px 12px;\n}\n'
            }, DUAL_SEAM);

            expect(failures.some(m => m.startsWith('[shell-seam]') && m.includes('NO FULL ZERO reveal override'))).toBe(true);
        });

        // census cross-check — the paneRoots list must not be hand-closed (the future-pane clause)
        const INVENTORY = (rows) => `export const doc = {\n    items: {\n${rows}\n    }\n};\n`;

        const seamWithInventory = (inventoryFile, {exempt = {}, refToRoot = {'known-pane': '.pane'}} = {}) => ({
            ...SEAM,
            inventory: {file: inventoryFile, refToRoot, exempt}
        });

        test('an UNCLASSIFIED autoHidden pane in the dock inventory fails — the future-pane clause', () => {
            // The exact-head probe: an unlisted pane never entered the closed list, so the guard
            // never looked. A future pane lands in the dock document first — the census catches it.
            const inv = path.join(tempDir, 'dockDocument.mjs');

            fs.writeFileSync(inv, INVENTORY(
                "        known : {componentRef: 'known-pane',  title: 'Known',  kind: 'tool', autoHidden: true},\n" +
                "        future: {componentRef: 'future-pane', title: 'Future', kind: 'tool', autoHidden: true}"
            ), 'utf8');

            const failures = runSeam({
                'fleet/Slot.scss': CLEAN_SLOT,
                'fleet/Pane.scss': '.pane {\n    gap: 10px;\n}\n'
            }, seamWithInventory(inv));

            expect(failures.some(m => m.startsWith('[shell-seam]') && m.includes("'future-pane'") && m.includes('UNCLASSIFIED'))).toBe(true);
        });

        test('a PARTIAL zero longhand does not satisfy the dual-mount override — all four sides (round 5)', () => {
            // `padding-top: 0` cleared the check while left/right/bottom kept double-framing.
            const failures = runSeam({
                'fleet/Slot.scss': '.host {\n    .slot {\n        background: var(--fm-rail);\n        padding   : 12px;\n\n        > .dual {\n            padding-top: 0;\n        }\n    }\n}\n',
                'fleet/Dual.scss': '.dual {\n    padding: 10px 12px;\n}\n'
            }, DUAL_SEAM);

            expect(failures.some(m => m.startsWith('[shell-seam]') && m.includes('NO FULL ZERO') && m.includes('covered: top'))).toBe(true);
        });

        test('four zero longhands covering every side DO satisfy the override — no over-rejection (round 5)', () => {
            const failures = runSeam({
                'fleet/Slot.scss': '.host {\n    .slot {\n        background: var(--fm-rail);\n        padding   : 12px;\n\n        > .dual {\n            padding-block : 0;\n            padding-inline: 0;\n        }\n    }\n}\n',
                'fleet/Dual.scss': '.dual {\n    padding: 10px 12px;\n}\n'
            }, DUAL_SEAM);

            expect(failures).toEqual([]);
        });

        test('a DESCENDANT-only zero rule does not satisfy the override — the root itself must be targeted (round 5)', () => {
            // `> .dual .dual-header { padding: 0 }` zeroed a child while the root kept 10px 12px,
            // and a contains-the-token selector match accepted it.
            const failures = runSeam({
                'fleet/Slot.scss': '.host {\n    .slot {\n        background: var(--fm-rail);\n        padding   : 12px;\n\n        > .dual .dual-header {\n            padding: 0;\n        }\n    }\n}\n',
                'fleet/Dual.scss': '.dual {\n    padding: 10px 12px;\n}\n'
            }, DUAL_SEAM);

            expect(failures.some(m => m.startsWith('[shell-seam]') && m.includes('NO FULL ZERO'))).toBe(true);
        });

        test('a MULTILINE autoHidden inventory item is still extracted — formatting-total census (round 4)', () => {
            // A valid multiline item escaped a one-line regex that required componentRef before
            // autoHidden on the same line. Extraction now walks the innermost object span.
            const inv = path.join(tempDir, 'dockDocument.mjs');

            fs.writeFileSync(inv, INVENTORY(
                "        known : {componentRef: 'known-pane', title: 'Known', kind: 'tool', autoHidden: true},\n" +
                "        future: {\n" +
                "            componentRef: 'future-pane',\n" +
                "            title       : 'Future',\n" +
                "            kind        : 'tool',\n" +
                "            autoHidden  : true\n" +
                "        }"
            ), 'utf8');

            const failures = runSeam({
                'fleet/Slot.scss': CLEAN_SLOT,
                'fleet/Pane.scss': '.pane {\n    gap: 10px;\n}\n'
            }, seamWithInventory(inv));

            expect(failures.some(m => m.startsWith('[shell-seam]') && m.includes("'future-pane'") && m.includes('UNCLASSIFIED'))).toBe(true);
        });

        test('a fully classified inventory passes — mapped and exempt refs both count', () => {
            const inv = path.join(tempDir, 'dockDocument.mjs');

            fs.writeFileSync(inv, INVENTORY(
                "        known : {componentRef: 'known-pane', title: 'Known', kind: 'tool', autoHidden: true},\n" +
                "        card  : {componentRef: 'card-pane',  title: 'Card',  kind: 'tool', autoHidden: true}"
            ), 'utf8');

            const failures = runSeam({
                'fleet/Slot.scss': CLEAN_SLOT,
                'fleet/Pane.scss': '.pane {\n    gap: 10px;\n}\n'
            }, seamWithInventory(inv, {exempt: {'card-pane': 'card exception'}}));

            expect(failures).toEqual([]);
        });

        test('a missing or zero-yield inventory source fails closed — the census cannot go vacuous', () => {
            const missing = runSeam({
                'fleet/Slot.scss': CLEAN_SLOT,
                'fleet/Pane.scss': '.pane {\n    gap: 10px;\n}\n'
            }, seamWithInventory(path.join(tempDir, 'nope.mjs')));

            expect(missing.some(m => m.startsWith('[shell-seam]') && m.includes('inventory source') && m.includes('missing'))).toBe(true);

            const emptyInv = path.join(tempDir, 'emptyDoc.mjs');

            fs.writeFileSync(emptyInv, 'export const doc = {};\n', 'utf8');

            const empty = runSeam({
                'fleet/Slot.scss': CLEAN_SLOT,
                'fleet/Pane.scss': '.pane {\n    gap: 10px;\n}\n'
            }, seamWithInventory(emptyInv));

            expect(empty.some(m => m.startsWith('[shell-seam]') && m.includes('ZERO autoHidden refs'))).toBe(true);
        });

        test('a DOUBLE-QUOTED componentRef is still extracted — JS spelling breadth (round 5)', () => {
            // A syntax-valid double-quoted row escaped a single-quote pattern while seven existing
            // refs kept the zero-yield fallback quiet.
            const inv = path.join(tempDir, 'dockDocument.mjs');

            fs.writeFileSync(inv, INVENTORY(
                "        known : {componentRef: 'known-pane', title: 'Known', kind: 'tool', autoHidden: true},\n" +
                '        future: {componentRef: "future-pane", title:\'Future\', kind:\'tool\', autoHidden:true}'
            ), 'utf8');

            const failures = runSeam({
                'fleet/Slot.scss': CLEAN_SLOT,
                'fleet/Pane.scss': '.pane {\n    gap: 10px;\n}\n'
            }, seamWithInventory(inv));

            expect(failures.some(m => m.startsWith('[shell-seam]') && m.includes("'future-pane'") && m.includes('UNCLASSIFIED'))).toBe(true);
        });

        test('a census row mapping to a selector absent from paneRoots is flagged as dangling', () => {
            const inv = path.join(tempDir, 'dockDocument.mjs');

            fs.writeFileSync(inv, INVENTORY(
                "        known: {componentRef: 'known-pane', title: 'Known', kind: 'tool', autoHidden: true}"
            ), 'utf8');

            const failures = runSeam({
                'fleet/Slot.scss': CLEAN_SLOT,
                'fleet/Pane.scss': '.pane {\n    gap: 10px;\n}\n'
            }, seamWithInventory(inv, {refToRoot: {'known-pane': '.not-in-pane-roots'}}));

            expect(failures.some(m => m.startsWith('[shell-seam]') && m.includes('dangling'))).toBe(true);
        });
    });
});
