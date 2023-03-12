import transformer from '../components/transformer.js';
import parsers from '../components/parsers.js';
import emitter from '../components/emitter.js';
import csvMaker from '../components/csv.js';
import u from 'ak-tools';
import { Storage } from "@google-cloud/storage";
import dayjs from "dayjs";
import wcmatch from 'wildcard-match';
import { Readable } from 'stream';


export default async function gcs(config, outStream) {
	const { path, format, ...storageAuth } = config.storageAuth();

	// * AUTH
	let storage;
	if (storageAuth.project_id && storageAuth.client_email && storageAuth.private_key) {
		// ! SERVICE ACCT AUTH
		// ? https://cloud.google.com/bigquery/docs/authentication/service-account-file
		storage = new Storage({
			projectId: storageAuth.project_id,
			credentials: {
				client_email: storageAuth.client_email,
				private_key: storageAuth.private_key
			}
		});
		if (config.verbose) u.cLog('\tusing service account credentials');

	}

	else {
		// ! ADC AUTH
		// ? https://cloud.google.com/docs/authentication/provide-credentials-adc#local-dev
		storage = new Storage();
		if (config.verbose) u.cLog('\tattempting to use application default credentials');
	}

	// ? https://googleapis.dev/nodejs/storage/latest/Storage.html

	// * ENUMERATION
	emitter.emit('cloud meta start', config);
	const parsedUri = parseGCSUri(path);
	const isMatch = wcmatch(parsedUri.file);
	const bucket = storage.bucket(parsedUri.bucket);
	const [allFiles] = await bucket.getFiles();
	const targetFiles = allFiles.filter(f => isMatch(f.name)).filter(f => Number(f.metadata.size) > 0);
	const fileNames = targetFiles.map(f => f.name);
	const totalSize = targetFiles.map(f => Number(f.metadata.size)).reduce((t, i) => t + i);
	config.store({ bytes: totalSize, files: fileNames });
	emitter.emit('cloud meta end', config);

	// * VALIDATION
	if (!targetFiles.length) {
		throw new Error(`no files found matching:\n${path}... did you mean\n${path}*`);
	}

	// * TRANSFORMS
	config.eventTimeTransform = (time) => {
		if (isNaN(Number(time))) {
			return dayjs(time).valueOf();
		}
		else {
			return Number(time);
		}
	};
	config.timeTransform = (time) => { return dayjs(time).format('YYYY-MM-DDTHH:mm:ss'); };
	const mpModel = transformer(config, config.mappings?.additional_time_keys);

	// * DOWNLOAD
	emitter.emit('cloud download start', config);
	const data = [];
	// download each file; parse + transform it
	for (const file of targetFiles) {
		emitter.emit('file download start', config, file.name, file.metadata.size);
		const [blob] = await file.download({ decompress: true });
		emitter.emit('file download end', config, file.name, file.metadata.size);
		data.push(parsers(format, blob).map(mpModel));
	}
	const records = data.flat();
	const stream = new Readable.from(records, { objectMode: true });
	config.store({ rows: records.length });
	emitter.emit('cloud download end', config);

	// * UPLOAD
	return new Promise((resolve, reject) => {
		stream
			.on('data', (record) => {
				outStream.push(record);
			})
			.on('error', reject)
			.on('end', () => {
				outStream.push(null);
				resolve(config);
			});

	});

}


function parseGCSUri(uri) {
	// ? https://www.npmjs.com/package/google-cloud-storage-uri-parser
	const REG_EXP = new RegExp("^gs://([^/]+)/(.+)$");
	const bucket = uri.replace(REG_EXP, "$1");
	const file = uri.replace(REG_EXP, "$2");
	return {
		uri,
		bucket,
		file
	};

}