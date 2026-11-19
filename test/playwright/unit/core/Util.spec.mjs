import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'CoreUtilTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Util           from '../../../../src/core/Util.mjs';

test.describe('Neo.core.Util style helpers', () => {
    test('createStyleObject parses several declarations and ignores a trailing semicolon', () => {
        expect(Util.createStyleObject('width: 10px; opacity: 0.5; background-color: red;')).toEqual({
            width          : '10px',
            opacity        : 0.5,
            backgroundColor: 'red'
        })
    });

    test('createStyleObject keeps a semicolon inside url() parentheses', () => {
        expect(Util.createStyleObject("background-image: url('data:image/png;base64,AAA='); color: red")).toEqual({
            backgroundImage: "url('data:image/png;base64,AAA=')",
            color          : 'red'
        })
    });

    test('createStyleObject splits a declaration at its first colon only', () => {
        expect(Util.createStyleObject("background-image: url('http://example.com/a.png')")).toEqual({
            backgroundImage: "url('http://example.com/a.png')"
        })
    });

    test('createStyleObject camel-cases properties and turns purely numeric values into numbers', () => {
        const style = Util.createStyleObject('z-index: 5; flex: 1; width: 10px');

        expect(style).toEqual({zIndex: 5, flex: 1, width: '10px'});
        expect(style.zIndex).toBe(5);
        expect(style.width).toBe('10px')
    });

    test('createStyles kebab-cases keys and skips null and undefined values', () => {
        expect(Util.createStyles({backgroundColor: 'red', opacity: 0.5, width: null, height: undefined}))
            .toBe('background-color:red;opacity:0.5;')
    });

    test('createStyleObject reverses createStyles', () => {
        const style = {width: '10px', opacity: 0.5, backgroundColor: 'red'};

        expect(Util.createStyleObject(Util.createStyles(style))).toEqual(style)
    });

    test('createStyleObject patterns are static members', () => {
        expect("a: url('x;y'); b: 1".split(Util.styleDeclarationRegEx)).toEqual(["a: url('x;y')", ' b: 1']);
        expect('a: http://x'.split(Util.stylePropertyRegEx)).toEqual(['a', ' http://x', '']);
        expect('z-index'.replace(Util.camelRegEx, (str, letter) => letter.toUpperCase())).toBe('zIndex')
    });
});
