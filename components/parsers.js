import JsonlParser from 'stream-json/jsonl/Parser.js';

export default function parser(type = "ndjson") {
	if (type === 'ndjson') return new JsonlParser();
}