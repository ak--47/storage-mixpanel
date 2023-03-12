//todo add more parsers

export default function parser(type = "ndjson", data) {
	if (type === 'ndjson') return parseJSONL(data);
	if (type === 'jsonl') return parseJSONL(data);
	if (type === 'json') return parseJSON(data);
}



function parseJSONL(buffer) {
	return buffer.toString().split('\n').filter(a => a).map(JSON.parse);
}

function parseJSON(buffer) {
	return JSON.parse(buffer.toString());
}