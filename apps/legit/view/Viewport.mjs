import BaseViewport          from '../../../src/container/Viewport.mjs';
import Button                from '../../../src/button/Base.mjs';
import Container             from '../../../src/container/Base.mjs';
import LivePreview           from '../../../src/code/LivePreview.mjs';
import TreeList              from '../../../src/tree/List.mjs';
import Splitter              from '../../../src/component/Splitter.mjs';
import Toolbar               from '../../../src/toolbar/Base.mjs';
import ViewportController    from './ViewportController.mjs';
import ViewportStateProvider from './ViewportStateProvider.mjs';

/**
 * @class Legit.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='Legit.view.Viewport'
         * @protected
         */
        className: 'Legit.view.Viewport',
        /**
         * @member {String[]} cls=['legit-viewport']
         */
        cls: ['legit-viewport'],
        /**
         * @member {Neo.controller.Component} controller=ViewportController
         */
        controller: ViewportController,
        /**
         * @member {Neo.state.Provider} stateProvider=ViewportStateProvider
         */
        stateProvider: ViewportStateProvider,
        /*
         * @member {Object} layout={ntype:'hbox',align:'stretch'}
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module                    : TreeList,
            bind                      : {store: 'stores.fileStore'},
            cls                       : ['legit-files-tree'],
            listeners                 : {leafItemClick: 'onFileItemClick', select: 'onTreeListSelect'},
            reference                 : 'files-tree',
            showCollapseExpandAllIcons: false,
            width                     : 300,
        }, {
            module      : Splitter,
            resizeTarget: 'previous',
            size        : 3
        }, {
            module: Container,
            flex  : 1,
            layout: {ntype: 'vbox', align: 'stretch'},
            items: [{
                module: Toolbar,
                flex  : 'none',
                items :['->', {
                    module   : Button,
                    handler  : 'onNewFileButtonClick',
                    iconCls  : 'fa fa-plus',
                    reference: 'new-file-button',
                    text     : 'New File'
                }, {
                    module : Button,
                    handler: 'onSaveButtonClick',
                    iconCls: 'fa fa-cloud-upload',
                    style  : {marginLeft: '.5em'},
                    text   : 'Save'
                }]
            }, {
                module: Container,
                flex  : 1,
                layout: {ntype: 'vbox', align: 'center', pack: 'center'},
                items: [{
                    module   : LivePreview,
                    language: 'markdown',
                    listeners: {editorChange: 'onEditorChange'},
                    reference: 'code-live-preview',
                    style    : {height: '85%', width: '85%'},
                    value: '# Forms Engine\n' +
                        '\n' +
                        '## Simplifying Complex Data Input\n' +
                        '\n' +
                        'Building robust and user-friendly forms is often a significant challenge in web development. Traditional approaches can\n' +
                        'lead to complex state management, difficult validation, and performance bottlenecks, especially with large or dynamic\n' +
                        'forms. The Neo.mjs Forms Engine is designed from the ground up to simplify these complexities, offering a powerful,\n' +
                        'declarative, and highly efficient solution for all your data input needs.\n' +
                        '\n' +
                        '### Forms Include a State-Provider: Effortless Data Management\n' +
                        '\n' +
                        'One of the most compelling features of the Neo.mjs Forms Engine is its integrated state management. You don\'t need to\n' +
                        'manually define a separate state tree or connect external state management libraries. Instead, the form itself acts as\n' +
                        'a state provider, automatically managing the data for its fields.\n' +
                        '\n' +
                        'This is achieved by simply using namespaces within the `name` attribute of each field. The form engine intelligently\n' +
                        'structures your data based on these names, providing a clean, hierarchical data object.\n' +
                        '\n' +
                        '**Benefit**: This significantly reduces boilerplate code and simplifies data flow. Developers can focus on defining the\n' +
                        'form structure and validation rules, rather than wrestling with data synchronization. For businesses, this means faster\n' +
                        'development cycles and fewer bugs related to data handling.\n' +
                        '\n' +
                        '```javascript live-preview\n' +
                        'import Button        from \'../button/Base.mjs\';\n' +
                        'import FormContainer from \'../form/Container.mjs\';\n' +
                        'import TextField     from \'../form/field/Text.mjs\';\n' +
                        '\n' +
                        'class MainView extends FormContainer {\n' +
                        '    static config = {\n' +
                        '        className: \'Benefits.forms1.MainView\',\n' +
                        '        layout   : {ntype:\'vbox\', align:\'start\'},\n' +
                        '        \n' +
                        '        items: [{\n' +
                        '            module   : TextField,\n' +
                        '            labelText: \'Firstname\',\n' +
                        '            name     : \'user.firstname\',\n' +
                        '            value    : \'John\'\n' +
                        '        }, {\n' +
                        '            module   : TextField,\n' +
                        '            labelText: \'Lastname\',\n' +
                        '            name     : \'user.lastname\',\n' +
                        '            value    : \'Doe\'\n' +
                        '        }, {\n' +
                        '            module : Button,\n' +
                        '            handler: \'up.getFormValues\',\n' +
                        '            style  : {marginTop: \'1em\'},\n' +
                        '            text   : \'Get Form Values\'\n' +
                        '        }]\n' +
                        '    }\n' +
                        '\n' +
                        '    async getFormValues(data) {\n' +
                        '        const formValues = await this.getValues();\n' +
                        '        // Logs {user: {firstname: \'John\', lastname: \'Doe\'}}\n' +
                        '        Neo.Main.log({value: formValues})\n' +
                        '    }\n' +
                        '}\n' +
                        'MainView = Neo.setupClass(MainView);\n' +
                        '```\n' +
                        '\n' +
                        '### Forms Can Be Validated Without Being Mounted: Flexible UI Design\n' +
                        '\n' +
                        'Neo.mjs forms exist as a pure abstraction layer within JavaScript, decoupled from their DOM representation. This unique\n' +
                        'capability allows forms to be validated and their values retrieved even if they are not currently mounted in the DOM.\n' +
                        '\n' +
                        '**Benefit**: This is incredibly powerful for complex user interfaces, such as multi-step wizards, tabbed forms, or\n' +
                        'forms with conditionally rendered sections. You can maintain the state and validate parts of a form that are not\n' +
                        'currently visible, ensuring data integrity without the performance overhead of rendering unnecessary DOM elements.\n' +
                        'For users, this translates to a smoother, more responsive experience, as the UI remains lightweight.\n' +
                        '\n' +
                        '```javascript live-preview\n' +
                        'import Button        from \'../button/Base.mjs\';\n' +
                        'import Container     from \'../container/Base.mjs\';\n' +
                        'import FormContainer from \'../form/Container.mjs\';\n' +
                        'import TextField     from \'../form/field/Text.mjs\';\n' +
                        '\n' +
                        'const myForm = Neo.create({\n' +
                        '    module: FormContainer,\n' +
                        '    items : [{\n' +
                        '        module   : TextField,\n' +
                        '        labelText: \'Firstname\',\n' +
                        '        name     : \'user.firstname\',\n' +
                        '        value    : \'John\'\n' +
                        '    }, {\n' +
                        '        module   : TextField,\n' +
                        '        labelText: \'Lastname\',\n' +
                        '        name     : \'user.lastname\',\n' +
                        '        value    : \'Doe\'\n' +
                        '    }]\n' +
                        '});\n' +
                        '\n' +
                        'class MainView extends Container {\n' +
                        '    static config = {\n' +
                        '        className: \'Benefits.forms2.MainView\',\n' +
                        '        layout   : {ntype:\'vbox\', align:\'start\'},\n' +
                        '        \n' +
                        '        items: [{\n' +
                        '            module : Button,\n' +
                        '            handler: \'up.getFormValues\',\n' +
                        '            text   : \'Get Form Values\'\n' +
                        '        }]\n' +
                        '    }\n' +
                        '\n' +
                        '    async getFormValues(data) {\n' +
                        '        const formValues = await myForm.getValues();\n' +
                        '        // Logs {user: {firstname: \'John\', lastname: \'Doe\'}}\n' +
                        '        Neo.Main.log({value: formValues})\n' +
                        '    }\n' +
                        '}\n' +
                        'MainView = Neo.setupClass(MainView);\n' +
                        '```\n' +
                        '\n' +
                        '### Nested Forms: Unprecedented Structural Flexibility\n' +
                        '\n' +
                        'Unlike the limitations of HTML, where nesting `<form>` tags is not permitted, Neo.mjs allows for true nested forms.\n' +
                        'This is achieved by mapping form containers to generic DOM nodes (e.g., `{module: FormContainer, tag: \'div\'}`).\n' +
                        '\n' +
                        '**Benefit**: This capability provides unparalleled structural flexibility, enabling you to build highly modular and\n' +
                        'complex forms. You can validate or retrieve values from individual nested forms, or from the top-level form (which\n' +
                        'includes all nested items), as needed. This promotes better organization of large forms, improves maintainability,\n' +
                        'and allows for fine-grained control over validation and data submission. For complex business processes, this means\n' +
                        'forms can accurately reflect intricate data relationships.\n' +
                        '\n' +
                        'Inside the example preview, clear the user lastname via hitting the x-button.\n' +
                        'Afterwards, click on the 3 buttons at the bottom and inspect the output inside the main window console carefully.\n' +
                        '\n' +
                        'The main form will log:\n' +
                        '```javascript readonly\n' +
                        '{\n' +
                        '    account: \'My Account\',\n' +
                        '    product: {brand: \'Tesla\', name: \'Car\'},\n' +
                        '    user   : {firstname: \'John\', lastname: null}\n' +
                        '}\n' +
                        '\'isValid: false\'\n' +
                        '```\n' +
                        '\n' +
                        'The user form will log:\n' +
                        '```javascript readonly\n' +
                        '{user: {firstname: \'John\', lastname: null}}\n' +
                        '\'isValid: false\'\n' +
                        '```\n' +
                        '\n' +
                        'The product form will log:\n' +
                        '```javascript readonly\n' +
                        '{product: {brand: \'Tesla\', name: \'Car\'}}\n' +
                        '\'isValid: true\'\n' +
                        '```\n' +
                        '\n' +
                        '```javascript live-preview\n' +
                        'import Button        from \'../button/Base.mjs\';\n' +
                        'import Container     from \'../container/Base.mjs\';\n' +
                        'import FormContainer from \'../form/Container.mjs\';\n' +
                        'import TabContainer  from \'../tab/Container.mjs\';\n' +
                        'import TextField     from \'../form/field/Text.mjs\';\n' +
                        '\n' +
                        'class MainView extends FormContainer {\n' +
                        '    static config = {\n' +
                        '        className: \'Benefits.forms3.MainView\',\n' +
                        '        layout   : {ntype:\'vbox\', align:\'stretch\'},\n' +
                        '        \n' +
                        '        items: [{\n' +
                        '            module       : TextField,\n' +
                        '            flex         : \'none\',\n' +
                        '            labelPosition: \'inline\',\n' +
                        '            labelText    : \'Account\',\n' +
                        '            name         : \'account\',\n' +
                        '            value        : \'My Account\'\n' +
                        '        }, {\n' +
                        '            module: TabContainer,\n' +
                        '            items : [{\n' +
                        '                module      : FormContainer,\n' +
                        '                header      : {text: \'User\'},\n' +
                        '                itemDefaults: {module: TextField, labelPosition: \'inline\'},\n' +
                        '                layout      : {ntype:\'vbox\', align:\'start\'},\n' +
                        '                reference   : \'user-form\',\n' +
                        '                tag         : \'div\',\n' +
                        '\n' +
                        '                items: [{\n' +
                        '                    labelText: \'Firstname\',\n' +
                        '                    name     : \'user.firstname\',\n' +
                        '                    value    : \'John\'\n' +
                        '                }, {\n' +
                        '                    labelText: \'Lastname\',\n' +
                        '                    name     : \'user.lastname\',\n' +
                        '                    required : true,\n' +
                        '                    value    : \'Doe\'\n' +
                        '                }]\n' +
                        '            }, {\n' +
                        '                module      : FormContainer,\n' +
                        '                header      : {text: \'Product\'},\n' +
                        '                itemDefaults: {module: TextField, labelPosition: \'inline\'},\n' +
                        '                layout      : {ntype:\'vbox\', align:\'start\'},\n' +
                        '                reference   : \'product-form\',\n' +
                        '                tag         : \'div\',\n' +
                        '\n' +
                        '                items: [{\n' +
                        '                    labelText: \'Name\',\n' +
                        '                    name     : \'product.name\',\n' +
                        '                    value    : \'Car\'\n' +
                        '                }, {\n' +
                        '                    labelText: \'Brand\',\n' +
                        '                    name     : \'product.brand\',\n' +
                        '                    required : true,\n' +
                        '                    value    : \'Tesla\'\n' +
                        '                }]\n' +
                        '            }]\n' +
                        '        }, {\n' +
                        '            module      : Container,\n' +
                        '            flex        : \'none\',\n' +
                        '            itemDefaults: {module: Button},\n' +
                        '            layout      : {ntype: \'hbox\'},\n' +
                        '\n' +
                        '            items: [{\n' +
                        '                handler: \'up.getMainFormValues\',\n' +
                        '                text   : \'Get Main Values\'\n' +
                        '            }, {\n' +
                        '                handler: \'up.getUserFormValues\',\n' +
                        '                text   : \'Get User Values\'\n' +
                        '            }, {\n' +
                        '                handler: \'up.getProductFormValues\',\n' +
                        '                text   : \'Get Product Values\'\n' +
                        '            }]\n' +
                        '        }]\n' +
                        '    }\n' +
                        '\n' +
                        '    async getFormValues(form) {\n' +
                        '        const formValues = await form.getValues();\n' +
                        '        Neo.Main.log({value: formValues});\n' +
                        '\n' +
                        '        const isValid = await form.validate();\n' +
                        '        Neo.Main.log({value: `isValid: ${isValid}`})\n' +
                        '    }\n' +
                        '\n' +
                        '    async getMainFormValues(data) {\n' +
                        '        await this.getFormValues(this)\n' +
                        '    }\n' +
                        '\n' +
                        '    async getProductFormValues(data) {\n' +
                        '        await this.getFormValues(this.getReference(\'product-form\'))\n' +
                        '    }\n' +
                        '\n' +
                        '    async getUserFormValues(data) {\n' +
                        '        await this.getFormValues(this.getReference(\'user-form\'))\n' +
                        '    }\n' +
                        '}\n' +
                        'MainView = Neo.setupClass(MainView);\n' +
                        '```\n' +
                        '\n' +
                        'Bonus: Inspect the DOM Inside the `TabContainer`.\n' +
                        'You will notice that only the active Tab is mounted inside the DOM.\n' +
                        '\n' +
                        '1. We can still get field values of unmounted forms\n' +
                        '2. We can still validate unmounted forms\n' +
                        '\n' +
                        '### Nested Lazy-Loaded Forms: Optimizing Performance for Complex UIs\n' +
                        '\n' +
                        'If you look closely at the `Button` handlers in the last example, you\'ll notice that `getValues()` and `validate()`\n' +
                        'are both `async` methods. The reason for this is that `form.getFields()` itself is also asynchronous: it will\n' +
                        'lazy-load (but not necessarily mount) missing fields when needed.\n' +
                        '\n' +
                        '**Benefit**: This asynchronous, lazy-loading mechanism is crucial for optimizing the performance of complex forms.\n' +
                        'Instead of loading all form fields and their associated logic upfront, Neo.mjs only loads what\'s necessary, when it\'s\n' +
                        'needed. This results in significantly faster initial load times, reduced memory footprint, and a more responsive\n' +
                        'application, especially for forms with many fields or conditional sections.\n' +
                        '\n' +
                        'The lazy-loading use case is not easy to display inside the `LivePreview`, since it does rely on defining child modules\n' +
                        'inside their own class files and dynamically importing them. However, the pattern is straightforward:\n' +
                        '\n' +
                        '```javascript readonly\n' +
                        '{\n' +
                        '    module: TabContainer,\n' +
                        '    items : [\n' +
                        '        {module: () => import(\'./MyChildForm1.mjs\')},\n' +
                        '        {module: () => import(\'./MyChildForm2.mjs\')}\n' +
                        '    ]\n' +
                        '}\n' +
                        '```\n' +
                        '\n' +
                        'This allows for highly modular and performant form structures, where even entire sections of a form can be loaded\n' +
                        'on-demand, further enhancing the user experience and application efficiency.\n' +
                        '\n' +
                        '## Conclusion: A Comprehensive Solution for Form Development\n' +
                        '\n' +
                        'The Neo.mjs Forms Engine provides a comprehensive and intuitive solution for building forms of any complexity.\n' +
                        'By offering integrated state management, the ability to validate unmounted forms, true nested forms, and intelligent\n' +
                        'lazy-loading, Neo.mjs empowers developers to create highly performant, maintainable, and user-friendly data input\n' +
                        'experiences. This translates directly into increased developer productivity and a superior end-user experience.\n'

                }]
            }]
        }]
    }
}

export default Neo.setupClass(Viewport);
