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
         * @member {String} text_=null
         */
        text_: null,
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
     */
    chars = []
    /**
     * @member {Number} currentIndex=0
     */
    currentIndex = 0
    /**
     * @member {Number|null} intervalId=null
     */
    intervalId = null
    /**
     * @member {Object[]} previousChars=[]
     */
    previousChars = []
    /**
     * @member {Object} measureElement
     */
    get measureElement() {
        return this.vdom.cn[1].cn[0]
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
        this.vdom.style.fontFamily = value;
        this.update()
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);
        this.autoCycle && this.startAutoCycle(value)
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

                if (char === ' ') {
                    char = '&nbsp;'
                }

                measureElement.cn.push({tag: 'span', html: char})
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
     * @returns {Promise<void>}
     */
    async measureChars() {
        let me = this,
            {measureElement} = me,
            parentRect, rects;

        delete me.vdom.cn[1].removeDom;

        await me.promiseUpdate();
        await me.timeout(20);

        rects      = await me.getDomRect([me.vdom.cn[1].id, ...measureElement.cn.map(node => node.id)]);
        parentRect = rects.shift();

        rects.forEach((rect, index) => {
            me.chars[index].left = `${rect.left - parentRect.left}px`;
            me.chars[index].top  = `${rect.top  - parentRect.top }px`;
        });

        me.vdom.cn[1].removeDom = true;
        await me.promiseUpdate()
    }

    /**
     * @param {Boolean} start=true
     */
    startAutoCycle(start=true) {
        let me = this;

        if (start) {
            me.intervalId = setInterval(() => {
                me.text         = me.cycleTexts[me.currentIndex];
                me.currentIndex = (me.currentIndex + 1) % me.cycleTexts.length
            }, me.autoCycleInterval)

            me.text && me.measureChars()
        } else {
            clearInterval(me.intervalId)
        }
    }

    /**
     * @returns {Promise<void>}
     */
    async updateChars() {
        let me                     = this,
            {chars, previousChars} = me,
            charsContainer         = me.vdom.cn[0].cn,
            letters                = chars.map(char => char.name),
            char, charNode, index;

        previousChars.forEach((previousChar, previousIndex) => {
            index = letters.indexOf(previousChar.name);

            if (index > -1) {
                charNode = charsContainer[previousIndex];

                charNode.style.color = me.colorMove;
                charNode.style.left  = chars[index].left;
                letters[index] = null
            } else {
                charNode = charsContainer[previousIndex];

                charNode.flag = 'remove'
            }
        });

        letters.forEach((letter, index) => {
            if (letter !== null) {
                char = chars[index];

                charsContainer.push({
                    html : char.name,
                    style: {color: me.colorFadeIn, left: char.left, opacity: 0, top: char.top}
                })
            }
        });

        await me.promiseUpdate();

        charsContainer.forEach(charNode => {
            if (charNode.flag === 'remove') {
                charNode.style.color   = me.colorFadeOut;
                charNode.style.opacity = 0
            } else {
                charNode.style.opacity = 1
            }
        });

        await me.promiseUpdate();
        await me.timeout(me.transitionTime);

        charsContainer.sort((a, b) => parseFloat(a.style.left) - parseFloat(b.style.left));

        index = charsContainer.length - 1;

        for (; index >= 0; index--) {
            charNode = charsContainer[index];

            delete charNode.flag;
            delete charNode.style.color;

            if (charNode.style.opacity === 0) {
                charsContainer.splice(index, 1)
            }
        }

        await me.promiseUpdate()
    }
}

export default Neo.setupClass(MagicMoveText);
