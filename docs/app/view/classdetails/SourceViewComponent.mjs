import {default as Component} from '../../../../src/component/Base.mjs';

/**
 * @class Docs.app.view.classdetails.SourceViewComponent
 * @extends Neo.component.Base
 */
class SourceViewComponent extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Docs.app.view.classdetails.SourceViewComponent'
         * @private
         */
        className: 'Docs.app.view.classdetails.SourceViewComponent',
        /**
         * @member {String} ntype='classdetails-sourceviewcomponent'
         * @private
         */
        ntype: 'classdetails-sourceviewcomponent',
        /**
         * @member {Boolean} isHighlighted_=false
         * @private
         */
        isHighlighted_: false,
        /**
         * @member {Number|null} line_=null
         * @private
         */
        line_: null,
        /**
         * @member {Number|null} previousLine=null
         * @private
         */
        previousLine: null,
        /**
         * @member {Object|null} structureData=null
         * @private
         */
        structureData: null,
        /**
         * @member {Object} style= {overflow: 'auto'}
         */
        style: {
            overflow: 'auto'
        },
        /**
         * @member {Object} _vdom={cn: [//...]}
         */
        _vdom: {
            cn: [{
                tag: 'pre',
                cn : [{
                    tag  : 'code',
                    class: 'javascript'
                }]
            }]
        }
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me   = this,
            url  = '../' + me.structureData.srcPath;

        if (!Neo.config.isExperimental) {
            url = '../' + url;
        }

        Neo.Xhr.promiseRequest({
            url: url
        }).then(data => {
            setTimeout(() => { // ensure we are not mounting
                me.applySourceCode(data.response);
            }, 100);
        });
    }

    /**
     * Triggered after the isHighlighted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @private
     */
    afterSetIsHighlighted(value, oldValue) {
        if (value) {
            let me = this;

            setTimeout(() => {
                Neo.currentWorker.promiseMessage('main', {
                    action    : 'syntaxHighlightLine',
                    addLine   : me.line,
                    removeLine: me.previousLine,
                    vnodeId   : me.vdom.cn[0].id
                });
            }, 50);
        }
    }

    /**
     * Triggered after the line config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @private
     */
    afterSetLine(value, oldValue) {
        let me = this;

        if (oldValue) {
            me.previousLine = oldValue;
        }

        if (me.isHighlighted) {
            me.afterSetIsHighlighted(true);
        }
    }

    /**
     *
     * @param {Object} data
     */
    applySourceCode(data) {
        let me   = this,
            vdom = me.vdom,
            node = vdom.cn[0]; // pre tag

        node.cn[0].innerHTML = data; // code tag
        me.vdom = vdom;

        setTimeout(() => {
            me.syntaxHighlight(node.id);
        }, 50);
    }

    /**
     *
     * @param {String} vnodeId
     */
    syntaxHighlight(vnodeId) {
        let me = this;

        Neo.currentWorker.promiseMessage('main', {
            action : 'syntaxHighlight',
            vnodeId: vnodeId
        }).then(() => {
            me.isHighlighted = true;
        });
    }
}

Neo.applyClassConfig(SourceViewComponent);

export {SourceViewComponent as default};