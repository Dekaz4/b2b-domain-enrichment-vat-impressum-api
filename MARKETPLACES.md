# Marketplace links and connection status

Last prepared: 2026-10-16. A suggested product slug is not proof that a listing exists. The client examples require actual marketplace URLs and subscriber credentials.

## Production origin

The Worker is deployed at **https://global-b2b-intelligence-engine.spoleto48.workers.dev**. Its public [health endpoint](https://global-b2b-intelligence-engine.spoleto48.workers.dev/health) returned HTTP 200 and version **1.4.0** on 2026-10-16. Authenticated endpoint checks passed after deployment.

The `/v1/full-enrich`, `/v1/eu-vat-validator`, `/v1/impressum-legal` and `/v1/dns-email-intel` routes are protected. The origin URL is not a subscriber gateway or a public unauthenticated API. RapidAPI and JoJ consumers must use the assigned marketplace host and subscriber credentials once those listings are verified. Origin credentials and gateway proxy secrets are never published in this repository.

## Apify

[Open the public bulk Actor](https://apify.com/dekaz/global-b2b-intelligence-engine).

Actor ID: `NVWgblCT11uSR8peG`. Current public name: `dekaz/global-b2b-intelligence-engine`. Proposed future slug: `b2b-website-contact-vat-impressum-scraper`; the proposal does not change the current URL. This is the existing live Actor. A newer Actor build or promotion is not confirmed by the Worker deployment above; use the version shown in Apify Console for an actual run.

Hosted MCP supports selecting Actors with the `tools` query parameter. Use Apify's configurator at [mcp.apify.com](https://mcp.apify.com/) and choose this Actor. OAuth or an Apify token is needed for a run; public discovery is different from free execution. Always specify a maximum charge.

## RapidAPI

The four intended product names are:

1. Company Domain Enrichment, Email Finder & B2B Tech Stack API
2. EU VAT Number Validator & Official VIES Company Lookup API
3. German Impressum Scraper, Legal Entity & DACH Company Data API
4. Domain DNS, MX Record, SPF, DMARC & Email Provider Lookup API

Verified public URLs for these new listings are not available in this package. Do not subscribe to an unrelated similarly named product. After publication, copy the actual product URL, gateway base URL and X-RapidAPI-Host from the listing. Each product has its own subscription; use X-RapidAPI-Key from your account. The documentation owner can then replace the setup badge with the verified listing URL.

## JoJ API

Intended title: **B2B Domain Enrichment, EU VAT VIES Validator & Impressum API (MCP Ready)**.

The requested MCP URL is `https://mcp.jojapi.com/b2b-domain-enrichment-vat-impressum-api`. On 2026-10-16 its public initialize probe returned a JSON-RPC error stating that no API with that name is available. HTTP 200 alone did not mean a successful MCP connection. This URL is a pending configuration target, not a working purchase link.

After the listing is deployed and accessible, use its Connect panel to obtain the actual MCP URL and authentication instructions. For HTTP calls, use the assigned API-specific host plus `/v1/...` and your X-JoJAPI-Key. Never paste a publisher management token or origin proxy secret into a client. [JoJ MCP setup](https://docs.jojapi.com/consumers/mcp).
