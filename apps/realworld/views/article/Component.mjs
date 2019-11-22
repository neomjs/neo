import {default as BaseComponent} from '../../../../src/component/Base.mjs';
import {default as VDomUtil}      from '../../../../src/util/VDom.mjs';

/**
 * @class RealWorld.views.article.Component
 * @extends Neo.component.Base
 */
class Component extends BaseComponent {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld.views.article.Component'
         * @private
         */
        className: 'RealWorld.views.article.Component',
        /**
         * @member {String} ntype='realworld-article-component'
         * @private
         */
        ntype: 'realworld-article-component',
        /**
         * @member {Object|null} author_=null
         */
        author_: null,
        /**
         * @member {String|null} body_=null
         */
        body_: null,
        /**
         * @member {String|null} createdAt_=null
         */
        createdAt_: null,
        /**
         * @member {String[]} cls=['article-page']
         */
        cls: ['article-page'],
        /**
         * @member {Number|null} favoritesCount_=null
         */
        favoritesCount_: null,
        /**
         * @member {String|null} title_=null
         */
        title_: null,
        /**
         * @member {Object} _vdom
         */
        _vdom: {
            cn: [{
                cls: ['banner'],
                cn : [{
                    cls: ['container'],
                    cn : [{
                        tag : 'h1',
                        flag: 'title'
                    }, {
                        cls: ['article-meta'],
                        cn : [{
                            tag : 'a',
                            href: '',
                            cn  : [{
                                tag : 'img',
                                flag: 'userimage'
                            }]
                        }, {
                            cls: ['info'],
                            cn : [{
                                tag : 'a',
                                cls : ['author'],
                                flag: 'username',
                                href: ''
                            }, {
                                tag : 'span',
                                cls : ['date'],
                                flag: 'createdAt'
                            }]
                        }, {
                            tag: 'button',
                            cls: ['btn', 'btn-sm', 'btn-outline-secondary', 'follow-button'],
                            cn : [{
                                tag: 'i',
                                cls: ['ion-plus-round']
                            }, {
                                vtype: 'text',
                                flag : 'followAuthor'
                            }, {
                                vtype: 'text',
                                flag : 'username'
                            }]
                        }, {
                            vtype: 'text',
                            html : '&nbsp;&nbsp;'
                        }, {
                            tag: 'button',
                            cls: ['btn', 'btn-sm', 'btn-outline-primary'],
                            cn : [{
                                tag: 'i',
                                cls: ['ion-heart']
                            }, {
                                vtype: 'text',
                                html : '&nbsp;'
                            }, {
                                vtype: 'text',
                                html : 'Favorite Post'
                            }, {
                                vtype: 'text',
                                html : '&nbsp;'
                            }, {
                                tag : 'span',
                                cls : ['counter'],
                                flag: 'favoritesCount'
                            }]
                        }]
                    }]
                }]
            }, {
                cls: ['container', 'page'],
                cn : [{
                    cls: ['row', 'article-content'],
                    cn : [{
                        cls : ['col-md-12'],
                        flag: 'body'
                    }]
                }, {
                    tag: 'hr'
                }, {
                    cls: ['article-actions'],
                    cn : [{
                        cls: ['article-meta'],
                        cn : [{
                            tag : 'a',
                            href: 'profile.html',
                            cn  : [{
                                tag : 'img',
                                flag: 'userimage'
                            }]
                        }, {
                            cls: ['info'],
                            cn : [{
                                tag : 'a',
                                cls : ['author'],
                                flag: 'username',
                                href: ''
                            }, {
                                tag : 'span',
                                cls : ['date'],
                                html: 'January 20th'
                            }]
                        }, {
                            tag: 'button',
                            cls: ['btn', 'btn-sm', 'btn-outline-secondary', 'follow-button'],
                            cn : [{
                                tag: 'i',
                                cls: ['ion-plus-round']
                            }, {
                                vtype: 'text',
                                flag : 'followAuthor'
                            }, {
                                vtype: 'text',
                                flag : 'username'
                            }]
                        }, {
                            vtype: 'text',
                            html : '&nbsp;&nbsp;'
                        }, {
                            tag: 'button',
                            cls: ['btn', 'btn-sm', 'btn-outline-primary'],
                            cn : [{
                                tag: 'i',
                                cls: ['ion-heart']
                            }, {
                                vtype: 'text',
                                html : '&nbsp;'
                            }, {
                                vtype: 'text',
                                html : 'Favorite Post'
                            }, {
                                vtype: 'text',
                                html : '&nbsp;'
                            }, {
                                tag : 'span',
                                cls : ['counter'],
                                flag: 'favoritesCount'
                            }]
                        }]
                    }]
                }, {
                    cls: 'row',
                    cn : [{
                        cls: ['col-xs-12', 'col-md-8', 'offset-md-2'],
                        cn : [{
                            tag: 'form',
                            cls: ['card', 'comment-form'],
                            cn : [{
                                cls: ['card-block'],
                                cn : [{
                                    tag        : 'textarea',
                                    cls        : ['form-control'],
                                    placeholder: 'Write a comment...',
                                    rows       : 3
                                }]
                            }, {
                                cls: ['card-footer'],
                                cn : [{
                                    tag: 'img',
                                    cls: ['comment-author-img'],
                                    src: 'http://i.imgur.com/Qr71crq.jpg'
                                }, {
                                    tag : 'button',
                                    cls : ['btn', 'btn-sm', 'btn-primary'],
                                    html: 'Post Comment',
                                    type: 'button' // override the default submit type
                                }]
                            }]
                        }, {
                            cls: 'card',
                            cn : [{
                                cls: ['card-block'],
                                cn : [{
                                    tag : 'p',
                                    cls : ['card-text'],
                                    html: 'With supporting text below as a natural lead-in to additional content.'
                                }]
                            }, {
                                cls: ['card-footer'],
                                cn : [{
                                    tag : 'a',
                                    cls : ['comment-author'],
                                    href: '',
                                    cn  : [{
                                        tag: 'img',
                                        cls: ['comment-author-img'],
                                        src: 'http://i.imgur.com/Qr71crq.jpg'
                                    }]
                                }, {
                                    vtype: 'text',
                                    html : '&nbsp;'
                                }, {
                                    tag : 'a',
                                    cls : ['comment-author'],
                                    href: '',
                                    html: 'Jacob Schmidt'
                                }, {
                                    tag : 'span',
                                    cls : ['date-posted'],
                                    html: 'Dec 29th'
                                }]
                            }]
                        }, {
                            cls: 'card',
                            cn : [{
                                cls: ['card-block'],
                                cn : [{
                                    tag : 'p',
                                    cls : ['card-text'],
                                    html: 'With supporting text below as a natural lead-in to additional content.'
                                }]
                            }, {
                                cls: ['card-footer'],
                                cn : [{
                                    tag : 'a',
                                    cls : ['comment-author'],
                                    href: '',
                                    cn  : [{
                                        tag: 'img',
                                        cls: ['comment-author-img'],
                                        src: 'http://i.imgur.com/Qr71crq.jpg'
                                    }]
                                }, {
                                    vtype: 'text',
                                    html : '&nbsp;'
                                }, {
                                    tag : 'a',
                                    cls : ['comment-author'],
                                    href: '',
                                    html: 'Jacob Schmidt'
                                }, {
                                    tag : 'span',
                                    cls : ['date-posted'],
                                    html: 'Dec 29th'
                                }, {
                                    tag: 'span',
                                    cls: ['mod-options'],
                                    cn : [
                                        {tag: 'i', cls: ['ion-edit']},
                                        {tag: 'i', cls: ['ion-trash-a']},
                                    ]
                                }]
                            }]
                        }]
                    }]
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

        let me           = this,
            domListeners = me.domListeners;

        domListeners.push({
            click: {
                fn      : me.onFollowButtonClick,
                delegate: '.follow-button',
                scope   : me
            }
        });

        me.domListeners = domListeners;
    }

    /**
     * Triggered after the body config got changed
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    afterSetBody(value, oldValue) {
        let vdom = this.vdom;

        // todo: markdown parsing => #78
        VDomUtil.getByFlag(vdom, 'body').html = value;
        this.vdom = vdom;
    }

    /**
     * Triggered after the createdAt config got changed
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    afterSetCreatedAt(value, oldValue) {
        if (value) {
            let vdom = this.vdom;

            VDomUtil.getByFlag(vdom, 'createdAt').html = new Intl.DateTimeFormat('en-US', {
                day  : 'numeric',
                month: 'long',
                year : 'numeric'
            }).format(new Date(value));

            this.vdom = vdom;
        }
    }

    /**
     * Triggered after the favoritesCount config got changed
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    afterSetFavoritesCount(value, oldValue) {
        if (Neo.isNumber(value)) {
            let vdom = this.vdom;

            VDomUtil.getFlags(vdom, 'favoritesCount').forEach(node => {
                node.html = `(${value})`;
            });

            this.vdom = vdom;
        }
    }

    /**
     * Triggered after the title config got changed
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    afterSetTitle(value, oldValue) {
        let vdom = this.vdom;

        VDomUtil.getByFlag(vdom, 'title').html = value;
        this.vdom = vdom;
    }

    /**
     * Triggered after the author config got changed
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    afterSetAuthor(value, oldValue) {
        if (value) {
            let vdom = this.vdom;

            VDomUtil.getFlags(vdom, 'followAuthor').forEach(node => {console.log(node);
                node.html = value.following ? ' Unfollow ' : ' Follow ';
            });

            VDomUtil.getFlags(vdom, 'userimage').forEach(node => {
                node.src = value.image;
            });

            VDomUtil.getFlags(vdom, 'username').forEach(node => {
                node.html = value.username;
            });

            this.vdom = vdom;
        }
    }

    /**
     *
     * @param {Object} data
     */
    onFollowButtonClick(data) {
        let me = this;

        me.getController().followUser(me.author.username, !me.author.following, profile => {
            me.author = profile;
        }, me);
    }
}

Neo.applyClassConfig(Component);

export {Component as default};