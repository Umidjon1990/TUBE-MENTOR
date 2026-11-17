// Sinfxona fayllari (o'quvchi audiolari, Zoom yozuvlari) uchun S3-mos bucket.
// Bucket sozlanmagan bo'lsa (test/dev) kichik fayllar Postgres'dagi cls_blobs jadvalida saqlanadi;
// katta Zoom yozuvlari esa faqat bucket bilan ishlaydi.
import { createHash, createHmac } from "node:crypto";
import { request as httpsRequest } from "node:https";
import type { Readable } from "node:stream";
import { pool } from "./db";

type Conf = { endpoint: string; bucket: string; region: string; key: string; secret: string; virtualHost: boolean };

export function classBucket(env = process.env): Conf | null {
  const endpoint = (env.CLASS_BUCKET_ENDPOINT || "").replace(/\/$/, "");
  const bucket = env.CLASS_BUCKET_NAME || "";
  const key = env.CLASS_BUCKET_ACCESS_KEY_ID || "";
  const secret = env.CLASS_BUCKET_SECRET_ACCESS_KEY || "";
  if (!/^https:\/\//.test(endpoint) || !bucket || !key || !secret) return null;
  return {
    endpoint,
    bucket,
    key,
    secret,
    region: env.CLASS_BUCKET_REGION || "auto",
    virtualHost: (env.CLASS_BUCKET_URL_STYLE || "").toLowerCase().startsWith("virtual"),
  };
}

const sha = (v: Buffer | string) => createHash("sha256").update(v).digest("hex");
const hmac = (k: Buffer | string, v: string) => createHmac("sha256", k).update(v).digest();
const enc = (v: string) => encodeURIComponent(v).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

function target(conf: Conf, objectKey: string) {
  const base = new URL(conf.endpoint);
  const encodedKey = objectKey.split("/").map(enc).join("/");
  const host = conf.virtualHost ? `${conf.bucket}.${base.host}` : base.host;
  const path = conf.virtualHost ? `/${encodedKey}` : `/${enc(conf.bucket)}/${encodedKey}`;
  return { host, path, origin: `${base.protocol}//${host}` };
}
function stamp(now = new Date()) {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate, day: amzDate.slice(0, 8) };
}
function signingKey(conf: Conf, day: string) {
  return hmac(hmac(hmac(hmac("AWS4" + conf.secret, day), conf.region), "s3"), "aws4_request");
}
function authorize(conf: Conf, method: string, objectKey: string, payloadHash: string, extra: Record<string, string> = {}) {
  const { host, path, origin } = target(conf, objectKey);
  const { amzDate, day } = stamp();
  const headers: Record<string, string> = { host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate, ...extra };
  const names = Object.keys(headers).sort();
  const canonical = [method, path, "", names.map((n) => `${n}:${headers[n]}\n`).join(""), names.join(";"), payloadHash].join("\n");
  const scope = `${day}/${conf.region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha(canonical)].join("\n");
  const signature = createHmac("sha256", signingKey(conf, day)).update(toSign).digest("hex");
  const { host: _h, ...sent } = headers;
  return {
    url: origin + path,
    headers: { ...sent, authorization: `AWS4-HMAC-SHA256 Credential=${conf.key}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}` },
  };
}

async function s3(conf: Conf, method: "PUT" | "GET" | "DELETE", objectKey: string, body?: Buffer, contentType?: string) {
  const a = authorize(conf, method, objectKey, sha(body || ""), contentType ? { "content-type": contentType } : {});
  const response = await fetch(a.url, { method, headers: a.headers, body: body ? new Uint8Array(body) : undefined, signal: AbortSignal.timeout(120000) });
  if (!response.ok && !(method === "DELETE" && response.status === 404)) throw new Error(`Bucket ${method} ${response.status}`);
  return response;
}

/** Katta faylni (Zoom yozuvi) xotiraga yuklamasdan oqim sifatida yuklash. */
function s3PutStream(conf: Conf, objectKey: string, stream: Readable, length: number, contentType: string) {
  const a = authorize(conf, "PUT", objectKey, "UNSIGNED-PAYLOAD", { "content-type": contentType, "content-length": String(length) });
  return new Promise<void>((resolve, reject) => {
    const req = httpsRequest(a.url, { method: "PUT", headers: a.headers, timeout: 30 * 60000 }, (res) => {
      res.resume();
      res.on("end", () => ((res.statusCode || 500) < 300 ? resolve() : reject(new Error(`Bucket PUT ${res.statusCode}`))));
    });
    req.on("timeout", () => req.destroy(new Error("Bucket upload timeout")));
    req.on("error", reject);
    stream.on("error", (e) => req.destroy(e));
    stream.pipe(req);
  });
}

/** Brauzer to'g'ridan-to'g'ri o'qishi uchun vaqtinchalik imzolangan havola (SigV4 query). */
export function presign(conf: Conf, objectKey: string, seconds = 3600, now = new Date()) {
  const { host, path, origin } = target(conf, objectKey);
  const { amzDate, day } = stamp(now);
  const scope = `${day}/${conf.region}/s3/aws4_request`;
  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${conf.key}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(Math.min(Math.max(seconds, 60), 604800)),
    "X-Amz-SignedHeaders": "host",
  };
  const qs = Object.keys(query).sort().map((k) => `${enc(k)}=${enc(query[k])}`).join("&");
  const canonical = ["GET", path, qs, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha(canonical)].join("\n");
  const signature = createHmac("sha256", signingKey(conf, day)).update(toSign).digest("hex");
  return `${origin}${path}?${qs}&X-Amz-Signature=${signature}`;
}

export type ClassStore = {
  put(key: string, data: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<{ data: Buffer; mime: string } | null>;
  remove(key: string): Promise<void>;
  putStream?(key: string, stream: Readable, length: number, mime: string): Promise<void>;
  url?(key: string, seconds?: number): string;
};

const dbStore: ClassStore = {
  async put(key, data, mime) {
    await pool.query("INSERT INTO cls_blobs(key,mime,data) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET mime=$2,data=$3", [key, mime, data]);
  },
  async get(key) {
    const r = (await pool.query("SELECT mime,data FROM cls_blobs WHERE key=$1", [key])).rows[0];
    return r ? { data: Buffer.from(r.data), mime: r.mime } : null;
  },
  async remove(key) {
    await pool.query("DELETE FROM cls_blobs WHERE key=$1", [key]);
  },
};

function bucketStore(conf: Conf): ClassStore {
  return {
    async put(key, data, mime) {
      await s3(conf, "PUT", key, data, mime);
    },
    async get(key) {
      const r = await s3(conf, "GET", key).catch((e) => {
        if (/ 404$/.test(String(e.message))) return null;
        throw e;
      });
      if (!r) return null;
      return { data: Buffer.from(await r.arrayBuffer()), mime: r.headers.get("content-type") || "application/octet-stream" };
    },
    async remove(key) {
      await s3(conf, "DELETE", key);
    },
    putStream: (key, stream, length, mime) => s3PutStream(conf, key, stream, length, mime),
    url: (key, seconds) => presign(conf, key, seconds),
  };
}

let override: ClassStore | undefined;
export function setClassStore(store: ClassStore | undefined) {
  override = store;
}
export function classStore(): ClassStore {
  if (override) return override;
  const conf = classBucket();
  return conf ? bucketStore(conf) : dbStore;
}
