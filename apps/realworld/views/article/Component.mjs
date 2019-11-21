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
         * @member {String|null} body_=null
         */
        body_: null,
        /**
         * @member {String[]} cls=['article-page']
         */
        cls: ['article-page'],
        /**
         * @member {String|null} title_=null
         */
        title_: null,
        /**
         * @member {String|null} userName_=null
         */
        userName_: null,
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
                                tag: 'img',
                                src: 'http://i.imgur.com/Qr71crq.jpg'
                            }]
                        }, {
                            cls: ['info'],
                            cn : [{
                                tag : 'a',
                                cls : ['author'],
                                flag: 'userName',
                                href: ''
                            }, {
                                tag : 'span',
                                cls : ['date'],
                                html: 'January 20th'
                            }]
                        }, {
                            tag: 'button',
                            cls: ['btn', 'btn-sm', 'btn-outline-secondary'],
                            cn : [{
                                tag: 'i',
                                cls: ['ion-plus-round']
                            }, {
                                vtype: 'text',
                                html : '&nbsp;'
                            }, {
                                vtype: 'text',
                                html : 'Follow Eric Simons'
                            }, {
                                vtype: 'text',
                                html : '&nbsp;'
                            }, {
                                tag : 'span',
                                cls : ['counter'],
                                html: '(10)'
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
                                html: '(29)'
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
                                tag: 'img',
                                src: 'http://i.imgur.com/Qr71crq.jpg'
                            }]
                        }, {
                            cls: ['info'],
                            cn : [{
                                tag : 'a',
                                cls : ['author'],
                                href: '',
                                html: 'Eric Simons'
                            }, {
                                tag : 'span',
                                cls : ['date'],
                                html: 'January 20th'
                            }]
                        }, {
                            tag: 'button',
                            cls: ['btn', 'btn-sm', 'btn-outline-secondary'],
                            cn : [{
                                tag: 'i',
                                cls: ['ion-plus-round']
                            }, {
                                vtype: 'text',
                                html : '&nbsp;'
                            }, {
                                vtype: 'text',
                                html : 'Follow Eric Simons'
                            }, {
                                vtype: 'text',
                                html : '&nbsp;'
                            }, {
                                tag : 'span',
                                cls : ['counter'],
                                html: '(10)'
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
                                html: '(29)'
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
                                    html: 'Post Comment'
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
     * Triggered after the userName config got changed
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    afterSetUserName(value, oldValue) {
        let vdom = this.vdom;

        VDomUtil.getByFlag(vdom, 'userName').html = value;
        this.vdom = vdom;
    }
}

Neo.applyClassConfig(Component);

export {Component as default};