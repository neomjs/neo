import aiConfig       from './config.mjs';
import {createLogger} from '../shared/logger.mjs';

export default createLogger(aiConfig, {
    filePrefix    : 'mc-server',
    fileSink      : true,
    flush         : true,
    stderrMode    : 'debug',
    timestampStyle: 'plain'
});
