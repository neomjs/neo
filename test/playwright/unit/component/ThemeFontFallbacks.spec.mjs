import {test, expect} from '@playwright/test';
import {readFileSync}  from 'node:fs';

for (const theme of ['neo-light', 'neo-dark']) {
    test(`${theme} font tokens include generic fallbacks`, () => {
        const css = readFileSync(new URL(`../../../../resources/css/theme-${theme}/Global.css`, import.meta.url), 'utf8');

        expect(css).toMatch(/--core-fontfamily-mono\s*:\s*'Source Code Pro',\s*monospace\s*;/);
        expect(css).toMatch(/--core-fontfamily-sans\s*:\s*'Source Sans 3',\s*sans-serif\s*;/);
        expect(css).toMatch(/--core-fontfamily-serif\s*:\s*'Source Serif Pro',\s*serif\s*;/);
    });
}
