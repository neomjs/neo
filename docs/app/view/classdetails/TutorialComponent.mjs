import Component from '../../../../src/component/Base.mjs';

/**
 * @class Docs.view.classdetails.TutorialComponent
 * @extends Neo.component.Base
 */
class TutorialComponent extends Component {
    static config = {
        /**
         * @member {String} className='Docs.view.classdetails.TutorialComponent'
         * @protected
         */
        className: 'Docs.view.classdetails.TutorialComponent',
        /**
         * @member {String} ntype='classdetails-tutorialcomponent'
         * @protected
         */
        ntype: 'classdetails-tutorialcomponent',
        /**
         * @member {String[]} baseCls=['neo-classdetails-tutorialcomponent']
         */
        baseCls: ['neo-classdetails-tutorialcomponent'],
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
    }

    /**
     *
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me     = this,
            isJson = me.fileType === 'json',
            url    = '../../docs/tutorials/' + me.fileName;

        Neo.Xhr[isJson ? 'promiseJson' : 'promiseRequest']({
            url
        }).then(data => {
            me.timeout(100).then(() => { // ensure we are not mounting
                me.applySourceCode(isJson ? data.json : data.response);
            })
        })
    }

    /**
     *
     * @param {Object} data
     */
    applySourceCode(data) {
        let me = this;

        if (me.fileType === 'json') {
            me.vdom.cn = data
        } else {
            me.vdom.innerHTML = data
        }

        me.update();

        me.timeout(50).then(() => {
            TutorialComponent.syntaxHighlight()
        })
    }

    /**
     *
     */
    static syntaxHighlight() {
        Neo.main.addon.HighlightJS.syntaxHighlightInit();
    }
}

Neo.setupClass(TutorialComponent);

export default TutorialComponent;
