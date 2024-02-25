import Container    from '../../../../src/container/Base.mjs';
import MonacoEditor from '../../../../src/component/wrapper/MonacoEditor.mjs'
import TabContainer from '../../../../src/tab/Container.mjs';

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
        baseCls: ['learn-live-preview'],
        value_: null,
        autoMount: true,
        autoRender: true,
        height: 400,
        layout: 'fit',
        /**
         * @member {Object[]} items
         */
        items: [{
            module: TabContainer,
            removeInactiveCards: false,
            reference: 'tab-container',
            cls: 'live-preview-container',
            items: [{
                module: MonacoEditor,
                hideLabel: true,
                style: { height: '100%' },
                reference: 'editor',
                tabButtonConfig: {
                    text: 'Source'
                },
                listeners: {
                    editorChange: data => {
                        let container = data.component.up({ className: 'Portal.view.learn.LivePreview' });
                        container.editorValue = data.value;
                    }
                }
            }, {
                tabButtonConfig: {
                    text: 'Preview'
                },
                reference: 'preview',
                ntype: 'container'
            }]
        }]
    }

    afterSetValue(value, oldValue) {
        if (value) {
            this.getItem('editor').value = value;
        }
    }

    onConstructed() {
        super.onConstructed();

        let me = this;

        me.getReference('tab-container').on('activeIndexChange', me.onActiveIndexChange, me)
    }

    doRunSource() {

        let source = this.editorValue || this.value;



        const importRegex = /import\s+([\w-]+)\s+from\s+['"]([^'"]+)['"]/;
        const exportRegex = /export\s+(?:default\s+)?(?:const|let|var|class|function|async\s+function|generator\s+function|async\s+generator\s+function|(\{[\s\S]*?\}))/g;


        const cleanLines = [];
        const importPromises = [];
        const importModuleNames = [];

        const moduleNameAndPath = [];

        const className = this.findLastClassName(source);


        source.split('\n').forEach(line => {
            let importMatch = line.match(importRegex);
            if (importMatch) {
                let moduleName = importMatch[1];
                let path = importMatch[2];
                moduleNameAndPath.push({
                    moduleName,
                    path
                });
                // importPromises.push(import(path));
                // importPromises.push(import(path).then(module => {
                //     eval(`const ${moduleName} = module.default;`)
                // }));
                importModuleNames.push(moduleName);
            } else if (line.match(exportRegex)) {
                // Skip export statements
            } else {
                cleanLines.push(line);
            }
        });
        var params = [];
        var vars = [];
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
            return `import("${item.path}")`;
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

        const container = this.getReference('preview');
        container.removeAll();
        try {
            const dynamicCode = new Function('container', codeString);
            dynamicCode(container);
        } catch (error) {
            container.add({
                ntype: 'component',
                html: error.message
            })
        }
    }

    /**
    * @param {String} reference
    * @returns {Object|Neo.component.Base|null}
    */
    getItem(reference, items = this.items) {
        let i = 0,
            len = items.length,
            item,
            childItem;

        for (;i < len;i++) {
            item = items[i];
            if (item.reference === reference) {
                return item
            } else if (item.items) {
                childItem = this.getItem(reference, item.items);

                if (childItem) {
                    return childItem;
                }
            }
        }
        return null
    }

    /**
     * @param {Object} data
     * @param {Neo.component.Base} data.item
     * @param {Number} data.oldValue
     * @param {String} data.source
     * @param {Number} data.value
     */
    onActiveIndexChange(data) {
        if (data.item.reference !== 'preview') return;
        this.doRunSource();
    }
    findLastClassName(sourceCode) {
        // Define a regular expression to match class declarations
        const classDeclarationRegex = /class\s+([a-zA-Z$_][a-zA-Z0-9$_]*)\s*(?:extends\s+[a-zA-Z$_][a-zA-Z0-9$_]*)?\s*{[\s\S]*?}/g;

        let match;
        let lastClassName = null;

        // Iterate through all matches of the regular expression
        while ((match = classDeclarationRegex.exec(sourceCode)) !== null) {
            // Update the last class name found
            lastClassName = match[1];
        }

        return lastClassName;

    }
}

Neo.setupClass(LivePreview);

export default LivePreview;
