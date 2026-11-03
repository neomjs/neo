import {test, expect}       from '@playwright/test';
import fs                   from 'node:fs';
import path                 from 'node:path';
import {fileURLToPath}      from 'node:url';
import {findSelectorBlocks} from '../../../../buildScripts/util/check-theme-value-files.mjs';

const
    __dirname = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot  = path.resolve(__dirname, '../../../..'),
    srcPath   = path.join(repoRoot, 'resources/scss/src/component/Carousel.scss'),
    themes    = [
        {name: 'theme-light',     selector: ':root .neo-theme-light',        path: path.join(repoRoot, 'resources/scss/theme-light/component/Carousel.scss')},
        {name: 'theme-dark',      selector: ':root .neo-theme-dark',         path: path.join(repoRoot, 'resources/scss/theme-dark/component/Carousel.scss')},
        {name: 'theme-neo-light', selector: ':where(.neo-theme-neo-light)',  path: path.join(repoRoot, 'resources/scss/theme-neo-light/component/Carousel.scss')},
        {name: 'theme-neo-dark',  selector: ':where(.neo-theme-neo-dark)',   path: path.join(repoRoot, 'resources/scss/theme-neo-dark/component/Carousel.scss')}
    ];

const extractDefinedTokens = source => new Set(
    [...source.matchAll(/^\s*(--carousel-[a-z0-9-]+)\s*:/gm)].map(m => m[1])
);

const extractConsumedTokens = source => new Set(
    [...source.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map(m => m[1])
);

test.describe('Neo.component.Carousel SCSS theme variable files', () => {
    test('src/component/Carousel.scss consumes only --carousel-* tokens and no foreign component tokens', () => {
        const
            src      = fs.readFileSync(srcPath, 'utf8'),
            consumed = [...extractConsumedTokens(src)].sort();

        expect(consumed).toEqual([
            '--carousel-background-color',
            '--carousel-duration',
            '--carousel-inner-background-color',
            '--carousel-inner-color',
            '--carousel-transition-timing',
            '--carousel-translate-x',
            '--carousel-translate-y'
        ]);

        expect(src).not.toContain('--neo-carousel-');
        expect(src).not.toContain('--container-');
        expect(src).not.toContain('--button-');
    });

    test('all four theme value sheets declare every consumed --carousel-* token with zero nested selectors', () => {
        const
            src      = fs.readFileSync(srcPath, 'utf8'),
            consumed = [...extractConsumedTokens(src)].sort();

        for (const theme of themes) {
            expect(fs.existsSync(theme.path), `${theme.name}/component/Carousel.scss exists`).toBe(true);

            const
                content = fs.readFileSync(theme.path, 'utf8'),
                defined = [...extractDefinedTokens(content)].sort();

            expect(content.trimStart().startsWith(theme.selector), `${theme.name} uses ${theme.selector}`).toBe(true);
            expect(defined, `${theme.name} defines all consumed --carousel-* tokens`).toEqual(consumed);
            expect(findSelectorBlocks(theme.path), `${theme.name} declares variables only`).toEqual([]);
        }
    });
});
