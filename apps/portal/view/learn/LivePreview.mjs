import Container    from '../../../../src/container/Base.mjs';
import MonacoEditor from '../../../../src/component/wrapper/MonacoEditor.mjs'
import TabContainer from '../../../../src/tab/Container.mjs';

const
    classDeclarationRegex = /class\s+([a-zA-Z$_][a-zA-Z0-9$_]*)\s*(?:extends\s+[a-zA-Z$_][a-zA-Z0-9$_]*)?\s*{[\s\S]*?}/g,
    exportRegex           = /export\s+(?:default\s+)?(?:const|let|var|class|function|async\s+function|generator\s+function|async\s+generator\s+function|(\{[\s\S]*?\}))/g,
    importRegex           = /import\s+([\w-]+)\s+from\s+['"]([^'"]+)['"]/;

/**
 * @class Portal.view.learn.LivePreview
 * @extends Neo.container.Base
 */
class LivePreview extends Container {
    static config = {
        /**
         * @member {String} className='Portal.view.learn.LivePreview'
         * @protected
         */
        className: 'Portal.view.learn.LivePreview',
        /**
         * @member {String} ntype='live-preview'
         * @protected
         */
        ntype: 'live-preview',

        baseCls   : ['learn-live-preview'],
        value_    : null,
        autoMount : true,
        autoRender: true,
        height    : 400,
        layout    : 'fit',
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
                style          : {height: '100%'},
                reference      : 'editor',
                tabButtonConfig: {
                    text: 'Source'
                },
                listeners      : {
                    editorChange: data => {
                        let container         = data.component.up({className: 'Portal.view.learn.LivePreview'});
                        container.editorValue = data.value;

                        if (container.previewContainer) {
                            container.doRunSource()
                        }
                    }
                }
            }, {
                module         : Container,
                reference      : 'preview',
                tabButtonConfig: {text: 'Preview'}
            }]
        }]
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
        return this.getReference('tab-container')
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
        let me     = this,
            source = me.editorValue || me.value;

        const
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
                cleanLines.push(line);
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
            vars.push(`const ${item.moduleName} = ${item.moduleName}Module.default`);
            return `import("${item.path}")`
        });

        const codeString = `
            Promise.all([
                ${promises.join(',\n')}
            ])
            .then(([${params.join(', ')}]) => {
                    ${vars.join('\n')}
                    ${cleanLines.join('\n')}
                    if (${className} && Neo.component.Base.isPrototypeOf(${className})) container.add({module:${className}});
                })
            .catch(error=>container.add({ntype:'component',html:error.message}));
        `;

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
     * @param {String} reference
     * @param {Object[]} items=this.items
     * @returns {Object|Neo.component.Base|null}
     */
    getItem(reference, items=this.items) {
        let i   = 0,
            len = items.length,
            item,
            childItem;

        for (; i < len; i++) {
            item = items[i];
            if (item.reference === reference) {
                return item
            } else if (item.items) {
                childItem = this.getItem(reference, item.items);

                if (childItem) {
                    return childItem
                }
            }
        }

        return null
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
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me           = this,
            tabContainer = me.getReference('tab-container');

        // we want to add a normal (non-header) button
        tabContainer.getTabBar().add({
            handler  : me.popoutPreview.bind(me),
            hidden   : tabContainer.activeIndex !== 1,
            iconCls  : 'far fa-window-maximize',
            reference: 'popout-window-button',
            style    : {marginLeft: 'auto'},
            ui       : 'ghost'
        });

        tabContainer.on('activeIndexChange', me.onActiveIndexChange, me)
    }

    /**
     * @param {Object} data
     */
    async popoutPreview(data) {
        let me = this;

        data.component.disabled = true;
        await me.createPopupWindow();

        // this component requires a view controller to manage connected apps
        me.getController()?.connectedApps.push(me.id)
    }
}

Neo.setupClass(LivePreview);

export default LivePreview;
