// @ts-nocheck
/* eslint-disable no-undef */
/* eslint-disable no-debugger */
/* eslint-disable no-unused-vars */
/* cSpell:disable */
import main from "../index.js";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const timeout = 60000;

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


