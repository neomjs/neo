import Component     from '../../../src/controller/Component.mjs';
import {openLegitFs} from 'https://esm.sh/@legit-sdk/core';
import fs            from 'https://esm.sh/memfs';

/**
 * @class Legit.view.ViewportController
 * @extends Neo.controller.Component
 */
class ViewportController extends Component {
    static config = {
        /**
         * @member {String} className='Legit.view.ViewportController'
         * @protected
         */
        className: 'Legit.view.ViewportController'
    }

    /**
     *
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();

        globalThis.legitFs = await openLegitFs({
            storageFs: fs,
            gitRoot: '/',
            serverUrl: 'http://localhost:9999/',
            // publicKey: process.env.NEXT_PUBLIC_LEGIT_PUBLIC_KEY,
        });
    }
}

export default Neo.setupClass(ViewportController);
