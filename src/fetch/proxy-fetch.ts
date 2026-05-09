import { request as httpRequest, type IncomingMessage } from "node:http";
import { connect as tlsConnect } from "node:tls";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_REDIRECT_LIMIT = 10;

type HeaderRecord = Record<string, string>;

interface ProxyResponse {
  status: number;
  statusText: string;
  headers: HeaderRecord;
  body: Buffer;
}

function envProxyForUrl(targetUrl: URL): URL | null {
  const raw = targetUrl.protocol === "https:"
    ? process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY || process.env.all_proxy
    : process.env.HTTP_PROXY || process.env.http_proxy || process.env.ALL_PROXY || process.env.all_proxy;
  if (!raw || noProxyMatches(targetUrl.hostname)) {
    return null;
  }
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function noProxyMatches(hostname: string): boolean {
  const raw = process.env.NO_PROXY ?? process.env.no_proxy ?? "";
  if (!raw) return false;
  const host = hostname.toLowerCase();
  return raw.split(",").map((entry) => entry.trim().toLowerCase()).some((entry) => {
    if (!entry) return false;
    if (entry === "*") return true;
    if (entry.startsWith(".")) return host === entry.slice(1) || host.endsWith(entry);
    return host === entry || host.endsWith(`.${entry}`);
  });
}

function headersToRecord(headers: HeadersInit | undefined): HeaderRecord {
  const record: HeaderRecord = {};
  if (!headers) return record;
  new Headers(headers).forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

function responseHeaders(headers: IncomingMessage["headers"]): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) result.append(key, item);
    } else if (value !== undefined) {
      result.set(key, String(value));
    }
  }
  return result;
}

async function bodyToBuffer(body: RequestInit["body"]): Promise<Buffer | undefined> {
  if (body === undefined || body === null) return undefined;
  if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) {
    throw new Error("proxy-aware fetch does not support streaming request bodies");
  }
  if (typeof body === "string") return Buffer.from(body);
  if (body instanceof URLSearchParams) return Buffer.from(body.toString());
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  if (typeof Blob !== "undefined" && body instanceof Blob) return Buffer.from(await body.arrayBuffer());
  throw new Error("proxy-aware fetch only supports buffered request bodies");
}

function collectResponse(res: IncomingMessage, done: (error: Error | null, response?: ProxyResponse) => void): void {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer | string) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  res.on("end", () => {
    done(null, {
      status: res.statusCode ?? 0,
      statusText: res.statusMessage ?? "",
      headers: Object.fromEntries(responseHeaders(res.headers) as unknown as Iterable<[string, string]>),
      body: Buffer.concat(chunks),
    });
  });
  res.on("error", (error) => done(error));
}

function proxyAuthorization(proxy: URL): string | undefined {
  if (!proxy.username) return undefined;
  return `Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString("base64")}`;
}

function requestViaHttpProxy(targetUrl: URL, proxy: URL, method: string, headers: HeaderRecord, body: Buffer | undefined, signal: AbortSignal | undefined): Promise<ProxyResponse> {
  if (proxy.protocol !== "http:") {
    throw new Error(`Unsupported proxy protocol: ${proxy.protocol}`);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let active: { destroy: (error?: Error) => void } | null = null;
    const done = (error: Error | null, response?: ProxyResponse) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else if (response) resolve(response);
      else reject(new Error("Proxy request ended without a response"));
    };
    const abort = () => active?.destroy(new Error("The operation was aborted"));
    if (signal?.aborted) {
      done(new Error("The operation was aborted"));
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });

    const targetPort = targetUrl.port ? Number(targetUrl.port) : targetUrl.protocol === "https:" ? 443 : 80;
    const proxyPort = proxy.port ? Number(proxy.port) : 8080;
    const auth = proxyAuthorization(proxy);
    const requestHeaders: HeaderRecord = {
      ...headers,
      host: targetUrl.host,
    };
    if (body && !Object.keys(requestHeaders).some((key) => key.toLowerCase() === "content-length")) {
      requestHeaders["content-length"] = String(body.byteLength);
    }

    if (targetUrl.protocol === "https:") {
      const connectHeaders: HeaderRecord = { host: `${targetUrl.hostname}:${targetPort}` };
      if (auth) connectHeaders["proxy-authorization"] = auth;
      const connectReq = httpRequest({
        host: proxy.hostname,
        port: proxyPort,
        method: "CONNECT",
        path: `${targetUrl.hostname}:${targetPort}`,
        headers: connectHeaders,
      });
      active = connectReq;
      connectReq.on("connect", (connectRes, socket) => {
        if (connectRes.statusCode !== 200) {
          socket.destroy();
          done(new Error(`Proxy CONNECT failed: ${connectRes.statusCode ?? 0}`));
          return;
        }
        const tlsSocket = tlsConnect({ socket, host: targetUrl.hostname, servername: targetUrl.hostname });
        active = tlsSocket;
        tlsSocket.on("error", (error) => done(error));
        tlsSocket.on("secureConnect", () => {
          const req = httpRequest({
            method,
            path: `${targetUrl.pathname}${targetUrl.search}`,
            headers: requestHeaders,
            createConnection: () => tlsSocket,
          }, (res) => collectResponse(res, done));
          active = req;
          req.on("error", (error) => done(error));
          if (body) req.write(body);
          req.end();
        });
      });
      connectReq.on("error", (error) => done(error));
      connectReq.end();
      return;
    }

    if (auth) requestHeaders["proxy-authorization"] = auth;
    const req = httpRequest({
      host: proxy.hostname,
      port: proxyPort,
      method,
      path: targetUrl.href,
      headers: requestHeaders,
    }, (res) => collectResponse(res, done));
    active = req;
    req.on("error", (error) => done(error));
    if (body) req.write(body);
    req.end();
  });
}

function requestUrl(input: RequestInfo | URL): URL {
  if (input instanceof URL) return input;
  if (typeof input === "string") return new URL(input);
  return new URL(input.url);
}

function requestMethod(input: RequestInfo | URL, init: RequestInit): string {
  if (init.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

function requestHeaders(input: RequestInfo | URL, init: RequestInit): HeaderRecord {
  return {
    ...(input instanceof Request ? headersToRecord(input.headers) : {}),
    ...headersToRecord(init.headers),
  };
}

async function proxyAwareFetchInternal(input: RequestInfo | URL, init: RequestInit, redirectsLeft: number): Promise<Response> {
  const url = requestUrl(input);
  const proxy = envProxyForUrl(url);
  if (!proxy) {
    return fetch(input, init);
  }

  const method = requestMethod(input, init);
  const headers = requestHeaders(input, init);
  const body = await bodyToBuffer(init.body ?? (input instanceof Request ? input.body : undefined));
  const proxied = await requestViaHttpProxy(url, proxy, method, headers, body, init.signal ?? undefined);
  const location = proxied.headers.location;
  const redirectMode = init.redirect ?? "follow";
  if (redirectMode !== "manual" && REDIRECT_STATUSES.has(proxied.status) && location && redirectsLeft > 0) {
    const nextUrl = new URL(location, url);
    const nextInit = { ...init };
    if (proxied.status === 303) {
      nextInit.method = "GET";
      nextInit.body = undefined;
    }
    return proxyAwareFetchInternal(nextUrl, nextInit, redirectsLeft - 1);
  }

  return new Response(new Uint8Array(proxied.body), {
    status: proxied.status,
    statusText: proxied.statusText,
    headers: proxied.headers,
  });
}

export async function proxyAwareFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  return proxyAwareFetchInternal(input, init, DEFAULT_REDIRECT_LIMIT);
}
