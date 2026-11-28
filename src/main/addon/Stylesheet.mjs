import Base           from './Base.mjs';
import DomAccess      from '../DomAccess.mjs';
import {isThemeClass} from '../../util/Theme.mjs';

/**
 * Logic to work with stylesheets, e.g. apply & switch Neo based themes
 * @class Neo.main.addon.Stylesheet
 * @extends Neo.main.addon.Base
 */
class Stylesheet extends Base {
    /**
     * @member {String} dynamicStyleSheetId='neo-dynamic-stylesheet'
     * @protected
     */
    dynamicStyleSheetId = 'neo-dynamic-stylesheet';
    /**
     * Theme class → CSS folder list populated from `resources/theme-map.json`.
     * @member {Object<String,String[]>|null} themeMap=null
     * @protected
     */
    themeMap = null;
    /**
     * Theme classes without an entry in `themeMap` that have already been warned about once.
     * @member {Set<String>} unmappedThemes
     * @protected
     */
    unmappedThemes = new Set();

    static config = {
        /**
         * @member {String} className='Neo.main.addon.Stylesheet'
         * @protected
         */
        className: 'Neo.main.addon.Stylesheet',
        /**
         * Remote method access for other workers
         * @member {Object} remote={app: [//...]}
         * @protected
         * @reactive
         */
        remote: {
            app: [
                'addThemeFiles',
                'createStyleSheet',
                'deleteCssRules',
                'insertCssRules',
                'setCssVariable',
                'setThemeMap',
                'swapStyleSheet'
            ]
        }
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let neoConfig = Neo.config,
            env       = neoConfig.environment,
            faPath;

        if (!neoConfig.useSSR) {
            if (neoConfig.useFontAwesome) {
                if (env === 'development' || env === 'dist/esm') {
                    faPath = neoConfig.basePath + 'node_modules/@fortawesome/fontawesome-free/css/all.min.css'
                } else {
                    faPath = neoConfig.basePath.substring(6) + 'resources/fontawesome-free/css/all.min.css'
                }

                DomAccess.loadStylesheet(faPath)
            }

            if (neoConfig.themes.length > 0 && neoConfig.themes[0] !== '') {
                document.body.classList.add(neoConfig.themes[0])
            }
        }
    }

    /**
     * @summary Loads `src`, `theme-base`, and each mapped theme folder's stylesheet for `data.className` once.
     *
     * Loads one file per class per resolved folder. The fan-out is intentional and bundling is not
     * an available alternative: any component tree, at any nesting depth, can be moved from the
     * main window into another one, so a second window's class set is not knowable ahead of time.
     * Pre-bundling would mean shipping every possible combination of those trees — which costs more
     * than it saves and still cannot cover a combination nobody anticipated.
     *
     * File granularity is what makes the delta work instead: a window fetches exactly the classes
     * it ends up rendering, and a single changed class is swapped in every open window without
     * rebuilding anything. The per-class request count is the price of that, deliberately paid.
     * @param {Object} data
     * @param {String} [data.appName]
     * @param {String} data.className
     * @param {String[]} data.folders
     * @param {String[]} [data.themes]
     */
    async addThemeFiles(data) {
        let {className} = data,
            {config}    = Neo,
            env         = config.environment,
            path        = env.startsWith('dist/') ? '' : config.appPath.includes('docs') ? `../dist/${env}/` : `../../dist/${env}/`,
            promises    = [],
            rootPath    = config.basePath.substring(6),
            available   = new Set(data.folders),
            ordered     = ['src', 'theme-base', ...this.resolveThemeFolders(data.themes ?? config.themes)],
            seen        = new Set();

        if (className.startsWith('Neo.')) {
            className = className.substring(4)
        }

        className = className.split('.').join('/');

        for (const folder of ordered) {
            if (available.has(folder) && !seen.has(folder)) {
                seen.add(folder);

                const href = `${rootPath}${path}css/${folder}/${className}.css`;

                if (!this.hasStyleSheet(href)) {
                    promises.push(this.createStyleSheet({href}))
                }
            }
        }

        await Promise.all(promises)
    }

    /**
     * Use either name for a neo theme (e.g. 'neo-theme-dark.css') or pass a href
     * @param {Object} data
     * @param {String} [data.name]
     * @param {String} [data.id]
     * @param {String} [data.href]
     * @returns {Promise<void>}
     */
    async createStyleSheet({name, id, href}) {
        if (!name && !href) {
            throw new Error('createStyleSheet: you need to either pass a name or a href')
        }

        return new Promise((resolve, reject) => {
            let link = document.createElement('link'),
                env  = Neo.config.environment,
                path = env.startsWith('dist/') ? env : ('dist/' + env),
                url  = href ? href : Neo.config.basePath + path + '/' + name;

            Object.assign(link, {
                href: url,
                rel : 'stylesheet',
                type: 'text/css'
            });

            if (id) {
                link.id = id
            }

            link.addEventListener('error', function() {reject(new Error(`Stylesheet failed to load: ${url}`))})
            link.addEventListener('load',  function() {resolve()})

            document.head.appendChild(link)
        })
    }

    /**
     * @param {Object} data
     * @param {Array} data.rules
     * @protected
     */
    deleteCssRules(data) {
        let styleEl    = document.getElementById(this.dynamicStyleSheetId),
            styleSheet = styleEl.sheet,
            {cssRules} = styleSheet,
            i          = 0,
            len        = data.rules.length,
            j, rulesLen;

        for (; i < len; i++) {
            j        = 0;
            rulesLen = cssRules.length;

            for (; j < rulesLen; j++) {
                if (cssRules[j].selectorText === data.rules[i]) {
                    styleSheet.deleteRule(j);
                    break
                }
            }
        }
    }

    /**
     * @param {String} token
     * @returns {Boolean}
     */
    hasStyleSheet(token) {
        let i   = 0,
            len = document.styleSheets.length,
            sheet;

        for (; i < len; i++) {
            sheet = document.styleSheets[i];
            if (sheet.href?.includes(token)) {
                return true
            }
        }

        return false
    }

    /**
     * @param {Object} data
     * @param {Array} data.rules
     * @protected
     */
    insertCssRules(data) {
        let styleEl = document.getElementById(this.dynamicStyleSheetId),
            i       = 0,
            len     = data.rules.length,
            styleSheet;

        if (!styleEl) {
            styleEl = document.createElement('style');

            styleEl.id = this.dynamicStyleSheetId;
            document.head.appendChild(styleEl)
        }

        styleSheet = styleEl.sheet;

        for (; i < len; i++) {
            styleSheet.insertRule(data.rules[i], styleSheet.cssRules.length)
        }
    }

    /**
     * @param {Object} opts
     * @param {String[]} opts.included
     * @param {String[]} opts.excluded
     */
    removeStyleSheets(opts) {
        let i        = 0,
            len      = document.styleSheets.length,
            included = opts.included || [],
            excluded = opts.included || [],
            sheet, removeSheet;

        for (; i < len; i++) {
            sheet = document.styleSheets[i];

            removeSheet = true;

            if (sheet.href) {
                excluded.forEach(name => {
                    if (sheet.href.includes(name)) {
                        removeSheet = false
                    }
                });

                if (removeSheet) {
                    included.forEach(name => {
                        if (!sheet.href.includes(name)) {
                            removeSheet = false
                        }
                    });

                    if (removeSheet) {
                        sheet.ownerNode.parentNode.removeChild(sheet.ownerNode)
                    }
                }
            }
        }
    }

    /**
     * @summary Walks a CSSRuleList (including `@layer` and other grouping blocks) for a rule matching `selectorPattern` that declares `key`.
     * @param {CSSRuleList|Array} cssRules
     * @param {RegExp|null} selectorPattern
     * @param {String} key
     * @param {CSSStyleSheet|CSSGroupingRule} container
     * @returns {{container: (CSSStyleSheet|CSSGroupingRule), rule: CSSStyleRule}|null}
     * @protected
     */
    findCssVariableRule(cssRules, selectorPattern, key, container) {
        let sharedMatch = null;

        for (const rule of cssRules) {
            if (rule.style && (!selectorPattern || selectorPattern.test(rule.selectorText))) {
                if (rule.style.getPropertyValue(key) !== '') {
                    const themeClasses = rule.selectorText
                        ? [...new Set([...rule.selectorText.matchAll(/\.(neo-theme-[a-zA-Z0-9_-]+)/g)].map(m => m[1]).filter(isThemeClass))]
                        : [];

                    if (themeClasses.length <= 1) {
                        return {container, rule}
                    }

                    sharedMatch ??= {container, rule}
                }
            }

            if (rule.cssRules?.length) {
                const nested = this.findCssVariableRule(rule.cssRules, selectorPattern, key, rule);

                if (nested) {
                    if (nested.single !== false) {
                        return nested
                    }

                    sharedMatch ??= nested
                }
            }
        }

        return sharedMatch ? {...sharedMatch, single: false} : null
    }

    /**
     * @summary Resolves theme class names to unique CSS folder names through `themeMap`, logging once per unmapped class.
     * @param {String[]} [themes=Neo.config.themes]
     * @returns {String[]}
     * @protected
     */
    resolveThemeFolders(themes=Neo.config.themes) {
        const folders  = new Set(),
              themeMap = this.themeMap || {};

        for (const theme of themes || []) {
            if (!theme) continue;

            const mapped = themeMap[theme];

            if (Array.isArray(mapped) && mapped.length > 0) {
                mapped.forEach(folder => folders.add(folder))
            } else if (!this.unmappedThemes.has(theme)) {
                this.unmappedThemes.add(theme);
                console.warn(`Neo.main.addon.Stylesheet: theme class "${theme}" has no entry in resources/theme-map.json`)
            }
        }

        return [...folders]
    }

    /**
     * @summary Updates a CSS custom property on the rule mapped to `data.theme`, walking into `@layer` blocks and skipping `<style>` sheets.
     * @param {Object} data
     * @param {String[]} [data.folders] Resolved folders for `data.theme`
     * @param {String} data.key
     * @param {String} [data.priority] optionally pass 'important'
     * @param {String} data.theme Theme class name (e.g. 'neo-theme-neo-dark')
     * @param {String} data.value
     * @returns {Boolean}
     */
    setCssVariable(data) {
        let {key, theme} = data,
            folders      = data.folders ?? (theme ? this.resolveThemeFolders([theme]) : []);

        if (!folders?.length) {
            return false
        }

        if (!key.startsWith('--')) {
            key = '--' + key
        }

        const escapedTheme    = theme ? theme.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null,
              selectorPattern = escapedTheme ? new RegExp(`\\.${escapedTheme}(?![a-zA-Z0-9_-])`) : null;

        for (const sheet of document.styleSheets) {
            if (!sheet.href || !folders.some(folder => sheet.href.includes(`/css/${folder}/`))) {
                continue
            }

            const match = this.findCssVariableRule(sheet.cssRules, selectorPattern, key, sheet);

            if (match) {
                if (match.single === false && theme) {
                    const exactSelector = `.${theme}`,
                          siblings      = match.container.cssRules;

                    let targetRule = null;

                    for (let i = siblings.length - 1; i >= 0; i--) {
                        const candidate = siblings[i];

                        if (candidate === match.rule) break;

                        if (candidate.style && candidate.selectorText?.trim() === exactSelector) {
                            targetRule = candidate;
                            break
                        }
                    }

                    if (!targetRule && typeof match.container.insertRule === 'function') {
                        const prioritySuffix = data.priority === 'important' ? ' !important' : '',
                              index          = match.container.insertRule(
                                  `${exactSelector} { ${key}: ${data.value}${prioritySuffix}; }`,
                                  siblings.length
                              );

                        targetRule = siblings[index];

                        if (targetRule) {
                            return true
                        }
                    }

                    if (targetRule) {
                        targetRule.style.setProperty(key, data.value, data.priority);
                        return true
                    }
                }

                match.rule.style.setProperty(key, data.value, data.priority);
                return true
            }
        }

        return false
    }

    /**
     * @summary Stores the `class → folders` section from `resources/theme-map.json` on this window's Stylesheet addon.
     * @param {Object} data
     * @param {Object<String,String[]>} data.themes
     */
    setThemeMap({themes}) {
        this.themeMap = themes || {}
    }

    /**
     * @param {Object} data
     * @param {String} data.href
     * @param {String} data.id
     */
    swapStyleSheet(data) {
        document.getElementById(data.id).setAttribute('href', data.href)
    }
}

export default Neo.setupClass(Stylesheet);
