import {test, expect} from '@playwright/test';
import fs             from 'fs';
import os             from 'os';
import path           from 'path';

/**
 * The corner-radius literal guard. The reading (`radiusLiterals`) is asserted per shape; the tree
 * walk runs over planted fixture trees with an injectable allow-list, so each failure direction stands on
 * its own. The live-tree control anchors the rest: a guard that cannot pass on the tree it guards is ceremony.
 */
test.describe('check-theme-radius-literals — a structural corner radius reads a variable', () => {
    let ALLOWED, findRadiusLiterals, radiusLiterals, tmpRoot;

    /**
     * @param {Object<String,String>} files Path below the src root → CSS
     * @returns {String} The fixture src root
     */
    const makeSrc = files => {
        const root = fs.mkdtempSync(path.join(tmpRoot, 'radius-'));

        for (const [file, css] of Object.entries(files)) {
            fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
            fs.writeFileSync(path.join(root, file), css)
        }

        return root
    };

    test.beforeAll(async () => {
        ({ALLOWED, findRadiusLiterals} = await import('../../../../buildScripts/util/check-theme-radius-literals.mjs'));
        ({radiusLiterals}              = await import('../../../../buildScripts/util/themeCss.mjs'));
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-theme-radius-'));
    });

    test.afterAll(() => {
        fs.rmSync(tmpRoot, {recursive: true, force: true});
    });

    test('CONTROL: the live tree passes, and every allowed entry still matches', () => {
        expect(findRadiusLiterals()).toEqual({offences: [], stale: []});
    });

    test('FIRES: a literal length in each shape the reading covers, with its line', () => {
        const css = [
            '.a {',
            '    border-radius: 6px;',
            '    border-top-left-radius: 2px;',
            '    border-start-end-radius: 1rem;',
            '    -webkit-border-radius: 5px;',
            '    --neo-b-border-radius: 12px;',
            '    --neo-b-border-radius-focus: 3px;',
            '    border-radius: 0 4px !important;',
            '}'
        ].join('\n');

        expect(radiusLiterals(css)).toEqual([
            {line: 2, property: 'border-radius',               value: '6px'},
            {line: 3, property: 'border-top-left-radius',      value: '2px'},
            {line: 4, property: 'border-start-end-radius',     value: '1rem'},
            {line: 5, property: '-webkit-border-radius',       value: '5px'},
            {line: 6, property: '--neo-b-border-radius',       value: '12px'},
            {line: 7, property: '--neo-b-border-radius-focus', value: '3px'},
            {line: 8, property: 'border-radius',               value: '0 4px'}
        ]);
    });

    test('PASSES: zero, the CSS-wide keywords, percentages only, and any value that reads a variable', () => {
        const css = '.a { border-radius: 0; border-radius: 0px; border-radius: inherit; border-radius: 50%; ' +
            'border-radius: 50% 50% 0 0; border-radius: var(--neo-a-border-radius); ' +
            'border-radius: calc(var(--neo-a-border-radius) + 2px); --neo-a-border-radius: var(--neo-radius-small); ' +
            '--neo-a-radius: 4px; }';

        expect(radiusLiterals(css)).toEqual([]);
    });

    test('FIRES in the engine files only: apps/ and examples/ are out of scope, comments are not rules', () => {
        const root = makeSrc({
            'button/Base.css'         : '/* border-radius: 9px */\n.neo-button {\n    border-radius: 4px;\n}',
            'apps/portal/Viewport.css': '.a { border-radius: 8px; }',
            'examples/grid/Main.css'  : '.a { border-radius: 8px; }'
        });

        expect(findRadiusLiterals(root, {})).toEqual({
            offences: [{file: 'button/Base.css', line: 3, property: 'border-radius', value: '4px'}],
            stale   : []
        });
    });

    test('ALLOWED: a listed literal passes, and a listed entry that matches nothing is stale', () => {
        const root = makeSrc({'dock/Container.css': '.neo-dock {\n    --neo-dock-splitter-border-radius: 999px;\n}'});

        expect(findRadiusLiterals(root, {'dock/Container.css|--neo-dock-splitter-border-radius': 'floor'}))
            .toEqual({offences: [], stale: []});
        expect(findRadiusLiterals(root, {
            'dock/Container.css|--neo-dock-splitter-border-radius': 'floor',
            'dock/Container.css|border-radius'                    : 'gone'
        })).toEqual({offences: [], stale: ['dock/Container.css|border-radius']});
        expect(Object.values(ALLOWED).every(reason => reason.length > 40), 'every allowed literal carries its reason').toBe(true);
    });
});
