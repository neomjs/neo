import Base from '../../node_modules/neo.mjs/src/data/interceptor/Base.mjs';

/** @summary Consumer-owned hooks whose returned values and HTTP headers identify their executing worker. */
class Handler extends Base {
    static config = {
        className: 'PipelineInterceptorProbe.Handler',
        mode     : 'shape',
        token    : null
    }

    /** @summary Awaits a microtask before preparing observable request headers. */
    async request(params) {
        await Promise.resolve();
        const headers = {...params.headers};
        headers['x-neo-order'] = [headers['x-neo-order'], this.token].filter(Boolean).join(',');
        headers['x-neo-realm'] = Neo.workerId;
        return {...params, headers}
    }

    /** @summary Makes awaiting the response chain observable without consuming streaming bodies. */
    async response(value) {
        await Promise.resolve();
        if (this.mode === 'uncloneable') throw {message: 'consumer hook refused', callback() {}};
        if (this.mode === 'stream') return;
        return {...value, responseTrace: [...(value.responseTrace || []), this.token], responseRealm: Neo.workerId}
    }

    /** @summary Recovers only when explicitly configured; undefined retains the transport rejection. */
    async responseError(error) {
        await Promise.resolve();
        if (this.mode === 'recover') {
            return {ok: true, data: error.data, recovered: this.token, errorRealm: Neo.workerId}
        }
    }

    /** @summary Shapes ordinary results and streamed row batches after an asynchronous boundary. */
    async postParse(value) {
        await Promise.resolve();
        const shape = record => ({...record, shapeTrace: [...(record.shapeTrace || []), this.token], shapeRealm: Neo.workerId});
        return this.mode === 'stream' ? value.map(shape) : shape(value)
    }
}

export default Neo.setupClass(Handler);
