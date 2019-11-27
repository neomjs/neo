import {default as ArticleComponent}    from './article/Component.mjs';
import {default as ArticleApi}          from '../api/Article.mjs';
import {default as ComponentController} from '../../../src/controller/Component.mjs';
import CreateComponent                  from './article/CreateComponent.mjs';
import {default as FavoriteApi}         from '../api/Favorite.mjs';
import HomeComponent                    from './HomeComponent.mjs';
import {LOCAL_STORAGE_KEY}              from '../api/config.mjs';
import {default as ProfileApi}          from '../api/Profile.mjs';
import ProfileComponent                 from './user/ProfileComponent.mjs';
import SettingsComponent                from './user/SettingsComponent.mjs';
import SignUpComponent                  from './user/SignUpComponent.mjs';
import {default as TagApi}              from '../api/Tag.mjs';
import {default as UserApi}             from '../api/User.mjs';

/**
 * @class RealWorld.views.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld.views.MainContainerController'
         * @private
         */
        className: 'RealWorld.views.MainContainerController',
        /**
         * @member {RealWorld.views.article.Component|null} articleComponent=null
         * @private
         */
        articleComponent: null,
        /**
         * @member {Number} articlesOffset_=0
         */
        articlesOffset_: 0,
        /**
         * @member {RealWorld.views.article.CreateComponent|null} createComponent=null
         * @private
         */
        createComponent: null,
        /**
         * Stores the current user data after logging in
         * @member {Object|null} currentUser_=null
         * @private
         */
        currentUser_: null,
        /**
         * @member {String|null} hashString=null
         */
        hashString: null,
        /**
         * @member {RealWorld.views.HomeComponent|null} homeComponent=null
         * @private
         */
        homeComponent: null,
        /**
         * @member {RealWorld.views.user.ProfileComponent|null} profileComponent=null
         * @private
         */
        profileComponent: null,
        /**
         * @member {RealWorld.views.user.SettingsComponent|null} settingsComponent=null
         * @private
         */
        settingsComponent: null,
        /**
         * @member {RealWorld.views.user.SignUpComponent|null} signUpComponent=null
         * @private
         */
        signUpComponent: null
    }}

    onConstructed() {
        super.onConstructed();

        const me = this;

        UserApi.on('ready', me.getCurrentUser, me);

        // default route => home
        if (!Neo.config.hash) {
            me.onHashChange({'/': ''}, null, '/');
        }
    }

    /**
     * Triggered after the articlesOffset config got changed
     * @param {Object} value
     * @param {Object} oldValue
     * @private
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
     * @private
     */
    afterSetCurrentUser(value, oldValue) {
        if (typeof oldValue === 'object') {
            this.fire('afterSetCurrentUser', value);

            if (value) {
                setTimeout(() => {
                    this.getReference('header').bulkConfigUpdate({
                        loggedIn : true,
                        userImage: value.image,
                        userName : value.username
                    });
                }, 50);
            }
        }
    }

    /**
     *
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
     *
     * @param {Number} id
     * @return {Promise<any>}
     */
    deleteComment(id) {
        let me   = this,
            slug = me.hashString.split('/').pop();

        return ArticleApi.deleteComment(slug, id).then(data => {
            me.getComments(slug);
        });
    }

    /**
     *
     * @param {String} slug
     * @param {Boolean} favorited
     */
    favoriteArticle(slug, favorited) {
        return FavoriteApi[favorited ? 'add' : 'remove'](slug);
    }

    /**
     *
     * @param {String} slug
     * @param {Boolean} follow
     */
    followUser(slug, follow) {
        return ProfileApi[follow ? 'follow' : 'unfollow'](slug);
    }

    /**
     * Article details: get an article providing a user slug
     * @param {String} slug
     */
    getArticle(slug) {
        return ArticleApi.get({
            slug: slug
        });
    }

    /**
     *
     */
    getArticles(opts={}) {
        ArticleApi.get({
            params: {
                limit : 10,
                offset: this.articlesOffset,
                ...opts
            }
        }).then(data => {
            this.homeComponent.bulkConfigUpdate({
                articlePreviews: data.json.articles,
                countArticles  : data.json.articlesCount
            });
        });
    }

    /**
     *
     * @param {String} slug
     */
    getComments(slug) {
        ArticleApi.getComments(slug).then(data => {
            this.articleComponent.comments = data.json.comments;
        });
    }

    /**
     *
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
     *
     * @param {String} slug
     */
    getProfile(slug) {
        const me = this;

        ProfileApi.get({
            slug: slug
        }).then(data => {
            me.profileComponent.update({
                ...data.json.profile,
                myProfile: data.json.profile.username === (me.currentUser && me.currentUser.username)
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
     *
     * @param {String} key
     * @param {Neo.component.Base} module
     * @param {String} reference
     * @returns {Neo.component.Base} The matching view instance
     */
    getView(key, module, reference) {
        const me = this;

        if (!me[key]) {
            me[key] = Neo.create({
                module   : module,
                parentId : me.view.id,
                reference: reference
            });
        }

        return me[key];
    }

    /**
     * @param {Object} userData
     */
    login(userData) {
        this.getReference('header').loggedIn = true;

        Neo.Main.createLocalStorageItem({
            key  : LOCAL_STORAGE_KEY,
            value: userData.token
        }).then(() => {
            // wait until the header vdom-update is done to avoid showing sign up & sign in twice
            setTimeout(() => {
                Neo.Main.setRoute({
                    value: '/'
                });
            }, 50);
        });
    }

    /**
     *
     */
    logout() {
        this.getReference('header').loggedIn = false;
        this.currentUser = null;

        Neo.Main.destroyLocalStorageItem({
            key: LOCAL_STORAGE_KEY
        }).then(() => {
            // wait until the header vdom-update is done to avoid showing sign up & sign in twice
            setTimeout(() => {
                Neo.Main.setRoute({
                    value: '/'
                });
            }, 50);
        });
    }

    /**
     *
     * @param {Object} value
     * @param {Object} oldValue
     * @param {String} hashString
     */
    onHashChange(value, oldValue, hashString) {
        let me    = this,
            view = me.view,
            newView, slug;

        if (!view.mounted) { // the initial hash change gets triggered before the vnode got back from the vdom worker (using autoMount)
            view.on('mounted', () => {
                me.onHashChange(value, oldValue, hashString);
            });
        } else {
            console.log('onHashChange', value, hashString);

            me.hashString = hashString;

            // adjust the active header link
            view.items[0].activeItem = Object.keys(value)[0];

                 if (hashString === '/')                {newView = me.getView('homeComponent',     HomeComponent,     'home');}
            else if (hashString.includes('/article/'))  {newView = me.getView('articleComponent',  ArticleComponent,  'article');}
            else if (hashString.includes('/editor'))    {newView = me.getView('createComponent',   CreateComponent,   'editor');}
            else if (hashString.includes('/profile/'))  {newView = me.getView('profileComponent',  ProfileComponent,  'profile');}
            else if (value.hasOwnProperty('/login'))    {newView = me.getView('signUpComponent',   SignUpComponent,   'signup'); newView.mode = 'signin';}
            else if (value.hasOwnProperty('/register')) {newView = me.getView('signUpComponent',   SignUpComponent,   'signup'); newView.mode = 'signup';}
            else if (value.hasOwnProperty('/settings')) {newView = me.getView('settingsComponent', SettingsComponent, 'settings');}

            if (!(oldValue && (
                oldValue.hasOwnProperty('/login')    && value.hasOwnProperty('/register') ||
                oldValue.hasOwnProperty('/register') && value.hasOwnProperty('/login')))
            ) {
                if (view.items.length > 2) {
                    view.removeAt(1, false, true);
                }

                if (newView) {
                    view.insert(1, newView);
                }
            }

            switch (newView.reference) {
                case 'article':
                    slug = hashString.split('/').pop();
                    me.getArticle(slug).then(data => {
                        me.articleComponent.bulkConfigUpdate(data.json.article);
                    });

                    me.getComments(slug);
                    break;
                case 'editor':
                    slug = hashString.split('/').pop();
                    if (slug !== 'editor') {
                        me.getArticle(slug).then(data => {
                            const article = data.json.article;

                            me.createComponent.bulkConfigUpdate({
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
                    me.getArticles();
                    me.getTags();
                    break;
                case 'profile':
                    me.getProfile(hashString.split('/').pop()); // pass the slug
                    break;
                case 'settings':
                    if (me.currentUser) {
                        setTimeout(() => { // added a short delay to not interfere with the mainContainer update
                            me.settingsComponent.onCurrentUserChange(me.currentUser);
                        }, 50);
                    }
                    break;
                case 'signup':
                    newView.errors = [];
                    break;
            }
        }
    }

    /**
     *
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
     *
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

Neo.applyClassConfig(MainContainerController);

export {MainContainerController as default};