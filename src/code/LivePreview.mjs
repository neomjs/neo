import Container    from '../container/Base.mjs';
import MonacoEditor from '../component/wrapper/MonacoEditor.mjs'
import TabContainer from '../tab/Container.mjs';

const
    classNameRegex = /className\s*:\s*['\"]([^'\"]+)['\"]/g,
    exportRegex    = /export\s+(?:default\s+)?(?:const|let|var|class|function|async\s+function|generator\s+function|async\s+generator\s+function|(\{[\s\S]*?\}))/g,
    importRegex    = /import\s+(?:([\w-]+)|\{([^}]+)\})\s+from\s+['\"]([^'\"]+)['\"]/;

/**
 * @class Neo.code.LivePreview
 * @extends Neo.container.Base
 */
class LivePreview extends Container {
    /**
     * Valid values for iconPosition
     * @member {String[]} activeViews=['preview','source']
     * @protected
     * @static
     */
    static activeViews = ['preview', 'source']

    static config = {
        /**
         * @member {String} className='Neo.code.LivePreview'
         * @protected
         */
        className: 'Neo.code.LivePreview',
        /**
         * @member {String} ntype='live-preview'
         * @protected
         */
        ntype: 'live-preview',
        /**
         * Valid values are 'preview' and 'source'
         * @member {String} activeView_='source'
         * @reactive
         */
        activeView_: 'source',
        /**
         * @member {String[]} baseCls=['neo-code-live-preview']
         */
        baseCls: ['neo-code-live-preview'],
        /**
         * @member {Boolean} disableRunSource=false
         */
        disableRunSource: false,
        /**
         * @member {Boolean} enableFullscreen=true
         */
        enableFullscreen: true,
        /**
         * @member {Object|String} layout='fit'
         * @reactive
         */
        layout: 'fit',
        /**
         * @member {Object[]} items
         */
        items: [{
            module             : TabContainer,
            cls                : ['live-preview-container'],
            reference          : 'tab-container',
            removeInactiveCards: false,

            items: [{
                module   : MonacoEditor,
                header   : {text: 'Source'},
                hideLabel: true,
                listeners: {editorChange: 'up.onEditorChange'},
                style    : {height: '100%'},
                reference: 'editor'
            }, {
                module   : Container,
                header   : {text: 'Preview'},
                reference: 'preview'
            }]
        }],
        /**
         * The code to display inside the Monaco editor
         * @member {String|null} value_=null
         * @reactive
         */
        value_: null,
    }

    /**
     * Link the preview output to different targets
     * @member {Neo.component.Base} previewContainer=null
     */
    previewContainer = null

    /**
     * @returns {Neo.component.Base|null}
     */
    get tabContainer() {
        return this.getItem('tab-container')
    }

    /**
     * Triggered after the activeView config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetActiveView(value, oldValue) {
        this.tabContainer.activeIndex = value === 'source' ? 0 : 1
    }

    /**
     * Triggered after the value config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetValue(value, oldValue) {
        if (value) {
            this.getItem('editor').value = value?.trim()
        }
    }

    /**
     * Triggered before the activeView config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @returns {String}
     * @protected
     */
    beforeSetActiveView(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'activeView')
    }

    /**
     * @param {Object} data
     */
    async collapseExpand(data) {
        let me       = this,
            button   = data.component,
            collapse = button.iconCls === 'fas fa-compress',
            {vdom}   = me,
            rect;

        if (collapse) {
            button.iconCls = 'fas fa-expand';

            rect = me.collapseRect;

            delete me.collapseRect;

            Object.assign(vdom.style, {
                height  : rect.height + 'px',
                left    : rect.x      + 'px',
                top     : rect.y      + 'px',
                width   : rect.width  + 'px'
            });

            me.update();

            await me.timeout(300);

            Object.assign(vdom.style, {
                position: null,
                zIndex  : null
            })
        } else {
            button.iconCls = 'fas fa-compress';

            rect = await me.getDomRect();

            me.collapseRect = rect;

            vdom.style = vdom.style || {};

            Object.assign(vdom.style, {
                height  : rect.height + 'px',
                left    : rect.x      + 'px',
                position: 'fixed',
                top     : rect.y      + 'px',
                width   : rect.width  + 'px',
                zIndex  : 103
            });

            me.update();

            await me.timeout(50);

            Object.assign(vdom.style, {
                height: '100%',
                left  : 0,
                top   : 0,
                width : '100%'
            })
        }

        me.update()
    }

    /**
     *
     */
    async createPopupWindow() {
        let me      = this,
            winData = await Neo.Main.getWindowData(),
            rect    = await me.getDomRect(me.getReference('preview').id);

        let {height, left, top, width} = rect;

        height -= 50; // popup header in Chrome
        left   += winData.screenLeft;
        top    += (winData.outerHeight - winData.innerHeight + winData.screenTop);

        Neo.Main.windowOpen({
            url           : `./childapps/preview/index.html?id=${me.id}`,
            windowFeatures: `height=${height},left=${left},top=${top},width=${width}`,
            windowName    : me.id
        })
    }

    /**
     *
     */
    doRunSource() {
        if (this.disableRunSource) {
            return
        }

        let me                = this,
            {environment}     = Neo.config,
            container         = me.getPreviewContainer(),
            source            = me.editorValue || me.value,
            className         = me.findMainClassName(source),
            cleanLines        = [],
            moduleNameAndPath = [],
            params            = [],
            vars              = [],
            codeString, module, promises;

        source.split('\n').forEach(line => {
            let importMatch = line.match(importRegex);

            if (importMatch) {
                let defaultImport = importMatch[1],
                    namedImports  = importMatch[2]?.split(',').map(name => name.trim()),
                    path          = importMatch[3],
                    index;

                // We want the non-minified version for code which can not get bundled.
                if (environment === 'dist/development') {
                    index = path.lastIndexOf('../');

                    if (index === 0) {
                        path = '../../../../src/' + path.slice(index + 3)
                    } else {
                        path = path.slice(0, index) + '../../../' + path.slice(index + 3)
                    }
                }

                // We want the minified version of the code which can not get bundled.
                else if (environment === 'dist/production') {
                    index = path.lastIndexOf('../');

                    if (index === 0) {
                        path = '../../../esm/src/' + path.slice(index + 3)
                    } else {
                        path = path.slice(0, index) + '../../esm/' + path.slice(index + 3)
                    }
                }

                moduleNameAndPath.push({defaultImport, namedImports, path})
            } else if (line.match(exportRegex)) {
                // Skip export statements
            } else {
                cleanLines.push(`    ${line}`)
            }
        });

        // Figure out the parts of the source we'll be running.
        // * The promises/import() corresponding to the user's import statements
        // * The vars holding the name of the imported module based on the module name for each import
        // * The rest of the user-provided source
        // It'll end up looking like this:
        // Promise.all([
        //     import('../../../node_modules/neo.mjs/src/container/Base.mjs'),
        //     import('../../../node_modules/neo.mjs/src/button/Base.mjs')
        //   ]).then(([BaseModule, ButtonModule]) => {
        //       const Base = BaseModule.default;
        //       const Button = ButtonModule.default;
        //       // Class declaration goes here...
        //   });
        // Making the promise part of the eval seems weird, but it made it easier to
        // set up the import vars.
        promises = moduleNameAndPath.map((item, i) => {
            let moduleAlias = `Module${i}`;
            params.push(moduleAlias);
            if (item.defaultImport) {
                vars.push(`    const ${item.defaultImport} = ${moduleAlias}.default;`);
            }
            if (item.namedImports) {
                vars.push(`    const {${item.namedImports.join(', ')}} = ${moduleAlias};`);
            }
            return `import('${item.path}')`
        });

        codeString = [
            'Promise.all([',
            `    ${promises.join(',\n')}`,
            `]).then(([${params.join(', ')}]) => {`,
            `${vars.join('\n')}`,
            `    ${cleanLines.join('\n')}`,
            '',
            `    module = Neo.ns('${className}');`,
            '',
            `    if (module && (`,
            `        Neo.component.Base.isPrototypeOf(module) ||`,
            `        Neo.functional.component.Base.isPrototypeOf(module)`,
            `    )) {`,
            `        container.add({module})`,
            '    }',
            '})',
            '.catch(error => {',
            '    console.warn("LivePreview Error:", error);',
            '    container.add({ntype:\'component\', html:error.message});',
            '})'
        ].join('\n')

        container.removeAll();

        // We must ensure that classes inside the editor won't get cached, since this disables run-time changes
        // See: https://github.com/neomjs/neo/issues/5863
        me.findClassNames(codeString).forEach(item => {
            let nsArray   = item.split('.'),
                className = nsArray.pop(),
                ns        = Neo.ns(nsArray);

            if (ns) {
                delete ns[className]
            }
        });

        try {
            new Function('container', 'module', codeString)(container, module);
        } catch (error) {
            container.add({
                ntype: 'component',
                html : error.message
            })
        }
    }

    /**
     * @param {String} sourceCode
     * @returns {String[]}
     */
    findClassNames(sourceCode) {
        let classNames = [],
            match;

        while ((match = classNameRegex.exec(sourceCode)) !== null) {
            classNames.push(match[1])
        }

        return classNames
    }

    /**
     * @param {String} sourceCode
     * @returns {String|null}
     */
    findMainClassName(sourceCode) {
        let classNames = this.findClassNames(sourceCode),
            mainName   = null,
            prioNames  = ['MainContainer', 'MainComponent', 'MainView', 'Main'];

        if (classNames.length > 0) {
            for (const name of prioNames) {
                mainName = classNames.find(className => className.endsWith(name));
                if (mainName) {
                    break
                }
            }

            if (!mainName) {
                mainName = classNames[classNames.length - 1]
            }
        }

        return mainName
    }

    

    /**
     * @returns {Neo.component.Base|null}
     */
    getPreviewContainer() {
        let me = this;

        if (me.previewContainer) {
            return me.previewContainer
        }

        return me.getReference('preview')
    }

    /**
     * @param {Object} data
     * @param {Neo.component.Base} data.item
     * @param {Number} data.oldValue
     * @param {String} data.source
     * @param {Number} data.value
     */
    onActiveIndexChange(data) {
        let me        = this,
            isPreview = data.value === 1;

        if (data.item.reference === 'preview') {
            me.doRunSource()
        }
        // Navigating to the source view should destroy the app, in case the preview view is not popped out
        else if (!isPreview && !me.previewContainer) {
            me.getReference('preview').removeAll()
        }

        me.getReference('popout-window-button').hidden = !isPreview
        me.disableRunSource = false;
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me             = this,
            items          = [],
            {tabContainer} = me;

        if (me.enableFullscreen) {
            items.push({
                handler: me.collapseExpand.bind(me),
                iconCls: 'fas fa-expand',
                ui     : 'ghost'
            })
        }

        items.push({
            handler  : me.popoutPreview.bind(me),
            hidden   : tabContainer.activeIndex !== 1,
            iconCls  : 'far fa-window-maximize',
            reference: 'popout-window-button',
            ui       : 'ghost'
        });

        items.unshift('->');

        // we want to add a normal (non-header) button
        tabContainer.getTabBar().add(items);

        tabContainer.getTabBar().update();

        tabContainer.on('activeIndexChange', me.onActiveIndexChange, me);

        // changing the activeView initially will not trigger our onActiveIndexChange() logic
        me.activeView === 'preview' && me.doRunSource()
    }

    /**
     * @param {Object} data
     */
    onEditorChange(data) {
        let me = this;

        me.editorValue = data.value;

        // We are not using getPreviewContainer(), since we only want to update the LivePreview in case it is visible.
        if (me.previewContainer) {
            me.doRunSource()
        }
    }

    /**
     * @param {Object} data
     */
    async popoutPreview(data) {
        let me = this;

        data.component.disabled = true;
        await me.createPopupWindow();

        // this component requires a view controller to manage connected apps
        me.getController('viewport-controller')?.connectedApps.push(me.id)
    }
}

export default Neo.setupClass(LivePreview);
