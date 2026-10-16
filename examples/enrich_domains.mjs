#!/usr/bin/env node
// Public HTTP client only. Node.js 20+; no enrichment engine or third-party packages.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const ACTOR_ID = 'NVWgblCT11uSR8peG';
const ROUTES = new Set(['/v1/full-enrich', '/v1/eu-vat-validator', '/v1/impressum-legal', '/v1/dns-email-intel']);
const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT']);
const MAX_BYTES = 4 * 1024 * 1024;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export class ClientError extends Error {
  constructor(code, message, status = null) { super(message); this.code = code; this.status = status; }
}
export function originFor(platform, base) {
  let url;
  try { url = new URL(base || (platform === 'apify' ? 'https://api.apify.com' : '')); }
  catch { throw new ClientError('configuration', 'Set BASE_URL to the actual HTTPS gateway origin.'); }
  const host = url.hostname.toLowerCase();
  const allowed = platform === 'apify' ? host === 'api.apify.com'
    : platform === 'rapidapi' ? /^[a-z0-9-]+\.p\.rapidapi\.com$/.test(host)
      : platform === 'jojapi' && /^[a-z0-9-]+\.jojapi\.(net|dev)$/.test(host);
  if (!allowed || url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) {
    throw new ClientError('configuration', 'BASE_URL must be an HTTPS origin on the selected marketplace gateway allowlist, with no path, port or credentials.');
  }
  return url.origin;
}
function integer(value, minimum, maximum, label) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < minimum || n > maximum) throw new ClientError('configuration', `${label} is out of range.`);
  return n;
}
export function normalizeDomains(values) {
  if (!Array.isArray(values) || values.length > 100000) throw new ClientError('input', 'Provide no more than 100,000 input lines.');
  const result = [], seen = new Set();
  for (const value of values) {
    if (typeof value !== 'string') throw new ClientError('input', 'Every domain must be a string.');
    if (!value.trim() || value.trim().startsWith('#')) continue;
    let url;
    try { url = new URL(value.includes('://') ? value.trim() : `https://${value.trim()}`); }
    catch { throw new ClientError('input', 'An input is not a valid public domain.'); }
    const host = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) || /\.(?:localhost|local|internal|test|invalid|example)$/.test(host)) {
      throw new ClientError('input', 'Use public DNS hostnames without credentials, IP addresses or custom ports.');
    }
    if (!seen.has(host)) { seen.add(host); result.push(host); }
    if (result.length > 50000) throw new ClientError('input', 'At most 50,000 unique domains are supported.');
  }
  return result;
}
export function configFrom(env, options = {}) {
  const platform = options.platform || env.PLATFORM || 'apify';
  if (!['apify', 'rapidapi', 'jojapi'].includes(platform)) throw new ClientError('configuration', 'PLATFORM must be apify, rapidapi or jojapi.');
  const base = originFor(platform, env.BASE_URL);
  const keyName = { apify: 'APIFY_TOKEN', rapidapi: 'RAPIDAPI_KEY', jojapi: 'JOJAPI_KEY' }[platform];
  const key = env[keyName];
  if (!key || /[\r\n]/.test(key)) throw new ClientError('configuration', `Set ${keyName} in the process environment.`);
  const endpoint = options.endpoint || '/v1/full-enrich';
  if (!ROUTES.has(endpoint)) throw new ClientError('configuration', 'Choose one of the four documented endpoint paths.');
  const resume = options.resumeRun || null;
  if (resume && (!/^[A-Za-z0-9]{17}$/.test(resume) || platform !== 'apify')) throw new ClientError('input', 'Resume requires a valid Apify run ID.');
  const rawBudget = options.maxChargeUsd ?? env.APIFY_MAX_TOTAL_CHARGE_USD;
  const budget = rawBudget === undefined ? null : Number(rawBudget);
  if (platform === 'apify' && !resume && (budget === null || !Number.isFinite(budget) || budget < 0)) throw new ClientError('budget_required', 'Set an explicit non-negative --max-charge-usd before starting an Actor.');
  const headers = platform === 'apify' ? { authorization: `Bearer ${key}` }
    : platform === 'rapidapi' ? { 'x-rapidapi-key': key, 'x-rapidapi-host': new URL(base).host }
      : { 'x-jojapi-key': key };
  return { platform, base, headers, endpoint, resume, budget,
    concurrency: integer(options.concurrency ?? 1, 1, 8, 'concurrency'),
    intervalMs: integer(options.intervalMs ?? 31000, 0, 300000, 'interval-ms'),
    waitSeconds: integer(options.waitSeconds ?? 60, 0, 3600, 'wait-seconds'),
    timeoutMs: integer(options.timeoutMs ?? 12000, 1000, 60000, 'timeout-ms'),
  };
}
export async function requestJson(config, path, { method = 'GET', body, fetchImpl = fetch, delay = sleep } = {}) {
  const url = new URL(path, config.base);
  if (url.origin !== config.base) throw new ClientError('origin_blocked', 'Cross-origin requests are not allowed.');
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetchImpl(url, { method, redirect: 'manual', signal: controller.signal,
        headers: { ...config.headers, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) });
      if (response.status >= 300 && response.status < 400) throw new ClientError('redirect_blocked', 'The gateway redirected; no credential was forwarded.', response.status);
      if (method === 'GET' && attempt === 0 && [429, 502, 503, 504].includes(response.status)) {
        const retry = response.headers.get('retry-after');
        const seconds = retry === null ? 1 : /^\d+$/.test(retry) ? Number(retry) : Math.ceil((Date.parse(retry) - Date.now()) / 1000);
        if (Number.isFinite(seconds) && seconds >= 0 && seconds <= 30) {
          await response.body?.cancel(); clearTimeout(timer); await delay(Math.max(1000, seconds * 1000)); continue;
        }
      }
      if (!response.ok) { await response.body?.cancel(); throw new ClientError('http_error', `Gateway returned HTTP ${response.status}.`, response.status); }
      if (Number(response.headers.get('content-length')) > MAX_BYTES) { await response.body?.cancel(); throw new ClientError('response_too_large', 'Response exceeded the client size limit.'); }
      const reader = response.body?.getReader();
      if (!reader) throw new ClientError('invalid_response', 'Gateway returned an empty response.');
      const chunks = []; let length = 0;
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        length += value.byteLength;
        if (length > MAX_BYTES) { await reader.cancel(); throw new ClientError('response_too_large', 'Response exceeded the client size limit.'); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let data; try { data = JSON.parse(new TextDecoder().decode(bytes)); }
      catch { throw new ClientError('invalid_response', 'Gateway did not return valid JSON.'); }
      return { data, headers: response.headers };
    } catch (error) {
      if (error instanceof ClientError) throw error;
      throw new ClientError('request_uncertain', 'Request failed or timed out. It was not automatically repeated; the server may have processed it.');
    } finally { clearTimeout(timer); }
  }
  throw new ClientError('http_error', 'Request retry limit reached.');
}
const publicError = error => ({ code: error.code || 'client_error', message: error.message, ...(error.status ? { http_status: error.status } : {}) });
export async function runGateway(config, domains, io = {}) {
  const request = io.request || ((path, options) => requestJson(config, path, options));
  const delay = io.delay || sleep;
  const rows = new Array(domains.length); let cursor = 0, nextStart = 0;
  await Promise.all(Array.from({ length: Math.min(config.concurrency, domains.length) }, async () => {
    for (;;) {
      const index = cursor++; if (index >= domains.length) return;
      const start = Math.max(Date.now(), nextStart); nextStart = start + config.intervalMs;
      await delay(Math.max(0, start - Date.now()));
      try {
        const { data } = await request(`${config.endpoint}?domain=${encodeURIComponent(domains[index])}`);
        rows[index] = { domain: domains[index], success: data?.success === true, result: data };
      } catch (error) { rows[index] = { domain: domains[index], success: false, error: publicError(error) }; }
    }
  }));
  return { platform: config.platform, success: rows.every(row => row.success), complete: true, items: rows };
}
function validRun(run) {
  if (!run || !/^[A-Za-z0-9]{17}$/.test(run.id || '') || (run.actId && run.actId !== ACTOR_ID)) throw new ClientError('invalid_run', 'Run does not match the expected Actor.');
  return run;
}
export async function runApify(config, domains, io = {}) {
  const request = io.request || ((path, options) => requestJson(config, path, options));
  const delay = io.delay || sleep; const now = io.now || Date.now;
  let run;
  try {
    run = config.resume ? validRun((await request(`/v2/actor-runs/${config.resume}`)).data.data)
      : validRun((await request(`/v2/actors/${ACTOR_ID}/runs?maxTotalChargeUsd=${encodeURIComponent(config.budget)}&restartOnError=false`, {
        method: 'POST', body: { domains, maxDomains: domains.length, maxConcurrency: config.concurrency, maxRetries: 0, includeRaw: false },
      })).data.data);
  } catch (error) {
    if (!config.resume && (!error.status || error.status >= 500)) throw new ClientError('run_start_uncertain', 'Actor start outcome is uncertain. Inspect Apify Console for an existing run; do not start another run blindly.');
    throw error;
  }
  const deadline = now() + config.waitSeconds * 1000;
  const state = () => ({ platform: 'apify', success: null, complete: false, run: { id: run.id, status: run.status, dataset_id: run.defaultDatasetId || null }, items: null });
  try {
    while (!TERMINAL.has(run.status) && now() < deadline) {
      await delay(Math.min(2000, Math.max(0, deadline - now())));
      if (now() >= deadline) break;
      run = validRun((await request(`/v2/actor-runs/${run.id}`)).data.data);
    }
    if (!TERMINAL.has(run.status)) return state();
    if (!/^[A-Za-z0-9]{17}$/.test(run.defaultDatasetId || '')) throw new ClientError('dataset_missing', 'The completed run has no readable dataset ID.');
    const items = []; let offset = 0;
    while (offset < 50000) {
      const page = await request(`/v2/datasets/${run.defaultDatasetId}/items?format=json&clean=false&desc=false&offset=${offset}&limit=500`);
      if (!Array.isArray(page.data)) throw new ClientError('invalid_response', 'Dataset response is not a JSON array.');
      items.push(...page.data); offset += page.data.length;
      const rawTotal = page.headers?.get('x-apify-pagination-total');
      const total = rawTotal === null || rawTotal === undefined ? null : Number(rawTotal);
      if (items.length > 50000 || (total !== null && total > 50000)) throw new ClientError('dataset_limit', 'Dataset exceeded 50,000 rows.');
      if (total !== null && Number.isFinite(total)) {
        if (offset >= total) break;
        if (!page.data.length) throw new ClientError('pagination_error', 'Dataset pagination stopped before its reported total.');
      } else if (page.data.length < 500) break;
    }
    return { ...state(), success: run.status === 'SUCCEEDED', complete: true, items };
  } catch (error) { return { ...state(), error: publicError(error) }; }
}
export async function main(args = process.argv.slice(2), env = process.env) {
  const options = {}, values = []; let file;
  const flags = { '--platform': 'platform', '--endpoint': 'endpoint', '--concurrency': 'concurrency', '--interval-ms': 'intervalMs', '--wait-seconds': 'waitSeconds', '--timeout-ms': 'timeoutMs', '--max-charge-usd': 'maxChargeUsd', '--resume-run': 'resumeRun' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--domains-file') { file = args[++i]; if (!file) throw new ClientError('input', 'Provide a domains file path.'); }
    else if (flags[args[i]]) { const key = flags[args[i]]; if (args[i + 1] === undefined) throw new ClientError('input', 'A CLI option needs a value.'); options[key] = args[++i]; }
    else if (args[i].startsWith('--')) throw new ClientError('input', 'Unknown CLI option.');
    else values.push(args[i]);
  }
  if (file) { const text = await readFile(file, 'utf8'); if (text.length > 12_000_000) throw new ClientError('input', 'Input file is too large.'); values.push(...text.split(/\r?\n/)); }
  const config = configFrom(env, options), domains = normalizeDomains(values);
  if (!domains.length && !config.resume) throw new ClientError('input', 'Supply domains or --domains-file.');
  if (config.resume && domains.length) throw new ClientError('input', 'Resume accepts a run ID only; omit domains to avoid confusing it with a new purchase.');
  return config.platform === 'apify' ? runApify(config, domains) : runGateway(config, domains);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { const output = await main(); process.stdout.write(JSON.stringify(output) + '\n'); if (output.success === false || output.error) process.exitCode = 1; }
  catch (error) { process.stdout.write(JSON.stringify({ success: false, error: publicError(error) }) + '\n'); process.exitCode = 1; }
}
