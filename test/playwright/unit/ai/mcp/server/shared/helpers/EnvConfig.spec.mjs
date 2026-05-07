import { expect, test } from '@playwright/test';
import {
    parsePort,
    parseUrl,
    parseBool,
    parseString,
    parseNumber,
    setDeep,
    applyEnvBindings
} from '../../../../../../../../ai/mcp/server/shared/helpers/EnvConfig.mjs';

test.describe('EnvConfig', () => {
    test.describe('Parsers', () => {
        let warnings = [];
        const mockWarn = (msg) => warnings.push(msg);

        test.beforeEach(() => {
            warnings = [];
        });

        test('parsePort', () => {
            expect(parsePort('3000', 'PORT', mockWarn)).toBe(3000);
            expect(parsePort('0', 'PORT', mockWarn)).toBeUndefined();
            expect(parsePort('65536', 'PORT', mockWarn)).toBeUndefined();
            expect(parsePort('abc', 'PORT', mockWarn)).toBeUndefined();
            expect(warnings.length).toBe(3);
        });

        test('parseUrl', () => {
            expect(parseUrl('http://localhost:3000', 'URL', mockWarn)).toBe('http://localhost:3000');
            expect(parseUrl('http://localhost:3000/', 'URL', mockWarn)).toBe('http://localhost:3000');
            expect(parseUrl('not-a-url', 'URL', mockWarn)).toBeUndefined();
            expect(warnings.length).toBe(1);
        });

        test('parseBool', () => {
            expect(parseBool('true', 'BOOL', mockWarn)).toBe(true);
            expect(parseBool('false', 'BOOL', mockWarn)).toBe(false);
            expect(parseBool('1', 'BOOL', mockWarn)).toBeUndefined();
            expect(warnings.length).toBe(1);
        });

        test('parseNumber', () => {
            expect(parseNumber('123.45', 'NUM', mockWarn)).toBe(123.45);
            expect(parseNumber('abc', 'NUM', mockWarn)).toBeUndefined();
            expect(warnings.length).toBe(1);
        });
    });

    test.describe('setDeep', () => {
        test('nested write', () => {
            const obj = { a: { b: { c: 1 } } };
            setDeep(obj, 'a.b.c', 2);
            expect(obj.a.b.c).toBe(2);

            setDeep(obj, 'a.b.d', 3);
            expect(obj.a.b.d).toBe(3);
        });

        test('prevents prototype pollution', () => {
            let warnings = [];
            const mockWarn = (msg) => warnings.push(msg);
            const originalWarn = console.warn;
            console.warn = mockWarn;

            const obj = {};
            setDeep(obj, '__proto__.polluted', true);
            expect(obj.polluted).toBeUndefined();
            expect({}.polluted).toBeUndefined();
            
            setDeep(obj, 'constructor.prototype.polluted2', true);
            expect(obj.polluted2).toBeUndefined();
            expect({}.polluted2).toBeUndefined();

            console.warn = originalWarn;
            expect(warnings.length).toBe(2);
        });
    });

    test.describe('applyEnvBindings', () => {
        let warnings = [];
        const mockWarn = (msg) => warnings.push(msg);

        test.beforeEach(() => {
            warnings = [];
        });

        test('preserves empty strings without Neo', () => {
            const data = { val: 'default' };
            const env = { TEST_VAR: '' };
            const bindings = { 'val': 'TEST_VAR' };
            applyEnvBindings(data, bindings, env, mockWarn);
            expect(data.val).toBe('default');
        });

        test('rejection paths and nested writes', () => {
            const data = {
                nested: { port: 8000 },
                validUrl: 'http://default',
                invalidUrl: 'http://default',
            };
            const env = {
                PORT_VAR: 'abc', // invalid port
                VALID_URL_VAR: 'http://override/', // valid url
                INVALID_URL_VAR: 'not-a-url', // invalid url
            };
            const bindings = {
                'nested.port': { var: 'PORT_VAR', parse: parsePort },
                'validUrl': { var: 'VALID_URL_VAR', parse: parseUrl },
                'invalidUrl': { var: 'INVALID_URL_VAR', parse: parseUrl },
            };

            applyEnvBindings(data, bindings, env, mockWarn);
            
            expect(data.nested.port).toBe(8000); // rejected, untouched
            expect(data.validUrl).toBe('http://override'); // written, trailing slash removed
            expect(data.invalidUrl).toBe('http://default'); // rejected, untouched
            expect(warnings.length).toBe(2);
        });
    });
});
