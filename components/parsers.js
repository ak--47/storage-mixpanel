import papaparse from 'papaparse';

export default function parser(type = "ndjson", data, fileName) {
	if (type === 'ndjson' || fileName.endsWith('ndjson')) return parseJSONL(data);
	if (type === 'jsonl' || fileName.endsWith('jsonl')) return parseJSONL(data);
	if (type === 'json' || fileName.endsWith('json')) return parseJSON(data);
	if (type === 'csv' || fileName.endsWith('csv')) return parseCSV(data);
	if (type === 'tsv' || fileName.endsWith('tsv')) return parseCSV(data);
	throw new Error(`${type} cannot be parsed; format not supported`);
}


function parseCSV(buffer) {
	return papaparse.parse(buffer.toString(), {
		header: true,
		skipEmptyLines: 'greedy'
	}).data;
}

function parseJSONL(buffer) {
	return buffer.toString().split('\n').filter(a => a).map(JSON.parse);
}

function parseJSON(buffer) {
	return JSON.parse(buffer.toString());
}