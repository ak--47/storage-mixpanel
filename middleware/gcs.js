import transformer from '../components/transformer.js';
import emitter from '../components/emitter.js';
import csvMaker from '../components/csv.js';
import u from 'ak-tools';
import { Storage } from "@google-cloud/storage";
// import { auth } from 'google-auth-library';
import dayjs from "dayjs";


export default async function bigquery(config, outStream) {
	const { location, query, ...dwhAuth } = config.dwhAuth();
	// todo support other auth types: 
	// ? https://cloud.google.com/nodejs/docs/reference/google-auth-library/latest
	// let googAuth;
	// try {
	// 	// eslint-disable-next-line no-unused-vars
	// 	googAuth = auth.fromJSON(dwhAuth);
	// }
	// catch (e) {
	// 	//noop
	// 	// todo use this:
	// 	googAuth = await auth.getApplicationDefault()
	// }

	// * AUTH
	let storage;
	if (dwhAuth.project_id && dwhAuth.client_email && dwhAuth.private_key) {
		// ! SERVICE ACCT AUTH
		// ? https://cloud.google.com/bigquery/docs/authentication/service-account-file
		storage = new Storage({
			projectId: dwhAuth.project_id,
			credentials: {
				client_email: dwhAuth.client_email,
				private_key: dwhAuth.private_key
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

	// // note: location must match that of the dataset(s) referenced in the query.
	// /** @type {import("BigQuery")} */
	// const options = {
	// 	query,
	// 	location,
	// 	jobTimeoutMs: 1000 * 60 * 60 * 60 // ! todo: think about this
	// };

	// list files in bucket + calc size
	emitter.emit('dwh query start', config);
	const bucketName = query.replace("gs://", "").split("/")[0];
	const bucket = storage.bucket(bucketName);
	const [files] = await bucket.getFiles();
	const fileNames = files.map(f => f.name);
	const totalSize = files.map(f => Number(f.metadata.size)).reduce((t, i) => t + i);
	config.store({ rows: totalSize, files: fileNames });
	emitter.emit('dwh query end', config);


	await files[0]
    .createReadStream({decompress: true}) //stream is created
	.on('data', (foo, bar, baz) => {
		debugger;
	})
	.on('response', (foo, bar, baz) => {
		debugger;
	})
    .on('finish', () => {
      // The file download is complete
    });

	// const ex = await files[0].download({ decompress: true });
	debugger;

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
