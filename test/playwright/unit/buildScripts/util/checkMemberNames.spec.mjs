import {test, expect} from '@playwright/test';
import {DEFAULT_DIR, findMismatchedMembers, scanDir}                from '../../../../../buildScripts/util/checkMemberNames.mjs';

/**
 * Regression spec for neomjs/neo#21862: four configs in `src/form/field/` carried a copy of a
 * neighbouring config's `@member` line, so the generated API docs documented the wrong config.
 * The guard `buildScripts/util/checkMemberNames.mjs` fails when a `@member` name differs from
 * the config key declared directly below its doc block.
 */
const block = (...lines) => ['/**', ...lines.map(l => ' * ' + l), ' */'].join('\n');

test.describe('checkMemberNames guard', () => {
    test('passes when the @member name matches the config key below the block', () => {
        const src = [
            'class X {',
            '    static config = {',
            '        className: \'X\',',
            block('@member {String} isTouchedEvent_=\'focusLeave\'', '@reactive'),
            '        isTouchedEvent_: \'focusLeave\'',
            '    }',
            '}'
        ].join('\n');

        expect(findMismatchedMembers(src)).toEqual([]);
    });

    test('flags the four #21862 shapes: @member names a neighbouring config', () => {
        // Base.mjs: the isTouchedEvent_ block carried isTouched_'s @member line
        const base = [
            block('Event name which sets isTouched to true.', '@member {String} isTouched_=false', '@reactive'),
            '        isTouchedEvent_: \'focusLeave\','
        ].join('\n');
        // Color.mjs: the colorFormatter block carried colorField's @member line
        const color = [
            block('@member {Function} colorField=(scope,data)=>data[scope.colorField]'),
            '        colorFormatter: (scope,data) => data[scope.colorField],'
        ].join('\n');
        // Number.mjs: the excludedValues block carried excluded's @member line
        const number = [
            block('@member {Number[]|null} excluded=null'),
            '        excludedValues: null,'
        ].join('\n');
        // Range.mjs: the useSpinButtons block carried useInputEvent's @member line
        const range = [
            block('@member {Boolean} useInputEvent=false'),
            '        useSpinButtons: false'
        ].join('\n');

        for (const [src, expected] of [[base, 'isTouched_'], [color, 'colorField'], [number, 'excluded'], [range, 'useInputEvent']]) {
            const hits = findMismatchedMembers(src);
            expect(hits).toHaveLength(1);
            expect(hits[0].member).toBe(expected);
        }

        expect(findMismatchedMembers(base)[0].key).toBe('isTouchedEvent_');
        expect(findMismatchedMembers(color)[0].key).toBe('colorFormatter');
        expect(findMismatchedMembers(number)[0].key).toBe('excludedValues');
        expect(findMismatchedMembers(range)[0].key).toBe('useSpinButtons');
    });

    test('reports the 1-based line number of the offending @member line', () => {
        const src = ['    static config = {', block('@member {Boolean} other=false'), '        realKey: false', '    }'].join('\n');
        const hits = findMismatchedMembers(src);
        expect(hits).toHaveLength(1);
        expect(hits[0].line).toBe(3); // block starts on line 2, @member is its second line
    });

    test('ignores doc blocks that are not directly above a config key (methods, nested objects)', () => {
        const src = [
            'class X {',
            '    static config = {',
            block('@member {Object|null} listConfig'),
            '        listConfig: {',
            '            module: ColorList,', // nested key: line above is not a doc block end
            '            key   : \'id\'',
            '        }',
            '    }',
            block('@param {Object} config'),
            '    constructor(config) {}',
            '}'
        ].join('\n');

        expect(findMismatchedMembers(src)).toEqual([]);
    });

    test('ignores single-star block comments and line comments (only /** doc blocks count)', () => {
        expect(findMismatchedMembers(['/*', ' * @member {String} wrong=false', ' */', 'realKey: false'].join('\n'))).toEqual([]);
        expect(findMismatchedMembers('// @member {String} wrong=false\nrealKey: false')).toEqual([]);
    });

    test('a block without a @member line is not checked', () => {
        const src = [block('Plain description, no member tag.'), '        someKey: 1'].join('\n');
        expect(findMismatchedMembers(src)).toEqual([]);
    });

    test('a single trailing underscore (reactive config) is normalised, not flagged', () => {
        // Both spellings exist across src/ (`isTouched_` in Base.mjs, `headers` above `headers_`
        // in FileUpload.mjs), so the underscore alone is not the defect this guard hunts.
        const src = [
            block('@member {Object} headers', '@reactive'),
            '        headers_: {}'
        ].join('\n');
        expect(findMismatchedMembers(src)).toEqual([]);
    });

    test('regression: the real src/form/field tree has no mismatched @member line', () => {
        // This is the test that failed before the #21862 fix and passes after it.
        expect(scanDir(DEFAULT_DIR)).toEqual([]);
    });
});
