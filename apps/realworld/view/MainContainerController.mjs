import ArticleApi          from '../api/Article.mjs';
import ComponentController from '../../../src/controller/Component.mjs';
import FavoriteApi         from '../api/Favorite.mjs';
import {LOCAL_STORAGE_KEY} from '../api/config.mjs';
import ProfileApi          from '../api/Profile.mjs';
import TagApi              from '../api/Tag.mjs';
import UserApi             from '../api/User.mjs';

/**
 * @class RealWorld.view.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    /**
     * True automatically applies the core.Observable mixin
     * @member {Boolean} observable=false
     * @static
     */
    static observable = true

    static config = {
        /**
         * @member {String} className='RealWorld.view.MainContainerController'
         * @protected
         */
        className: 'RealWorld.view.MainContainerController',
        /**
         * @member {RealWorld.view.article.Component|null} articleComponent=null
         * @protected
         */
        articleComponent: null,
        /**
         * @member {Number} articlesOffset_=0
         */
        articlesOffset_: 0,
        /**
         * @member {RealWorld.view.article.CreateComponent|null} createComponent=null
         * @protected
         */
        createComponent: null,
        /**
         * Stores the current user data after logging in
         * @member {Object|null} currentUser_=null
         * @protected
         */
        currentUser_: null,
        /**
         * @member {String|null} hashString=null
         */
        hashString: null,
        /**
         * @member {RealWorld.view.HomeComponent|null} homeComponent=null
         * @protected
         */
        homeComponent: null,
        /**
         * @member {RealWorld.view.user.ProfileComponent|null} profileComponent=null
         * @protected
         */
        profileComponent: null,
        /**
         * @member {RealWorld.view.user.SettingsComponent|null} settingsComponent=null
         * @protected
         */
        settingsComponent: null,
        /**
         * @member {RealWorld.view.user.SignUpComponent|null} signUpComponent=null
         * @protected
         */
        signUpComponent: null
    }

    /**
     * Triggered after the articlesOffset config got changed
     * @param {Object} value
     * @param {Object} oldValue
     * @protected
     */
    afterSetArticlesOffset(value, oldValue) {
        // ignore the initial config setter call
        if (Neo.isNumber(oldValue)) {
            this.getArticles();
        }
    }

    /**
     * Triggered after the currentUser config got changed
     * @param {Object} value
     * @param {Object} oldValue
     * @protected
     */
    afterSetCurrentUser(value, oldValue) {
        if (typeof oldValue === 'object') {
            let me = this;

            me.getReference('header').set({
                loggedIn : !!value,
                userImage: value ? value.image    : null,
                userName : value ? value.username : null
            }).then(() => {
                // todo: test to ensure the initial markup is rendered
                me.timeout(200).then(() => {
                    me.fire('afterSetCurrentUser', value)
                })
            })
        }
    }

    /**
     * @param {String} slug
     */
    deleteArticle(slug) {
        ArticleApi.delete({slug: slug}).then(data => {
            Neo.Main.setRoute({
                value: '/'
            });
        });
    }

    /**
     * @param {Number} id
     * @returns {Promise<any>}
     */
    deleteComment(id) {
        let me   = this,
            slug = me.hashString.split('/').pop();

        return ArticleApi.deleteComment(slug, id).then(data => {
            me.getComments(slug);
        });
    }

    /**
     * @param {String} slug
     * @param {Boolean} favorited
     */
    favoriteArticle(slug, favorited) {
        return FavoriteApi[favorited ? 'add' : 'remove'](slug);
    }

    /**
     * @param {String} slug
     * @param {Boolean} follow
     */
    followUser(slug, follow) {
        return ProfileApi[follow ? 'follow' : 'unfollow'](slug);
    }

    /**
     * Article details: get an article providing a user slug
     * @param {String} slug
     * @returns {Promise<any>}
     */
    getArticle(slug) {
        return ArticleApi.get({
            slug
        });
    }

    /**
     * @param {Object} [params={}]
     * @param {Object} [opts={}]
     * @returns {Promise<any>}
     */
    getArticles(params={}, opts={}) {
        return ArticleApi.get({
            params: {
                limit : 10,
                offset: this.articlesOffset,
                ...params
            },
            ...opts
        });
    }

    /**
     * @param {String} slug
     */
    getComments(slug) {
        ArticleApi.getComments(slug).then(data => {
            this.articleComponent.comments = data.json.comments;
        });
    }

    /**
     * @param {String} token
     */
    getCurrentUser(token) {
        if (token) {
            UserApi.get({
                resource: '/user' // edge case, user instead of users
            }).then(data => {
                this.currentUser = data.json.user;
            });
        }
    }

    /**
     * @param {String} slug
     */
    getProfile(slug) {
        let me = this;

        ProfileApi.get({
            slug
        }).then(data => {
            me.profileComponent.updateContent({
                ...data.json.profile,
                myProfile: data.json.profile.username === (me.currentUser?.username)
            });
        });
    }

    /**
     *
     */
    getTags() {
        TagApi.get().then(data => {
            this.homeComponent.tagList.tags = data.json.tags;
        });
    }

    /**
     * @param {Object} userData
     */
    login(userData) {
        this.currentUser = userData;

        Neo.main.addon.LocalStorage.createLocalStorageItem({
            key  : LOCAL_STORAGE_KEY,
            value: userData.token
        }).then(() => {
            // wait until the header vdom-update is done to avoid showing sign up & sign in twice
            this.timeout(50).then(() => {
                Neo.Main.setRoute({
                    value: '/'
                })
            })
        })
    }

    /**
     *
     */
    logout() {
        this.currentUser = null;

        Neo.main.addon.LocalStorage.destroyLocalStorageItem({
            key: LOCAL_STORAGE_KEY
        }).then(() => {
            // wait until the header vdom-update is done to avoid showing sign up & sign in twice
            this.timeout(50).then(() => {
                Neo.Main.setRoute({
                    value: '/'
                })
            })
        })
    }

    /**
     *
     */
    onComponentConstructed() {
        super.onComponentConstructed();

        // default route => home
        if (!Neo.config.hash) {
            this.onHashChange({
                appNames  : ['RealWorld'],
                hash      : {'/': ''},
                hashString: '/'
            }, null);
        }
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        UserApi.on('ready', this.getCurrentUser, this);
    }

    /**
     * @param {Object} value
     * @param {Object} oldValue
     */
    async onHashChange(value, oldValue) {
        let me         = this,
            component  = me.component,
            hash       = value.hash,
            hashString = value.hashString,
            mode, newView, opts, slug;

        if (!component.isConstructed) { // the initial hash change gets triggered before the vnode got back from the vdom worker (using autoMount)
            component.on('constructed', () => {
                me.onHashChange(value, oldValue);
            });
        } else {
            me.hashString = hashString;

            // adjust the active header link
            component.items[0].activeItem = Object.keys(hash)[0];

                 if (hashString === '/')               {opts = ['homeComponent',     () => import('./HomeComponent.mjs'),           'home']}
            else if (hashString.includes('/article/')) {opts = ['articleComponent',  () => import('./article/Component.mjs'),       'article']}
            else if (hashString.includes('/editor'))   {opts = ['createComponent',   () => import('./article/CreateComponent.mjs'), 'editor']}
            else if (hashString.includes('/profile/')) {opts = ['profileComponent',  () => import('./user/ProfileComponent.mjs'),   'profile']}
            else if (hash.hasOwnProperty('/login'))    {opts = ['signUpComponent',   () => import('./user/SignUpComponent.mjs'),    'signup']; mode = 'signin';}
            else if (hash.hasOwnProperty('/register')) {opts = ['signUpComponent',   () => import('./user/SignUpComponent.mjs'),    'signup']; mode = 'signup';}
            else if (hash.hasOwnProperty('/settings')) {opts = ['settingsComponent', () => import('./user/SettingsComponent.mjs'),  'settings']}

            if (opts) {
                newView = await me.promiseView(...opts);

                if (mode) {
                    newView.mode = mode;
                }
            }

            if (!(oldValue && oldValue.hash && (
                oldValue.hash.hasOwnProperty('/login')    && hash.hasOwnProperty('/register') ||
                oldValue.hash.hasOwnProperty('/register') && hash.hasOwnProperty('/login')))
            ) {
                if (component.items.length > 2) {
                    component.removeAt(1, false, true);
                }

                if (newView) {
                    component.insert(1, newView);
                }
            }

            switch (newView.reference) {
                case 'article':
                    slug = hashString.split('/').pop();

                    me.getArticle(slug).then(data => {
                        let article = data.json.article,
                            body    = article.body;

                        delete article.body;

                        me.articleComponent.set(article).then(() => {
                            me.articleComponent.body = body;
                        });
                    });

                    me.getComments(slug);
                    break;
                case 'editor':
                    slug = hashString.split('/').pop();
                    if (slug !== 'editor') {
                        me.getArticle(slug).then(data => {
                            const article = data.json.article;

                            me.createComponent.set({
                                body       : article.body,
                                description: article.description,
                                slug       : article.slug,
                                tagList    : article.tagList,
                                title      : article.title
                            });
                        });
                    } else {
                        me.createComponent.resetForm();
                    }
                    break;
                case 'home':
                    me.homeComponent.loggedIn = !!me.currentUser;
                    me.homeComponent.getArticles();
                    me.getTags();
                    break;
                case 'profile':
                    me.getProfile(hashString.split('/').pop()); // pass the slug
                    break;
                case 'settings':
                    if (me.currentUser) {
                        me.timeout(50).then(() => { // added a short delay to not interfere with the mainContainer update
                            me.settingsComponent.onCurrentUserChange(me.currentUser)
                        })
                    }
                    break
                case 'signup':
                    newView.errors = [];
                    break;
            }
        }
    }

    /**
     * @param {Object} [opts)
     * @returns {Promise<any>}
     */
    postComment(opts={}) {
        let me   = this,
            slug = me.hashString.split('/').pop();

        return ArticleApi.postComment(slug, opts).then(data => {
            me.getComments(slug);
        });
    }

    /**
     * @param {String} key
     * @param {Function} module
     * @param {String} reference
     * @returns {Neo.component.Base} The matching view instance
     */
    async promiseView(key, module, reference) {
        let me = this;

        if (!me[key]) {
            module = await module();

            me[key] = Neo.create({
                module  : module.default,
                parentId: me.component.id,
                reference
            });
        }

        return me[key];
    }

    /**
     * @param {Object} opts
     * @returns {Promise<any>}
     */
    saveUser(opts) {
        return UserApi.post(opts);
    }

    /**
     * @param {Object} [opts)
     * @returns {Promise<any>}
     */
    updateSettings(opts={}) {
        return UserApi.put({
            ...opts,
            resource: '/user' // edge case, user instead of users
        }).then(data => {
            if (!data.json.errors) {
                this.currentUser = data.json.user;
            }

            return data;
        });
    }
}

export default Neo.setupClass(MainContainerController);
