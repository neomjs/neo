import Component from '../../../../src/component/Base.mjs';
import VDomUtil  from '../../../../src/util/VDom.mjs';

/**
 * @class RealWorld.view.article.CommentComponent
 * @extends Neo.component.Base
 */
class CommentComponent extends Component {
    static config = {
        /**
         * @member {String} className='RealWorld.view.article.CommentComponent'
         * @protected
         */
        className: 'RealWorld.view.article.CommentComponent',
        /**
         * @member {Object|null} author_=null
         */
        author_: null,
        /**
         * @member {String[]} baseCls=['card']
         */
        baseCls: ['card'],
        /**
         * @member {String|null} body_=null
         */
        body_: null,
        /**
         * @member {Number|null} commentId=null
         */
        commentId: null,
        /**
         * @member {String|null} createdAt_=null
         */
        createdAt_: null,
        /**
         * Not in use
         * @member {String|null} updatedAt=null
         */
        updatedAt: null,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {cls: ['card-block'], cn: [
                {tag: 'p', cls: ['card-text']}
            ]},
            {cls: ['card-footer'], cn: [
                {tag: 'a', cls : ['comment-author'], href: '', cn: [
                    {tag: 'img', cls: ['comment-author-img']}
                ]},
                {vtype: 'text', html: '&nbsp;'},
                {tag: 'a', cls: ['comment-author'], href: ''},
                {tag: 'span', cls : ['date-posted']},
                {tag: 'span', cls : ['mod-options'], flag: 'mod-options', cn: [
                    //{tag: 'i', cls: ['ion-edit']}, // not implemented in other apps => not sure what should happen
                    {tag: 'i', cls: ['ion-trash-a']}
                ]}
            ]}
        ]}
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {click: {fn: me.onDeleteButtonClick, delegate: '.ion-trash-a', scope: me}}
            /*{click: {fn: me.onEditButtonClick,   delegate: '.ion-edit',    scope: me}*/
        ]);

        me.getController().on({
            afterSetCurrentUser: me.onCurrentUserChange,
            scope              : me
        });
    }

    /**
     * Triggered after the author config got changed
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetAuthor(value, oldValue) {
        if (value) {
            let me = this;

            me.vdom.cn[1].cn[0].cn[0].src = value.image;
            me.vdom.cn[1].cn[2].html      = value.username;

            me.update();
            me.onCurrentUserChange();
        }
    }

    /**
     * Triggered after the body config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetBody(value, oldValue) {
        if (value) {
            this.vdom.cn[0].cn[0].html = value;
            this.update();
        }
    }

    /**
     * Triggered after the createdAt config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetCreatedAt(value, oldValue) {
        if (value) {
            this.vdom.cn[1].cn[3].html = new Intl.DateTimeFormat('en-US', {
                day  : 'numeric',
                month: 'long',
                year : 'numeric'
            }).format(new Date(value));

            this.update();
        }
    }

    /**
     *
     */
    onCurrentUserChange() {
        let me          = this,
            currentUser = me.getController().currentUser;

        if (currentUser) {
            VDomUtil.getByFlag(me.vdom, 'mod-options').removeDom = me.author.username !== currentUser.username;
            me.update();
        }
    }

    /**
     * @param {Object} data
     */
    onDeleteButtonClick(data) {
        this.getController().deleteComment(this.commentId);
    }

    /**
     * Not supported yet
     * @param {Object} data
     */
    onEditButtonClick(data) {
        console.log('onEditButtonClick');
    }
}

export default Neo.setupClass(CommentComponent);
