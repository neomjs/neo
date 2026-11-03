import {test, expect}       from '@playwright/test';
import fs                   from 'node:fs';
import path                 from 'node:path';
import {fileURLToPath}      from 'node:url';
import * as sass            from 'sass';
import {findSelectorBlocks} from '../../../../buildScripts/util/check-theme-value-files.mjs';

const
    __dirname = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot  = path.resolve(__dirname, '../../../..'),
    srcPath   = path.join(repoRoot, 'resources/scss/src/component/Carousel.scss'),
    themes    = [
        {name: 'theme-light',     selector: ':root .neo-theme-light',        path: path.join(repoRoot, 'resources/scss/theme-light/component/Carousel.scss')},
        {name: 'theme-dark',      selector: ':root .neo-theme-dark',         path: path.join(repoRoot, 'resources/scss/theme-dark/component/Carousel.scss')},
        {name: 'theme-neo-light', selector: ':where(.neo-theme-neo-light)',  path: path.join(repoRoot, 'resources/scss/theme-neo-light/component/Carousel.scss')},
        {name: 'theme-neo-dark',  selector: ':where(.neo-theme-neo-dark)',   path: path.join(repoRoot, 'resources/scss/theme-neo-dark/component/Carousel.scss')},
        {name: 'theme-cyberpunk', selector: ':root .neo-theme-cyberpunk',    path: path.join(repoRoot, 'resources/scss/theme-cyberpunk/component/Carousel.scss')}
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

    test('all five theme value sheets declare every consumed --carousel-* token with zero nested selectors', () => {
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

    test('compiled Cyberpunk and Light theme sheets resolve offscreen slide transform, duration, and inner color intent', async ({page}) => {
        const
            cyberGlobal = sass.compile(path.join(repoRoot, 'resources/scss/theme-cyberpunk/Global.scss')).css,
            cyberTheme  = sass.compile(path.join(repoRoot, 'resources/scss/theme-cyberpunk/component/Carousel.scss')).css,
            lightTheme  = sass.compile(path.join(repoRoot, 'resources/scss/theme-light/component/Carousel.scss')).css,
            structural  = sass.compile(srcPath).css;

        await page.setContent(`
            <style>${cyberGlobal}\n${cyberTheme}\n${lightTheme}\n${structural}</style>
            <div id="cyber-host" class="neo-theme-cyberpunk">
                <div class="neo-carousel" style="width: 430px; box-sizing: border-box;">
                    <div class="neo-carousel-inner" style="width: 400px;">
                        <div class="neo-carousel-item neo-carousel-translate-x-full"></div>
                    </div>
                </div>
            </div>
            <div id="light-host" class="neo-theme-light">
                <div class="neo-carousel" style="width: 430px; box-sizing: border-box;">
                    <div class="neo-carousel-inner" style="width: 400px;">
                        <div class="neo-carousel-item neo-carousel-translate-x-full"></div>
                    </div>
                </div>
            </div>
        `);

        const measured = await page.evaluate(() => {
            const read = rootSelector => {
                const
                    root      = document.querySelector(rootSelector),
                    inner     = root.querySelector('.neo-carousel-inner'),
                    item      = root.querySelector('.neo-carousel-item'),
                    innerComp = getComputedStyle(inner),
                    itemComp  = getComputedStyle(item);

                return {
                    innerBg  : innerComp.backgroundColor,
                    duration : itemComp.transitionDuration,
                    transform: itemComp.transform
                }
            };

            return {
                cyberpunk: read('#cyber-host'),
                light    : read('#light-host')
            }
        });

        expect(measured.cyberpunk).toEqual({
            innerBg  : 'rgb(0, 210, 255)',
            duration : '0.7s',
            transform: 'matrix(1, 0, 0, 1, 400, 0)'
        });
        expect(measured.light).toEqual({
            innerBg  : 'rgb(28, 96, 160)',
            duration : '0.7s',
            transform: 'matrix(1, 0, 0, 1, 400, 0)'
        });
    });
});
