import transformer from '../components/transformer.js';
import parsers from '../components/parsers.js';
import emitter from '../components/emitter.js';
import u from 'ak-tools';
import { Storage } from "@google-cloud/storage";
import dayjs from "dayjs";
import wcmatch from 'wildcard-match';
import { Readable } from 'stream';
import { pEvent } from 'p-event';


export default async function gcs(config, outStream) {
	const { path, format, deleteFiles, ...storageAuth } = config.storageConfig();

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
	if (!targetFiles.length) throw new Error(`no files found matching ${path} for format: ${format}`);
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
	let filesFinished = 0;
	// download each file; parse + transform it
	for (const file of targetFiles) {
		emitter.emit('file download start', config, file.name, file.metadata.size);
		const [blob] = await file.download({ decompress: true });
		emitter.emit('file download end', config, file.name, file.metadata.size);
		const parsed = parsers(format, blob, file.name);
		const records = parsed.map(mpModel);
		const stream = new Readable.from(records, { objectMode: true });
		stream
			.once('data', () => {
				emitter.emit('record stream start');
			})
			.on('data', (record) => {
				outStream.push(record);
			})
			.on('error', (e) => {
				throw e;
			})
			.on('end', () => {
				filesFinished++;
				emitter.emit('record stream done', filesFinished);
			});
	}

	// holder yer horses
	await pEvent(emitter, 'record stream done', {
		filter: () => {
			return filesFinished === targetFiles.length;
		},

	});

	if (deleteFiles) {
		const deletedFiles = [];
		for (const file of targetFiles) {
			emitter.emit('file delete start', config, file.name, file.metadata.size);
			const [res] = await file.delete({ ignoreNotFound: true });
			deletedFiles.push({ [file.name]: res?.toJSON()?.headers });
			emitter.emit('file delete end', config, file.name, file.metadata.size);
		}
		config.store({ deletedFiles });
	}
	outStream.push(null);
	return config;
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