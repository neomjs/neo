import {default as Component} from '../../../../src/component/Base.mjs';

/**
 * @class Docs.app.view.classdetails.TutorialComponent
 * @extends Neo.component.Base
 */
class TutorialComponent extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Docs.app.view.classdetails.TutorialComponent'
         * @private
         */
        className: 'Docs.app.view.classdetails.TutorialComponent',
        /**
         * @member {String} ntype='classdetails-tutorialcomponent'
         * @private
         */
        ntype: 'classdetails-tutorialcomponent',
        /**
         * @member {String[]} cls=['neo-classdetails-tutorialcomponent']
         */
        cls: ['neo-classdetails-tutorialcomponent'],
        /**
         * @member {String|null} fileName=null
         */
        fileName: null,
        /**
         * @member {String|null} fileType=null
         */
        fileType: null,
        /**
         * @member {Object} style={overflow: 'auto'}
         */
        style: {
            overflow: 'auto'
        }
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me     = this,
            isJson = me.fileType === 'json',
            url    = '../docs/tutorials/' + me.fileName;

        if (!Neo.config.isExperimental) {
            url = '../' + url;
        }

        Neo.Xhr[isJson ? 'promiseJson' : 'promiseRequest']({
            url: url
        }).then(data => {
            setTimeout(() => { // ensure we are not mounting
                me.applySourceCode(isJson ? data.json : data.response);
            }, 100);
        });
    }

    /**
     *
     * @param {Object} data
     */
    applySourceCode(data) {
        let me   = this,
            vdom = me.vdom;

        if (me.fileType === 'json') {
            vdom.cn = data;
        } else {
            vdom.innerHTML = data;
        }

        me.vdom = vdom;

        setTimeout(() => {
            TutorialComponent.syntaxHighlight();
        }, 50);
    }

    /**
     *
     */
    static syntaxHighlight() {
        Neo.currentWorker.promiseMessage('main', {
            action : 'syntaxHighlightInit'
        });
    }
}

Neo.applyClassConfig(TutorialComponent);

export {TutorialComponent as default};