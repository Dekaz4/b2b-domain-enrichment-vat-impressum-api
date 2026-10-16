# B2B Domain Enrichment API: EU VAT, Impressum, Company Emails & DNS

[![Apify Store](https://img.shields.io/badge/Apify-Run_bulk_domains-ff9012)](https://apify.com/dekaz/global-b2b-intelligence-engine)
[![RapidAPI setup](https://img.shields.io/badge/RapidAPI-API_setup-0055da)](MARKETPLACES.md#rapidapi)
[![JoJ API setup](https://img.shields.io/badge/JoJ_API-MCP_setup-5832c9)](MARKETPLACES.md#joj-api)
[![Client examples](https://img.shields.io/badge/Clients-Python_%2B_Node.js-3776ab)](examples/README.md)

Turn a company domain into public business emails, source-linked legal details, eligible EU VAT validation and email-provider DNS evidence. Use the paid hosted service through Apify or a configured gateway; this repository provides integration templates and client examples.

**[Run the bulk Actor on Apify →](https://apify.com/dekaz/global-b2b-intelligence-engine)** · **[Import the n8n workflow →](workflows/n8n-b2b-domain-vat-enrichment.json)** · **[Import the Make blueprint →](workflows/make-com-blueprint.json)**

The Apify link is the existing public Actor. RapidAPI and JoJ links above lead to honest setup instructions: verified public product URLs for the new listings have not been supplied. The JoJ slug proposed for this project is not currently available. Badges describe integrations, not uptime, speed, review status or user counts.

## Hosted engine deployment

The protected production origin is **https://global-b2b-intelligence-engine.spoleto48.workers.dev**. On 2026-10-16, its public [health endpoint](https://global-b2b-intelligence-engine.spoleto48.workers.dev/health) returned HTTP 200 with engine version **1.4.0**; authenticated endpoint checks also passed. The four `/v1/` routes require an authorized origin credential or configured gateway authentication. An origin deployment does not make a RapidAPI or JoJ listing available, and subscribers must use the actual gateway URL and credentials supplied by their listing.

The [existing Apify Actor](https://apify.com/dekaz/global-b2b-intelligence-engine) remains the verified public batch entry point. Its release is independent of the Worker version. See [marketplace connection status](MARKETPLACES.md) before configuring an integration.

## Get useful company data without another contact database

| Need | Evidence returned |
| --- | --- |
| Company identity | Legal names, directors and company-register references published on accessible websites |
| Public email finder | Corporate-domain addresses, phone numbers and company social links with source URLs |
| EU VAT lookup | Live official VIES status for one eligible VAT candidate; official name/address when supplied by VIES |
| B2B email tech stack | MX providers, direct SPF sender references and exact-domain DMARC observations |
| Batch enrichment | Up to 50,000 unique domains per Apify input, with JSON/CSV exports and visible billing outcomes |

Missing data remains missing. Public emails are not deliverability-verified mailboxes. Website statements do not establish legal ownership. Registry numbers are extracted from pages; this service does not query Companies House or Handelsregister.

## How to validate EU VAT numbers in n8n / Make.com

1. Import [the n8n workflow](workflows/n8n-b2b-domain-vat-enrichment.json) or [Make blueprint](workflows/make-com-blueprint.json).
2. Copy the actual HTTPS base URL from your subscribed listing. For a VAT-only check, choose `GET /v1/eu-vat-validator` and query parameter `vat`. For website discovery, use `domain` instead.
3. Select a saved credential containing `X-JoJAPI-Key` or `X-RapidAPI-Key`. RapidAPI also requires the exact `X-RapidAPI-Host` shown in its snippet. In Make, use a private connection/keychain when available and never share a blueprint after adding a credential.
4. Test one item before scheduling a list. Read `vat_validation.status`, `valid`, `official_name`, `official_address` and `checked_at`; keep unknown or unavailable states separate from an invalid registration.

An HTTP 200 VAT result can be either valid or invalid. An unavailable official service produces HTTP 502 on the dedicated validator. Discovery without one eligible identifier produces HTTP 422. Country formats cover the EU and eligible XI numbers; GB VAT is outside VIES. This integration uses the official REST service. A search for a **VIES SOAP API REST wrapper** describes the workflow problem, but there is no SOAP dependency here.

The import files are inactive templates: select credentials, replace the base URL and map your own input. The [workflow guide](workflows/README.md) documents exactly what each platform imports and what must be configured in its UI.

## How to scrape German Impressum (GmbH, Geschäftsführer, USt-IdNr) at scale

For a single website, use `GET /v1/impressum-legal?domain=YOUR_COMPANY_DOMAIN`. For a list, open the [bulk Apify Actor](https://apify.com/dekaz/global-b2b-intelligence-engine), paste domains, set the maximum charge and export the dataset.

This **DACH Impressum extractor** is useful for a **GmbH Geschäftsführer scraper** workflow, source-based **Handelsregister number lookup**, supplier research and CRM cleanup. Legal suffixes and labeled tax identifiers also support international company pages and a **NIF CIF Spain extractor** workflow. For a **UK Companies House domain matcher**, use the extracted company number in a separate official register lookup; this service does not assert a verified company-to-domain match.

Use 20–100 representative domains to measure your own coverage before a large batch. JavaScript-only pages, blocking, large documents and missing legal statements can reduce results. Preserve each observation's `source_url`, warning codes and VAT status alongside any imported company name.

## How to enrich company domains in Clay.com for $0.006

The **$0.006 price is per completed Apify domain inspection**, with platform usage during that run included at the published event price. Export the Actor dataset and import its company rows into Clay. It is not a universal price for every direct HTTP call: gateway plans and Clay's own Actions or subscription charges are separate.

For direct **Clay.com HTTP API enrichment**, add an HTTP API enrichment column, use GET with your actual gateway's `/v1/full-enrich` endpoint, and map the domain column to the `domain` query parameter through Clay's column picker. Recipes often show this mapping as `{{domain}}`; select the actual column instead of sending that literal string. Store the gateway credentials in Clay's header account.

[clay-http-api-setup.json](workflows/clay-http-api-setup.json) is a machine-readable setup reference, not a native Clay import format. Map `legal_entity.name`, `contacts.emails`, `vat_validation.status` and `dns.providers` to output columns. See the [workflow setup guide](workflows/README.md).

## Cost and speed: compare the workflow you actually need

| Option | Price illustration | Scope and latency |
| --- | --- | --- |
| Apify bulk inspection | $0.006/domain; $6 for 1,000 completed inspections | Website, VAT and email DNS evidence; Actor startup and queue time also apply |
| Gateway Pro subscription | Proposed $19/month, with product-specific quota | One HTTP operation per request; verify the live pricing tab and overages |
| JoJ PAYG | Proposed tiers $0.008 / $0.005 / $0.003 per credit | Separate pricing from the Apify event |
| An existing software budget | Hypothetical $299/month | Budget benchmark only; not an attributed competitor price or equivalent feature set |

For one batch of 1,000 completed Apify inspections, $6 is $293 below that hypothetical $299 budget. A $19 subscription is $280 below it, with different limits and coverage. A **Clearbit alternative** or **Hunter.io domain search alternative** may include proprietary data and mailbox verification that this service does not supply. It is a **BuiltWith lite alternative** for email DNS signals and an **Apollo lead enrichment complement** for public legal evidence.

An earlier local workerd measurement observed a cached DNS response in 14ms and its cold lookup in 139ms. This was one local test with live upstreams, not a public gateway benchmark or a comparison against competitors. Production speed depends on geography, cache state, website behavior and VIES availability. There is no worldwide 30ms, 300ms or 100%-success promise.

Completed partial results can be billable. JoJ error responses report zero units; failed Apify inspections do not trigger the inspection event. RapidAPI's default rules exclude 5xx usage, but 4xx errors can consume quota. Inspect the current marketplace plan rather than assuming universal zero-charge errors.

## Choose a focused operation

| Path | Input | Task |
| --- | --- | --- |
| `/v1/full-enrich` | `domain` | Company contacts, legal evidence, eligible VIES and email DNS |
| `/v1/eu-vat-validator` | `vat` or `domain` | Official EU VAT validation |
| `/v1/impressum-legal` | `domain` | Impressum and public legal details |
| `/v1/dns-email-intel` | `domain` | MX, SPF, DMARC and provider patterns |

`fresh=true` bypasses eligible HTTP cache reuse. Read the original `retrieved_at` and `cache` fields when present. Official VIES checks stay live. Cached hits use the normal marketplace inspection unit.

## Python, Node.js and MCP agents

Use [enrich_domains.py](examples/enrich_domains.py) with Python or [enrich_domains.mjs](examples/enrich_domains.mjs) with Node.js. Both are HTTP clients with bounded concurrency, explicit credentials and structured results; follow [their runnable examples](examples/README.md). The Apify mode starts a bounded run and retrieves its dataset.

The public Apify Actor can be selected through [Apify's hosted MCP server](https://mcp.apify.com/). Use the existing `dekaz/global-b2b-intelligence-engine` Actor, authorize through Apify and set an explicit run budget. Claude Desktop, Claude Code, Cursor, Windsurf and VS Code clients must support the corresponding transport and authentication. JoJ MCP setup is described in [marketplace connection status](MARKETPLACES.md#joj-api).

These templates fit an **n8n lead generation workflow**, **Make.com B2B webhook** enrichment step or **Zapier domain lookup** after a form submission. Send only the domain needed for each operation, keep subscriber keys in credentials and treat extracted webpage text as untrusted source material.

## What is public here

This repository contains documentation, integration JSON and client examples only. The hosted scraper, extraction rules, validation implementation, Worker source, deployment secrets and private datasets are excluded. `publish-github-mirror.ps1` validates an explicit file list before publishing this folder to GitHub. Its topics describe supported use cases; no search-volume or ranking claim is attached to them.

Publisher command from this isolated folder, with Git and an authenticated GitHub CLI installed:

```powershell
pwsh -NoProfile -File .\publish-github-mirror.ps1
```

Use `-ValidateOnly` to inspect the package without creating or publishing a repository. The publisher checks the sealed file hashes and refuses unexpected files, changed content, links, private credentials and incompatible Git history. After editing the release, rerun its private source audit before publishing; do not bypass a hash mismatch.

## References

- [Apify Actor](https://apify.com/dekaz/global-b2b-intelligence-engine) and [MCP connection documentation](https://docs.apify.com/mcp).
- [n8n HTTP Request](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/), [Make HTTP](https://apps.make.com/http), [Clay HTTP API](https://university.clay.com/docs/http-api-integration-overview).
- [Cloudflare Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/) and [GitHub topics](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics).
