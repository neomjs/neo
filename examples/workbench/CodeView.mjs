import Button    from '../../src/button/Base.mjs';
import Component from '../../src/component/Base.mjs';
import Container from '../../src/container/Base.mjs';

/**
 * @summary Docked live Neo config snippet panel with reactive `code` updates and one-click clipboard copy.
 * @class Neo.examples.workbench.CodeView
 * @extends Neo.container.Base
 */
class CodeView extends Container {
    static config = {
        /**
         * @member {String} className='Neo.examples.workbench.CodeView'
         * @protected
         */
        className: 'Neo.examples.workbench.CodeView',
        /**
         * @member {String} ntype='workbench-code-view'
         * @protected
         */
        ntype: 'workbench-code-view',
        /**
         * @member {String[]} baseCls=['neo-workbench-code-panel','neo-container']
         */
        baseCls: ['neo-workbench-code-panel', 'neo-container'],
        /**
         * Evaluable Neo config source displayed in the code preview and copied to the clipboard.
         * @member {String} code_=''
         * @reactive
         */
        code_: '',
        /**
         * @member {Number|String} flex='none'
         */
        flex: 'none',
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }

    /**
     * Last snippet copied via {@link #copyCode}.
     * @member {String|null} lastCopiedCode=null
     */
    lastCopiedCode = null

    /**
     * @summary Builds the header toolbar and code output component before container items instantiate.
     */
    onConstructed() {
        const
            me          = this,
            initialCode = me.code || '';

        me.items = [{
            module   : Container,
            cls      : ['neo-workbench-code-header'],
            flex     : 'none',
            layout   : {ntype: 'hbox', align: 'center'},
            reference: 'code-header',
            items    : [{
                ntype    : 'label',
                cls      : ['neo-workbench-code-title'],
                reference: 'code-title',
                text     : 'Code'
            }, {
                ntype: 'component',
                flex : 1
            }, {
                module   : Button,
                cls      : ['neo-button-copy-code'],
                handler  : me.copyCode.bind(me),
                id       : me.getCopyButtonId(),
                reference: 'copy-code-button',
                text     : 'Copy'
            }]
        }, {
            module   : Component,
            cls      : ['neo-workbench-code-output'],
            flex     : 1,
            reference: 'code-output',
            vdom     : {
                cls: ['neo-workbench-code-body'],
                cn : [{
                    tag: 'pre',
                    cls: ['neo-workbench-code-pre'],
                    cn : [{
                        tag : 'code',
                        cls : ['neo-workbench-code-content'],
                        text: initialCode
                    }]
                }, {
                    'aria-hidden': 'true',
                    cls          : ['neo-workbench-code-clipboard'],
                    id           : me.getClipboardId(),
                    readOnly     : true,
                    tabIndex     : -1,
                    tag          : 'textarea',
                    text         : initialCode,
                    value        : initialCode
                }]
            }
        }];

        super.onConstructed()
    }

    /**
     * @summary Syncs the rendered `<code>` node and hidden clipboard textarea when `code` changes.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetCode(value, oldValue) {
        if (oldValue !== undefined) {
            const output = this.getReference('code-output');

            if (output) {
                const cn = output.vdom?.cn;

                if (cn?.[0]?.cn?.[0]) {
                    cn[0].cn[0].text = value
                }

                if (cn?.[1]) {
                    cn[1].text  = value;
                    cn[1].value = value
                }

                output.update()
            }
        }
    }

    /**
     * @summary Copies {@link #code} to the clipboard via Main DomAccess and flashes a confirmation label.
     * @param {Object} [data]
     * @returns {Promise<void>}
     */
    async copyCode(data) {
        const
            me     = this,
            button = data?.component || me.getReference('copy-code-button'),
            text   = me.code;

        me.lastCopiedCode = text;

        if (Neo.main?.DomAccess?.selectNode && Neo.main?.DomAccess?.execCommand) {
            await Neo.main.DomAccess.selectNode({
                appName : me.appName,
                end     : text.length,
                id      : me.getClipboardId(),
                start   : 0,
                windowId: me.windowId
            });

            await Neo.main.DomAccess.execCommand({
                appName : me.appName,
                command : 'copy',
                windowId: me.windowId
            });

            button && Neo.main.DomAccess.focus?.({
                id           : button.id,
                modality     : 'pointer',
                preventScroll: true,
                windowId     : me.windowId
            })
        }

        if (button && !button.isDestroyed) {
            button.text = 'Copied';

            me.timeout(1200).then(() => {
                if (!me.isDestroyed && !button.isDestroyed) {
                    button.text = 'Copy'
                }
            }).catch(error => {
                if (error !== Neo.isDestroyed) {
                    throw error
                }
            })
        }
    }

    /**
     * @summary Returns the deterministic DOM id of the hidden clipboard textarea.
     * @returns {String}
     */
    getClipboardId() {
        return this.id + '__clipboard'
    }

    /**
     * @summary Returns the deterministic DOM id of the Copy button.
     * @returns {String}
     */
    getCopyButtonId() {
        return this.id + '__copyButton'
    }
}

export default Neo.setupClass(CodeView);
