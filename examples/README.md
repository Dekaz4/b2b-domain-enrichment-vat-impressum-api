# Public marketplace clients

These clients call subscribed marketplace endpoints. They contain no enrichment engine and need no third-party packages: Python 3.11+ or Node.js 20+. Set credentials in the process environment, then run either file from this repository. A real subscription and its current pricing apply.

## Apify: bulk enrichment with an explicit spend cap

Set `APIFY_TOKEN` in your environment. The client targets the published [Global B2B Intelligence Engine](https://apify.com/dekaz/global-b2b-intelligence-engine), Actor ID `NVWgblCT11uSR8peG`.

```sh
node examples/enrich_domains.mjs --platform apify --max-charge-usd 0.06 --wait-seconds 60 proton.me
python examples/enrich_domains.py --platform apify --max-charge-usd 0.06 --wait-seconds 60 proton.me
```

Run one command, not both, unless you intend two separate purchases. The amount is a maximum run charge in USD, not a promise that every input will finish within that amount. Check the Actor's live Pricing tab. At a published price of $0.006 per domain, $0.06 covers at most ten chargeable domains; platform usage during a pay-per-event run is included in that price. Existing credits may cover the charge. The client does not buy credits or upgrade a plan.

For a text file containing one domain per line:

```sh
node examples/enrich_domains.mjs --platform apify --domains-file domains.txt --max-charge-usd 6 --concurrency 4 --wait-seconds 60
```

The input is normalized and deduplicated, with a maximum of 50,000 unique domains. Empty lines and lines beginning with `#` are ignored. A successful run can contain fewer results than requested if its budget is exhausted; inspect the dataset rows and run status.

The start request is sent once. The client polls its run ID and fetches dataset pages after completion. If the wait window expires, stdout contains `success: null`, `complete: false`, `items: null` and the actual run ID. This means “still pending,” not a failed purchase. Resume with that returned ID:

```sh
node examples/enrich_domains.mjs --platform apify --resume-run "$RUN_ID" --wait-seconds 60
python examples/enrich_domains.py --platform apify --resume-run "$RUN_ID" --wait-seconds 60
```

`RUN_ID` must be the real 17-character ID from the earlier output or Apify Console. Resume never creates another run. If the initial POST times out before an ID is received, inspect Console first: the original run may already exist. The client deliberately does not repeat that POST. A local wait timeout does not abort the remote Actor.

## RapidAPI or JoJAPI: one domain per request

Set `BASE_URL` to the exact HTTPS gateway origin shown in your subscription. Set `RAPIDAPI_KEY` or `JOJAPI_KEY` accordingly. No live gateway URL is assumed by this repository. The clients accept RapidAPI origins ending in `.p.rapidapi.com`, and JoJAPI origins ending in `.jojapi.net` or `.jojapi.dev`, with one subdomain label and no path, custom port or embedded credentials.

```sh
node examples/enrich_domains.mjs --platform jojapi --endpoint /v1/full-enrich proton.me
python examples/enrich_domains.py --platform rapidapi --endpoint /v1/dns-email-intel proton.me
```

RapidAPI may publish each endpoint as a separate product. Use the matching product's host and subscription for the chosen route. The four accepted routes are:

| Route | Domain input behavior |
| --- | --- |
| `/v1/full-enrich` | Web, legal, available VAT validation and DNS data |
| `/v1/eu-vat-validator` | Discover a VAT ID from the domain, then validate when possible |
| `/v1/impressum-legal` | Legal-page evidence and public business contacts |
| `/v1/dns-email-intel` | MX, SPF, DMARC and DNS-based provider signals |

These batch clients take domains. To submit an already-known VAT ID directly, use the n8n template or an HTTP call with `vat` to the VAT endpoint. A direct VAT check uses fresh VIES data; eligible web/DNS results can use the API's documented cache.

## Options and output

| Option | Default | Meaning |
| --- | --- | --- |
| `--platform` | `apify` | `apify`, `rapidapi` or `jojapi`; alternatively set `PLATFORM` |
| `--endpoint` | `/v1/full-enrich` | Gateway route; the Actor uses its own bulk input |
| `--domains-file` | none | UTF-8 newline-separated domain list |
| `--concurrency` | `1` | Maximum simultaneous gateway calls or requested Actor concurrency; 1–8 |
| `--interval-ms` | `31000` | Minimum spacing between gateway request starts; 0–300000 |
| `--timeout-ms` | `12000` | Per HTTP request timeout budget; 1000–60000 |
| `--wait-seconds` | `60` | Apify polling window; 0–3600 |
| `--max-charge-usd` | required for new Apify runs | Explicit non-negative run cap; alternatively `APIFY_MAX_TOTAL_CHARGE_USD` |
| `--resume-run` | none | Read an existing Apify run without starting another |

The 31-second gateway interval is conservative for plans permitting two requests per minute. Set it to your actual plan's limit; increasing concurrency does not increase your subscription quota. The Python timeout uses the standard library's socket timeout plus an elapsed-time check between bounded reads; an in-progress blocking read can extend the total wall-clock duration by up to its socket timeout.

Each invocation writes one JSON envelope to stdout, in input order for gateway calls. Exit code `1` means a failed request or retrieval error; pending runs use exit code `0` and `success: null`. Gateway success preserves the complete original response, including partial results, warnings and evidence. An HTTP 200 partial response is not proof of complete data. Actor rows preserve the published dataset format.

GET requests retry once after HTTP 429, 502, 503 or 504 only when the indicated retry delay is at most 30 seconds. Network failures, timeouts and Apify start POSTs are never automatically retried. A gateway retry may count as another request on your plan, especially on RapidAPI. No redirect is followed, so a redirect cannot forward the credential to another origin. Keys are never placed in query strings or output.

References: [Apify asynchronous runs and spend limits](https://docs.apify.com/api/v2/actors-runs-post), [run status](https://docs.apify.com/api/v2/actor-run-get), [dataset pagination](https://docs.apify.com/api/v2/dataset-items-get), [JoJAPI authentication](https://docs.jojapi.com/consumers/api-keys).
