import Container    from '../container/Base.mjs';
import MonacoEditor from '../component/wrapper/MonacoEditor.mjs'
import TabContainer from '../tab/Container.mjs';

/**
 * @summary A split-view component for real-time code editing and execution.
 *
 * This class provides a robust environment for editing source code and viewing the results in real-time.
 * It integrates the **Monaco Editor** for a rich editing experience and supports multiple languages and execution modes.
 *
 * Key features:
 * - **Multi-Language Support**: Supports 'neomjs' (JS execution) and 'markdown' (rendering).
 * - **Dynamic Imports**: Utilizes `import()` to lazy-load the Markdown component or Code Executor, optimizing initial load performance.
 * - **Sandboxed Execution**: Executes Neo.mjs code within a controlled context using `new Function`.
 * - **Responsive Layout**: collapsible, pop-out support, and configurable views (source vs. preview).
 *
 * This component is central to the Neo.mjs learning experience and documentation portal.
 *
 * @class Neo.code.LivePreview
 * @extends Neo.container.Base
 * @see Neo.code.executor.Neo
 * @see Neo.component.Markdown
 * @see Neo.component.wrapper.MonacoEditor
 */
class LivePreview extends Container {
    /**
     * Valid values for activeView
     * @member {String[]} activeViews=['preview','source']
     * @protected
     * @static
     */
    static activeViews = ['preview', 'source']
    /**
     * Valid values for language
     * @member {String[]} languages=['markdown','neomjs']
     * @protected
     * @static
     */
    static languages = ['markdown', 'neomjs']

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
         * @member {String} language_='neomjs'
         * @reactive
         */
        language_: 'neomjs',
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
     * @member {Class|null} markdownComponentClass=null
     */
    markdownComponentClass = null
    /**
     * @member {Neo.code.executor.Neo|null} neoExecutor=null
     */
    neoExecutor = null

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
     * Triggered after the language config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetLanguage(value, oldValue) {
        if (oldValue) {
            this.doRunSource()
        }
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
     * Triggered before the language config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @returns {String}
     * @protected
     */
    beforeSetLanguage(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'language')
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
     * Executes the current source code.
     *
     * This method acts as the **execution trigger**. It orchestrates the process by:
     * 1.  **Validation**: Ensuring source code exists.
     * 2.  **Execution**:
     *     - For **Markdown**: Clears the container and adds a new `Neo.component.Markdown` instance.
     *     - For **Neo.mjs**: Delegates execution to the `Neo.code.executor.Neo` instance.
     *
     * @returns {Promise<void>}
     */
    async doRunSource() {
        if (this.disableRunSource) {
            return
        }

        let me        = this,
            container = me.getPreviewContainer(),
            source    = me.editorValue || me.value; // Use current editor value or initial value

        if (!source) return;

        if (me.language === 'markdown') {
            if (!me.markdownComponentClass) {
                const module = await import('../component/Markdown.mjs');
                me.markdownComponentClass = module.default;
            }

            container.removeAll();
            container.add({
                module: me.markdownComponentClass,
                style : {height: '100%', overflow: 'auto'},
                value : source
            })
        } else {
            if (!me.neoExecutor) {
                const module = await import('./executor/Neo.mjs');
                me.neoExecutor = Neo.create(module.default);
            }

            await me.neoExecutor.execute({
                code: source,
                container: container,
                context: {
                    appName        : me.appName,
                    windowId       : me.windowId,
                    parentComponent: me
                }
            })
        }
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
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync()
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

        me.fire('editorChange', {value: data.value});

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
