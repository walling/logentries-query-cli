#!/usr/bin/env node
'use strict';

const args      = require('yargs').argv;
const chalk     = require('chalk');
const path      = require('path');
const os        = require('os');
const pkg       = require('./package.json');
const castArray = require('cast-array');

const configFile = path.join(os.homedir(), '.'+pkg.name, 'config.json');
let config;

// Load user config. If failing, print info how to set it up.
try {
    config = require(configFile) || {};
} catch (error) {
    if (error && error.code === 'MODULE_NOT_FOUND') {
        console.error('\nConfig file not found: %s\n', configFile);
    } else {
        console.error('\nFailed to load config file: %s\n\n%s\n', configFile, error);
    }
    console.error('Please read documentation for initial setup:');
    console.error('https://github.com/walling/logentries-query-cli#initial-setup\n');
    process.exit(1);
}

let logs = {};

// Load all logs and their aliases from config.
let configAccounts = config.accounts || {};
Object.keys(configAccounts).forEach(account => {
    let configLogsets = configAccounts[account] || {};
    Object.keys(configLogsets).forEach(logset => {
        let configLogs = configLogsets[logset] || {};
        Object.keys(configLogs).forEach(log => {
            let alias = configLogs[log];

            // If falsy value, we skip this log. Can be used to disable a log.
            if (!alias) { return; }

            // If true, we just store under its own name. Otherwise we use alias.
            if (alias === true) {
                alias = log;
            } else {
                alias = ''+alias;
            }

            // If alias is already used, display a warning.
            if (logs[alias]) {
                console.warn('Warning: Duplicate alias for %s/%s' +
                    ', already pointing to %s/%s: %s',
                    logset, log, logs[alias].logset, logs[alias].log, alias);
                return;
            }

            // Store log settings under alias.
            logs[alias] = {
                alias   : alias,
                account : account,
                logset  : logset,
                log     : log
            };
        });
    });
});

let logList = Object.keys(logs);
if (logList.length === 0) {
    console.error('\nNo logs defined: %s\n', configFile);
    console.error('You must define as least one log to use this tool.\n');
    console.error('Please read documentation for initial setup:');
    console.error('https://github.com/walling/logentries-query-cli#initial-setup\n');
    process.exit(1);
}

// Parse `--log` arguments. If none given and only one log is defined in config,
// we use that as default.
let argsLog = [];
if ('log' in args) {
    argsLog = castArray(args.log).map(alias => ''+alias);
} else {
    if (logList.length === 1) {
        argsLog = [ logList[0] ];
    }
}

// Go through list of logs. If any of them are unknown, we display an error.
let argsLogNotFound = argsLog.filter(alias => !logs[alias]);
if (argsLogNotFound.length > 0) {
    console.error('Unknown log alias%s: %s',
        argsLogNotFound.length > 1 ? 'es' : '',
        argsLogNotFound.map(alias => alias || '(empty)').join(', '));
    process.exit(1);
}

// If no logs are selected, we show a list of all logs in config.
if (argsLog.length === 0) {
    console.log('\nLogs:\n\n%s\n',
        Object.keys(logs)
            .map(alias => ' - ' + alias + ' ' +
                chalk.gray(logs[alias].logset+'/'+logs[alias].log))
            .join('\n'));
    process.exit(0);
}

// Set up log format. If `--format` is given, it takes precedence. Otherwise we
// just log the message. If `--show-time` is given, we also show the time of the
// log record. If `--log-name` is given or for multiple logs (except for
// `--no-log-name`), we also output the alias of the log.
let format = args.format || (args.showTime ? '%t %m' : '%m');
if (    (args.logName === true && !/^%l/i.test(format)) ||
        (args.logName !== false && argsLog.length > 1 && !/%l/i.test(format))) {
    format = '%l: '+format;
}

// If `--utc` is given, we setup UTC mode.
if (args.utc) {
    process.env.TZ = 'UTC';
}

// Load extra modules here. For performance reasons we load them this late,
// because they are not needed for the above code.
const moment   = require('moment');
const leq      = require('logentries-query-stream');
const duration = require('parse-duration');

// Setup query to run.
let query = {};

// If any filters are given (all the remaining arguments), we join them together
// and attach to the query.
const filter = args._.join(' ');
if (filter) {
    query.filter = filter;
}

// If `--time` is given, we parse as a duration. Default is to calculate start
// and end, so that we search back in time (duration) until now.
const time = args.time && duration(''+args.time);
if (time) {
    let now = Date.now();
    query.start = now - time;
    query.end   = now + 10*60*1000; // 10 min added to be sure to catch up
}

// If `--start` is given, we put as a start time in the query. In this case the
// `--time` argument defines the length of the duration to search.
if (args.start) {
    query.start = moment(args.start).valueOf();
    if (time && !args.end) {
        query.end = query.start + time;
    }
}

// If `--end` is given, we put as an end time in the query. In this case the
// `--time` argument defines the length of the duration to search.
if (args.end) {
    query.end = moment(args.end).valueOf();
    if (time && !args.start) {
        query.start = query.end - time;
    }
}

// If `--limit` is given, we add to the query. This defines the maximum number
// of records to return for each log.
if (args.limit) {
    query.limit = args.limit | 0;
}

// We compile the format string to a JavaScript function for optimized
// performance. This means that we don't have to run color manipulation through
// chalk all the time, just this once. Also the code is potentially optimized
// by V8 engine, when streaming many records.
const loggerCode = JSON.stringify(format.replace(/%[lLmt]/g, specifier => {
    return  specifier === '%l' ? chalk.yellow('<#js# settings.alias #js#>') :
            specifier === '%L' ? chalk.yellow('<#js# settings.log #js#>') :
            specifier === '%S' ? chalk.yellow('<#js# settings.logset #js#>') :
            specifier === '%A' ? chalk.yellow('<#js# settings.account #js#>') :
            specifier === '%m' ? '<#js# log.m #js#>' :
            specifier === '%t' ? chalk.cyan('<#js# moment(log.t).format() #js#>') :
            specifier;
})).replace(/<#js# (.+?) #js#>/g,
    (match, code) => `" + ${JSON.parse('"'+code+'"')} + "`);
// Here we compile the logger code to an actual JavaScript function and bind it
// on the required modules.
/*jshint -W054*/
const logger = new Function('moment',
`return function logger(settings, log) {
    console.log(${loggerCode});
}`)(moment);
/*jshint +W054*/

// Store flag if any errors occurred. On exit we change exit code in this case.
let queryErrors = false;
process.on('exit', code => {
    if (!code && queryErrors) {
        process.exit(1);
    }
});

// For each log, we run the query and attach the logger to output results.
argsLog
    .map(alias => logs[alias])
    .forEach(settings => {
        // Run the query.
        leq(settings)(query)
            // Attach error handler. Just logging the error for now.
            .on('error', error => {
                console.error(chalk.yellow(settings.alias) + ': ' +
                    chalk.red('Failed to return more logs: ' + error));
                queryErrors = true;
            })
            // Attach log record handler. Output log record in specified format.
            .on('data', logger.bind(null, settings));
    });
