#! /usr/bin/env node


/*
----
DWH MIXPANEL
by AK
purpose: stream events/users/groups/tables into mixpanel... from the warehouse!
----
*/

/*
-----------
MIDDLEWARE
these are the main 'connectors'
for all the sources
-----------
*/

import createStream from "./middleware/mixpanel.js";
import gcs from './middleware/gcs.js';

/*
----
DEPS
----
*/

import esMain from 'es-main';
import cli from './components/cli.js';
import emitter from './components/emitter.js';
import Config from "./components/config.js";
import env from './components/env.js';
import u from 'ak-tools';

import mp from 'mixpanel-import';
import { pEvent } from 'p-event';
import { resolve } from 'path';
import _ from "lodash";

// eslint-disable-next-line no-unused-vars
import * as Types from "./types/types.js";
import c from 'ansi-colors';

/*
--------
PIPELINE
--------
*/

/**
 * stream a SQL query from your data warehouse into mixpanel!
 * @example
 * const results = await dwhMixpanel(params)
 * console.log(results.mixpanel) // { duration: 3461, success: 420, responses: [], errors: [] }
 * @param {Types.Params} params your streaming configuration
 * @returns {Promise<Types.Summary>} summary of the job containing metadata about time/throughput/responses
 */
async function main(params) {
	// * TRACKING
	const track = u.tracker('storage-mixpanel');
	const runId = u.uid();
	track('start', { runId });

	// * ENV VARS
	const envVars = env();

	// * CONFIG
	const config = new Config(
		_.merge(
			u.clone(params), //params take precedence over env
			u.clone(envVars)
		)
	);

	if (config.verbose) u.cLog(c.red('\nSTART!'));

	const { type, version, storage } = config;
	const props = { runId, type, version, storage };
	try {
		config.validate();
		props.type = config.type;
		props.storage = config.storage;
		props.version = config.version;
		track('valid', props);
	}
	catch (e) {
		track('invalid config', { ...props, reason: e });
		console.error(`configuration is invalid! reason:\n\n\t${e}\n\nquitting...\n\n`);
		process.exit(0);
	}

	// don't allow strict mode imports if no insert_id it supplied
	if (config.type === 'event' && config.options.strict && !config.mappings.insert_id_col) {
		if (config.verbose) u.cLog('\tstrict mode imports are not possible without $insert_id; turning strict mode off...');
		config.options.strict = false;
		delete config.mappings.insert_id_col;
	}

	config.etlTime.start();


	//* MIXPANEL STREAM
	const mpStream = createStream(config);

	//* STORAGE STREAM
	let cloudStorage;
	try {
		switch (config.storage) {			
			case 'gcs':
				cloudStorage = await gcs(config, mpStream);
				break;
			default:
				if (config.verbose) u.cLog(`i do not know how to access ${config.storage}... sorry`);
				mpStream.destroy();
				track('unsupported storage', props);
				throw new Error('unsupported storage', { cause: config.storage, config });
		}
	}

	catch (e) {
		track('storage error', { ...props, msg: e.message });
		if (config.verbose) {
			console.log(c.redBright.bold(`\n${config.storage.toUpperCase()} ERROR:`));
			console.log(c.redBright.bold(e.message));
		}
		else {
			u.cLog(e, `${config.storage} error: ${e.message}`, `CRITICAL`);
		}
		mpStream.destroy();
		throw e;
	}

	// ? SPECIAL CASE: lookup tables cannot be streamed as batches
	if (config.type === 'table') {
		mpStream.destroy();
		emitter.emit('mp upload start', config);
		const tableImport = await mp(config.mpAuth(), cloudStorage, { ...config.mpOpts(), logs: false });
		config.store(tableImport, 'mp');
		emitter.emit('mp upload end', config);
	}

	else {
		// * WAIT
		try {
			await pEvent(emitter, 'mp upload end');
			mpStream.destroy();
		} catch (e) {
			u.cLog(e, c.red('UNKNOWN FAILURE'), 'CRITICAL');
			throw e;
		}
	}


	// * LOGS + CLEANUP
	const result = config.summary();
	if (config.options.logFile) {
		try {
			const fileName = resolve(config.options.logFile);
			const logFile = await u.touch(fileName, result, true, false, true);
			if (config.verbose) {
				u.cLog(c.gray(`logs written to ${logFile}\n\n`));
			}
		}
		catch (e) {
			if (config.verbose) {
				u.cLog(c.red('failed to write logs'));
			}

		}
	}
	track('end', props);
	return result;
}

/*
---------
LISTENERS
---------
*/

emitter.once('cloud meta start', (config) => {
	config.metaTime.start();
	if (config.verbose) u.cLog(c.cyan(`\nenumerating ${config.storage}`));

});

emitter.once('cloud meta end', (config) => {
	config.metaTime.end(false);
	if (config.verbose) {
		u.cLog(c.cyan(`${config.storage} enumeration complete`));
		u.cLog(c.cyan(`\t${config.storage} took ${config.metaTime.report(false).human}\n`));
	}
});

emitter.once('cloud download start', (config) => {
	config.downloadTime.start();
	if (config.verbose) {
		u.cLog(c.magenta(`\ndownload start! (${config.cloudStore.bytes > 0 ? u.bytesHuman(config.cloudStore.bytes) : "unknown number of bytes"})\n`));
		config.progress({ total: config.cloudStore.bytes, startValue: 0 });
	}
});

emitter.once('cloud download end', (config) => {
	config.downloadTime.end(false);
	if (config.verbose) {
		//noop
	}
});

emitter.once('mp upload start', (config) => {
	config.uploadTime.start();
	if (config.verbose) {
		config.progress({ total: config.cloudStore.bytes, startValue: 0 }, 'mp');
	}
});

emitter.once('mp upload end', (config) => {
	config.uploadTime.end(false);
	config.etlTime.end(false);
	const summary = config.summary();
	const successRate = u.round(summary.mixpanel.success / summary.mixpanel.total * 100, 2);
	const importTime = config.uploadTime.report(false).delta;
	const evPerSec = Math.floor((config.inCount / importTime) * 1000);

	if (config.verbose) {
		config.progress(); //stop progress bars
		// u.cLog(`\nmixpanel import end`);
		// u.cLog(`\tmixpanel took ${config.importTime.report(false).human}\n`);
		u.cLog(c.magenta('\nupload ended!'));
		u.cLog(c.red(`\nCOMPLETE!`));
		u.cLog(c.yellow(`\tprocessed ${u.comma(summary.mixpanel.total)} ${config.type}s in ${summary.time.human}`));
		u.cLog(c.yellow(`\t(${successRate}% success rate; ~${u.comma(evPerSec)} EPS)`));
		u.cLog(`\ncheck out your data!\n` + c.blue.underline(`https://mixpanel.com/project/${config.mpAuth().project}\n`));
	}
});

emitter.on('storage batch', (config, bytes = 1) => {
	if (config.verbose) {
		try {
			config.progress(bytes, 'storage');
		}
		catch (e) {
			//noop
		}
	}
});

emitter.on('mp batch', (config, numImported) => {
	if (config.verbose) {
		try {
			config.progress(numImported, 'mp');
		}
		catch (e) {
			//noop
		}
	}
});

/*
--------
EXPORTS
--------
*/

export default main;

//this fires when the module is run as a standalone script
if (esMain(import.meta)) {
	cli().then(answers => {
		const { params, run } = answers;
		if (run) {
			params.options.verbose = true;
			return main(params);
		}

		else {
			u.cLog('\nnothing left to do\n\no_0\n\n');
			process.exit(0);
		}
	}).then(() => {
		//noop

	}).catch((e) => {
		u.cLog(`\nuh oh! something didn't work...\nthe error message is:\n\n\t${e.message}\n\n`);
		u.cLog(`take a closer look at your config file and try again (it's usually credentials!)\n`);
		u.cLog(`if you continue to be stuck, file an issue:\nhttps://github.com/ak--47/dwh-mixpanel/issues\n\n`);
		process.exit(1);
	}).finally(() => {
		u.cLog('\n\nhave a great day!\n\n');
		process.exit(0);
	});

}
