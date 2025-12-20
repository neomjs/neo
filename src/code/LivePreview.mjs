import Container    from '../container/Base.mjs';
import MonacoEditor from '../component/wrapper/MonacoEditor.mjs'
import TabContainer from '../tab/Container.mjs';

const configSymbol = Symbol.for('configSymbol');

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
        /**
         * The url for the child app to use for the popout window
         * @member {String} windowUrl_='./childapps/preview/index.html'
         * @reactive
         */
        windowUrl_: './childapps/preview/index.html'
    }

    /**
     * @member {Number|null} connectedWindowId=null
     */
    connectedWindowId = null
    /**
     * @member {Neo.component.Markdown|null} markdownComponent=null
     */
    markdownComponent = null
    /**
     * @member {Class|null} markdownComponentClass=null
     */
    markdownComponentClass = null
    /**
     * @member {Neo.code.executor.Neo|null} neoExecutor=null
     */
    neoExecutor = null
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
     * Triggered after the language config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetLanguage(value, oldValue) {
        let me = this;

        if (value !== 'markdown') {
            me.markdownComponent = null
        }

        me.getItem('editor').language = value === 'neomjs' ? 'javascript' : value;

        // If there is a new pending value for the value config, it will run trigger doRunSource().
        // This can happen when calling: this.set({language, value})
        if (oldValue && !Object.hasOwn(me[configSymbol], 'value')) {
            me.doRunSource()
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
     * Triggered before the language config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @returns {String}
     * @protected
     */
    beforeSetWindowUrl(value, oldValue) {
        if (value.startsWith('./')) {
            let appPath = Neo.config.appPath.split('/');
            appPath.pop()

            return new URL(Neo.config.basePath + appPath.join('/') + value.substring(1), location.href).href
        }

        return value
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
        let me         = this,
            {windowId} = me,
            winData    = await Neo.Main.getWindowData({windowId}),
            rect       = await me.getDomRect(me.getReference('preview').id);

        let {height, left, top, width} = rect;

        left += winData.screenLeft;
        top  += (winData.outerHeight - winData.innerHeight + winData.screenTop);

        Neo.Main.windowOpen({
            url           : `${me.windowUrl}?id=${me.id}`,
            windowFeatures: `height=${height},left=${left},top=${top},width=${width}`,
            windowId,
            windowName    : me.id
        })
    }

    /**
     * @param {...*} args
     */
    destroy(...args) {
        if (this.connectedWindowId) {
            Neo.Main.windowClose({names: [this.id], windowId: this.windowId})
        }

        super.destroy(...args)
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

            if (me.markdownComponent && !me.markdownComponent.isDestroyed) {
                me.markdownComponent.value = source
            } else {
                // destroy, silent => merge changes into one update cycle
                container.removeAll(true, true);

                me.markdownComponent = container.add({
                    module   : me.markdownComponentClass,
                    style    : {height: '100%', overflow: 'auto'},
                    value    : source,
                    windowUrl: me.windowUrl
                })
            }
        } else {
            if (!me.neoExecutor) {
                const module = await import('./executor/Neo.mjs');
                me.neoExecutor = Neo.create(module.default);
            }

            await me.neoExecutor.execute({code: source, container})
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

        me.editor

        if (me.enableFullscreen) {
            items.push({
                handler: me.collapseExpand.bind(me),
                iconCls: 'fas fa-expand',
                ui     : 'ghost'
            })
        }

        // Only add the popout window button in case we are using shared workers
        if (Neo.config.useSharedWorkers) {
            items.push({
                handler  : me.popoutPreview.bind(me),
                hidden   : tabContainer.activeIndex !== 1,
                iconCls  : 'far fa-window-maximize',
                reference: 'popout-window-button',
                ui       : 'ghost'
            });

            Neo.currentWorker.on({
                connect   : me.onWindowConnect,
                disconnect: me.onWindowDisconnect,
                scope     : me
            })
        }

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
     * @param {String} data.value
     */
    onEditorChange({value}) {
        let me = this;

        me._value = value;

        me.editorValue = value;

        me.fire('editorChange', {value});

        me.doRunSource()
    }

    /**
     * @param {Object} data
     * @param {String} data.appName
     * @param {Number} data.windowId
     */
    async onWindowConnect(data) {
        let me           = this,
            searchString = await Neo.Main.getByPath({path: 'location.search', windowId: data.windowId}),
            params       = new URLSearchParams(searchString),
            id           = params.get('id');

        if (id === me.id) {
            me.connectedWindowId = data.windowId;

            let app              = Neo.apps[data.windowId],
                mainView         = app.mainView,
                previewContainer = me.getReference('preview'),
                {tabContainer}   = me,
                previewView      = previewContainer.removeAt(0, false);

            me.previewContainer = mainView;
            mainView.add(previewView);

            tabContainer.activeIndex = 0; // switch to the source view

            tabContainer.getTabAtIndex(1).disabled = true
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.appName
     * @param {Number} data.windowId
     */
    async onWindowDisconnect(data) {
        let me = this;

        if (data.windowId === me.connectedWindowId) {
            let app              = Neo.apps[data.windowId],
                mainView         = app.mainView,
                previewContainer = me.getReference('preview'),
                {tabContainer}   = me,
                previewView      = mainView.removeAt(0, false);

            me.previewContainer = null;
            previewContainer.add(previewView);

            me.disableRunSource = true; // will get reset after the next activeIndex change (async)
            tabContainer.activeIndex = 1;        // switch to the source view

            me.getReference('popout-window-button').disabled = false;
            tabContainer.getTabAtIndex(1).disabled = false;

            me.connectedWindowId = null
        }
    }

    /**
     * @param {Object} data
     */
    async popoutPreview(data) {
        let me = this;

        data.component.disabled = true;
        await me.createPopupWindow()
    }
}

export default Neo.setupClass(LivePreview);
