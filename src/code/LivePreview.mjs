import Container    from '../container/Base.mjs';
import MonacoEditor from '../component/wrapper/MonacoEditor.mjs'
import TabContainer from '../tab/Container.mjs';

/**
 * @summary A split-view component for real-time code editing and execution.
 *
 * This class provides a robust environment for editing source code and viewing the results in real-time.
 * It integrates the **Monaco Editor** for a rich editing experience and uses a **pluggable renderer architecture**
 * to support multiple languages and execution modes.
 *
 * Key features:
 * - **Multi-Language Support**: Dynamically loads renderers for 'neomjs' (JS execution) and 'markdown' (rendering).
 * - **Dynamic Imports**: Utilizes `import()` to lazy-load renderers, optimizing initial load performance.
 * - **Sandboxed Execution**: Executes Neo.mjs code within a controlled context using `new Function`.
 * - **Responsive Layout**: collapsible, pop-out support, and configurable views (source vs. preview).
 *
 * This component is central to the Neo.mjs learning experience and documentation portal.
 *
 * @class Neo.code.LivePreview
 * @extends Neo.container.Base
 * @see Neo.code.renderer.Base
 * @see Neo.component.wrapper.MonacoEditor
 */
class LivePreview extends Container {
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
         * @member {Neo.code.renderer.Base|null} renderer_=null
         * @reactive
         */
        renderer_: null,
        /**
         * The code to display inside the Monaco editor
         * @member {String|null} value_=null
         * @reactive
         */
        value_: null,
    }

    /**
     * @member {Neo.component.Base[]} customComponents=[]
     */
    customComponents = []
    /**
     * @member {Neo.code.LivePreview[]} livePreviews=[]
     */
    livePreviews = []
    /**
     * Link the preview output to different targets
     * @member {Neo.component.Base} previewContainer=null
     */
    previewContainer = null
    /**
     * @member {Object} renderers={}
     */
    renderers = {}

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
            this.loadRenderer(value)
        }
    }

    /**
     * Triggered after the renderer config got changed
     * @param {Neo.code.renderer.Base} value
     * @param {Neo.code.renderer.Base} oldValue
     * @protected
     */
    afterSetRenderer(value, oldValue) {
        if (this.isConstructed && this.value) {
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
     *
     */
    destroyChildInstances() {
        let me = this;

        me.customComponents.forEach(component => component.destroy());
        me.customComponents = [];

        me.livePreviews.forEach(livePreview => livePreview.destroy());
        me.livePreviews = [];
    }

    /**
     * Executes the current source code using the active renderer.
     *
     * This method acts as the **execution trigger**. It orchestrates the process by:
     * 1.  **Validation**: Ensuring a renderer is loaded and source code exists.
     * 2.  **Cleanup**: Calling `destroyChildInstances()` to clear any artifacts (components, divs) from the previous run, ensuring a clean slate.
     * 3.  **Delegation**: Passing the source code and context to `renderer.render()`.
     * 4.  **State Update**: Storing the references to newly created components so they can be managed (and destroyed) later.
     *
     * @returns {Promise<void>}
     */
    async doRunSource() {
        if (this.disableRunSource || !this.renderer) {
            return
        }

        let me        = this,
            container = me.getPreviewContainer(),
            source    = me.editorValue || me.value; // Use current editor value or initial value

        if (!source) return;

        // Clean up previous instances (for Markdown renderer)
        me.destroyChildInstances();

        // Delegate to renderer
        let result = await me.renderer.render({
            code: source,
            container: container,
            context: {
                appName        : me.appName,
                windowId       : me.windowId,
                parentComponent: me
            }
        });

        if (result) {
            if (result.customComponents) {
                me.customComponents = result.customComponents;
            }
            if (result.livePreviews) {
                me.livePreviews = result.livePreviews;
            }
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
        await super.initAsync();
        await this.loadRenderer(this.language)
    }

    /**
     * Loads and caches the renderer for a specific language.
     *
     * This method implements a **lazy-loading strategy**. It only imports and instantiates the renderer
     * when it is first requested. This keeps the initial bundle size small and improves startup performance,
     * especially since not all users will need every language renderer.
     *
     * Once loaded, the renderer instance is cached in `this.renderers` for instant access on subsequent switches.
     *
     * @param {String} language The language identifier (e.g., 'neomjs', 'markdown').
     * @returns {Promise<void>}
     */
    async loadRenderer(language) {
        let me = this,
            module;

        if (!me.renderers[language]) {
            switch (language) {
                case 'markdown':
                    module = await import('./renderer/Markdown.mjs');
                    break;
                case 'neomjs':
                    module = await import('./renderer/Neo.mjs');
                    break;
                default:
                    console.error('Invalid language for LivePreview:', language);
                    return
            }

            me.renderers[language] = Neo.create(module.default)
        }

        me.renderer = me.renderers[language]
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
