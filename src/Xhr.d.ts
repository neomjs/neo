// Xhr.d.ts

declare module 'Neo' {
    /**
     * @class Neo.data.connection.Xhr
     */
    class XhrConnection {
        // Define the structure and types of XhrConnection here
    }

    /**
     * @class Neo.Xhr
     * @extends Neo.data.connection.Xhr
     * @singleton
     */
    class Xhr extends XhrConnection {
        static config: {
            /**
             * @member {String} className='Neo.Xhr'
             * @protected
             */
            className: string;
            /**
             * @member {String} ntype='xhr'
             * @protected
             */
            ntype: string;
            /**
             * @member {Object} remote={app:['promiseRequest','promiseJson']}
             * @protected
             */
            remote: {
                app: string[];
            };
            /**
             * @member {Boolean} singleton=true
             * @protected
             */
            singleton: boolean;
        };
    }

    export default Xhr;
}