import env from '../config/env';
import util from 'util';
type LogLevel = 'log' | 'info' | 'warn' | 'error';

const ENABLE_LOGS = JSON.parse(env?.ENABLE_LOGS.toString() || 'false');

const customLog = (level: LogLevel, ...args: any[]) => {
    if (ENABLE_LOGS === true) {
        console[level](...args);
    }
};

// Shortcut methods
const log = (...args: any[]) => customLog('log', ...args);
const info = (...args: any[]) => customLog('info', ...args);
const warn = (...args: any[]) => customLog('warn', ...args);
const error = (...args: any[]) => customLog('error', ...args);
const deep = (...args: any[]) =>
    customLog(
        'log',
        util.inspect(args, { showHidden: false, depth: null, colors: true })
    );
export const ddl = (...args: any[]) => customLog('log', ...args);

export const dd = {
    log,
    info,
    warn,
    error,
    deep,
};
