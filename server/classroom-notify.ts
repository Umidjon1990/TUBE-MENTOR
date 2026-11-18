// Sinfxona bildirishnomalari: web push (telefon ekranida) + Telegram zaxira yo'li.
// Har bir xabar notification_outbox'ga yoziladi (qayta urinish, bir nechta server nusxasi xavfsiz).
// Tinch soatlar: 22:00–07:00 (Toshkent) oralig'idagi oddiy xabarlar ertalab 07:00 da yuboriladi.
import type { Express } from "express";
import webpush from "web-push";
import { z } from "zod";
import { pool } from "./db";
import { requireAuth } from "./auth";
import { route, setClassNotifier, type ClassNotice } from "./classroom";
import { sendBotMessage } from "./payment-bot";

const TASHKENT = 5 * 3600e3;

/** Tinch soatlarda kechiktirish (soniya). Urgent xabar (jonli dars boshlandi) kechiktirilmaydi. */
export function quietDelaySeconds(now = new Date()) {
  const local = new Date(now.getTime() + TASHKENT);
  const h = local.getUTCHours();
  if (h >= 7 && h < 22) return 0;
  const next = new Date(local);
  if (h >= 22) next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(7, 0, 0, 0);
  return Math.ceil((next.getTime() - local.getTime()) / 1000);
}

function vapid() {
  const publicKey = process.env.CLASS_VAPID_PUBLIC_KEY || "";
  const privateKey = process.env.CLASS_VAPID_PRIVATE_KEY || "";
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(publicKey) || !/^[A-Za-z0-9_-]{40,50}$/.test(privateKey)) return null;
  return { publicKey, privateKey, subject: process.env.CLASS_VAPID_SUBJECT || "https://www.zamonaviytalim.uz" };
}
function portal() {
  try {
    const url = new URL(process.env.PLATFORM_APP_URL || "");
    if (url.protocol === "https:" && !url.username && !url.password) return url.origin;
  } catch {}
  return "https://www.zamonaviytalim.uz";
}

/** Xabarni har bir foydalanuvchi uchun navbatga qo'yish. */
/** O'qituvchi bildirishnomani bosganda o'z xonasiga (/ustoz) tushadi, o'quvchi — sinfxonaga. */
export function staffPath(groupId: string, rel: string) {
  const [head, query = ""] = rel.replace(/^\//, "").split("?");
  const params = new URLSearchParams(query);
  if (head === "chat") return `/ustoz/xabarlar?group=${groupId}${params.get("with") ? "&with=" + encodeURIComponent(params.get("with")!) : ""}`;
  if (head === "tekshirish" || head === "natijalar") return "/ustoz/vazifalar";
  if (head === "jonli") return "/ustoz/darslar";
  return `/ustoz/guruh/${groupId}`;
}

/** Xabarni har bir foydalanuvchi uchun navbatga qo'yish. */
export async function enqueueClassNotice(userIds: string[], groupId: string, notice: ClassNotice) {
  if (!userIds.length) return;
  const delay = notice.urgent ? 0 : quietDelaySeconds();
  const ref = notice.ref || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const rel = notice.path ? notice.path.replace(/^\//, "") : "";
  const studentPath = `/sinfxona/${groupId}${rel ? "/" + rel : ""}`;
  const staff = new Set(
    (
      await pool.query(
        `SELECT u.id FROM users u LEFT JOIN cls_group_staff gs ON gs.user_id=u.id AND gs.group_id=$1
          WHERE u.id = ANY($2::text[]) AND (u.role='admin' OR gs.user_id IS NOT NULL)`,
        [groupId, userIds],
      )
    ).rows.map((r: any) => r.id),
  );
  const groups: [string[], string][] = [
    [userIds.filter((u) => !staff.has(u)), studentPath],
    [userIds.filter((u) => staff.has(u)), staffPath(groupId, rel)],
  ];
  for (const [ids, path] of groups) {
    if (!ids.length) continue;
    await pool.query(
      `INSERT INTO notification_outbox(kind,reference_id,payload,next_attempt_at)
       SELECT 'class_notice', $1 || ':' || u, json_build_object('userId',u,'title',$2::text,'body',$3::text,'path',$4::text,'tag',$5::text), now()+($6*interval '1 second')
         FROM unnest($7::text[]) AS u
       ON CONFLICT(kind,reference_id) DO NOTHING`,
      [ref, notice.title.slice(0, 120), notice.body.slice(0, 300), path, notice.tag || groupId, delay, ids],
    );
  }
}

type Sender = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<void>;
let pushSender: Sender | undefined;
/** Testlar uchun: haqiqiy push serveriga chiqmaslik. */
export function setPushSender(fn: Sender | undefined) {
  pushSender = fn;
}

async function deliver(job: any) {
  const p = job.payload || {};
  const userId = String(p.userId || "");
  const payload = JSON.stringify({ title: p.title, body: p.body, url: p.path, tag: p.tag });
  const subs = (await pool.query("SELECT * FROM cls_push_subscriptions WHERE user_id=$1", [userId])).rows;
  const keys = vapid();
  let delivered = 0;
  for (const s of subs) {
    const sub = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
    try {
      if (pushSender) await pushSender(sub, payload);
      else if (keys) await webpush.sendNotification(sub, payload, { vapidDetails: keys, TTL: 6 * 3600, urgency: "high" });
      else continue;
      delivered++;
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) await pool.query("DELETE FROM cls_push_subscriptions WHERE endpoint=$1", [s.endpoint]);
    }
  }
  if (!delivered) await sendBotMessage(userId, `${p.title}\n${p.body}`, { text: "Ochish", url: portal() + p.path }).catch(() => false);
  return delivered;
}

export async function processClassNotices(limit = 25) {
  for (let i = 0; i < limit; i++) {
    const job = (
      await pool.query(
        `UPDATE notification_outbox SET state='processing', next_attempt_at=now()+interval '2 minutes'
          WHERE id=(SELECT id FROM notification_outbox WHERE kind='class_notice' AND state IN ('pending','processing') AND next_attempt_at<=now()
                    ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
          RETURNING *`,
      )
    ).rows[0];
    if (!job) return;
    try {
      await deliver(job);
      await pool.query("UPDATE notification_outbox SET state='sent',last_error=NULL WHERE id=$1", [job.id]);
    } catch {
      const attempts = job.attempts + 1;
      await pool.query("UPDATE notification_outbox SET state=$2,attempts=$3,next_attempt_at=now()+($4*interval '1 second'),last_error='class notice failed' WHERE id=$1", [
        job.id, attempts >= 5 ? "failed" : "pending", attempts, 30 * 2 ** attempts,
      ]);
    }
  }
}

/** Jonli darsdan 15 daqiqa oldin eslatma. */
export async function remindLiveSessions() {
  const due = (
    await pool.query(
      `UPDATE cls_live_sessions SET reminded_at=now()
        WHERE reminded_at IS NULL AND status='scheduled' AND starts_at <= now()+interval '15 minutes' AND starts_at > now()-interval '5 minutes'
        RETURNING id,group_id,title,starts_at`,
    )
  ).rows;
  for (const s of due) {
    const ids = (await pool.query("SELECT user_id FROM cls_members WHERE group_id=$1 AND status='active'", [s.group_id])).rows.map((r: any) => r.user_id);
    const time = new Date(new Date(s.starts_at).getTime() + TASHKENT).toISOString().slice(11, 16);
    await enqueueClassNotice(ids, s.group_id, { title: "Jonli dars tez orada", body: `${s.title} — soat ${time} da boshlanadi`, path: "jonli", ref: `remind-${s.id}`, urgent: true });
  }
}

/** Jadval bo'yicha dars ochilganda guruhga xabar (bir marta). */
export async function announceOpenedLessons() {
  const opened = (
    await pool.query(
      `UPDATE cls_group_lessons gl SET notified_at=now() FROM cls_lessons l, cls_groups g
        WHERE l.id=gl.lesson_id AND g.id=gl.group_id AND NOT g.archived
          AND gl.notified_at IS NULL AND gl.opens_at <= now() AND gl.opens_at > now()-interval '1 day'
        RETURNING gl.group_id, gl.lesson_id, l.title, l.kind`,
    )
  ).rows;
  for (const o of opened) {
    const ids = (await pool.query("SELECT user_id FROM cls_members WHERE group_id=$1 AND status='active'", [o.group_id])).rows.map((r: any) => r.user_id);
    const label = o.kind === "midterm" ? "Oraliq nazorat ochildi" : o.kind === "final" ? "Yakuniy imtihon ochildi" : "Yangi dars ochildi";
    await enqueueClassNotice(ids, o.group_id, { title: label, body: o.title, path: `dars/${o.lesson_id}`, ref: `open-${o.group_id}-${o.lesson_id}-${Date.now()}` });
  }
}

export function startClassNotifications() {
  setClassNotifier(enqueueClassNotice);
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await remindLiveSessions();
      await announceOpenedLessons();
      await processClassNotices();
    } catch {
      console.error("Class notification worker failed");
    } finally {
      busy = false;
    }
  }, 15000);
  timer.unref();
  return () => clearInterval(timer);
}

export function registerClassPush(app: Express) {
  const P = "/api/platform/class/push";
  setClassNotifier(enqueueClassNotice);
  app.get(P + "/key", route(async () => ({ publicKey: vapid()?.publicKey || null })));
  app.post(P + "/subscribe", requireAuth, route(async (req) => {
    const b = z.object({
      endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "https"),
      keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
    }).parse(req.body);
    await pool.query(
      `INSERT INTO cls_push_subscriptions(endpoint,user_id,p256dh,auth) VALUES($1,$2,$3,$4)
       ON CONFLICT(endpoint) DO UPDATE SET user_id=$2,p256dh=$3,auth=$4`,
      [b.endpoint, String(req.session.userId), b.keys.p256dh, b.keys.auth],
    );
    const count = (await pool.query("SELECT count(*)::int AS n FROM cls_push_subscriptions WHERE user_id=$1", [String(req.session.userId)])).rows[0].n;
    // Bir foydalanuvchida juda ko'p eski qurilma yig'ilmasin.
    if (count > 8)
      await pool.query("DELETE FROM cls_push_subscriptions WHERE endpoint IN (SELECT endpoint FROM cls_push_subscriptions WHERE user_id=$1 ORDER BY created_at LIMIT $2)", [String(req.session.userId), count - 8]);
    return { ok: true };
  }));
  app.post(P + "/unsubscribe", requireAuth, route(async (req) => {
    const b = z.object({ endpoint: z.string().max(1000) }).parse(req.body);
    await pool.query("DELETE FROM cls_push_subscriptions WHERE endpoint=$1 AND user_id=$2", [b.endpoint, String(req.session.userId)]);
    return { ok: true };
  }));
  app.post(P + "/test", requireAuth, route(async (req) => {
    const b = z.object({ groupId: z.string().uuid().optional() }).parse(req.body);
    const uid = String(req.session.userId);
    if (b.groupId) await enqueueClassNotice([uid], b.groupId, { title: "Bildirishnoma yoqildi", body: "Yangi dars, vazifa va xabarlar shu yerga keladi.", path: "", urgent: true });
    else
      await pool.query(
        `INSERT INTO notification_outbox(kind,reference_id,payload,next_attempt_at)
         VALUES('class_notice', $1, json_build_object('userId',$2::text,'title','Bildirishnoma yoqildi','body','Xabarlar, so‘rovlar va vazifalar haqida shu yerga xabar keladi.','path','/ustoz','tag','ustoz'), now())
         ON CONFLICT(kind,reference_id) DO NOTHING`,
        [`test-${Date.now()}:${uid}`, uid],
      );
    return { ok: true };
  }));
}
