import Container    from '../container/Base.mjs';
import MonacoEditor from '../component/wrapper/MonacoEditor.mjs'
import TabContainer from '../tab/Container.mjs';

const
    classDeclarationRegex = /class\s+([a-zA-Z$_][a-zA-Z0-9$_]*)\s*(?:extends\s+[a-zA-Z$_][a-zA-Z0-9$_]*)?\s*{[\s\S]*?}/g,
    exportRegex           = /export\s+(?:default\s+)?(?:const|let|var|class|function|async\s+function|generator\s+function|async\s+generator\s+function|(\{[\s\S]*?\}))/g,
    importRegex           = /import\s+([\w-]+)\s+from\s+['"]([^'"]+)['"]/;

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
         * @member {Number} height=400
         */
        height: 400,
        /**
         * @member {Object|String} layout='fit'
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
                module         : MonacoEditor,
                hideLabel      : true,
                listeners      : {editorChange: 'up.onEditorChange'},
                style          : {height: '100%'},
                reference      : 'editor',
                tabButtonConfig: {text: 'Source'}
            }, {
                module         : Container,
                reference      : 'preview',
                tabButtonConfig: {text: 'Preview'}
            }]
        }],
        /**
         * The code to display inside the Monaco editor
         * @member {String|null} value_=null
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
            source            = me.editorValue || me.value,
            cleanLines        = [],
            importModuleNames = [],
            moduleNameAndPath = [],
            className         = me.findLastClassName(source);

        source.split('\n').forEach(line => {
            let importMatch = line.match(importRegex);

            if (importMatch) {
                let moduleName = importMatch[1],
                    path       = importMatch[2];

                moduleNameAndPath.push({moduleName, path});

                importModuleNames.push(moduleName);
            } else if (line.match(exportRegex)) {
                // Skip export statements
            } else {
                cleanLines.push(`    ${line}`);
            }
        });

        var params = [];
        var vars   = [];
        // Figure out the parts of the source we'll be running.
        // o The promises/import() corresponding to the user's import statements
        // o The vars holding the name of the imported module based on the module name for each import
        // o The rest of the user-provided source
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

        let promises = moduleNameAndPath.map(item => {
            params.push(`${item.moduleName}Module`);
            vars.push(`    const ${item.moduleName} = ${item.moduleName}Module.default;`);
            return `import('${item.path}')`
        });

        const codeString = [
            'Promise.all([',
            `    ${promises.join(',\n')}`,
            `]).then(([${params.join(', ')}]) => {`,
            `${vars.join('\n')}`,
            `    ${cleanLines.join('\n')}`,
            '',
            `    if (${className} && Neo.component.Base.isPrototypeOf(${className})) {`,
            `        container.add({module:${className}})`,
            '    }',
            '})',
            '.catch(error => container.add({ntype:\'component\', html:error.message}));'
        ].join('\n')

        const container = me.getPreviewContainer();
        container.removeAll();

        try {
            new Function('container', codeString)(container);
        } catch (error) {
            container.add({
                ntype: 'component',
                html : error.message
            })
        }
    }

    /**
     * @param {String} sourceCode
     * @returns {String|null}
     */
    findLastClassName(sourceCode) {
        let lastClassName = null,
            match;

        // Iterate through all matches of the regular expression
        while ((match = classDeclarationRegex.exec(sourceCode)) !== null) {
            // Update the last class name found
            lastClassName = match[1]
        }

        return lastClassName
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
        if (data.item.reference === 'preview') {
            this.doRunSource()
        }

        this.getReference('popout-window-button').hidden = data.value !== 1
        this.disableRunSource = false;
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me             = this,
            {tabContainer} = me;

        // we want to add a normal (non-header) button
        tabContainer.getTabBar().add({
            handler  : me.popoutPreview.bind(me),
            hidden   : tabContainer.activeIndex !== 1,
            iconCls  : 'far fa-window-maximize',
            reference: 'popout-window-button',
            style    : {marginLeft: 'auto'},
            ui       : 'ghost'
        });

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

Neo.setupClass(LivePreview);

export default LivePreview;
