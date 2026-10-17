# Marketplace links and connection status

Last verified: 2026-10-17. Client examples use the subscriber gateway URLs below, with credentials from the corresponding marketplace.

## Production origin

The protected Worker origin is **https://global-b2b-intelligence-engine.spoleto48.workers.dev**. Its public [health endpoint](https://global-b2b-intelligence-engine.spoleto48.workers.dev/health) reports engine version **1.4.0**. The four business routes require authentication, and each RapidAPI listing has a distinct origin-secret binding. Origin credentials and gateway proxy secrets are excluded from this repository.

## Apify

[Open the public bulk Actor](https://apify.com/dekaz/global-b2b-intelligence-engine).

Actor ID: `NVWgblCT11uSR8peG`. Public name: `dekaz/global-b2b-intelligence-engine`. Build **1.4.1** was deployed and tested against the protected Worker origin on 2026-10-16. Use the live version and Pricing tab for current terms. Completed domain inspection events are priced at **$0.006**; platform usage during the run is included in that event price.

Hosted MCP supports selecting Actors through [mcp.apify.com](https://mcp.apify.com/). Choose this Actor, authenticate through Apify and always set an explicit maximum charge. Public tool discovery is different from free execution.

## RapidAPI

All four products are public, connected to the Worker and tested through the native RapidAPI gateway. One product's subscription does not unlock the others.

| Product | Marketplace listing | HTTPS gateway base URL | Route |
| --- | --- | --- | --- |
| Company Domain Enrichment, Email Finder & B2B Tech Stack API | [Open listing](https://rapidapi.com/spoleto48/api/company-domain-enrichment-email-finder-b2b-tech-stack-api) | `https://company-domain-enrichment-email-finder-b2b-tech-stack-api.p.rapidapi.com` | `/v1/full-enrich` |
| EU VAT Number Validator & Official VIES Company Lookup API | [Open listing](https://rapidapi.com/spoleto48/api/eu-vat-number-validator-official-vies-company-lookup-api) | `https://eu-vat-number-validator-official-vies-company-lookup-api.p.rapidapi.com` | `/v1/eu-vat-validator` |
| German Impressum Scraper, Legal Entity & DACH Company Data | [Open listing](https://rapidapi.com/spoleto48/api/german-impressum-scraper-legal-entity-dach-company-data) | `https://german-impressum-scraper-legal-entity-dach-company-data.p.rapidapi.com` | `/v1/impressum-legal` |
| Domain DNS, MX Record, SPF, DMARC & Email Provider Lookup | [Open listing](https://rapidapi.com/spoleto48/api/domain-dns-mx-record-spf-dmarc-email-provider-lookup) | `https://domain-dns-mx-record-spf-dmarc-email-provider-lookup.p.rapidapi.com` | `/v1/dns-email-intel` |

Send `X-RapidAPI-Key` from your own RapidAPI application and `X-RapidAPI-Host` equal to the hostname in the chosen row. The provider's origin secret is never required from consumers.

### Current public plans

BASIC is **$0/month for 15 requests**, with a **hard limit** and **2 requests/minute**. PRO is **$19/month** at **20 requests/minute**. ULTRA is **$49/month** at **60 requests/minute**. PRO is recommended; no manual subscription approval is required.

| Product | PRO monthly requests | PRO excess/request | ULTRA monthly requests | ULTRA excess/request |
| --- | ---: | ---: | ---: | ---: |
| Company enrichment | 2,000 | $0.012 | 10,000 | $0.006 |
| EU VAT / VIES | 5,000 | $0.005 | 20,000 | $0.003 |
| Impressum | 4,000 | $0.006 | 20,000 | $0.003 |
| DNS / email | 25,000 | $0.001 | 100,000 | $0.0006 |

RapidAPI separately displays its platform bandwidth allowance of 10,240 MB/month and $0.001 per additional MB. Refer to the product's Pricing tab before subscribing. HTTP 200 partial inspections consume quota; default HTTP 5xx do not, while HTTP 4xx can count. Provider test subscriptions do not prove ordinary-customer quota enforcement.

## JoJ API

[Submitted JoJ listing](https://jojapi.com/hub/api/b2b-domain-enrichment-vat-impressum-api): **B2B Domain Enrichment, EU VAT VIES Validator & Impressum API (MCP Ready)**.

The deployment's assigned API base URL is `https://gfseh.jojapi.net`. Publication is **pending JoJ human review** as of 2026-10-17; this is not a claim of public purchase availability or approval. Wait for the listing to be approved before wiring a production customer workflow to it.

After approval, copy the current HTTP and MCP settings from the listing's Connect panel. HTTP clients use the assigned host plus `/v1/...` and their `X-JoJAPI-Key`. The project MCP target is `https://mcp.jojapi.com/b2b-domain-enrichment-vat-impressum-api`; do not treat that proposed endpoint as verified until discovery succeeds for the approved listing. Never use a publisher token or origin secret as a customer key. [JoJ MCP documentation](https://docs.jojapi.com/consumers/mcp).
