import * as u from 'ak-tools';
import dayjs from 'dayjs';
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// eslint-disable-next-line no-unused-vars
import * as Types from "../types/types.js";

/*
--------
DEFAULTS
--------
*/

// const defaultMappings = {
// 	event_name_col: "event",
// 	distinct_id_col: "distinct_id",
// 	time_col: "time",
// 	insert_id_col: "insert_id"
// };

/** @type {Types.Options} */
const defaultImportOptions = {
	logFile: `./logs/log-${dayjs().format('YYYY-MM-DDTHH.mm-ss')}.txt`,
	strict: true,
	compress: true,
	verbose: true,
	workers: 10,
	deleteFiles: false


};

const defaultMixpanel = {
	region: "US",
	type: "event"
};

/*
------
CONFIG
------
*/

export default class storageConfig {
	constructor(spec) {
		this.storage = spec.storage?.toLowerCase() || ``;
		this.format = spec.format?.toLowerCase() || 'ndjson';
		this.path = spec.path || ``;
		this.auth = spec.auth || {};

		this.mappings = spec.mappings; //u.objDefault(spec.mappings || {}, defaultMappings);
		this.options = u.objDefault(spec.options || {}, defaultImportOptions);
		this.mixpanel = u.objDefault(spec.mixpanel || {}, defaultMixpanel);
		this.tags = spec.tags || {};

		this.inCount = 0;
		this.outCount = 0;

		this.cloudStore = {};
		this.mpStore = {};
		this.timers = {
			etl: u.timer('etl'),
			meta: u.timer('meta'),
			download: u.timer('download'),
			upload: u.timer('upload'),
			generic: u.timer('generic')
		};

		this.version = this.getVersion();

	}

	getVersion() {
		const { version } = require('../package.json');
		if (version) return version;
		if (process.env.npm_package_version) return process.env.npm_package_version;
		return 'unknown';
	}

	get type() {
		return this.mixpanel.type.toLowerCase();
	}

	get verbose() {
		return this.options.verbose;
	}

	get metaTime() {
		return this.timers.meta;
	}
	get downloadTime() {
		return this.timers.download;
	}
	get uploadTime() {
		return this.timers.upload;
	}
	get etlTime() {
		return this.timers.etl;
	}

	in(pretty = true) {
		return pretty ? u.comma(this.inCount) : this.inCount;
	}

	out(pretty = true) {
		return pretty ? u.comma(this.outCount) : this.outCount;
	}

	got(num = 1) {
		this.inCount += num;
	}

	sent(num) {
		this.outCount += num || 1;
	}

	store(data, where = 'storage') {
		if (where === 'storage') {
			this.cloudStore = u.objDefault(this.cloudStore, data);
		}
		else if (where === 'mp') {
			this.mpStore = u.objDefault(this.mpStore, data);
		}
	}

	summary() {
		return {
			mixpanel: this.mpStore,
			[this.storage]: this.cloudStore,
			time: {
				job: this.etlTime.report(false),
				enumeration: this.metaTime.report(false),
				download: this.downloadTime.report(false),
				upload: this.uploadTime.report(false)
			}
		};
	}

	mpAuth() {
		const mp = this.mixpanel;
		return {
			acct: mp.service_account,
			pass: mp.service_secret,
			project: mp.project_id,
			token: mp.token,
			secret: mp.api_secret,
			lookupTableId: mp.lookupTableId,
			groupKey: mp.groupKey
		};

	}

	/** @returns {Types.ImportOptions} */
	mpOpts() {
		const mp = this.mixpanel;
		const opt = this.options;

		return {
			recordType: mp.type,
			region: mp.region,
			streamFormat: 'jsonl',
			compress: opt.compress,
			strict: opt.strict,
			logs: false,
			fixData: false,
			verbose: false,
			workers: opt.workers,
			forceStream: true,
			recordsPerBatch: mp.type === 'group' ? 200 : 2000,
			abridged: opt.abridged

		};
	}

	storageConfig() {
		if (this.storage === 'gcs') {
			return {
				//always required
				path: this.path,
				format: this.format,
				deleteFiles: this.options.deleteFiles || false,

				//required w/out ADV
				project_id: this.auth.project_id,
				private_key: this.auth.private_key,
				client_email: this.auth.client_email,
				//opt				
				type: this.auth?.type,
				private_key_id: this.auth?.private_key_id,
				client_id: this.auth?.client_id,
				client_x509_cert_url: this.auth?.client_x509_cert_url,
				auth_uri: this.auth?.auth_uri,
				token_uri: this.auth?.token_uri,
				auth_provider_x509_cert_url: this.auth?.auth_provider_x509_cert_url,


			};
		}

		else {
			return {
				path: this.path,
				...this.auth
			};
		}
	}

	//todo improve validation
	validate() {
		// lookup tables must have an id
		if (this.type === 'table' && !this.mixpanel.lookupTableId) throw 'missing lookup table id';

		// users + groups need a token
		if (this.type === 'user' && !this.mixpanel.token) throw 'missing project token';
		if (this.type === 'group' && !this.mixpanel.token) throw 'missing project token';

		//groups need a group key
		if (this.type === 'group' && !this.mixpanel.groupKey) throw 'missing group key';

		//events + lookups need an API secret or service acct
		if ((this.type === 'event' || this.type === 'table') && (!this.mixpanel.api_secret && !this.mixpanel.service_account)) throw 'missing API secret or service account';
		return true;
	}

}