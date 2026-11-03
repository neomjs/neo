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

    test('compiled Cyberpunk and Light theme sheets resolve offscreen slide transform, duration, and inner color intent', () => {
        const
            cyberGlobal = sass.compile(path.join(repoRoot, 'resources/scss/theme-cyberpunk/Global.scss')).css,
            cyberTheme  = sass.compile(path.join(repoRoot, 'resources/scss/theme-cyberpunk/component/Carousel.scss')).css,
            lightTheme  = sass.compile(path.join(repoRoot, 'resources/scss/theme-light/component/Carousel.scss')).css,
            structural  = sass.compile(srcPath).css;

        const parseDeclarations = css => {
            const map = new Map();

            for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
                const
                    selector = match[1].trim().replace(/\s+/g, ' '),
                    decls    = new Map();

                for (const raw of match[2].split(';')) {
                    const colon = raw.indexOf(':');
                    if (colon > 0) {
                        decls.set(raw.slice(0, colon).trim(), raw.slice(colon + 1).trim())
                    }
                }

                map.set(selector, {...(map.get(selector) || {}), ...Object.fromEntries(decls)})
            }

            return map
        };

        const resolveTheme = (themeCss, selector) => {
            const
                vars        = {...(parseDeclarations(cyberGlobal).get(selector) || {}), ...(parseDeclarations(themeCss).get(selector) || {})},
                structRules = parseDeclarations(structural),
                innerRule   = structRules.get('.neo-carousel .neo-carousel-inner') || {},
                itemRule    = structRules.get('.neo-carousel .neo-carousel-inner .neo-carousel-item') || {},
                offscreen   = structRules.get('.neo-carousel-translate-x-full') || {},
                scopeVars   = {...vars, ...offscreen};

            const resolveExpr = expr => {
                let current = expr;

                for (let depth = 0; depth < 5 && /var\(/.test(current); depth++) {
                    current = current.replace(/var\(\s*(--[a-z0-9-]+)\s*\)/g, (_, name) => {
                        return Object.hasOwn(scopeVars, name) ? scopeVars[name] : `__UNRESOLVED_${name}__`
                    })
                }

                return current
            };

            return {
                duration : resolveExpr(itemRule['transition-duration']),
                innerBg  : resolveExpr(innerRule['background-color']),
                transform: resolveExpr(offscreen.transform || itemRule.transform)
            }
        };

        expect(resolveTheme(cyberTheme, ':root .neo-theme-cyberpunk')).toEqual({
            duration : '.7s',
            innerBg  : '#00d2ff',
            transform: 'translate(100%, 0)'
        });
        expect(resolveTheme(lightTheme, ':root .neo-theme-light')).toEqual({
            duration : '.7s',
            innerBg  : '#1c60a0',
            transform: 'translate(100%, 0)'
        });
    });
});
