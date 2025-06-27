import Component from '../component/Base.mjs';

/**
 * Deeply inspired by https://github.com/yangshun 's video on LinkedIn
 * as well as Apple's Keynote Magic Move effect
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
         * @member {Boolean} autoCycle_=true
         */
        autoCycle_: true,
        /**
         * @member {Number} autoCycleInterval_=2000
         */
        autoCycleInterval_: 2000,
        /**
         * @member {String[]} baseCls=['neo-magic-move-text']
         * @protected
         */
        baseCls: ['neo-magic-move-text'],
        /**
         * @member {String|null} colorMove=null
         */
        colorMove: null,
        /**
         * @member {String|null} colorFadeIn=null
         */
        colorFadeIn: null,
        /**
         * @member {String|null} colorFadeOut=null
         */
        colorFadeOut: null,
        /**
         * @member {String[]|null} cycleTexts=null
         */
        cycleTexts: null,
        /**
         * @member {String} fontFamily_='Helvetica Neue'
         */
        fontFamily_: 'Helvetica Neue',
        /**
         * Time in ms for the fadeIn, fadeOut and move character OPs
         * @member {Number} transitionTime_=500
         */
        transitionTime_: 500,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {style: {}, cn: [
            {cls: ['neo-content'], cn: []},
            {cls: ['neo-measure-element-wrapper'], removeDom: true, cn: [
                {cls: ['neo-measure-element'], cn:[]}
            ]}
        ]}
    }

    /**
     * @member {Object[]} chars=[]
     * @protected
     */
    chars = []
    /**
     * @member {Object[]} charsVdom=[]
     * @protected
     */
    charsVdom = []
    /**
     * @member {Number} contentHeight=0
     * @protected
     */
    contentHeight = 0
    /**
     * @member {Number} contentWidth=0
     * @protected
     */
    contentWidth = 0
    /**
     * @member {Number} currentIndex=0
     * @protected
     */
    currentIndex = 0
    /**
     * We do not need the first event to trigger logic, since afterSetMounted() handles this
     * @member {Boolean} initialResizeEvent=true
     * @protected
     */
    initialResizeEvent = true
    /**
     * @member {Number|null} intervalId=null
     * @protected
     */
    intervalId = null
    /**
     * Internal flag which gets set to true while the animated char transitions are running
     * @member {Boolean} isTransitioning=false
     * @protected
     */
    isTransitioning = false
    /**
     * @member {Object} measureCache={}
     * @protected
     */
    measureCache = {}
    /**
     * @member {Object[]} previousChars=[]
     * @protected
     */
    previousChars = []
    /**
     * @member {Object} measureElement
     * @protected
     */
    get measureElement() {
        return this.measureWrapper.cn[0]
    }
    /**
     * @member {Object} measureElement
     * @protected
     */
    get measureWrapper() {
        return this.vdom.cn[1]
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners({
            resize: me.onResize,
            scope : me
        })
    }

    /**
     * @param {Boolean} mounted
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
     * Triggered after the autoCycle config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetAutoCycle(value, oldValue) {
        this.mounted && this.startAutoCycle(value)
    }

    /**
     * Triggered after the autoCycleInterval config got changed
     * @param {Number} value
     * @param {Number} oldValue
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
     * Triggered after the fontFamily config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetFontFamily(value, oldValue) {
        let me = this;

        me.measureCache = {};

        me.vdom.style.fontFamily = value;
        me.update()
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
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
            me.measureCache  = {};
            me.previousChars = []
        }

        if (oldValue !== undefined) {
            me.addResizeObserver(value);

            me.autoCycle && me.startAutoCycle(value)
        }
    }

    /**
     * Triggered after the text config got changed
     * @param {String} value
     * @param {String} oldValue
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
            me.chars = [];
            measureElement.cn = [];

            value?.split('').forEach(char => {
                me.chars.push({name: char});

                measureElement.cn.push({tag: 'span', text: char})
            });

            if (me.mounted) {
                await me.measureChars()
            }

            await me.updateChars()
        }
    }

    /**
     * Triggered after the transitionTime config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetTransitionTime(value, oldValue) {
        this.vdom.style['--neo-transition-time'] = value + 'ms';
        this.update()
    }

    /**
     * @param {String[]} letters
     * @returns {Object[]}
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
     * @protected
     */
    cycleText() {
        let me = this;

        me.text         = me.cycleTexts[me.currentIndex];
        me.currentIndex = (me.currentIndex + 1) % me.cycleTexts.length
    }

    /**
     * @returns {Promise<void>}
     * @protected
     */
    async measureChars() {
        let me = this,
            {measureCache, measureElement, measureWrapper, text} = me,
            parentRect, rects;

        if (measureCache[text]) {
            rects      = [...measureCache[text]];
            parentRect = rects.shift()
        } else {
            measureWrapper.style = {
                height: me.contentHeight + 'px',
                width : me.contentWidth  + 'px'
            };

            delete measureWrapper.removeDom;

            await me.promiseUpdate();
            await me.timeout(20);

            rects      = await me.getDomRect([measureWrapper.id, ...measureElement.cn.map(node => node.id)]);
            parentRect = rects.shift();

            measureCache[text] = [parentRect, ...rects]
        }

        rects.forEach((rect, index) => {
            me.chars[index].left = `${rect.left - parentRect.left}px`;
            me.chars[index].top  = `${rect.top  - parentRect.top }px`;
        });

        //measureWrapper.removeDom = true;
        await me.promiseUpdate()
    }

    /**
     * @param {Object} data
     * @returns {Promise<void>}
     * @protected
     */
    async onResize({rect}) {
        let me = this;

        me.contentHeight = rect.height;
        me.contentWidth  = rect.width;

        me.measureCache = {};


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
     * @param {Object} a
     * @param {Object} b
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
     * @param {Boolean} start=true
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
     * @returns {Promise<void>}
     * @protected
     */
    async updateChars() {
        let me                     = this,
            {chars, previousChars} = me,
            charsContainer         = me.vdom.cn[0],
            letters                = chars.map(char => char.name),
            charNode, index;

        me.isTransitioning = true;

        if (me.charsVdom.length > 1) {
            charsContainer.cn = me.charsVdom;
            await me.promiseUpdate()
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

        charsContainer.cn.forEach(charNode => {
            if (charNode.flag === 'remove') {
                charNode.style.color   = me.colorFadeOut;
                charNode.style.opacity = 0
            } else {
                delete charNode.style.opacity
            }
        });

        await me.promiseUpdate();
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
        await me.timeout(200);

        me.charsVdom = [...charsContainer.cn];

        charsContainer.cn.length = 0;

        charsContainer.cn.push({text: me.text});
        await me.promiseUpdate();

        me.isTransitioning = false
    }
}

export default Neo.setupClass(MagicMoveText);
