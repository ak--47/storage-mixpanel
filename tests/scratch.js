/**
 * 
 * THIS IS JUST A SCRATCH FILE 
 * TO TEST RANDOM CONFIGS LOCALLY
 * YOU PROBABLY DON'T NEED THIS 
 * BUT I DID... ;) 
 */

/* eslint-disable no-undef */
/* eslint-disable no-debugger */
/* eslint-disable no-unused-vars */
/* cSpell:disable */
import main from "../index.js";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// link to a config!
let current = require("../environments/gcs/events.json");


// do the thing!
main(current)
	.then(result => {
		//noop
		debugger;
		result;
	})
	.catch(e => {
		//noop
		debugger;
	}) 


// main({
// 	"dwh": "bigquery",
// 	"auth": {},
// 	"sql": "SELECT payments.insert_id as insert_id, payments.user_id as user_id, payments.time as time, payments.event as event, payments.payment_type as payment_type, payments.total_value as revenue_usd, payments.product_id as product_id, users.age as user_age, users.email as user_email, users.full_name as user_fullName, users.plan as user_plan, users.campaign_attribution as user_campaign, products.ad_budget_usd as product_budget, products.product_released as product_release_month, products.primiary_audience as intended_audience FROM `ak-internal-tool-1613096051700.mp_joins.payments` as payments JOIN `ak-internal-tool-1613096051700.mp_joins.users` as users USING(user_id) JOIN `ak-internal-tool-1613096051700.mp_joins.products` as products ON payments.product_id = products.unit_id LIMIT 10005",
// 	"mappings": {
// 		"event_name_col": "event",
// 		"time_col": "time",
// 		"distinct_id_col": "user_id",
// 		"insert_id_col": "insert_id"
// 	},
// 	"options": {
// 		"strict": true,
// 		"compress": false,
// 		"workers": 20,
// 		"shouldLog": true,
// 		"test": false
// 	},
// 	"mixpanel": {
// 		"type": "event",
// 		"project_id": "2913412",
// 		"region": "US",
// 		"howAuth": "APISecret",
// 		"api_secret": "aa54fa71a5b5e247fb5e580401687e34"
// 	},
// 	"tags": {
// 		"dwh": "bigquery"
// 	}
// }).then((r) => {
// 	debugger;
// });