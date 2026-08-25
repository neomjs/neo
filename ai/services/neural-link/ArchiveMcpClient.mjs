import Client from '../../mcp/client/Client.mjs';

/**
 * @class Neo.ai.services.neural-link.ArchiveMcpClient
 * @extends Neo.ai.mcp.client.Client
 * @summary An MCP client whose CONNECT FAILURE is readable on the instance instead of escaping to the
 * process — the one thing `Client` does not offer a caller for whom connecting is optional.
 *
 * **Why the framework cannot report this.** `Neo.create` builds its ready promise with a resolver only and
 * then awaits `initAsync` inside a detached `Promise.resolve().then(...)` chain (`src/core/Base.mjs`).
 * There is no reject path, so everything `Client.initAsync` throws — a refused connection included —
 * rejects a promise nobody holds, and Node's default policy kills the process. A possession session must
 * not die because a telemetry archive could not reach Memory Core.
 *
 * **Why not a process listener.** Claiming that rejection with `process.on('unhandledRejection')` was the
 * previous shape, and it could only GUESS at ownership: every rejection arriving while this client was not
 * yet connected was treated as this client's, so an unrelated subsystem's fatal error was silently
 * converted into an archive refusal. Catching the throw where it is RAISED needs no ownership guess,
 * because nothing reaches the process to be claimed.
 *
 * **Why a whole class for one property.** The alternative is monkey-patching `initAsync` on an instance
 * between `Neo.create` returning and the detached microtask running — correct only for as long as that
 * scheduling detail holds. A subclass states the same intent as a contract.
 */
class ArchiveMcpClient extends Client {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.neural-link.ArchiveMcpClient'
         * @protected
         */
        className: 'Neo.ai.services.neural-link.ArchiveMcpClient',
        /**
         * The error initialization raised, or `null` while the connect is in flight or once it succeeded.
         *
         * Read rather than caught: `ready()` settling says the attempt FINISHED, not that it worked.
         * @member {Error|null} initError=null
         */
        initError: null
    }

    /**
     * @summary Initializes, keeping any failure on the instance rather than in the detached chain above.
     * @returns {Promise<void>} Always fulfils; `initError` carries the outcome.
     */
    async initAsync() {
        try {
            await super.initAsync()
        } catch (error) {
            this.initError = error instanceof Error ? error : new Error(String(error))
        }
    }
}

export default Neo.setupClass(ArchiveMcpClient);
