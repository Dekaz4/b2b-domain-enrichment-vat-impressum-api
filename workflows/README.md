# Importable workflows and Clay setup

The n8n workflow and Make blueprint are public HTTP clients. Importing them makes no request. Both require your actual subscribed gateway URL and credential before execution; this repository does not invent a live RapidAPI or JoJAPI endpoint. Use the [Python or Node clients](../examples/README.md) for bulk Apify runs with a spend cap and resumable polling.

## n8n

1. In a new workflow, choose **Import from File** and select [n8n-b2b-domain-vat-enrichment.json](n8n-b2b-domain-vat-enrichment.json).
2. In **Set gateway and input**, choose `jojapi` or `rapidapi`, paste the actual HTTPS gateway origin into `baseUrl`, and choose the endpoint and domain. In **Call subscribed endpoint**, select a **Header Auth** credential with name `X-JoJAPI-Key` or `X-RapidAPI-Key` and your real key as its value. Then execute the manual trigger.

The RapidAPI host header is derived from the gateway origin. A separate product subscription may be required for each RapidAPI endpoint. The template validates the vendor origin before making a request, rejects redirects, waits at most 10 seconds per HTTP request, and does not retry. Its last node preserves the HTTP status, response body and headers. A non-200 response is shown as unsuccessful, not discarded.

For direct VAT validation, set `endpoint` to `/v1/eu-vat-validator` and put the country-prefixed VAT number in `vat`. The template then sends `vat` alone; a non-empty `domain` is ignored in this mode. With an empty `vat`, it sends `domain` for discovery. Set `fresh` to true to bypass eligible web/DNS caching; VIES validation is always fresh. This template handles one input per execution. For large lists, use the bounded bulk clients or add batching and rate controls appropriate to your plan before connecting a table.

The file uses native Manual Trigger, Edit Fields, HTTP Request and Code nodes. It contains no key, credential ID or private extraction logic. Import structure and its URL expressions have automated checks; account-specific UI import/execution requires your installed n8n version and credential. [n8n JSON import](https://docs.n8n.io/workflows/export-import/), [HTTP Request configuration](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/).

## Make

Create a new scenario, open its three-dot menu, choose **Import blueprint**, and select [make-com-blueprint.json](make-com-blueprint.json). The file uses the documented legacy `http:ActionSendData` module, version 3. Its URL is deliberately empty until you supply the actual subscribed origin plus `/v1/full-enrich`. It sends GET with `domain=proton.me` and `fresh=false`; replace the sample domain or map a domain field.

For JoJAPI, set the blank `X-JoJAPI-Key` header to your subscribed key. For RapidAPI, replace that header with `X-RapidAPI-Key` and add `X-RapidAPI-Host` containing the actual gateway hostname. Leave Basic username and password empty for this header setup. Set the URL to the product's correct HTTPS gateway and endpoint. Keep **Follow redirect** disabled and **Reject unverified certificates** enabled. Response parsing is enabled and the request timeout is 10 seconds. This blueprint has no automatic retry handler and no schedule.

The v3 generic HTTP module stores custom header values in its scenario configuration, so a configured export can expose your key. Never publish or share an export containing credentials. For a shared production scenario, replace this single module with current **HTTP → Make a request**, choose **API key** authentication, and store the key in its keychain with header placement and the corresponding header name. Carry over the URL, query, timeout and redirect settings. This is a UI migration, not an invented v3 credential field. [Make import instructions](https://help.make.com/blueprints), [official v3 exported module example](https://developers.make.com/api-documentation/api-reference/incomplete-executions), [current HTTP module and keychain](https://apps.make.com/http).

For `/v1/eu-vat-validator`, either keep the `domain` query for discovery or replace it with `vat` and an actual country-prefixed VAT number. For other products, change only the endpoint and use its matching subscription. Confirm the HTTP status and response before chaining actions; a failed lookup must not become a positive legal finding. The blueprint is structurally checked against the published export format; it has not been imported into your private Make account.

## Clay

[clay-http-api-setup.json](clay-http-api-setup.json) is a readable configuration reference, **not a native Clay import file**. Clay documents configuring the HTTP API enrichment in its table UI.

1. Add a **Domain** column and choose **Add enrichment → HTTP API**.
2. Choose GET and enter the actual subscribed gateway origin plus `/v1/full-enrich`. Add query parameter `domain`; use Clay's column picker to select the Domain column. Add `fresh=false` if desired.
3. Create/select an encrypted **HTTP API (Headers)** account containing `X-JoJAPI-Key`, or `X-RapidAPI-Key` plus the corresponding `X-RapidAPI-Host`. Add `Accept: application/json`, run one row, and inspect the complete result before mapping fields to columns.

For direct VAT checks, use the VAT endpoint and map `vat` from a country-prefixed VAT column instead of `domain`. Keep warnings and source URLs alongside extracted fields. The marketplace charges according to its plan; Clay's own platform usage is separate. [Clay HTTP API setup](https://university.clay.com/docs/http-api-integration-overview).
