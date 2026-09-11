import { lookup } from "node:dns/promises";
import https from "node:https";
import ipaddr from "ipaddr.js";
export function isPublicAddress(value) {
  try {
    const ip = ipaddr.process(value);
    return ip.range() === "unicast";
  } catch {
    return false;
  }
}
export function checkedUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    !url.hostname.includes(".") ||
    /\.(local|internal|localhost)$/i.test(url.hostname)
  )
    throw Object.assign(
      new Error("Only public HTTPS resources are supported."),
      { code: "url" },
    );
  return url;
}
export async function fetchResource(
  value,
  { maxBytes = 64 * 1024 * 1024, resolve = lookup, transport = https.get } = {},
) {
  let url = checkedUrl(value);
  const deadline = Date.now() + 30000;
  for (let redirects = 0; redirects <= 5; redirects++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0)
      throw Object.assign(new Error("Provider timed out."), {
        code: "timeout",
      });
    let dnsTimer;
    let addresses;
    try {
      addresses = await Promise.race([
        resolve(url.hostname, { all: true, verbatim: true }),
        new Promise((_, reject) => {
          dnsTimer = setTimeout(
            () =>
              reject(
                Object.assign(new Error("DNS timed out."), { code: "timeout" }),
              ),
            remaining,
          );
        }),
      ]);
    } finally {
      clearTimeout(dnsTimer);
    }
    if (!addresses.length || addresses.some((x) => !isPublicAddress(x.address)))
      throw Object.assign(new Error("Non-public destination blocked."), {
        code: "url",
      });
    const address = addresses[0];
    const result = await new Promise((resolveResult, reject) => {
      const request = transport(
        url,
        {
          agent: false,
          lookup: (_host, options, done) =>
            options?.all
              ? done(null, [address])
              : done(null, address.address, address.family),
          headers: { Accept: "*/*", "Accept-Encoding": "identity" },
        },
        (response) => {
          const status = response.statusCode;
          if ([301, 302, 303, 307, 308].includes(status)) {
            response.resume();
            resolveResult({ redirect: response.headers.location });
            return;
          }
          if (status < 200 || status >= 300) {
            response.resume();
            reject(
              Object.assign(new Error(`Provider returned HTTP ${status}.`), {
                code: "transport",
                status,
              }),
            );
            return;
          }
          if (Number(response.headers["content-length"]) > maxBytes) {
            response.destroy();
            reject(
              Object.assign(new Error("Resource exceeds capture limit."), {
                code: "size",
              }),
            );
            return;
          }
          let size = 0;
          const chunks = [];
          response.on("data", (chunk) => {
            size += chunk.length;
            if (size > maxBytes)
              request.destroy(
                Object.assign(new Error("Resource exceeds capture limit."), {
                  code: "size",
                }),
              );
            else chunks.push(chunk);
          });
          response.on("error", reject);
          response.on("end", () =>
            resolveResult({
              bytes: Buffer.concat(chunks),
              finalUrl: url.href,
              status,
              mediaType:
                response.headers["content-type"] || "application/octet-stream",
              etag: response.headers.etag,
              lastModified: response.headers["last-modified"],
              retrievedAt: new Date().toISOString(),
            }),
          );
        },
      );
      const timer = setTimeout(
        () =>
          request.destroy(
            Object.assign(new Error("Provider timed out."), {
              code: "timeout",
            }),
          ),
        Math.max(1, deadline - Date.now()),
      );
      request.on("close", () => clearTimeout(timer));
      request.on("error", reject);
    });
    if ("redirect" in result) {
      if (!result.redirect) throw new Error("Invalid redirect.");
      url = checkedUrl(new URL(result.redirect, url).href);
      continue;
    }
    return result;
  }
  throw new Error("Too many redirects.");
}
