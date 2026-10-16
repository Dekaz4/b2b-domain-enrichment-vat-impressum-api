#!/usr/bin/env python3
"""Public marketplace HTTP client. Python 3.11+, standard library only."""
import argparse
import concurrent.futures
import json
import math
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from email.utils import parsedate_to_datetime

ACTOR_ID = "NVWgblCT11uSR8peG"
ROUTES = {"/v1/full-enrich", "/v1/eu-vat-validator", "/v1/impressum-legal", "/v1/dns-email-intel"}
TERMINAL = {"SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"}
MAX_BYTES = 4 * 1024 * 1024


class ClientError(Exception):
    def __init__(self, code, message, status=None):
        super().__init__(message)
        self.code, self.status = code, status


def error_json(error):
    result = {"code": getattr(error, "code", "client_error"), "message": str(error)}
    if getattr(error, "status", None):
        result["http_status"] = error.status
    return result


def origin_for(platform, base):
    try:
        url = urllib.parse.urlsplit(base or ("https://api.apify.com" if platform == "apify" else ""))
        host = url.hostname or ""
        allowed = host == "api.apify.com" if platform == "apify" else (
            bool(re.fullmatch(r"[a-z0-9-]+\.p\.rapidapi\.com", host)) if platform == "rapidapi"
            else platform == "jojapi" and bool(re.fullmatch(r"[a-z0-9-]+\.jojapi\.(net|dev)", host)))
        if not allowed or url.scheme != "https" or url.username or url.password or url.port or url.path not in ("", "/") or url.query or url.fragment:
            raise ValueError()
        return "https://" + host
    except ValueError:
        raise ClientError("configuration", "BASE_URL must be an HTTPS origin on the selected marketplace gateway allowlist, with no path, port or credentials.") from None


def normalize_domains(values):
    if len(values) > 100000:
        raise ClientError("input", "Provide no more than 100,000 input lines.")
    result, seen = [], set()
    for value in values:
        if not isinstance(value, str):
            raise ClientError("input", "Every domain must be a string.")
        value = value.strip()
        if not value or value.startswith("#"):
            continue
        try:
            url = urllib.parse.urlsplit(value if "://" in value else "https://" + value)
            host = (url.hostname or "").encode("idna").decode("ascii").lower().rstrip(".")
            host = host[4:] if host.startswith("www.") else host
            if url.scheme not in ("http", "https") or url.username or url.password or url.port or not re.fullmatch(r"(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}", host) or re.search(r"\.(?:localhost|local|internal|test|invalid|example)$", host):
                raise ValueError()
        except (ValueError, UnicodeError):
            raise ClientError("input", "Use public DNS hostnames without credentials, IP addresses or custom ports.") from None
        if host not in seen:
            seen.add(host)
            result.append(host)
        if len(result) > 50000:
            raise ClientError("input", "At most 50,000 unique domains are supported.")
    return result


def config_from(env, options):
    platform = options.platform or env.get("PLATFORM", "apify")
    if platform not in ("apify", "rapidapi", "jojapi"):
        raise ClientError("configuration", "PLATFORM must be apify, rapidapi or jojapi.")
    base = origin_for(platform, env.get("BASE_URL"))
    key_name = {"apify": "APIFY_TOKEN", "rapidapi": "RAPIDAPI_KEY", "jojapi": "JOJAPI_KEY"}[platform]
    key = env.get(key_name)
    if not key or "\r" in key or "\n" in key:
        raise ClientError("configuration", "Set " + key_name + " in the process environment.")
    if options.endpoint not in ROUTES:
        raise ClientError("configuration", "Choose one of the four documented endpoint paths.")
    if options.resume_run and (platform != "apify" or not re.fullmatch(r"[A-Za-z0-9]{17}", options.resume_run)):
        raise ClientError("input", "Resume requires a valid Apify run ID.")
    raw_budget = options.max_charge_usd if options.max_charge_usd is not None else env.get("APIFY_MAX_TOTAL_CHARGE_USD")
    try:
        budget = float(raw_budget) if raw_budget is not None else None
    except ValueError:
        budget = None
    if platform == "apify" and not options.resume_run and (budget is None or not math.isfinite(budget) or budget < 0):
        raise ClientError("budget_required", "Set an explicit non-negative --max-charge-usd before starting an Actor.")
    for name, low, high in (("concurrency", 1, 8), ("interval_ms", 0, 300000), ("wait_seconds", 0, 3600), ("timeout_ms", 1000, 60000)):
        if not low <= getattr(options, name) <= high:
            raise ClientError("configuration", name + " is out of range.")
    headers = {"Authorization": "Bearer " + key} if platform == "apify" else (
        {"X-RapidAPI-Key": key, "X-RapidAPI-Host": urllib.parse.urlsplit(base).hostname} if platform == "rapidapi"
        else {"X-JoJAPI-Key": key})
    return {**vars(options), "platform": platform, "base": base, "headers": headers, "budget": budget}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request_json(config, path, method="GET", body=None, opener=None, delay=time.sleep):
    url = urllib.parse.urljoin(config["base"], path)
    target = urllib.parse.urlsplit(url)
    if target.scheme + "://" + target.netloc != config["base"]:
        raise ClientError("origin_blocked", "Cross-origin requests are not allowed.")
    opener = opener or urllib.request.build_opener(NoRedirect())
    headers = {**config["headers"], "Accept": "application/json"}
    payload = None
    if body is not None:
        payload = json.dumps(body, allow_nan=False).encode("utf8")
        headers["Content-Type"] = "application/json"
    for attempt in range(2):
        request = urllib.request.Request(url, data=payload, headers=headers, method=method)
        try:
            deadline = time.monotonic() + config["timeout_ms"] / 1000
            with opener.open(request, timeout=config["timeout_ms"] / 1000) as response:
                if int(response.headers.get("Content-Length", "0")) > MAX_BYTES:
                    raise ClientError("response_too_large", "Response exceeded the client size limit.")
                chunks, size = [], 0
                while True:
                    if time.monotonic() >= deadline:
                        raise ClientError("request_uncertain", "Response exceeded the client time budget; the request was not repeated.")
                    chunk = response.read(min(65536, MAX_BYTES + 1 - size))
                    if not chunk:
                        break
                    chunks.append(chunk)
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise ClientError("response_too_large", "Response exceeded the client size limit.")
                try:
                    data = json.loads(b"".join(chunks).decode("utf8"))
                except (ValueError, UnicodeError):
                    raise ClientError("invalid_response", "Gateway did not return valid JSON.") from None
                return {"data": data, "headers": {k.lower(): v for k, v in response.headers.items()}}
        except urllib.error.HTTPError as error:
            status, retry = error.code, error.headers.get("Retry-After")
            error.close()
            if 300 <= status < 400:
                raise ClientError("redirect_blocked", "The gateway redirected; no credential was forwarded.", status) from None
            if method == "GET" and attempt == 0 and status in (429, 502, 503, 504):
                try:
                    seconds = 1 if retry is None else float(retry) if retry.isdigit() else parsedate_to_datetime(retry).timestamp() - time.time()
                except (TypeError, ValueError, OverflowError):
                    seconds = -1
                if 0 <= seconds <= 30:
                    delay(max(1, seconds))
                    continue
            raise ClientError("http_error", f"Gateway returned HTTP {status}.", status) from None
        except ClientError:
            raise
        except Exception:
            raise ClientError("request_uncertain", "Request failed or timed out. It was not automatically repeated; the server may have processed it.") from None
    raise ClientError("http_error", "Request retry limit reached.")


def run_gateway(config, domains, request=None, delay=time.sleep):
    request = request or (lambda path, **kw: request_json(config, path, **kw))
    lock, next_start = threading.Lock(), [0.0]

    def inspect(domain):
        with lock:
            start = max(time.monotonic(), next_start[0])
            next_start[0] = start + config["interval_ms"] / 1000
        delay(max(0, start - time.monotonic()))
        try:
            data = request(config["endpoint"] + "?" + urllib.parse.urlencode({"domain": domain}))["data"]
            return {"domain": domain, "success": isinstance(data, dict) and data.get("success") is True, "result": data}
        except Exception as error:
            return {"domain": domain, "success": False, "error": error_json(error)}

    with concurrent.futures.ThreadPoolExecutor(max_workers=config["concurrency"]) as pool:
        items = list(pool.map(inspect, domains))
    return {"platform": config["platform"], "success": all(item["success"] for item in items), "complete": True, "items": items}


def valid_run(run):
    if not isinstance(run, dict) or not re.fullmatch(r"[A-Za-z0-9]{17}", run.get("id", "")) or run.get("actId", ACTOR_ID) != ACTOR_ID:
        raise ClientError("invalid_run", "Run does not match the expected Actor.")
    return run


def run_apify(config, domains, request=None, delay=time.sleep, now=time.monotonic):
    request = request or (lambda path, **kw: request_json(config, path, **kw))
    try:
        if config["resume_run"]:
            run = valid_run(request("/v2/actor-runs/" + config["resume_run"])["data"]["data"])
        else:
            query = urllib.parse.urlencode({"maxTotalChargeUsd": config["budget"], "restartOnError": "false"})
            run = valid_run(request(f"/v2/actors/{ACTOR_ID}/runs?{query}", method="POST", body={
                "domains": domains, "maxDomains": len(domains), "maxConcurrency": config["concurrency"], "maxRetries": 0, "includeRaw": False,
            })["data"]["data"])
    except Exception as error:
        if not config["resume_run"] and (not getattr(error, "status", None) or error.status >= 500):
            raise ClientError("run_start_uncertain", "Actor start outcome is uncertain. Inspect Apify Console for an existing run; do not start another run blindly.") from None
        raise
    deadline = now() + config["wait_seconds"]

    def state():
        return {"platform": "apify", "success": None, "complete": False, "run": {
            "id": run["id"], "status": run.get("status"), "dataset_id": run.get("defaultDatasetId")}, "items": None}

    try:
        while run.get("status") not in TERMINAL and now() < deadline:
            delay(min(2, max(0, deadline - now())))
            if now() >= deadline:
                break
            run = valid_run(request("/v2/actor-runs/" + run["id"])["data"]["data"])
        if run.get("status") not in TERMINAL:
            return state()
        if not re.fullmatch(r"[A-Za-z0-9]{17}", run.get("defaultDatasetId", "")):
            raise ClientError("dataset_missing", "The completed run has no readable dataset ID.")
        items, offset = [], 0
        while offset < 50000:
            page = request(f"/v2/datasets/{run['defaultDatasetId']}/items?format=json&clean=false&desc=false&offset={offset}&limit=500")
            if not isinstance(page["data"], list):
                raise ClientError("invalid_response", "Dataset response is not a JSON array.")
            items.extend(page["data"])
            offset += len(page["data"])
            if len(items) > 50000:
                raise ClientError("dataset_limit", "Dataset exceeded 50,000 rows.")
            raw_total = page.get("headers", {}).get("x-apify-pagination-total")
            total = int(raw_total) if raw_total is not None else None
            if total is not None and total > 50000:
                raise ClientError("dataset_limit", "Dataset exceeded 50,000 rows.")
            if total is not None:
                if offset >= total:
                    break
                if not page["data"]:
                    raise ClientError("pagination_error", "Dataset pagination stopped before its reported total.")
            elif len(page["data"]) < 500:
                break
        return {**state(), "success": run["status"] == "SUCCEEDED", "complete": True, "items": items}
    except Exception as error:
        return {**state(), "error": error_json(error)}


def main(argv=None, env=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("domains", nargs="*")
    for name in ("platform", "domains-file", "resume-run", "max-charge-usd"):
        parser.add_argument("--" + name)
    parser.add_argument("--endpoint", default="/v1/full-enrich")
    for name, default in (("concurrency", 1), ("interval-ms", 31000), ("wait-seconds", 60), ("timeout-ms", 12000)):
        parser.add_argument("--" + name, type=int, default=default)
    options = parser.parse_args(argv)
    values = list(options.domains)
    if options.domains_file:
        with open(options.domains_file, encoding="utf8") as stream:
            text = stream.read(12000001)
        if len(text) > 12000000:
            raise ClientError("input", "Input file is too large.")
        values.extend(text.splitlines())
    config = config_from(os.environ if env is None else env, options)
    domains = normalize_domains(values)
    if not domains and not config["resume_run"]:
        raise ClientError("input", "Supply domains or --domains-file.")
    if config["resume_run"] and domains:
        raise ClientError("input", "Resume accepts a run ID only; omit domains.")
    return run_apify(config, domains) if config["platform"] == "apify" else run_gateway(config, domains)


if __name__ == "__main__":
    try:
        output = main()
    except Exception as error:
        output = {"success": False, "error": error_json(error)}
    print(json.dumps(output, ensure_ascii=True, allow_nan=False, separators=(",", ":")))
    sys.exit(1 if output.get("success") is False or output.get("error") else 0)
