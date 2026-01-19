import Component from '../component/Base.mjs';

/**
 * @summary Animates text transitions by calculating character positions and applying CSS transforms.
 *
 * This component creates a "Magic Move" style effect, where changing from one string of text to another results
 * in a smooth animation. Characters that are common between the two strings appear to move to their new positions,
 * while old characters fade out and new characters fade in.
 *
 * This effect is achieved using a two-phase process that leverages Neo.mjs's VDOM and rendering pipeline:
 * 1.  **Measurement Phase (`measureChars`):** When the text changes, the component determines the exact final
 *     position of every character by briefly rendering them into a hidden `measure-element` div and retrieving
 *     their `DOMRect` values. This ensures pixel-perfect transitions even when fonts or dimensions change.
 * 2.  **Animation Phase (`updateChars`):** Using the measured positions, the component calculates the delta
 *     between the old and new text. It manipulates the VDOM to apply CSS transforms for movement and opacity
 *     to individual `<span>` elements.
 *
 * **SEO & Accessibility:**
 * The component supports a `renderSeoList` config which injects a hidden, semantically correct `<ul>` containing
 * all cycle texts. This ensures that search engines and screen readers can index and access the full content
 * without being hindered by the visual animation DOM structure.
 *
 * Relevant concepts: `text animation`, `character transition`, `magic move`, `declarative animation`, `CSS transitions`, `SEO`, `accessibility`.
 *
 * Deeply inspired by https://github.com/yangshun 's video on LinkedIn
 * as well as Apple's Keynote Magic Move effect.
 * @class Neo.component.MagicMoveText
 * @extends Neo.component.Base
 */
class MagicMoveText extends Component {
    static config = {
        /**
         * @member {String} className='Neo.component.MagicMoveText'
         * @protected
         */
        className: 'Neo.component.MagicMoveText',
        /**
         * @member {String} ntype='magic-move-text'
         * @protected
         */
        ntype: 'magic-move-text',
        /**
         * Set to true to automatically cycle through the `cycleTexts` array.
         * @member {Boolean} autoCycle_=true
         * @reactive
         */
        autoCycle_: true,
        /**
         * The time in milliseconds between each automatic text transition.
         * @member {Number} autoCycleInterval_=2000
         * @reactive
         */
        autoCycleInterval_: 2000,
        /**
         * @member {String[]} baseCls=['neo-magic-move-text']
         * @protected
         */
        baseCls: ['neo-magic-move-text'],
        /**
         * The color applied to characters that are moving to a new position.
         * @member {String|null} colorMove=null
         */
        colorMove: null,
        /**
         * The color applied to new characters as they fade in.
         * @member {String|null} colorFadeIn=null
         */
        colorFadeIn: null,
        /**
         * The color applied to old characters as they fade out.
         * @member {String|null} colorFadeOut=null
         */
        colorFadeOut: null,
        /**
         * An array of strings to automatically cycle through if `autoCycle` is true.
         * @member {String[]|null} cycleTexts=null
         */
        cycleTexts: null,
        /**
         * The font-family for the text. Changing this will trigger a cache invalidation and remeasurement.
         * @member {String} fontFamily_='Helvetica Neue'
         * @reactive
         */
        fontFamily_: 'Helvetica Neue',
        /**
         * The duration in milliseconds for the fade-in, fade-out, and move animations.
         * This value is applied to the `--neo-transition-time` CSS variable.
         * @member {Number} transitionTime_=500
         * @reactive
         */
        transitionTime_: 500,
        /**
         * Set to true to render a semantic `<ul>` containing all cycleTexts for SEO.
         * @member {Boolean} renderSeoList_=false
         * @reactive
         */
        renderSeoList_: false,
        /**
         * The VDOM structure for the component, including a content area and a hidden measurement element.
         * @member {Object} _vdom
         * @protected
         */
        _vdom:
        {style: {}, cn: [
            {ariaHidden: true, cn: [
                {cls: ['neo-content'], cn: []},
                {cls: ['neo-measure-element-wrapper'], removeDom: true, cn: [
                    {cls: ['neo-measure-element'], cn:[]}
                ]}
            ]}
        ]}
    }

    /**
     * An array of objects, where each object represents a character in the current `text`.
     * Each object contains the character's `name` (the character itself) and its calculated
     * `left` and `top` positions relative to the container.
     * @member {Object[]} chars=[]
     * @protected
     */
    chars = []
    /**
     * A cached representation of the VDOM for the currently displayed characters.
     * This is used to persist the character state during resize events, preventing
     * the need for a full recalculation.
     * @member {Object[]} charsVdom=[]
     * @protected
     */
    charsVdom = []
    /**
     * The height of the component's content area, determined on mount and resize.
     * Used to size the measurement wrapper.
     * @member {Number} contentHeight=0
     * @protected
     */
    contentHeight = 0
    /**
     * The width of the component's content area, determined on mount and resize.
     * Used to size the measurement wrapper.
     * @member {Number} contentWidth=0
     * @protected
     */
    contentWidth = 0
    /**
     * The index of the string currently displayed from the `cycleTexts` array.
     * @member {Number} currentIndex=0
     * @protected
     */
    currentIndex = 0
    /**
     * A flag to ignore the very first resize event that fires immediately after mounting,
     * as the initial measurement is handled by `afterSetMounted`.
     * @member {Boolean} initialResizeEvent=true
     * @protected
     */
    initialResizeEvent = true
    /**
     * The ID for the `setInterval` used for `autoCycle`. Stored so it can be cleared.
     * @member {Number|null} intervalId=null
     * @protected
     */
    intervalId = null
    /**
     * Internal flag to prevent infinite retry loops in case of errors during the animation.
     * @member {Boolean} isRetrying=false
     * @protected
     */
    isRetrying = false
    /**
     * A flag to indicate that the component is currently in the middle of an animation.
     * This is used to prevent concurrent, overlapping updates (e.g., from a resize event).
     * @member {Boolean} isTransitioning=false
     * @protected
     */
    isTransitioning = false
    /**
     * Stores the `chars` array from the *previous* text state. This is essential for calculating
     * the transition, as it's compared against the new `chars` array to determine which characters
     * need to move, fade in, or fade out.
     * @member {Object[]} previousChars=[]
     * @protected
     */
    previousChars = []
    /**
     * A getter for the VDOM node used to measure character positions.
     * @member {Object} measureElement
     * @protected
     */
    get measureElement() {
        return this.measureWrapper.cn[0]
    }
    /**
     * A getter for the wrapper of the measurement VDOM node. This wrapper is temporarily
     * added to the DOM to perform measurements.
     * @member {Object} measureWrapper
     * @protected
     */
    get measureWrapper() {
        return this.vdom.cn[0].cn[1]
    }
    /**
     * A getter for the visual content container.
     * @member {Object} visualWrapper
     * @protected
     */
    get visualWrapper() {
        return this.vdom.cn[0].cn[0]
    }

    /**
     * The constructor registers a resize listener to invalidate the measurement cache when the component size changes.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners({
            resize: me.onResize,
            scope : me
        });

        me.app?.on('visibilitychange', me.onVisibilityChange, me)
    }

    /**
     * Registers or unregisters this component with the global ResizeObserver addon.
     * This is more efficient than having a separate observer for each component instance.
     * @param {Boolean} mounted True to register, false to unregister.
     * @protected
     */
    async addResizeObserver(mounted) {
        let {id, windowId} = this,
            ResizeObserver = await Neo.currentWorker.getAddon('ResizeObserver', windowId);

        ResizeObserver[mounted ? 'register' : 'unregister']({id, windowId});

        if (mounted) {
            this.initialResizeEvent = true
        }
    }

    /**
     * Starts or stops the automatic text cycling when the `autoCycle` config changes.
     * @param {Boolean} value    The new value of `autoCycle`.
     * @param {Boolean} oldValue The old value of `autoCycle`.
     * @protected
     */
    afterSetAutoCycle(value, oldValue) {
        this.mounted && this.startAutoCycle(value)
    }

    /**
     * Restarts the automatic text cycling with the new interval when the `autoCycleInterval` config changes.
     * @param {Number} value    The new value of `autoCycleInterval`.
     * @param {Number} oldValue The old value of `autoCycleInterval`.
     * @protected
     */
    afterSetAutoCycleInterval(value, oldValue) {
        let me = this;

        if (oldValue && me.mounted) {
            me.startAutoCycle(false);
            me.startAutoCycle()
        }
    }

    /**
     * Invalidates the measurement cache and updates the VDOM when the `fontFamily` config changes,
     * as a new font will change all character dimensions.
     * @param {String} value    The new value of `fontFamily`.
     * @param {String} oldValue The old value of `fontFamily`.
     * @protected
     */
    afterSetFontFamily(value, oldValue) {
        let me = this;

        me.vdom.style.fontFamily = value;
        me.update()
    }

    /**
     * Handles the component's mounted state changes. When mounted, it determines the component's
     * dimensions. When unmounted, it clears the measurement cache and character state.
     * @param {Boolean} value    The new value of `mounted`.
     * @param {Boolean} oldValue The old value of `mounted`.
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        let me = this;

        if (value) {
            me.getDomRect().then(rect => {
                me.contentHeight = rect.height;
                me.contentWidth  = rect.width;
            })
        } else {
            me.previousChars = []
        }

        if (oldValue !== undefined) {
            me.addResizeObserver(value);

            me.autoCycle && me.startAutoCycle(value)
        }
    }

    /**
     * This is the main entry point for the animation when the `text` config is changed.
     * It orchestrates the measurement and animation phases. It also contains a `try/catch`
     * block to handle potential errors during the complex animation logic, with a single-retry
     * mechanism to recover from transient states by clearing the cache and re-running the process.
     * @param {String} value    The new text value.
     * @param {String} oldValue The old text value.
     * @returns {Promise<void>}
     * @protected
     */
    async afterSetText(value, oldValue) {
        let me               = this,
            {measureElement} = me;

        if (oldValue) {
            me.previousChars = me.chars
        }

        if (value) {
            try {
                me.chars = [];
                measureElement.cn = [];

                value?.split('').forEach(char => {
                    me.chars.push({name: char});
                    measureElement.cn.push({tag: 'span', text: char})
                });

                if (me.mounted) {
                    await me.measureChars()
                }

                if (me.isDestroyed) return;

                await me.updateChars()
            } catch (e) {
                if (e === Neo.isDestroyed) return;

                if (!me.isRetrying) {
                    me.isRetrying    = true;
                    me.previousChars = [];

                    // Reset a transitioning state
                    me.visualWrapper.cn.length = 0;

                    await me.afterSetText(value, oldValue)
                }
            }

            me.isRetrying = false
        }
    }

    /**
     * Updates the VDOM to include or remove the SEO-friendly list.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetRenderSeoList(value, oldValue) {
        let me = this;

        if (value) {
            if (!me.vdom.cn[1]) {
                me.vdom.cn.push({
                    tag: 'ul',
                    cls: ['neo-seo-list'],
                    cn : me.cycleTexts?.map(text => ({tag: 'li', text})) || []
                });
                me.update();
            }
        } else {
            if (me.vdom.cn[1] && me.vdom.cn[1].cls.includes('neo-seo-list')) {
                me.vdom.cn.pop();
                me.update();
            }
        }
    }

    /**
     * Applies the transition time to a CSS variable, allowing the animations to be controlled via JavaScript.
     * @param {Number} value    The new value of `transitionTime`.
     * @param {Number} oldValue The old value of `transitionTime`.
     * @protected
     */
    afterSetTransitionTime(value, oldValue) {
        this.vdom.style['--neo-transition-time'] = value + 'ms';
        this.update()
    }

    /**
     * Creates the VDOM for new characters that are fading in. It filters out characters
     * that are already present (and will be moved instead).
     * @param {String[]} letters An array representing the new text, with `null` for characters that already existed.
     * @returns {Object[]} An array of VDOM nodes for the new characters.
     * @protected
     */
    createCharsVdom(letters) {
        let me             = this,
            {chars}        = me,
            charsContainer = [],
            char;

        letters.forEach((letter, index) => {
            if (letter !== null) {
                char = chars[index];

                charsContainer.push({
                    cls  : ['neo-char'],
                    style: {color: me.colorFadeIn, left: char.left, opacity: 0, top: char.top},
                    text : char.name
                })
            }
        });

        return charsContainer
    }

    /**
     * Advances the text to the next string in the `cycleTexts` array.
     * @protected
     */
    cycleText() {
        let me = this;

        me.text         = me.cycleTexts[me.currentIndex];
        me.currentIndex = (me.currentIndex + 1) % me.cycleTexts.length
    }

    /**
     * The first phase of the animation: calculating character positions.
     * If the positions for the current text are not in the cache, this method temporarily
     * renders the characters into a hidden div, measures their bounding rectangles,
     * stores the results in the cache, and then removes the measurement elements from the DOM.
     * @returns {Promise<void>}
     * @protected
     */
    async measureChars() {
        let me = this,
            {measureElement, measureWrapper} = me,
            parentRect, rects, rootRect;

        measureWrapper.style = {
            height: me.contentHeight + 'px',
            width : me.contentWidth  + 'px'
        };

        delete measureWrapper.removeDom;

        await me.promiseUpdate();
        if (me.isDestroyed) return;
        await me.timeout(20);

        rects      = await me.getDomRect([me.id, measureWrapper.id, ...measureElement.cn.map(node => node.id)]);
        if (me.isDestroyed) return;
        rootRect   = rects.shift();
        parentRect = rects.shift();

        // Self-Correction: If the real DOM size differs from our expected size, we update and retry.
        // We allow a small tolerance (2px) for sub-pixel rendering differences.
        // We also check for > 0 to avoid zeroing out dimensions if the component is temporarily hidden.
        if (rootRect.width > 0 && (Math.abs(rootRect.width - me.contentWidth) > 2 || Math.abs(rootRect.height - me.contentHeight) > 2)) {
            me.contentWidth  = rootRect.width;
            me.contentHeight = rootRect.height;

            return me.measureChars()
        }

        // Race condition guard: If text changed while we were measuring, me.chars might be out of sync.
        if (rects.length !== me.chars.length) {
            return
        }

        rects.forEach((rect, index) => {
            me.chars[index].left = `${rect.left - parentRect.left}px`;
            me.chars[index].top  = `${rect.top  - parentRect.top }px`;
        });

        await me.promiseUpdate()
    }

    /**
     * The resize event handler. It updates the component's dimensions, invalidates the
     * measurement cache, and triggers a remeasurement and VDOM update.
     * @param {Object} data      The event data from the resize observer.
     * @param {Object} data.rect The new bounding rectangle of the component.
     * @returns {Promise<void>}
     * @protected
     */
    async onResize({rect}) {
        let me = this;

        me.contentHeight = rect.height;
        me.contentWidth  = rect.width;

        if (!me.initialResizeEvent) {
            if (!me.isTransitioning) {
                await me.measureChars();

                me.charsVdom = me.createCharsVdom(me.chars.map(char => char.name))
            }
        } else {
            me.initialResizeEvent = false
        }
    }

    /**
     * Triggered when switching browser tabs or minimizing the browser
     * @param {Object}  data
     * @param {Boolean} data.hidden
     * @param {String}  data.visibilityState
     * @param {Number}  data.windowId
     */
    onVisibilityChange(data) {
        let me = this;

        if (me.autoCycle) {
            if (data.hidden) {
                me.startAutoCycle(false)
            } else {
                me.isRetrying    = false;
                me.previousChars = [];

                me.startAutoCycle()
            }
        }
    }

    /**
     * A sort comparator function used to order character VDOM nodes based on their
     * `top` and `left` style properties. This ensures a consistent DOM order.
     * @param {Object} a The first VDOM node.
     * @param {Object} b The second VDOM node.
     * @returns {Number}
     * @protected
     */
    sortCharacters(a, b) {
        let deltaTop = parseFloat(a.style.top) - parseFloat(b.style.top);

        if (deltaTop !== 0) {
            return deltaTop
        }

        return parseFloat(a.style.left) - parseFloat(b.style.left)
    }

    /**
     * Starts or stops the `setInterval` for automatic text cycling.
     * @param {Boolean} start=true True to start the timer, false to stop it.
     * @protected
     */
    startAutoCycle(start=true) {
        let me = this;

        if (start) {
            me.intervalId = setInterval(me.cycleText.bind(me), me.autoCycleInterval);

            me.timeout(20).then(() => {me.cycleText()})
        } else {
            clearInterval(me.intervalId)
        }
    }

    /**
     * The second and most complex phase of the animation: updating the VDOM to trigger CSS transitions.
     * This method implements the core "magic move" logic by determining the delta between the old
     * and new text states and applying styles accordingly.
     *
     * The algorithm is as follows:
     * 1. Iterate through the `previousChars`.
     * 2. For each old character, check if it exists in the new text.
     *    - If YES: This character needs to **move**. Apply the new `left` and `top` styles to its VDOM node.
     *    - If NO: This character needs to **fade out**. Flag it for removal.
     * 3. Create new VDOM nodes for all characters that are unique to the new text. These will **fade in**.
     * 4. Apply styles to all nodes simultaneously to trigger the CSS transitions (move, fade-in, fade-out).
     * 5. After the transition duration, clean up the VDOM by removing the faded-out nodes.
     * 6. Finally, for performance, collapse all the individual character `<span>` nodes back into a single
     *    text node until the next animation is triggered.
     * @returns {Promise<void>}
     * @protected
     */
    async updateChars() {
        let me                     = this,
            {chars, previousChars} = me,
            charsContainer         = me.visualWrapper,
            letters                = chars.map(char => char.name),
            charNode, index;

        me.isTransitioning = true;

        if (me.charsVdom.length > 1) {
            charsContainer.cn = me.charsVdom;
            await me.promiseUpdate();
            if (me.isDestroyed) return;
        }

        previousChars.forEach((previousChar, previousIndex) => {
            index = letters.indexOf(previousChar.name);

            if (index > -1) {
                charNode = charsContainer.cn[previousIndex];

                Object.assign(charNode.style, {
                    color: me.colorMove,
                    left : chars[index].left,
                    top  : chars[index].top
                });

                letters[index] = null
            } else {
                charNode = charsContainer.cn[previousIndex];

                charNode.flag = 'remove'
            }
        });

        charsContainer.cn.push(...me.createCharsVdom(letters));

        await me.promiseUpdate();
        if (me.isDestroyed) return;

        charsContainer.cn.forEach(charNode => {
            if (charNode.flag === 'remove') {
                charNode.style.color   = me.colorFadeOut;
                charNode.style.opacity = 0
            } else {
                delete charNode.style.opacity
            }
        });

        await me.promiseUpdate();
        if (me.isDestroyed) return;
        await me.timeout(me.transitionTime);

        charsContainer.cn.sort(me.sortCharacters);

        index = charsContainer.cn.length - 1;

        for (; index >= 0; index--) {
            charNode = charsContainer.cn[index];

            delete charNode.flag;
            delete charNode.style.color;

            if (charNode.style.opacity === 0) {
                charsContainer.cn.splice(index, 1)
            }
        }

        await me.promiseUpdate();
        if (me.isDestroyed) return;
        await me.timeout(200);

        me.charsVdom = [...charsContainer.cn];

        me.isTransitioning = false
    }
}

export default Neo.setupClass(MagicMoveText);
