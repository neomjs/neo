import Base from './Base.mjs';

/**
 * Logic to work with stylesheets, e.g. apply & switch Neo based themes
 * main.addon.HighlightJS requires this file
 * @class Neo.main.addon.Stylesheet
 * @extends Neo.main.addon.Base
 */
class Stylesheet extends Base {
    /**
     * @member {String} dynamicStyleSheetId='neo-dynamic-stylesheet'
     * @protected
     */
    dynamicStyleSheetId = 'neo-dynamic-stylesheet';

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
                'swapStyleSheet'
            ]
        }
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let neoConfig = Neo.config;

        if (!neoConfig.useSSR) {
            if (neoConfig.useFontAwesome) {
                this.createStyleSheet({
                    href: this.getFontAwesomePath()
                })
            }

            if (neoConfig.themes.length > 0 && neoConfig.themes[0] !== '') {
                this.addGlobalCss()
            }
        }
    }

    /**
     *
     */
    addGlobalCss() {
        let {config} = Neo,
            {themes} = config,
            folders  = ['src', ...themes],
            cssRoot  = this.getCssRoot();

        document.body.classList.add(themes[0]);

        folders.forEach(folder => {
            if (folder.startsWith('neo-')) {
                folder = folder.substring(4)
            }

            this.createStyleSheet({
                href: `${cssRoot}css/${folder}/Global.css`
            })
        })
    }

    /**
     * @summary Resolves the dist-tree root for stylesheet/resource URLs when `basePath` is absolute.
     *
     * The relative arithmetic in {@link #getCssRoot} (`basePath.substring(6)` = strip one `../../`
     * hop) is exact for the engine's own serving, where a dist page lives INSIDE
     * `dist/<env>/apps/<app>/` and `basePath` climbs to the repository root. An absolute mount
     * (one index per app OUTSIDE dist, e.g. `basePath: '/mount/'`) has no hops to strip — the dist
     * tree hangs directly under the mount, so the root is `basePath + 'dist/<env>/'` (dist
     * environments already carry the `dist/` prefix in their name). Returns `null` for relative
     * basePaths, so callers keep the proven relative arithmetic byte-identical.
     * @returns {String|null}
     * @protected
     */
    getAbsoluteDistRoot() {
        let {basePath, environment: env} = Neo.config;

        if (basePath.startsWith('/') || /^https?:\/\//.test(basePath)) {
            return `${basePath}${env.startsWith('dist/') ? env : `dist/${env}`}/`
        }

        return null
    }

    /**
     * @summary The Font Awesome stylesheet URL for the active environment.
     *
     * Source and `dist/esm` fetch from the package inside `node_modules` (already basePath-rooted,
     * so absolute mounts need no help). The bundled environments carry a copied
     * `resources/fontawesome-free` tree inside `dist/<env>/`, addressed through the same dist-root
     * derivation as every stylesheet.
     * @returns {String}
     * @protected
     */
    getFontAwesomePath() {
        let {basePath, environment: env} = Neo.config;

        if (env === 'development' || env === 'dist/esm') {
            return basePath + 'node_modules/@fortawesome/fontawesome-free/css/all.min.css'
        }

        return (this.getAbsoluteDistRoot() ?? basePath.substring(6)) + 'resources/fontawesome-free/css/all.min.css'
    }

    /**
     * @summary The URL prefix every theme/global stylesheet hangs from, ending at the dist tree.
     *
     * Absolute mounts resolve through {@link #getAbsoluteDistRoot}; relative basePaths keep the
     * original page-relative arithmetic (`rootPath` compensates app depth beyond two levels,
     * `path` adds the fixed hop into `dist/<env>/` for non-dist environments, and a dist-mode
     * page already lives inside the dist tree).
     * @returns {String}
     * @protected
     */
    getCssRoot() {
        let absoluteRoot = this.getAbsoluteDistRoot();

        if (absoluteRoot) {
            return absoluteRoot
        }

        let {config} = Neo,
            env      = config.environment,
            path     = env.startsWith('dist/') ? '' : config.appPath.includes('docs') ? `../dist/${env}/` : `../../dist/${env}/`;

        return config.basePath.substring(6) + path
    }

    /**
     * @param {Object} data
     * @param {String} data.appName
     * @param {String} data.className
     * @param {String[]} data.folders
     */
    async addThemeFiles(data) {
        let {className} = data,
            {config}    = Neo,
            cssRoot     = this.getCssRoot(),
            promises    = [];

        if (className.startsWith('Neo.')) {
            className = className.substring(4)
        }

        className = className.split('.').join('/');

        data.folders.forEach(folder => {
            if (folder === 'src' || folder.includes('theme-') && config.themes.includes(`neo-${folder}`)) {
                promises.push(this.createStyleSheet({
                    href: `${cssRoot}css/${folder}/${className}.css`
                }))
            }
        });

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
            i     = 0,
            len   = data.rules.length,
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
     * @param {Object} data
     * @param {String} data.key
     * @param {String} [data.priority] optionally pass 'important'
     * @param {String} data.theme
     * @param {String} data.value
     */
    setCssVariable(data) {
        let {key} = data,
            rule, sheet;

        if (!key.startsWith('--')) {
            key = '--' + key
        }

        for (sheet of document.styleSheets) {
            if (sheet.href.includes(data.theme)) {
                for (rule of sheet.cssRules) {
                    if (Neo.typeOf(rule) === 'CSSStyleRule') {
                        if (rule.style.getPropertyValue(key) !== '') {
                            rule.style.setProperty(key, data.value, data.priority);
                            return true
                        }
                    }
                }
            }
        }

        return false
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
