import Container from '../../../../src/container/Base.mjs';

/**
 * @class RealWorld2.view.user.ProfileContainer
 * @extends Neo.container.Base
 */
class ProfileContainer extends Container {
    static config = {
        /**
         * @member {String} className='RealWorld2.view.user.ProfileContainer'
         * @protected
         */
        className: 'RealWorld2.view.user.ProfileContainer',
        /**
         * @member {Array} items
         */
        items: [{
            ntype: 'component',
            html : 'ProfileContainer'
        }],
        /**
         * @member {Object} style
         */
        style: {
            padding: '20px'
        }
    }
}

Neo.setupClass(ProfileContainer);

export default ProfileContainer;
