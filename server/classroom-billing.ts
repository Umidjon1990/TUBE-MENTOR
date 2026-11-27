// Sinfxona moliyasi: sinov haftasi, oylik to'lov (chek orqali), nasiya, eslatmalar va ogohlantirib chiqarish.
//
// Model sodda: har bir o'quvchida bitta sana — «…gacha to'langan» (paid_until). Tasdiqlangan chek uni uzaytiradi.
// Hisob davri o'quvchi qo'shilgan kundan boshlanadi: sinov haftasi birinchi oyning ichida (real darslar hisobidan).
// Holatlar: off (guruhda to'lov o'chiq) · exempt (imtiyozli) · paid · review (chek tekshirilmoqda) · promise (nasiya)
//           · trial · grace (muddat o'tdi, imtiyoz kuni) · overdue (darslar yopiq).
// Yopilganda ham «Kurs to'lovi» sahifasi, guruh bosh sahifasi va chat ochiq qoladi — o'quvchi to'lab, qayta ochadi.
import type { Express, NextFunction, Request, Response } from "express";
import { z } from "zod";
import { pool } from "./db";
import { requireAuth } from "./auth";
import { ClassError, groupRole, groupStaff, isTestUser, membership, needGroup, notifyUsers, requireStaff, route, uuid } from "./classroom";
import { checkAttachment } from "./classroom-chat";
import { classStore } from "./class-storage";
import { myGroups } from "./classroom-staff";

const fail = (status: number, message: string): never => {
  throw new ClassError(status, message);
};
const userOf = (req: Request) => String(req.session.userId);
const DAY = 86400e3;
const TASHKENT = 5 * 3600e3;
/** Toshkent bo'yicha kun oxiri (23:59:59) — nasiya va qo'lda belgilangan sanalar uchun. */
const endOfDay = (ymd: string) => new Date(Date.parse(ymd + "T23:59:59Z") - TASHKENT);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Sana noto‘g‘ri");
const addMonths = (d: Date, n: number) => {
  const t = new Date(d.getTime() + TASHKENT);
  const day = t.getUTCDate();
  t.setUTCDate(1);
  t.setUTCMonth(t.getUTCMonth() + n);
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return new Date(t.getTime() - TASHKENT);
};
const fmt = (d: Date | string) => {
  const t = new Date(new Date(d).getTime() + TASHKENT);
  const M = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
  return `${t.getUTCDate()}-${M[t.getUTCMonth()]}`;
};

export type BillingState = "off" | "exempt" | "paid" | "review" | "promise" | "trial" | "grace" | "overdue";
type MemberRow = { trial_until: Date | null; paid_until: Date | null; promise_until: Date | null; billing_exempt: boolean; removal_due_at?: Date | null };
type GroupRow = { billing_enabled: boolean; grace_days: number; trial_days: number; monthly_price: number | null };

export function billingState(g: GroupRow, m: MemberRow, pending: boolean, now = Date.now()) {
  const t = (d: Date | null) => (d ? new Date(d).getTime() : null);
  const paid = t(m.paid_until), trial = t(m.trial_until), promise = t(m.promise_until);
  const dueAt = paid ?? trial; // keyingi to'lov sanasi: to'langan bo'lsa — davr oxiri, bo'lmasa — sinov oxiri
  let state: BillingState;
  if (!g.billing_enabled) state = "off";
  else if (m.billing_exempt) state = "exempt";
  else if (paid && paid > now) state = "paid";
  else if (pending) state = "review";
  else if (promise && promise > now) state = "promise";
  else if (!paid && trial && trial > now) state = "trial";
  else if (dueAt && now < dueAt + g.grace_days * DAY) state = "grace";
  else if (!dueAt) state = "trial"; // sinov hali boshlanmagan (bir lahza) — yopmaymiz
  else state = "overdue";
  return { state, locked: state === "overdue", dueAt: dueAt ? new Date(dueAt) : null, lockAt: dueAt ? new Date(dueAt + g.grace_days * DAY) : null };
}

/** Sinov va oldindan to'lov qilganlar: faol a'zoga birinchi marta sana qo'yish (qaysi yo'l bilan faollashganidan qat'i nazar). */
export async function seedBilling(groupId?: string) {
  const where = groupId ? "AND g.id=$1" : "";
  const args = groupId ? [groupId] : [];
  // To'lov qilganlar ro'yxatidagi raqam — qo'shilgan kundan 1 oy to'langan.
  await pool.query(
    `UPDATE cls_members m SET paid_until = m.joined_at + interval '1 month'
       FROM cls_groups g
      WHERE g.id=m.group_id AND g.billing_enabled ${where} AND m.status='active' AND m.paid_until IS NULL AND m.trial_until IS NULL
        AND EXISTS (SELECT 1 FROM cls_preapproved p WHERE p.group_id=m.group_id AND p.phone = right(regexp_replace(COALESCE(m.phone,''),'\\D','','g'),9))`,
    args,
  );
  await pool.query(
    `UPDATE cls_members m SET trial_until = now() + make_interval(days => g.trial_days)
       FROM cls_groups g
      WHERE g.id=m.group_id AND g.billing_enabled ${where} AND m.status='active' AND m.paid_until IS NULL AND m.trial_until IS NULL`,
    args,
  );
}

async function memberBilling(groupId: string, userId: string) {
  const r = (
    await pool.query(
      `SELECT m.*, g.billing_enabled, g.grace_days, g.trial_days, g.monthly_price,
              EXISTS (SELECT 1 FROM cls_payments p WHERE p.group_id=m.group_id AND p.user_id=m.user_id AND p.status='pending') AS pending
         FROM cls_members m JOIN cls_groups g ON g.id=m.group_id WHERE m.group_id=$1 AND m.user_id=$2`,
      [groupId, userId],
    )
  ).rows[0];
  if (!r) return null;
  if (r.billing_enabled && r.status === "active" && !r.trial_until && !r.paid_until) {
    await seedBilling(groupId);
    return memberBilling(groupId, userId);
  }
  return { row: r, ...billingState(r, r, r.pending) };
}

/** O'quvchiga ko'rsatiladigan to'lov holati (guruh bosh sahifasi va «Kurs to'lovi» uchun). */
export async function billingInfo(groupId: string, userId: string) {
  const b = await memberBilling(groupId, userId);
  if (!b || b.state === "off") return null;
  const r = b.row;
  return {
    state: b.state,
    locked: b.locked,
    dueAt: b.dueAt,
    lockAt: b.lockAt,
    trialUntil: r.trial_until,
    paidUntil: r.paid_until,
    promiseUntil: r.promise_until,
    removalAt: r.removal_due_at,
    price: r.monthly_price,
  };
}

/** Yopiladigan bo'limlar: darslar, topshiriqlar, jonli dars, natijalar. Bosh sahifa, chat va to'lov ochiq qoladi. */
const LOCKED = /^\/api\/platform\/class\/groups\/([0-9a-f-]{36})\/(lessons|parts|flow|tasks|live|results|tts|review)(\/|$)/i;
const LIVE = /^\/api\/platform\/class\/live\/([^/]+)\/(join|recording|watch)$/i;

export function registerClassBilling(app: Express) {
  const P = "/api/platform/class";

  app.use(async (req: Request, res: Response, next: NextFunction) => {
    const m = LOCKED.exec(req.path), live = m ? null : LIVE.exec(req.path);
    if ((!m && !live) || !req.session?.userId) return next();
    try {
      const uid = String(req.session.userId);
      const groupId = m ? m[1] : (await pool.query("SELECT group_id FROM cls_live_sessions WHERE id::text=$1", [live![1]])).rows[0]?.group_id;
      if (!groupId || (await groupRole(groupId, uid))) return next();
      const b = await memberBilling(groupId, uid);
      if (!b || !b.locked || b.row.status !== "active" || (await isTestUser(uid))) return next();
      res.status(403).json({ message: "To‘lov muddati o‘tgan. Darslar to‘lov tasdiqlangach yana ochiladi — «Kurs to‘lovi» bo‘limiga o‘ting.", code: "billing_locked" });
    } catch (e) {
      next(e);
    }
  });

  /* ---------------- O'quvchi ---------------- */
  app.get(P + "/groups/:id/billing", requireAuth, route(async (req) => {
    const id = uuid.parse(req.params.id), uid = userOf(req);
    const { group, teacher } = await membership(id, uid);
    if (teacher) return { enabled: group.billing_enabled, info: null, payments: [] };
    const payments = (
      await pool.query(
        "SELECT id,amount,paid_on,note,status,reason,period_to,created_at,decided_at FROM cls_payments WHERE group_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 20",
        [id, uid],
      )
    ).rows;
    return { enabled: group.billing_enabled, info: await billingInfo(id, uid), payments };
  }));

  app.post(P + "/groups/:id/payments", requireAuth, route(async (req) => {
    const id = uuid.parse(req.params.id), uid = userOf(req);
    const { group, teacher } = await membership(id, uid);
    if (teacher) fail(400, "O‘qituvchi chek yubormaydi");
    if (!group.billing_enabled) fail(400, "Bu guruhda to‘lov yoqilmagan");
    const b = z.object({
      amount: z.coerce.number().int().min(1000, "Summani so‘mda yozing").max(100_000_000),
      paidOn: ymd,
      note: z.string().trim().max(300).optional(),
      file: z.object({ data: z.string().min(10), mime: z.string().max(100), name: z.string().max(200) }),
    }).parse(req.body);
    const day = Date.parse(b.paidOn + "T00:00:00Z");
    if (day > Date.now() + TASHKENT + DAY || day < Date.now() - 120 * DAY) fail(400, "To‘lov sanasini tekshiring");
    const pending = (await pool.query("SELECT 1 FROM cls_payments WHERE group_id=$1 AND user_id=$2 AND status='pending'", [id, uid])).rowCount;
    if (pending) fail(409, "Avvalgi chekingiz hali tekshirilmoqda. Natijasini kuting");
    const file = checkAttachment(Buffer.from(b.file.data, "base64"), b.file.mime, b.file.name);
    if (file.kind === "voice") fail(415, "Chekni rasm yoki PDF qilib yuboring");
    const key = `class/payments/${id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${file.ext}`;
    await classStore().put(key, file.data, file.mime);
    const p = (
      await pool.query(
        `INSERT INTO cls_payments(group_id,user_id,amount,paid_on,note,file_key,file_mime,file_name,file_size)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,amount,paid_on,note,status,created_at`,
        [id, uid, b.amount, b.paidOn, b.note || null, key, file.mime, file.name, file.data.length],
      )
    ).rows[0];
    const name = (await pool.query("SELECT COALESCE(NULLIF(m.display_name,''),u.full_name) AS n FROM cls_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=$1 AND m.user_id=$2", [id, uid])).rows[0]?.n;
    await notifyUsers((await groupStaff(id)).filter((s) => s.role === "teacher").map((s) => s.user_id), id, {
      title: "Yangi to‘lov cheki",
      body: `${name || "O‘quvchi"} — ${b.amount.toLocaleString("ru-RU").replace(/,/g, " ")} so‘m · ${group.name}`,
      path: "",
      ref: `pay-${p.id}`,
      tag: "billing",
    });
    return { payment: p };
  }));

  /** Chek fayli: o'quvchining o'zi yoki shu guruh xodimi. */
  app.get(P + "/payments/:pid/file", requireAuth, async (req, res, next) => {
    try {
      const pid = z.coerce.number().int().positive().parse(req.params.pid), uid = userOf(req);
      const p = (await pool.query("SELECT * FROM cls_payments WHERE id=$1", [pid])).rows[0];
      if (!p || (p.user_id !== uid && !(await groupRole(p.group_id, uid)))) return res.status(404).json({ message: "Chek topilmadi" });
      const f = await classStore().get(p.file_key);
      if (!f) return res.status(404).json({ message: "Chek topilmadi" });
      res.set({ "Content-Type": p.file_mime, "Cache-Control": "private, max-age=300", "Content-Disposition": `inline; filename="chek-${pid}.${p.file_key.split(".").pop()}"`, "X-Content-Type-Options": "nosniff" });
      res.end(f.data);
    } catch (e) {
      next(e);
    }
  });

  /* ---------------- O'qituvchi: Moliya ---------------- */
  /** Guruh to'lov sozlamalari: yoqish, sinov kunlari, imtiyoz kuni, oylik summa. */
  app.put(P + "/admin/groups/:id/billing", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    await needGroup(id, userOf(req));
    const b = z.object({
      enabled: z.boolean(),
      trialDays: z.number().int().min(0).max(30).default(7),
      graceDays: z.number().int().min(0).max(7).default(1),
      monthlyPrice: z.number().int().min(0).max(100_000_000).nullable().default(null),
    }).parse(req.body);
    const g = (
      await pool.query(
        "UPDATE cls_groups SET billing_enabled=$2, trial_days=$3, grace_days=$4, monthly_price=$5 WHERE id=$1 RETURNING id,billing_enabled,trial_days,grace_days,monthly_price",
        [id, b.enabled, b.trialDays, b.graceDays, b.monthlyPrice || null],
      )
    ).rows[0];
    if (b.enabled) await seedBilling(id);
    return { group: g };
  }));

  app.get(P + "/staff/finance", requireStaff, route(async (req) => {
    const me = userOf(req);
    const groups = (await myGroups(me)).map((g) => g.id);
    const only = req.query.group ? uuid.parse(req.query.group) : null;
    if (only && !groups.includes(only)) fail(404, "Guruh topilmadi");
    const ids = only ? [only] : groups;
    if (!ids.length) return { groups: [], members: [], payments: [], counts: {}, monthSum: 0 };
    await seedBilling();
    const gs = (await pool.query(
      `SELECT g.id,g.name,g.billing_enabled,g.trial_days,g.grace_days,g.monthly_price FROM cls_groups g
        WHERE g.id = ANY($1::uuid[]) AND NOT g.archived AND g.audience='students' ORDER BY g.created_at DESC`,
      [groups],
    )).rows;
    const billed = gs.filter((g: any) => g.billing_enabled && ids.includes(g.id)).map((g: any) => g.id);
    const rows = billed.length
      ? (
          await pool.query(
            `SELECT m.group_id,m.user_id,m.phone,m.joined_at,m.trial_until,m.paid_until,m.promise_until,m.billing_exempt,m.removal_due_at,
                    COALESCE(NULLIF(m.display_name,''),u.full_name) AS name, g.name AS group_name, g.billing_enabled,g.grace_days,g.trial_days,g.monthly_price,
                    EXISTS (SELECT 1 FROM cls_payments p WHERE p.group_id=m.group_id AND p.user_id=m.user_id AND p.status='pending') AS pending
               FROM cls_members m JOIN users u ON u.id=m.user_id JOIN cls_groups g ON g.id=m.group_id
              WHERE m.group_id = ANY($1::uuid[]) AND m.status='active' AND NOT u.is_test ORDER BY name`,
            [billed],
          )
        ).rows
      : [];
    const members = rows.map((r: any) => {
      const s = billingState(r, r, r.pending);
      return {
        groupId: r.group_id, groupName: r.group_name, userId: r.user_id, name: r.name, phone: r.phone, joinedAt: r.joined_at,
        trialUntil: r.trial_until, paidUntil: r.paid_until, promiseUntil: r.promise_until, exempt: r.billing_exempt, removalAt: r.removal_due_at,
        state: s.state, dueAt: s.dueAt, lockAt: s.lockAt,
      };
    });
    const counts: Record<string, number> = { total: members.length };
    for (const m of members) counts[m.state] = (counts[m.state] || 0) + 1;
    const payments = billed.length
      ? (
          await pool.query(
            `SELECT p.id,p.group_id,p.user_id,p.amount,p.paid_on,p.note,p.status,p.reason,p.created_at,p.file_mime,p.period_to,p.decided_at,
                    COALESCE(NULLIF(m.display_name,''),u.full_name) AS name, g.name AS group_name, m.paid_until, m.joined_at, d.full_name AS decided_by_name
               FROM cls_payments p JOIN users u ON u.id=p.user_id JOIN cls_groups g ON g.id=p.group_id
               LEFT JOIN cls_members m ON m.group_id=p.group_id AND m.user_id=p.user_id
               LEFT JOIN users d ON d.id=p.decided_by
              WHERE p.group_id = ANY($1::uuid[]) AND (p.status='pending' OR p.created_at > now() - interval '45 days')
              ORDER BY (p.status='pending') DESC, p.created_at DESC LIMIT 200`,
            [billed],
          )
        ).rows.map((p: any) => ({ ...p, suggestedUntil: nextPeriod(p).to }))
      : [];
    const local = new Date(Date.now() + TASHKENT);
    const monthStart = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - TASHKENT);
    const monthSum = billed.length
      ? Number((await pool.query("SELECT COALESCE(sum(amount),0)::bigint AS s FROM cls_payments WHERE group_id = ANY($1::uuid[]) AND status='approved' AND decided_at >= $2", [billed, monthStart])).rows[0].s)
      : 0;
    return { groups: gs, members, payments, counts, monthSum };
  }));

  /** Chekni tasdiqlash (sukut: +1 oy) yoki rad etish (sababi bilan). Guruh o'qituvchisi yoki admin. */
  app.post(P + "/admin/payments/:pid/decide", requireStaff, route(async (req) => {
    const pid = z.coerce.number().int().positive().parse(req.params.pid), me = userOf(req);
    const b = z.object({
      action: z.enum(["approve", "reject"]),
      reason: z.string().trim().max(300).optional(),
      paidUntil: ymd.optional(),
    }).parse(req.body);
    const head = (await pool.query("SELECT group_id FROM cls_payments WHERE id=$1", [pid])).rows[0];
    if (!head) fail(404, "Chek topilmadi");
    await needGroup(head.group_id, me);
    const c = await pool.connect();
    let notice: { user: string; group: string; title: string; body: string } | null = null;
    try {
      await c.query("BEGIN");
      const p = (await c.query("SELECT * FROM cls_payments WHERE id=$1 FOR UPDATE", [pid])).rows[0];
      if (p.status !== "pending") fail(409, "Bu chek allaqachon ko‘rib chiqilgan");
      const m = (await c.query("SELECT * FROM cls_members WHERE group_id=$1 AND user_id=$2 FOR UPDATE", [p.group_id, p.user_id])).rows[0];
      if (b.action === "reject") {
        if (!b.reason) fail(400, "Rad etish sababini yozing");
        await c.query("UPDATE cls_payments SET status='rejected', reason=$2, decided_by=$3, decided_at=now() WHERE id=$1", [pid, b.reason, me]);
        notice = { user: p.user_id, group: p.group_id, title: "Chek rad etildi", body: b.reason! + " — chekni qayta yuboring." };
      } else {
        const period = nextPeriod({ paid_until: m?.paid_until, joined_at: m?.joined_at });
        const to = b.paidUntil ? endOfDay(b.paidUntil) : period.to;
        if (to.getTime() <= Date.now()) fail(400, "To‘lov sanasi bugundan keyin bo‘lishi kerak");
        await c.query("UPDATE cls_payments SET status='approved', period_from=$2, period_to=$3, decided_by=$4, decided_at=now() WHERE id=$1", [pid, period.from, to, me]);
        if (m) await c.query("UPDATE cls_members SET paid_until=$3, promise_until=NULL, removal_due_at=NULL WHERE group_id=$1 AND user_id=$2", [p.group_id, p.user_id, to]);
        notice = { user: p.user_id, group: p.group_id, title: "To‘lov tasdiqlandi", body: `Rahmat! Kurs ${fmt(to)}gacha to‘langan.` };
      }
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
    if (notice) await notifyUsers([notice.user], notice.group, { title: notice.title, body: notice.body, path: "tolov", ref: `pay-decide-${pid}`, tag: "billing" });
    return { ok: true };
  }));

  /** O'quvchi bo'yicha qo'lda: nasiya sanasi, imtiyozli belgisi, to'langan sanani tuzatish. */
  app.put(P + "/admin/groups/:id/members/:userId/billing", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id), me = userOf(req);
    const { group } = await needGroup(id, me);
    const userId = z.string().min(1).max(100).parse(req.params.userId);
    const b = z.object({ promiseUntil: ymd.nullable().optional(), exempt: z.boolean().optional(), paidUntil: ymd.nullable().optional() }).parse(req.body);
    const m = (await pool.query("SELECT * FROM cls_members WHERE group_id=$1 AND user_id=$2 AND status='active'", [id, userId])).rows[0];
    if (!m) fail(404, "O‘quvchi topilmadi");
    const promise = b.promiseUntil === undefined ? m.promise_until : b.promiseUntil && endOfDay(b.promiseUntil);
    if (b.promiseUntil && promise!.getTime() < Date.now()) fail(400, "Nasiya sanasi bugundan oldin bo‘lmasin");
    const paid = b.paidUntil === undefined ? m.paid_until : b.paidUntil && endOfDay(b.paidUntil);
    const r = (
      await pool.query(
        `UPDATE cls_members SET promise_until=$3, billing_exempt=COALESCE($4,billing_exempt), paid_until=$5,
                removal_due_at = CASE WHEN $3::timestamptz IS NOT NULL OR $4 IS TRUE THEN NULL ELSE removal_due_at END
          WHERE group_id=$1 AND user_id=$2 RETURNING trial_until,paid_until,promise_until,billing_exempt,removal_due_at`,
        [id, userId, promise || null, b.exempt ?? null, paid || null],
      )
    ).rows[0];
    if (b.promiseUntil)
      await notifyUsers([userId], id, { title: "To‘lov sanasi belgilandi", body: `${group.name}: to‘lovni ${fmt(promise!)}gacha qiling. Shu kungacha darslar ochiq.`, path: "tolov", ref: `promise-set-${id}-${userId}-${b.promiseUntil}`, tag: "billing" });
    return { member: r };
  }));

  /** Ogohlantirib chiqarish: tanlangan o'quvchilarga xabar, 24 soatdan keyin to'lamaganlar o'zi chiqariladi. Bekor qilish ham shu yerda. */
  app.post(P + "/admin/groups/:id/members/remove-unpaid", requireStaff, route(async (req) => {
    const id = uuid.parse(req.params.id);
    const { group } = await needGroup(id, userOf(req));
    const b = z.object({ userIds: z.array(z.string().min(1).max(100)).min(1).max(300), cancel: z.boolean().default(false), hours: z.number().int().min(1).max(168).default(24) }).parse(req.body);
    if (b.cancel) {
      const n = (await pool.query("UPDATE cls_members SET removal_due_at=NULL WHERE group_id=$1 AND user_id = ANY($2::varchar[]) AND removal_due_at IS NOT NULL", [id, b.userIds])).rowCount;
      return { cancelled: n };
    }
    const at = new Date(Date.now() + b.hours * 3600e3);
    const ids = (
      await pool.query(
        "UPDATE cls_members SET removal_due_at=$3 WHERE group_id=$1 AND user_id = ANY($2::varchar[]) AND status='active' AND NOT billing_exempt RETURNING user_id",
        [id, b.userIds, at],
      )
    ).rows.map((r: any) => r.user_id);
    if (ids.length)
      await notifyUsers(ids, id, {
        title: "Ogohlantirish: to‘lov qilinmagan",
        body: `${group.name}: ${b.hours} soat ichida to‘lov qilmasangiz yoki chek yubormasangiz, guruhdan chiqarilasiz.`,
        path: "tolov",
        ref: `removal-${id}-${at.getTime()}`,
        urgent: true,
        tag: "billing",
      });
    return { warned: ids.length, removeAt: at };
  }));
}

/** Keyingi to'lov davri: oxirgi to'langan sanadan (yoki qo'shilgan kundan) +1 oy; ancha kechiksa — bugundan. */
function nextPeriod(m: { paid_until?: Date | null; joined_at?: Date | null }) {
  let from = m.paid_until ? new Date(m.paid_until) : m.joined_at ? new Date(m.joined_at) : new Date();
  if (from.getTime() < Date.now() - 7 * DAY) from = new Date();
  return { from, to: addMonths(from, 1) };
}

/* ---------------- Eslatmalar va chiqarish (har 15 soniyada ishchi chaqiradi; har biri bir marta) ---------------- */
async function once(groupId: string, userId: string, kind: string, ref: string) {
  return !!(await pool.query("INSERT INTO cls_billing_notices(group_id,user_id,kind,ref) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING", [groupId, userId, kind, ref])).rowCount;
}

let lastRun = 0;
export async function runBilling(force = false) {
  if (!force && Date.now() - lastRun < 5 * 60e3) return;
  lastRun = Date.now();
  await seedBilling();
  const rows = (
    await pool.query(
      `SELECT m.group_id,m.user_id,m.trial_until,m.paid_until,m.promise_until,m.billing_exempt,m.removal_due_at,
              COALESCE(NULLIF(m.display_name,''),u.full_name) AS name, g.name AS group_name, g.billing_enabled,g.grace_days,g.trial_days,g.monthly_price,
              EXISTS (SELECT 1 FROM cls_payments p WHERE p.group_id=m.group_id AND p.user_id=m.user_id AND p.status='pending') AS pending
         FROM cls_members m JOIN cls_groups g ON g.id=m.group_id JOIN users u ON u.id=m.user_id
        WHERE g.billing_enabled AND NOT g.archived AND m.status='active' AND NOT u.is_test`,
    )
  ).rows;
  const now = Date.now();
  const send = (r: any, title: string, body: string, ref: string, urgent = false) =>
    notifyUsers([r.user_id], r.group_id, { title, body: `${r.group_name}: ${body}`, path: "tolov", ref, urgent, tag: "billing" });
  for (const r of rows) {
    const s = billingState(r, r, r.pending, now);
    const left = (d: Date | null) => (d ? new Date(d).getTime() - now : Infinity);
    // Ogohlantirilgan va muddati yetgan: to'lamagan bo'lsa — chiqariladi.
    if (r.removal_due_at && new Date(r.removal_due_at).getTime() <= now) {
      if (["paid", "review", "promise", "exempt"].includes(s.state)) await pool.query("UPDATE cls_members SET removal_due_at=NULL WHERE group_id=$1 AND user_id=$2", [r.group_id, r.user_id]);
      else {
        await pool.query("UPDATE cls_members SET status='removed', removal_due_at=NULL WHERE group_id=$1 AND user_id=$2 AND status='active'", [r.group_id, r.user_id]);
        await notifyUsers([r.user_id], r.group_id, { title: "Guruhdan chiqarildingiz", body: `${r.group_name}: to‘lov qilinmagani uchun. Qaytish uchun o‘qituvchiga yozing.`, path: "", ref: `removed-${r.group_id}-${r.user_id}-${now}`, tag: "billing" });
      }
      continue;
    }
    if (s.state === "trial" && r.trial_until) {
      const ref = new Date(r.trial_until).toISOString();
      if (left(r.trial_until) <= DAY && (await once(r.group_id, r.user_id, "trial-0", ref)))
        await send(r, "Sinov darslari bugun tugaydi", "Darslar yoqqan bo‘lsa, «Kurs to‘lovi» bo‘limida to‘lov qilib chekni yuboring.", `trial0-${r.group_id}-${r.user_id}-${ref}`);
      else if (left(r.trial_until) <= 2 * DAY && (await once(r.group_id, r.user_id, "trial-2", ref)))
        await send(r, "Sinov darslari tugashiga 2 kun qoldi", `Sinov ${fmt(r.trial_until)}da tugaydi. Davom etish uchun kurs to‘lovini qiling.`, `trial2-${r.group_id}-${r.user_id}-${ref}`);
    }
    if (s.state === "paid" && r.paid_until) {
      const ref = new Date(r.paid_until).toISOString();
      if (left(r.paid_until) <= DAY && (await once(r.group_id, r.user_id, "due-0", ref)))
        await send(r, "Bugun to‘lov kuni", "Kurs to‘lovini qilib chekni yuboring — darslar uzilmasin.", `due0-${r.group_id}-${r.user_id}-${ref}`);
      else if (left(r.paid_until) <= 3 * DAY && (await once(r.group_id, r.user_id, "due-3", ref)))
        await send(r, "To‘lov sanasi yaqinlashmoqda", `Keyingi to‘lov: ${fmt(r.paid_until)}. Oldindan to‘lab qo‘yishingiz mumkin.`, `due3-${r.group_id}-${r.user_id}-${ref}`);
    }
    if (s.state === "promise" && r.promise_until) {
      const ref = new Date(r.promise_until).toISOString();
      const kind = left(r.promise_until) <= DAY ? "promise-0" : left(r.promise_until) <= 2 * DAY ? "promise-1" : null;
      if (kind && (await once(r.group_id, r.user_id, kind, ref))) {
        const today = kind === "promise-0";
        await send(r, today ? "Bugun va’da qilingan to‘lov kuni" : "Ertaga to‘lov kuni", `Siz ${fmt(r.promise_until)}gacha to‘lov qilishni belgilagansiz.`, `${kind}-${r.group_id}-${r.user_id}-${ref}`);
        const staff = (await groupStaff(r.group_id)).filter((x) => x.role === "teacher").map((x) => x.user_id);
        await notifyUsers(staff, r.group_id, { title: today ? "Bugun nasiya to‘lov kuni" : "Ertaga nasiya to‘lov kuni", body: `${r.name} — ${r.group_name} (${fmt(r.promise_until)})`, path: "", ref: `${kind}-staff-${r.group_id}-${r.user_id}-${ref}`, tag: "billing" });
      }
    }
    if (s.state === "grace" && s.dueAt && (await once(r.group_id, r.user_id, "grace", s.dueAt.toISOString())))
      await send(r, "To‘lov muddati o‘tdi", `Darslar ${fmt(s.lockAt!)}da yopiladi. To‘lov qilib chekni yuboring.`, `grace-${r.group_id}-${r.user_id}-${s.dueAt.toISOString()}`, true);
    if (s.state === "overdue" && s.dueAt && (await once(r.group_id, r.user_id, "locked", s.dueAt.toISOString())))
      await send(r, "Darslar yopildi", "To‘lov qilinmagani uchun darslar vaqtincha yopildi. Chekni yuborsangiz, tasdiqlangach yana ochiladi.", `locked-${r.group_id}-${r.user_id}-${s.dueAt.toISOString()}`, true);
  }
}
