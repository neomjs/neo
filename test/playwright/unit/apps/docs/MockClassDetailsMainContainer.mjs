import Neo       from '../../../../../src/Neo.mjs';
import Container from '../../../../../src/container/Base.mjs';

/**
 * @summary Shared stand-in for `Docs.view.classdetails.MainContainer` (`ntype: 'classdetails-maincontainer'`)
 * across Docs unit specs so running `test/playwright/unit/apps/docs/` in a single worker registers one deterministic class.
 * @class Test.Unit.Docs.MockClassDetailsMainContainer
 * @extends Neo.container.Base
 */
class MockClassDetailsMainContainer extends Container {
    static config = {
        /**
         * @member {String} className='Test.Unit.Docs.MockClassDetailsMainContainer'
         * @protected
         */
        className: 'Test.Unit.Docs.MockClassDetailsMainContainer',
        /**
         * @member {String} ntype='classdetails-maincontainer'
         * @protected
         */
        ntype: 'classdetails-maincontainer',
        /**
         * @member {Object|null} structureData=null
         */
        structureData: null
    }
}

export default Neo.setupClass(MockClassDetailsMainContainer);
