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
        expect(run({...fixture}).length,
            'the --fm-* default extracts nothing here — a clean report over an empty map').toBe(0);
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
        const SEAM = {
            slotFile    : 'fleet/Slot.scss',
            slotSelector: '.slot',
            paneRoots   : [
                ['fleet/Pane.scss', '.pane'],
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
            });

            expect(failures.some(m => m.startsWith('[shell-seam]') && m.includes('.dual') && m.includes('reveal override'))).toBe(true);
        });

        test('the same dual-mount pane WITH the slot-side reveal override passes — the ownership split', () => {
            const failures = runSeam({
                'fleet/Slot.scss': '.host {\n    .slot {\n        background: var(--fm-rail);\n        padding   : 12px;\n\n        > .dual {\n            padding: 0;\n        }\n    }\n}\n',
                'fleet/Dual.scss': '.dual {\n    padding: 10px 12px;\n}\n'
            });

            expect(failures, 'pinned/vessel keep the root frame; the reveal mount is neutralized slot-side').toEqual([]);
        });

        test('a SUBSTRING selector does not satisfy the dual-mount override — boundary-aware matching', () => {
            // Found by this repair's own red control: renaming the override to `.dual-x` (effectively
            // removing it) still passed, because a bare includes() matched `.dual` inside `.dual-x`.
            const failures = runSeam({
                'fleet/Slot.scss': '.host {\n    .slot {\n        background: var(--fm-rail);\n        padding   : 12px;\n\n        > .dual-x {\n            padding: 0;\n        }\n    }\n}\n',
                'fleet/Dual.scss': '.dual {\n    padding: 10px 12px;\n}\n'
            });

            expect(failures.some(m => m.startsWith('[shell-seam]') && m.includes('reveal override'))).toBe(true);
        });

        test('a slot file that no longer styles the slot selector reports the frame as ownerless', () => {
            const failures = runSeam({
                'fleet/Slot.scss': '.host {\n    .elsewhere {\n        padding: 12px;\n    }\n}\n',
                'fleet/Pane.scss': '.pane {\n    gap: 10px;\n}\n'
            });

            expect(failures.some(m => m.startsWith('[shell-seam]') && m.includes('no longer styles'))).toBe(true);
        });
    });
});
