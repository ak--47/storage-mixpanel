import transformer from '../components/transformer.js';
import parsers from '../components/parsers.js';
import emitter from '../components/emitter.js';
import csvMaker from '../components/csv.js';
import u from 'ak-tools';
import { Storage } from "@google-cloud/storage";
import dayjs from "dayjs";
import wcmatch from 'wildcard-match';



export default async function gcs(config, outStream) {
	const { path, ...storageAuth } = config.storageAuth();

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

	// list files in bucket + calc size
	emitter.emit('cloud meta start', config);
	const parsedUri = parseGCSUri(path);
	const isMatch = wcmatch(parsedUri.file);
	const bucket = storage.bucket(parsedUri.bucket);
	const [allFiles] = await bucket.getFiles();
	const targetFiles = allFiles.filter(f => isMatch(f.name));
	const fileNames = targetFiles.map(f => f.name);
	const totalSize = targetFiles.map(f => Number(f.metadata.size)).reduce((t, i) => t + i);
	config.store({ bytes: totalSize, files: fileNames });
	emitter.emit('cloud meta end', config);

	config.eventTimeTransform = (time) => {
		if (isNaN(Number(time))) {
			return dayjs(time).valueOf();
		}
		else {
			return Number(time);
		}
	};
	config.timeTransform = (time) => { return dayjs(time.value).format('YYYY-MM-DDTHH:mm:ss'); };

	const mpTransform = transformer(config, config.mappings?.additional_time_keys);


	// download each file and transform/stream it

	for (const file of targetFiles) {
		await file
			.createReadStream({ decompress: true })
			.on('data', (blob) => {
				emitter.emit('storage batch', config, blob.length);
			})
			.pipe(parsers(config.format))
			.once('data', () => {
				emitter.emit('cloud download start', config);
			}) //stream is created
			.on('data', (record) => {
				outStream.push(mpTransform(record.value));
			})
			.on('finish', () => {
				emitter.emit('cloud download end', config);
				outStream.push(null);
			});
	}




	// const ex = await files[0].download({ decompress: true });


	// bucket.getFilesStream()
	// 	.on('error', console.error)
	// 	.on('data', async function (file) {
	// 		const [contents, bar] = await file.download()
	// 		debugger;
	// 		// file is a File object.
	// 	})
	// 	.on('end', function () {
	// 		// All files retrieved.
	// 	});


	// const [job, jobMeta] = await storage.createQueryJob(options);
	// const { datasetId, tableId } = jobMeta.configuration.query.destinationTable;

	// return new Promise((resolve, reject) => {
	// 	job.on('complete', async function (metadata) {
	// 		config.store({ job: metadata });
	// 		emitter.emit('dwh query end', config);

	// 		// get temp table's metadata and schema + store it
	// 		const [tableMeta] = await storage.dataset(datasetId).table(tableId).get();
	// 		const { schema, ...tempTable } = tableMeta.metadata;
	// 		config.store({ schema: schema.fields });
	// 		config.store({ table: tempTable });
	// 		config.store({ rows: Number(tempTable.numRows) });

	// 		//model time transforms
	// 		const dateFields = schema.fields
	// 			.filter(f => ['DATETIME', 'DATE', 'TIMESTAMP', 'TIME']
	// 				.includes(f.type))
	// 			.map(f => f.name);

	// 		config.eventTimeTransform = (time) => { return dayjs(time.value).valueOf(); };
	// 		config.timeTransform = (time) => { return dayjs(time.value).format('YYYY-MM-DDTHH:mm:ss'); };
	// 		const mpModel = transformer(config, dateFields);

	// 		// tables cannot be streamed...they are returned as a CSV
	// 		if (config.type === 'table') {
	// 			emitter.emit('dwh query end', config);
	// 			const [rows] = await storage.dataset(datasetId).table(tableId).getRows();
	// 			const transformedRows = rows.map(mpModel);
	// 			const csv = csvMaker(transformedRows);
	// 			resolve(csv);
	// 		}

	// 		// stream results
	// 		// ? https://stackoverflow.com/a/41169200 apparently this is faster?
	// 		emitter.emit('dwh stream start', config);
	// 		job
	// 			.getQueryResultsStream({ highWaterMark: 2000 * config.options.workers, timeoutMs: 0 })
	// 			.on("error", reject)
	// 			.on("data", (row) => {
	// 				outStream.push(mpModel(row));
	// 			})
	// 			.on("end", () => {
	// 				emitter.emit('dwh stream end', config);
	// 				outStream.push(null);
	// 				resolve(config);
	// 			});
	// 	});


	// });

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