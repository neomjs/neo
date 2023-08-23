import Base from '../../core/Base.mjs';

/**
 * Logic to work with stylesheets, e.g. apply & switch Neo based themes
 * main.addon.HighlightJS requires this file
 * @class Neo.main.addon.Stylesheet
 * @extends Neo.core.Base
 * @singleton
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
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let neoConfig = Neo.config,
            faPath;

        if (neoConfig.useFontAwesome) {
            if (neoConfig.environment === 'development') {
                faPath = neoConfig.basePath + 'node_modules/@fortawesome/fontawesome-free/css/all.min.css';
            } else {
                faPath = neoConfig.basePath.substr(6) + 'resources/fontawesome-free/css/all.min.css';
            }

            this.createStyleSheet(null, null, faPath);
        }

        if (neoConfig.themes.length > 0 && neoConfig.themes[0] !== '') {
            this.addGlobalCss();
        }
    }

    /**
     *
     */
    addGlobalCss() {
        let config   = Neo.config,
            themes   = config.themes,
            folders  = [themes[0]],
            env      = config.environment,
            path      = env.startsWith('dist/') ? '' : config.appPath.includes('docs') ? `../dist/${env}/` : `../../dist/${env}/`,
            rootPath = config.basePath.substr(6);

        document.body.classList.add(themes[0]);

        folders.forEach(folder => {
            if (folder.startsWith('neo-')) {
                folder = folder.substring(4);
            }

            this.createStyleSheet(
                null,
                null,
                `${rootPath}${path}css/${folder}/Global.css`
            );
        });
    }

    /**
     * @param {Object} data
     * @param {String} data.appName
     * @param {String} data.className
     * @param {String[]} data.folders
     */
    addThemeFiles(data) {
        let className = data.className,
            config    = Neo.config,
            env       = config.environment,
            path      = env.startsWith('dist/') ? '' : config.appPath.includes('docs') ? `../dist/${env}/` : `../../dist/${env}/`,
            rootPath  = config.basePath.substr(6);

        if (className.startsWith('Neo.')) {
            className = className.substring(4);
        }

        className = className.split('.').join('/');

        data.folders.forEach(folder => {
            if (folder === 'src' && folder.includes('theme-') && config.themes[0] === `neo-${folder}`) {
                this.createStyleSheet(
                    null,
                    null,
                    `${rootPath}${path}css/${folder}/${className}.css`
                )
            }
        })
    }

    /**
     * Use either name for a neo theme (e.g. 'neo-theme-dark.css') or pass a href
     * @param {String} [name]
     * @param {String} [id]
     * @param {String} [href]
     */
    createStyleSheet(name, id, href) {
        if (!name && !href) {
            throw new Error('createStyleSheet: you need to either pass a name or a href');
        }

        const link = document.createElement('link'),
              env  = Neo.config.environment,
              path = env.startsWith('dist/') ? env : ('dist/' + env),
              url  = href ? href : Neo.config.basePath + path + '/' + name;

        Object.assign(link, {
            href: url,
            rel : 'stylesheet',
            type: 'text/css'
        });

        if (id) {
            link.id = id;
        }

        document.head.appendChild(link);
    }

    /**
     * @param {Object} data
     * @param {Array} data.rules
     * @protected
     */
    deleteCssRules(data) {
        let styleEl    = document.getElementById(this.dynamicStyleSheetId),
            styleSheet = styleEl.sheet,
            cssRules   = styleSheet.cssRules,
            i          = 0,
            len        = data.rules.length,
            j, rulesLen;

        for (; i < len; i++) {
            j        = 0;
            rulesLen = cssRules.length;

            for (; j < rulesLen; j++) {
                if (cssRules[j].selectorText === data.rules[i]) {
                    styleSheet.deleteRule(j);
                    break;
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
                return true;
            }
        }

        return false;
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
            document.head.appendChild(styleEl);
        }

        styleSheet = styleEl.sheet;

        for (; i < len; i++) {
            styleSheet.insertRule(data.rules[i], styleSheet.cssRules.length);
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
                        removeSheet = false;
                    }
                });

                if (removeSheet) {
                    included.forEach(name => {
                        if (!sheet.href.includes(name)) {
                            removeSheet = false;
                        }
                    });

                    if (removeSheet) {
                        sheet.ownerNode.parentNode.removeChild(sheet.ownerNode);
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
        let key = data.key,
            rule, sheet;

        if (!key.startsWith('--')) {
            key = '--' + key;
        }

        for (sheet of document.styleSheets) {
            if (sheet.href.includes(data.theme)) {
                for (rule of sheet.cssRules) {
                    if (Neo.typeOf(rule) === 'CSSStyleRule') {
                        if (rule.style.getPropertyValue(key) !== '') {
                            rule.style.setProperty(key, data.value, data.priority);
                            return true;
                        }
                    }
                }
            }
        }

        return false;
    }

    /**
     * @param {Object} data
     * @param {String} data.href
     * @param {String} data.id
     */
    swapStyleSheet(data) {
        document.getElementById(data.id).setAttribute('href', data.href);
    }
}

let instance = Neo.applyClassConfig(Stylesheet);

export default instance;
