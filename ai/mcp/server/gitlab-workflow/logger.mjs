import aiConfig       from './config.mjs';
import {createLogger} from '../shared/logger.mjs';

export default createLogger(aiConfig, {
    defaultLevel: 'warn',
    fileSink    : false,
    stderrMode  : 'threshold'
});
