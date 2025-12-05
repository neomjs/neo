import aiConfig from './config.mjs';

const createLogMethod = (level, stream = process.stderr) => {
    return (message, ...args) => {
        if (aiConfig.debug || level !== 'debug') {
            const timestamp = new Date().toISOString();
            const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
            stream.write(`${prefix} ${message} ${args.length ? JSON.stringify(args) : ''}\n`);
        }
    };
};

const logger = {
    debug: createLogMethod('debug'),
    info: createLogMethod('info'),
    warn: createLogMethod('warn'),
    error: createLogMethod('error')
};

export default logger;
