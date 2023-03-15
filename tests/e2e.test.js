// @ts-nocheck
/* eslint-disable no-undef */
/* eslint-disable no-debugger */
/* eslint-disable no-unused-vars */
/* cSpell:disable */
import main from "../index.js";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const timeout = 60000;

const gcsNDJSONEvents = require("../environments/gcs/events-NDJSON.json");
const gcsCSVEvents = require("../environments/gcs/events-CSV.json");

const opts = {
	options: {
		"verbose": false,
		"abridged": false
	}
};

describe('do tests work?', () => {
	test('a = a', () => {
		expect(true).toBe(true);
	});
});


describe('gcs', () => {
	test('events NDJSON', async () => {
		const data = await main(gcsNDJSONEvents);
		const { mixpanel, gcs, time } = data;
		expect(gcs.files.length).toBe(2);
		expect(mixpanel.failed).toBe(0);
		expect(mixpanel.success).toBe(28246);
		expect(mixpanel.responses.length).toBe(29);
		expect(mixpanel.errors.length).toBe(0);
	}, timeout);

	test('events CSV', async () => {
		const data = await main(gcsCSVEvents);
		const { mixpanel, gcs, time } = data;
		expect(gcs.files.length).toBe(1);
		expect(mixpanel.failed).toBe(0);
		expect(mixpanel.success).toBe(10000);
		expect(mixpanel.responses.length).toBe(11);
		expect(mixpanel.errors.length).toBe(0);
	}, timeout);
})


