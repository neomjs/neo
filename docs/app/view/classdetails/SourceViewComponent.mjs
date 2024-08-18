import Component from '../../../../src/component/Base.mjs';

/**
 * @class Docs.view.classdetails.SourceViewComponent
 * @extends Neo.component.Base
 */
class SourceViewComponent extends Component {
    static config = {
        /**
         * @member {String} className='Docs.view.classdetails.SourceViewComponent'
         * @protected
         */
        className: 'Docs.view.classdetails.SourceViewComponent',
        /**
         * @member {String} ntype='classdetails-sourceviewcomponent'
         * @protected
         */
        ntype: 'classdetails-sourceviewcomponent',
        /**
         * @member {Boolean} isHighlighted_=false
         * @protected
         */
        isHighlighted_: false,
        /**
         * @member {Number|null} line_=null
         * @protected
         */
        line_: null,
        /**
         * @member {Number|null} previousLine=null
         * @protected
         */
        previousLine: null,
        /**
         * @member {Object|null} structureData=null
         * @protected
         */
        structureData: null,
        /**
         * @member {Object} style= {overflow: 'auto'}
         */
        style: {
            overflow: 'auto'
        },
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {tag: 'pre', cls: ['hljs'], cn: [
                {tag: 'code', class: 'language-javascript'}
            ]}
        ]}
    }

    /**
     *
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me  = this,
            url = '../../' + me.structureData.srcPath;

        Neo.Xhr.promiseRequest({
            url
        }).then(data => {
            me.applySourceCode(data.response)
        })
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        value && this.timeout(50).then(() => {
            this.syntaxHighlight()
        })
    }

    /**
     * Triggered after the isHighlighted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetIsHighlighted(value, oldValue) {
        if (value) {
            let me = this;

            me.timeout(50).then(() => {
                Neo.main.addon.HighlightJS.syntaxHighlightLine({
                    addLine   : me.line,
                    appName   : me.appName,
                    removeLine: me.previousLine,
                    vnodeId   : me.vdom.cn[0].cn[0].id
                })
            })
        }
    }

    /**
     * Triggered after the line config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetLine(value, oldValue) {
        let me = this;

        if (oldValue) {
            me.previousLine = oldValue
        }

        if (me.isHighlighted) {
            me.afterSetIsHighlighted(true, false)
        }
    }

    /**
     *
     * @param {Object} data
     */
    applySourceCode(data) {
        let me   = this,
            node = me.vdom.cn[0]; // pre tag

        node.cn[0].innerHTML = data; // code tag
        me.update();

        me.mounted && me.syntaxHighlight()
    }

    /**
     *
     */
    syntaxHighlight() {
        let me = this;

        Neo.main.addon.HighlightJS.syntaxHighlight({
            appName: me.appName,
            vnodeId: me.vdom.cn[0].cn[0].id
        }).then(() => {
            if (!me.isHighlighted) {
                me.isHighlighted = true
            } else {
                me.afterSetIsHighlighted(true, false)
            }
        })
    }
}

export default Neo.setupClass(SourceViewComponent);
