// Jonli darslar (Zoom): o'qituvchi dars yaratadi → Zoom'da uchrashuv ochiladi (bulutga avtomatik yozib olish),
// o'quvchi saytning o'zida (Meeting SDK) qo'shiladi, davomat yoziladi. Dars tugagach Zoom yozuvi
// bizning bucket'ga ko'chiriladi va Zoom'dagi nusxa savatga tashlanadi (Zoom xotirasi to'lib qolmaydi).
import type { Express, Request } from "express";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";
import { z } from "zod";
import { pool } from "./db";
import { requireAuth } from "./auth";
import { ClassError, membership, needGroup, notifyGroup, requireStaff, route, uuid } from "./classroom";
import { classStore } from "./class-storage";

const fail = (status: number, message: string): never => {
  throw new ClassError(status, message);
};
const userOf = (req: Request) => String(req.session.userId);

export function zoomConfig(env = process.env) {
  const c = {
    accountId: env.ZOOM_ACCOUNT_ID || "",
    clientId: env.ZOOM_CLIENT_ID || "",
    clientSecret: env.ZOOM_CLIENT_SECRET || "",
    sdkKey: env.ZOOM_SDK_KEY || "",
    sdkSecret: env.ZOOM_SDK_SECRET || "",
    webhookSecret: env.ZOOM_WEBHOOK_SECRET || "",
  };
  return {
    ...c,
    api: Boolean(c.accountId && c.clientId && c.clientSecret),
    sdk: Boolean(c.sdkKey && c.sdkSecret),
    webhook: Boolean(c.webhookSecret),
  };
}

/* ---------------- Zoom REST (Server-to-Server OAuth) ---------------- */
type ZoomApi = (method: string, path: string, body?: unknown) => Promise<any>;
let tokenCache: { token: string; expires: number } | undefined;
async function zoomToken() {
  if (tokenCache && tokenCache.expires > Date.now() + 60000) return tokenCache.token;
  const c = zoomConfig();
  const response = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(c.accountId)}`, {
    method: "POST",
    headers: { authorization: "Basic " + Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64") },
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  const data = response ? await response.json().catch(() => null) : null;
  if (!response?.ok || !data?.access_token) throw new ClassError(502, "Zoom bilan ulanib bo‘lmadi (kalitlarni tekshiring)");
  tokenCache = { token: data.access_token, expires: Date.now() + Number(data.expires_in || 3600) * 1000 };
  return tokenCache.token;
}
const realApi: ZoomApi = async (method, path, body) => {
  const response = await fetch("https://api.zoom.us/v2" + path, {
    method,
    headers: { authorization: `Bearer ${await zoomToken()}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  }).catch(() => null);
  if (!response) throw new ClassError(502, "Zoom javob bermadi");
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new ClassError(response.status === 404 ? 404 : 502, "Zoom so‘rovi bajarilmadi");
    (error as any).zoomStatus = response.status;
    throw error;
  }
  return data;
};
let api: ZoomApi = realApi;
type Downloader = (url: string, bearer: string) => Promise<{ stream: Readable; length: number; type: string }>;
const realDownload: Downloader = async (url, bearer) => {
  const response = await fetch(url, { headers: { authorization: `Bearer ${bearer}` }, redirect: "follow", signal: AbortSignal.timeout(30 * 60000) });
  if (!response.ok || !response.body) throw new Error(`Recording download ${response.status}`);
  const length = Number(response.headers.get("content-length") || 0);
  return { stream: Readable.fromWeb(response.body as any), length, type: response.headers.get("content-type") || "video/mp4" };
};
let download: Downloader = realDownload;
/** Testlar uchun Zoom'ga chiqmaslik. */
export function setZoomTransport(next: { api?: ZoomApi; download?: Downloader } | undefined) {
  api = next?.api || realApi;
  download = next?.download || realDownload;
}

/* ---------------- Meeting SDK imzosi (HS256 JWT) ---------------- */
const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");
export function sdkSignature(meetingNumber: string, role: 0 | 1, now = Date.now()) {
  const c = zoomConfig();
  if (!c.sdk) throw new ClassError(503, "Zoom hali ulanmagan");
  const iat = Math.floor(now / 1000) - 30;
  const exp = iat + 2 * 3600;
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ appKey: c.sdkKey, sdkKey: c.sdkKey, mn: meetingNumber, role, iat, exp, tokenExp: exp, video_webrtc_mode: 1 }));
  const sig = createHmac("sha256", c.sdkSecret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

/* ---------------- Yozuvni bucket'ga ko'chirish ---------------- */
const zoomUuidPath = (u: string) => (u.startsWith("/") || u.includes("//") ? encodeURIComponent(encodeURIComponent(u)) : encodeURIComponent(u));
function pickRecording(files: any[]) {
  const mp4 = (files || []).filter((f) => String(f.file_type).toUpperCase() === "MP4" && f.download_url && f.status !== "processing");
  const order = ["shared_screen_with_speaker_view", "shared_screen_with_speaker_view(CC)", "active_speaker", "shared_screen_with_gallery_view", "gallery_view", "shared_screen"];
  return mp4.sort((a, b) => (order.indexOf(a.recording_type) + 99) % 99 - ((order.indexOf(b.recording_type) + 99) % 99))[0];
}
export async function importRecording(sessionId: string, files: any[], downloadToken: string | null, meetingUuid?: string) {
  const s = (await pool.query("SELECT * FROM cls_live_sessions WHERE id=$1", [sessionId])).rows[0];
  if (!s || s.recording_state === "ready") return;
  const file = pickRecording(files);
  if (!file) {
    await pool.query("UPDATE cls_live_sessions SET recording_state='failed', recording_error='Zoom’da MP4 yozuv topilmadi' WHERE id=$1", [sessionId]);
    return;
  }
  const store = classStore();
  if (!store.putStream) {
    await pool.query("UPDATE cls_live_sessions SET recording_state='failed', recording_error='Fayl ombori (bucket) sozlanmagan' WHERE id=$1", [sessionId]);
    return;
  }
  await pool.query("UPDATE cls_live_sessions SET recording_state='processing', recording_error=NULL WHERE id=$1", [sessionId]);
  try {
    const bearer = downloadToken || (await zoomToken());
    const got = await download(String(file.download_url), bearer);
    const length = got.length || Number(file.file_size || 0);
    if (!length) throw new Error("Unknown recording size");
    const key = `class/recordings/${s.group_id}/${sessionId}.mp4`;
    await store.putStream(key, got.stream, length, "video/mp4");
    await pool.query("UPDATE cls_live_sessions SET recording_key=$2, recording_state='ready', recording_error=NULL WHERE id=$1", [sessionId, key]);
    // Zoom bulutidagi nusxa savatga (30 kun ichida tiklash mumkin) — joy bo'shaydi.
    const target = meetingUuid || s.zoom_uuid;
    if (target) await api("DELETE", `/meetings/${zoomUuidPath(target)}/recordings?action=trash`).catch(() => undefined);
    await notifyGroup(s.group_id, { title: "Dars yozuvi tayyor", body: s.title, path: "jonli", ref: `rec-${sessionId}` });
  } catch {
    await pool.query("UPDATE cls_live_sessions SET recording_state='failed', recording_error='Yozuvni ko‘chirishda xato. Qayta urinib ko‘ring' WHERE id=$1", [sessionId]);
  }
}

/* ---------------- Webhook ---------------- */
export function verifyZoomWebhook(rawBody: Buffer | undefined, timestamp: string, signature: string, secret: string, now = Date.now()) {
  if (!rawBody || !/^\d{9,13}$/.test(timestamp)) return false;
  const ts = Number(timestamp) * (timestamp.length > 10 ? 1 : 1000);
  if (Math.abs(now - ts) > 5 * 60000) return false;
  const expected = Buffer.from("v0=" + createHmac("sha256", secret).update(`v0:${timestamp}:${rawBody.toString("utf8")}`).digest("hex"));
  const given = Buffer.from(signature || "");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

const liveSchema = z.object({
  title: z.string().trim().min(1).max(200),
  startsAt: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(10).max(300).default(60),
  lessonId: uuid.nullable().optional(),
});
const zoomTime = (iso: string) => new Date(iso).toISOString().replace(/\.\d{3}Z$/, "Z");
const TASHKENT = 5 * 3600e3;
const localTime = (d: Date | string) => {
  const t = new Date(new Date(d).getTime() + TASHKENT).toISOString();
  return `${t.slice(8, 10)}.${t.slice(5, 7)} soat ${t.slice(11, 16)}`;
};

function publicSession(s: any) {
  return {
    id: s.id,
    title: s.title,
    startsAt: s.starts_at,
    durationMinutes: s.duration_minutes,
    status: s.status,
    lessonId: s.lesson_id,
    recording: s.recording_state,
    recordingError: s.recording_error || null,
    attended: s.attended ?? undefined,
    attendance: s.attendance ?? undefined,
  };
}

export function registerClassZoom(app: Express) {
  const P = "/api/platform/class";

  app.get(P + "/admin/zoom/status", requireStaff, route(async () => {
    const c = zoomConfig();
    return { api: c.api, sdk: c.sdk, webhook: c.webhook, storage: Boolean(classStore().putStream) };
  }));

  /* ---------- O'qituvchi ---------- */
  app.get(P + "/admin/groups/:id/live", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    await needGroup(id, userOf(req), "view");
    const rows = (
      await pool.query(
        `SELECT s.*, (SELECT count(*)::int FROM cls_attendance a WHERE a.session_id=s.id) AS attendance
           FROM cls_live_sessions s WHERE s.group_id=$1 ORDER BY s.starts_at DESC LIMIT 200`,
        [id],
      )
    ).rows;
    return { sessions: rows.map(publicSession), zoom: zoomConfig().api && zoomConfig().sdk };
  }));
  app.post(P + "/admin/groups/:id/live", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    const b = liveSchema.parse(req.body);
    const { group: g } = await needGroup(id, userOf(req));
    if (b.lessonId && !(await pool.query("SELECT 1 FROM cls_lessons WHERE id=$1 AND course_id=$2", [b.lessonId, g.course_id])).rowCount) fail(400, "Dars bu kursga tegishli emas");
    if (!zoomConfig().api) fail(503, "Zoom hali ulanmagan. Sozlamalarga Zoom kalitlarini kiriting");
    const password = String(randomInt(100000, 999999));
    const meeting = await api("POST", "/users/me/meetings", {
      topic: `${g.name}: ${b.title}`.slice(0, 200),
      type: 2,
      start_time: zoomTime(b.startsAt),
      duration: b.durationMinutes,
      timezone: "Asia/Tashkent",
      password,
      settings: {
        join_before_host: false,
        waiting_room: false,
        mute_upon_entry: true,
        host_video: true,
        participant_video: false,
        auto_recording: "cloud",
        approval_type: 2,
        meeting_authentication: false,
      },
    });
    const s = (
      await pool.query(
        `INSERT INTO cls_live_sessions(group_id,lesson_id,title,starts_at,duration_minutes,zoom_meeting_id,zoom_password,join_url)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [id, b.lessonId || null, b.title, b.startsAt, b.durationMinutes, String(meeting.id), meeting.password || password, meeting.join_url || null],
      )
    ).rows[0];
    await notifyGroup(id, { title: "Jonli dars rejalashtirildi", body: `${b.title} — ${localTime(b.startsAt)}`, path: "jonli", ref: `live-new-${s.id}` });
    return { session: publicSession(s) };
  }));
  app.patch(P + "/admin/live/:id", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    const b = liveSchema.partial().parse(req.body);
    const s = (await pool.query("SELECT * FROM cls_live_sessions WHERE id=$1", [id])).rows[0] || fail(404, "Jonli dars topilmadi");
    await needGroup(s.group_id, userOf(req));
    if (s.status !== "scheduled") fail(409, "Boshlangan yoki tugagan darsni o‘zgartirib bo‘lmaydi");
    if (s.zoom_meeting_id && (b.startsAt || b.durationMinutes || b.title))
      await api("PATCH", `/meetings/${s.zoom_meeting_id}`, {
        ...(b.title ? { topic: b.title } : {}),
        ...(b.startsAt ? { start_time: zoomTime(b.startsAt), timezone: "Asia/Tashkent" } : {}),
        ...(b.durationMinutes ? { duration: b.durationMinutes } : {}),
      });
    const u = (
      await pool.query(
        `UPDATE cls_live_sessions SET title=COALESCE($2,title), starts_at=COALESCE($3,starts_at), duration_minutes=COALESCE($4,duration_minutes),
                reminded_at=CASE WHEN $3::timestamptz IS NULL THEN reminded_at ELSE NULL END
          WHERE id=$1 RETURNING *`,
        [id, b.title ?? null, b.startsAt ?? null, b.durationMinutes ?? null],
      )
    ).rows[0];
    if (b.startsAt) await notifyGroup(u.group_id, { title: "Jonli dars vaqti o‘zgardi", body: `${u.title} — ${localTime(u.starts_at)}`, path: "jonli", ref: `live-move-${id}-${Date.now()}` });
    return { session: publicSession(u) };
  }));
  app.delete(P + "/admin/live/:id", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    const s = (await pool.query("SELECT * FROM cls_live_sessions WHERE id=$1", [id])).rows[0] || fail(404, "Jonli dars topilmadi");
    await needGroup(s.group_id, userOf(req));
    if (s.status === "ended") fail(409, "Tugagan darsni bekor qilib bo‘lmaydi");
    if (s.zoom_meeting_id) await api("DELETE", `/meetings/${s.zoom_meeting_id}`).catch((e: any) => (e?.zoomStatus === 404 ? null : Promise.reject(e)));
    await pool.query("UPDATE cls_live_sessions SET status='cancelled' WHERE id=$1", [id]);
    await notifyGroup(s.group_id, { title: "Jonli dars bekor qilindi", body: `${s.title} — ${localTime(s.starts_at)}`, path: "jonli", ref: `live-cancel-${id}`, urgent: true });
  }));
  /** O'qituvchi darsni saytning o'zida boshlaydi (host). */
  app.post(P + "/admin/live/:id/start", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    const s = (await pool.query("SELECT * FROM cls_live_sessions WHERE id=$1", [id])).rows[0] || fail(404, "Jonli dars topilmadi");
    await needGroup(s.group_id, userOf(req));
    if (s.status === "cancelled") fail(409, "Bu dars bekor qilingan");
    const zak = (await api("GET", "/users/me/token?type=zak"))?.token;
    const meeting = await api("GET", `/meetings/${s.zoom_meeting_id}`).catch(() => null);
    const name = (await pool.query("SELECT full_name FROM users WHERE id=$1", [userOf(req)])).rows[0]?.full_name || "O‘qituvchi";
    return {
      signature: sdkSignature(String(s.zoom_meeting_id), 1),
      meetingNumber: String(s.zoom_meeting_id),
      password: s.zoom_password || "",
      zak,
      userName: name,
      startUrl: meeting?.start_url || null,
      title: s.title,
      groupId: s.group_id,
    };
  }));
  app.get(P + "/admin/live/:id/attendance", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    const s = (await pool.query("SELECT group_id FROM cls_live_sessions WHERE id=$1", [id])).rows[0] || fail(404, "Jonli dars topilmadi");
    await needGroup(s.group_id, userOf(req), "view");
    return {
      people: (
        await pool.query(
          `SELECT m.user_id, COALESCE(NULLIF(m.display_name,''),u.full_name) AS name, a.joined_at
             FROM cls_members m JOIN users u ON u.id=m.user_id LEFT JOIN cls_attendance a ON a.session_id=$1 AND a.user_id=m.user_id
            WHERE m.group_id=$2 AND m.status='active' ORDER BY a.joined_at NULLS LAST, name`,
          [id, s.group_id],
        )
      ).rows,
    };
  }));
  app.post(P + "/admin/live/:id/recording/retry", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    const s = (await pool.query("SELECT * FROM cls_live_sessions WHERE id=$1", [id])).rows[0] || fail(404, "Jonli dars topilmadi");
    await needGroup(s.group_id, userOf(req));
    const rec = await api("GET", `/meetings/${zoomUuidPath(s.zoom_uuid || s.zoom_meeting_id)}/recordings`).catch(() => null);
    if (!rec?.recording_files?.length) fail(404, "Zoom’da bu dars yozuvi topilmadi");
    importRecording(id, rec.recording_files, null, rec.uuid).catch(() => undefined);
    return { ok: true, state: "processing" };
  }));

  /* ---------- O'quvchi ---------- */
  app.get(P + "/groups/:id/live", requireAuth, route(async (req) => {
    const id = uuid.parse(req.params.id), me = userOf(req);
    const { teacher } = await membership(id, me);
    const rows = (
      await pool.query(
        `SELECT s.*, EXISTS(SELECT 1 FROM cls_attendance a WHERE a.session_id=s.id AND a.user_id=$2) AS attended
           FROM cls_live_sessions s WHERE s.group_id=$1 AND s.status<>'cancelled' ORDER BY s.starts_at`,
        [id, me],
      )
    ).rows;
    const now = Date.now();
    const endOf = (s: any) => new Date(s.starts_at).getTime() + s.duration_minutes * 60000;
    const upcoming = rows.filter((s) => s.status !== "ended" && endOf(s) + 3600e3 > now);
    const past = rows.filter((s) => !upcoming.includes(s)).reverse();
    return {
      teacher,
      zoomReady: zoomConfig().sdk,
      upcoming: upcoming.map((s) => ({ ...publicSession(s), canJoin: s.status === "live" || new Date(s.starts_at).getTime() - 15 * 60000 <= now })),
      past: past.map((s) => ({ ...publicSession(s), hasRecording: s.recording_state === "ready" })),
    };
  }));
  app.post(P + "/live/:id/join", requireAuth, route(async (req) => {
    const id = uuid.parse(req.params.id), me = userOf(req);
    const s = (await pool.query("SELECT * FROM cls_live_sessions WHERE id=$1", [id])).rows[0] || fail(404, "Jonli dars topilmadi");
    const { teacher, member } = await membership(s.group_id, me);
    if (s.status === "cancelled") fail(409, "Bu dars bekor qilingan");
    const now = Date.now(), start = new Date(s.starts_at).getTime();
    if (!teacher && s.status !== "live") {
      if (now < start - 15 * 60000) fail(409, `Dars ${localTime(s.starts_at)} da boshlanadi. 15 daqiqa oldin kirish ochiladi`);
      if (s.status === "ended" || now > start + (s.duration_minutes + 60) * 60000) fail(409, "Bu dars tugagan. Yozuvini keyinroq ko‘rishingiz mumkin");
    }
    if (!teacher) await pool.query("INSERT INTO cls_attendance(session_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [id, me]);
    const u = (await pool.query("SELECT full_name FROM users WHERE id=$1", [me])).rows[0];
    return {
      signature: sdkSignature(String(s.zoom_meeting_id), 0),
      meetingNumber: String(s.zoom_meeting_id),
      password: s.zoom_password || "",
      userName: (member?.display_name || u?.full_name || "O‘quvchi").slice(0, 60),
      joinUrl: s.join_url,
      title: s.title,
      groupId: s.group_id,
    };
  }));
  app.get(P + "/live/:id/recording", requireAuth, route(async (req) => {
    const id = uuid.parse(req.params.id), me = userOf(req);
    const s = (await pool.query("SELECT * FROM cls_live_sessions WHERE id=$1", [id])).rows[0] || fail(404, "Jonli dars topilmadi");
    await membership(s.group_id, me);
    if (s.recording_state !== "ready" || !s.recording_key) fail(404, "Yozuv hali tayyor emas");
    const store = classStore();
    if (!store.url) fail(503, "Yozuvlar ombori sozlanmagan");
    return { url: store.url!(s.recording_key, 4 * 3600), title: s.title, startsAt: s.starts_at };
  }));

  /* ---------- Zoom webhook (Zoom serveridan) ---------- */
  app.post("/api/zoom/webhook", async (req, res) => {
    const c = zoomConfig();
    const body = req.body || {};
    if (!c.webhook) return res.status(503).json({ message: "Zoom webhook sozlanmagan" });
    if (body.event === "endpoint.url_validation" && typeof body.payload?.plainToken === "string") {
      const plainToken = String(body.payload.plainToken).slice(0, 200);
      return res.json({ plainToken, encryptedToken: createHmac("sha256", c.webhookSecret).update(plainToken).digest("hex") });
    }
    if (!verifyZoomWebhook((req as any).rawBody, String(req.get("x-zm-request-timestamp") || ""), String(req.get("x-zm-signature") || ""), c.webhookSecret))
      return res.status(401).json({ message: "Imzo noto‘g‘ri" });
    const object = body.payload?.object || {};
    const meetingId = String(object.id || "");
    const s = meetingId ? (await pool.query("SELECT * FROM cls_live_sessions WHERE zoom_meeting_id=$1 ORDER BY created_at DESC LIMIT 1", [meetingId])).rows[0] : null;
    res.json({ ok: true });
    if (!s) return;
    try {
      if (body.event === "meeting.started") {
        await pool.query("UPDATE cls_live_sessions SET status='live', started_at=now(), zoom_uuid=COALESCE($2,zoom_uuid) WHERE id=$1 AND status<>'cancelled'", [s.id, object.uuid || null]);
        await notifyGroup(s.group_id, { title: "Jonli dars boshlandi", body: `${s.title} — hoziroq qo‘shiling`, path: "jonli", ref: `live-start-${s.id}`, urgent: true });
      } else if (body.event === "meeting.ended") {
        await pool.query("UPDATE cls_live_sessions SET status='ended', ended_at=now(), zoom_uuid=COALESCE($2,zoom_uuid), recording_state=CASE WHEN recording_state='none' THEN 'waiting' ELSE recording_state END WHERE id=$1 AND status<>'cancelled'", [s.id, object.uuid || null]);
      } else if (body.event === "recording.completed") {
        await importRecording(s.id, object.recording_files || [], typeof body.download_token === "string" ? body.download_token : null, object.uuid);
      }
    } catch {
      console.error("Zoom webhook processing failed");
    }
  });
}
