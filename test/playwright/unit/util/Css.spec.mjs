import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'CssUtilTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Css            from '../../../../src/util/Css.mjs';

/**
 * @summary Unit tests for Neo.util.Css#insertRules and Neo.util.Css#deleteRules
 */
test.describe('Neo.util.Css', () => {
    let addon,
        deletedCalls,
        insertedCalls,
        original;

    test.beforeEach(() => {
        addon         = Neo.ns('Neo.main.addon', true);
        original      = addon.Stylesheet;
        insertedCalls = [];
        deletedCalls  = [];

        addon.Stylesheet = {
            insertCssRules(opts) {
                insertedCalls.push(opts);
            },
            deleteCssRules(opts) {
                deletedCalls.push(opts);
            }
        };
    });

    test.afterEach(() => {
        original ? addon.Stylesheet = original : delete addon.Stylesheet;
    });

    test('insertRules forwards an array of rules to Stylesheet.insertCssRules', () => {
        Css.insertRules('w1', ['a {}', 'b {}']);

        expect(insertedCalls).toEqual([{
            rules   : ['a {}', 'b {}'],
            windowId: 'w1'
        }]);
        expect(deletedCalls).toEqual([]);
    });

    test('insertRules wraps a single rule string in an array before calling Stylesheet.insertCssRules', () => {
        Css.insertRules('w1', 'a {}');

        expect(insertedCalls).toEqual([{
            rules   : ['a {}'],
            windowId: 'w1'
        }]);
        expect(deletedCalls).toEqual([]);
    });

    test('deleteRules forwards an array of rules to Stylesheet.deleteCssRules', () => {
        Css.deleteRules('w1', ['a {}']);

        expect(deletedCalls).toEqual([{
            rules   : ['a {}'],
            windowId: 'w1'
        }]);
        expect(insertedCalls).toEqual([]);
    });

    test('deleteRules wraps a single rule string in an array before calling Stylesheet.deleteCssRules', () => {
        Css.deleteRules('w1', 'a {}');

        expect(deletedCalls).toEqual([{
            rules   : ['a {}'],
            windowId: 'w1'
        }]);
        expect(insertedCalls).toEqual([]);
    });
});
