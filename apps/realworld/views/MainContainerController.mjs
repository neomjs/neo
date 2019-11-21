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
            this.getReference('header').bulkConfigUpdate({
                loggedIn: true,
                userName: value.username
            });
        }
    }

    /**
     *
     * @param {String} slug
     * @param {Boolean} favorited
     */
    favoriteArticle(slug, favorited) {
        FavoriteApi[favorited ? 'add' : 'remove'](slug);
    }

    /**
     *
     * @param {String} slug
     * @param {Boolean} follow
     */
    followUser(slug, follow) {
        ProfileApi[follow ? 'follow' : 'unfollow'](slug).then(data => {
            this.profileComponent.following = data.json.profile.following;
        });
    }

    /**
     * Article details: get an article providing a user slug
     */
    getArticle(slug) {
        ArticleApi.get({
            slug: slug
        }).then(data => {
            console.log('getArticle', data);
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

    getCurrentUser(token) {
        if (token) {
            ArticleApi.get({
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
        ProfileApi.get({
            slug: slug
        }).then(data => {
            this.profileComponent.update({
                ...data.json.profile,
                myProfile: data.json.profile.username === this.currentUser.username
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
            newView;

        if (!view.mounted) { // the initial hash change gets triggered before the vnode got back from the vdom worker (using autoMount)
            view.on('mounted', () => {
                me.onHashChange(value, oldValue, hashString);
            });
        } else {
            console.log('onHashChange', value, hashString);

            // adjust the active header link
            view.items[0].activeItem = Object.keys(value)[0];

                 if (hashString === '/')                   {newView = me.getView('homeComponent',     HomeComponent,     'home');}
            else if (hashString.includes('/article/'))     {newView = me.getView('articleComponent',  ArticleComponent,  'article');}
            else if (hashString.includes('/profile/'))     {newView = me.getView('profileComponent',  ProfileComponent,  'profile');}
            else if (value.hasOwnProperty('newpost'))      {newView = me.getView('createComponent',   CreateComponent,   'newpost');}
            else if (value.hasOwnProperty('/login'))       {newView = me.getView('signUpComponent',   SignUpComponent,   'signup'); newView.mode = 'signin';}
            else if (value.hasOwnProperty('/register'))    {newView = me.getView('signUpComponent',   SignUpComponent,   'signup'); newView.mode = 'signup';}
            else if (value.hasOwnProperty('usersettings')) {newView = me.getView('settingsComponent', SettingsComponent, 'usersettings');}

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
                    me.getArticle(hashString.split('/').pop()); // pass the slug
                    break;
                case 'home':
                    me.getArticles();
                    me.getTags();
                    break;
                case 'profile':
                    me.getProfile(hashString.split('/').pop()); // pass the slug
                    break;
                case 'signup':
                    newView.errors = [];
                    break;
            }
        }
    }
}

Neo.applyClassConfig(MainContainerController);

export {MainContainerController as default};