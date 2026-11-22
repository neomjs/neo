import {test, expect}      from '@playwright/test';
import {resolveStartTheme} from '../../../../src/util/Theme.mjs';

test.describe('Neo.util.Theme resolveStartTheme', () => {
    const themes = ['neo-theme-light', 'neo-theme-neo-dark'];

    test('returns the theme a configured `?theme=` names', () => {
        const url = new URL('https://neomjs.com/?theme=neo-theme-neo-dark');

        expect(resolveStartTheme({prefersDarkTheme: false, themes, url})).toBe('neo-theme-neo-dark');
    });

    test('ignores a `?theme=` that is not configured', () => {
        const url = new URL('https://neomjs.com/?theme=neo-theme-unknown');

        expect(resolveStartTheme({prefersDarkTheme: false, themes, url})).toBe('neo-theme-light');
    });

    test('prefers the dark theme on a dark system when it is configured', () => {
        const url = new URL('https://neomjs.com/');

        expect(resolveStartTheme({prefersDarkTheme: true, themes, url})).toBe('neo-theme-neo-dark');
    });

    test('falls back to the first configured theme on a dark system without the dark theme configured', () => {
        const url = new URL('https://neomjs.com/');

        expect(resolveStartTheme({prefersDarkTheme: true, themes: ['neo-theme-light'], url})).toBe('neo-theme-light');
    });

    test('falls back to the first configured theme on a light system', () => {
        const url = new URL('https://neomjs.com/');

        expect(resolveStartTheme({prefersDarkTheme: false, themes, url})).toBe('neo-theme-light');
    });

    test('reads the plain object shape Neo.config.url ships as', () => {
        const url = {search: '?theme=neo-theme-neo-dark'};

        expect(resolveStartTheme({prefersDarkTheme: false, themes, url})).toBe('neo-theme-neo-dark');
    });

    test('tolerates a missing url', () => {
        expect(resolveStartTheme({prefersDarkTheme: false, themes})).toBe('neo-theme-light');
    });
});
