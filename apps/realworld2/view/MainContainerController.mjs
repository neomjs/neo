import ArticleApi              from '../api/Article.mjs';
import ArticleDetailsContainer from './article/DetailsContainer.mjs';
import ComponentController     from '../../../src/controller/Component.mjs';
import FavoriteApi             from '../api/Favorite.mjs';
import FormContainer           from './article/FormContainer.mjs';
import GalleryContainer        from './article/GalleryContainer.mjs';
import HelixContainer          from './article/HelixContainer.mjs';
import HomeContainer           from './HomeContainer.mjs';
import LoginFormContainer      from './user/LoginFormContainer.mjs';
import {LOCAL_STORAGE_KEY}     from '../api/config.mjs';
import ProfileApi              from '../api/Profile.mjs';
import ProfileContainer        from './user/ProfileContainer.mjs';
import SettingsFormContainer   from './user/SettingsFormContainer.mjs';
import TagApi                  from '../api/Tag.mjs';
import UserApi                 from '../api/User.mjs';

/**
 * @class RealWorld2.view.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static config = {
        /**
         * @member {String} className='RealWorld2.view.MainContainerController'
         * @protected
         */
        className: 'RealWorld2.view.MainContainerController',
        /**
         * Stores the current user data after logging in
         * @member {Object|null} currentUser_=null
         * @protected
         */
        currentUser_: null,
        /**
         * @member {String|null} hashString=null
         */
        hashString: null
    }

    onConstructed() {
        super.onConstructed();

        const me = this;

        UserApi.on('ready', me.getCurrentUser, me);

        // default route => home
        if (!Neo.config.hash) {
            me.onHashChange({
                appNames  : ['RealWorld2'],
                hash      : {'/': ''},
                hashString: '/'
            }, null);
        }
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
            /*this.getReference('header').set({
                loggedIn : !!value,
                userImage: value ? value.image    : null,
                userName : value ? value.username : null
            }).then(() => {
                this.fire('afterSetCurrentUser', value);
            });*/
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
     */
    getArticle(slug) {
        return ArticleApi.get({
            slug: slug
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
                limit : 20,
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
            //this.articleComponent.comments = data.json.comments;
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
                console.log(this.currentUser);
            });
        }
    }

    /**
     * @param {String} slug
     */
    getProfile(slug) {
        let me = this;

        ProfileApi.get({
            slug: slug
        }).then(data => {
            /*me.profileComponent.updateContent({
                ...data.json.profile,
                myProfile: data.json.profile.username === (me.currentUser && me.currentUser.username)
            });*/
        });
    }

    /**
     *
     */
    getTags() {
        TagApi.get().then(data => {
            this.getReference('home').getTagList().tags = data.json.tags;
        });
    }

    /**
     * @param {String} reference
     * @param {Neo.component.Base} module
     * @returns {Neo.component.Base} The matching view instance
     */
    getView(reference, module) {
        let me   = this,
            card = me.getReference(reference);

        if (!card) {
            card = me.getReference('cards').add({
                module,
                reference
            });
        }

        return card;
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
     * @param {Object} value
     * @param {Object} oldValue
     */
    onHashChange(value, oldValue) {
        let me         = this,
            component  = me.component,
            hash       = value.hash,
            hashString = value.hashString,
            cards, newView, slug;

        if (!component.mounted) { // the initial hash change gets triggered before the vnode got back from the vdom worker (using autoMount)
            component.on('mounted', () => {
                me.onHashChange(value, oldValue, hashString);
            });
        } else {
            console.log('onHashChange', value, hashString);

            cards = me.getReference('cards');

            me.hashString = hashString;

            // adjust the active header link
            // view.items[0].activeItem = Object.keys(value)[0];

                 if (hashString === '/')               {newView = me.getView('home',     HomeContainer);}
            else if (hashString.includes('/article/')) {newView = me.getView('article',  ArticleDetailsContainer);}
            else if (hashString === '/editor')         {newView = me.getView('editor',   FormContainer);}
            else if (hashString === '/helix')          {newView = me.getView('helix',    HelixContainer);}
            else if (hashString === '/gallery')        {newView = me.getView('gallery',  GalleryContainer);}
            else if (hashString === '/login')          {newView = me.getView('login',    LoginFormContainer); newView.mode = 'login';}
            else if (hashString.includes('/profile/')) {newView = me.getView('profile',  ProfileContainer);}
            else if (hashString === '/settings')       {newView = me.getView('settings', SettingsFormContainer);}
          /*else if (value.hasOwnProperty('/register')) {newView = me.getView('signUpComponent',   SignUpComponent,   'signup'); newView.mode = 'signup';}

            if (!(oldValue && (
                oldValue.hasOwnProperty('/login')    && value.hasOwnProperty('/register') ||
                oldValue.hasOwnProperty('/register') && value.hasOwnProperty('/login')))
            ) {
                if (component.items.length > 2) {
                    component.removeAt(1, false, true);
                }

                if (newView) {
                    view.insert(1, newView);
                }
            }*/

            // short delay to ensure the new card already got added
            me.timeout(100).then(() => {
                cards.layout.activeIndex = cards.indexOf(newView)
            });

            switch (newView.reference) {
                case 'gallery':
                    newView.getArticles();
                    break;
                case 'helix':
                    newView.getArticles();
                    break;
                case 'home':
                    //me.homeComponent.loggedIn = !!me.currentUser;
                    newView.getArticles();
                    me.getTags();
                    break;
            }
        }
    }

    onProfileButtonClick() {
        Neo.Main.setRoute({
            value: '/profile/' + this.currentUser.username
        });
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
