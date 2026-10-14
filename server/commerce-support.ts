import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { hasVerifiedIdentity, requireAdmin, requireAuth } from "./auth";
import { rateLimit } from "./security";
import {
  CommerceError,
  getCommerceSettings,
  commerceDatabaseError,
} from "./commerce";
import { publishedLesson } from "@shared/learning";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_STATUSES,
  type SupportMessageDTO,
  type SupportThreadDTO,
  type SupportTicketDTO,
} from "@shared/commerce";
import {
  commerceAudit,
  commerceSupportMessages,
  commerceSupportTickets,
  lessonAccess,
  lessons,
  notificationOutbox,
  paymentOrders,
  users,
} from "@shared/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Ticket = typeof commerceSupportTickets.$inferSelect;
const uuid = z.string().uuid();
const messageSchema = z
  .string()
  .trim()
  .min(3, "Xabar kamida 3 belgidan iborat bo‘lsin")
  .max(4000, "Xabar 4000 belgidan oshmasin")
  .refine(
    (value) => [...value].length >= 3,
    "Xabar kamida 3 belgidan iborat bo‘lsin",
  );
const createSchema = z
  .object({
    category: z.enum(SUPPORT_CATEGORIES),
    subject: z
      .string()
      .trim()
      .min(3)
      .max(160)
      .refine((value) => [...value].length >= 3),
    message: messageSchema,
    orderId: uuid.optional(),
    lessonId: z.number().int().positive().optional(),
  })
  .strict();
const replySchema = z.object({ message: messageSchema }).strict();
const adminReplySchema = z
  .object({ message: messageSchema, status: z.enum(SUPPORT_STATUSES) })
  .strict();
const fail = (status: number, code: string, message: string): never => {
  throw new CommerceError(status, code, message);
};
const id = (req: Request) => uuid.parse(String(req.params.id));
const userId = (req: Request) => req.session.userId!;
function ticketDTO(ticket: Ticket, admin: boolean): SupportTicketDTO {
  return {
    id: ticket.id,
    category: ticket.category as SupportTicketDTO["category"],
    subject: ticket.subject,
    status: ticket.status as SupportTicketDTO["status"],
    orderId: ticket.orderId,
    lessonId: ticket.lessonId,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    ...(admin
      ? { userId: ticket.userId, fullName: ticket.fullNameSnapshot }
      : {}),
  };
}
async function actor(tx: Tx, actorId: string, admin = false) {
  const [user] = await tx.select().from(users).where(eq(users.id, actorId));
  if (!user?.isActive || !hasVerifiedIdentity(user))
    return fail(401, "AUTH_REQUIRED", "Faol hisob talab qilinadi");
  if (admin && user.role !== "admin")
    fail(403, "ADMIN_REQUIRED", "Admin hisobi talab qilinadi");
  return user;
}
async function ticketFor(
  tx: Tx,
  ticketId: string,
  actorId: string,
  admin: boolean,
  lock = false,
) {
  const query = tx
    .select()
    .from(commerceSupportTickets)
    .where(
      and(
        eq(commerceSupportTickets.id, ticketId),
        ...(admin ? [] : [eq(commerceSupportTickets.userId, actorId)]),
      ),
    );
  const [ticket] = lock ? await query.for("update") : await query.for("share");
  if (!ticket) return fail(404, "SUPPORT_NOT_FOUND", "Murojaat topilmadi");
  return ticket;
}
async function thread(
  ticketId: string,
  actorId: string,
  admin: boolean,
): Promise<SupportThreadDTO> {
  return db.transaction(async (tx) => {
    await actor(tx, actorId, admin);
    const ticket = await ticketFor(tx, ticketId, actorId, admin);
    const rows = await tx
      .select()
      .from(commerceSupportMessages)
      .where(eq(commerceSupportMessages.ticketId, ticketId))
      .orderBy(asc(commerceSupportMessages.id));
    const messages: SupportMessageDTO[] = rows.map((row) => ({
      id: row.id,
      message: row.message,
      authorName:
        !admin && row.authorRole === "admin"
          ? "TUBE MENTOR admini"
          : row.authorNameSnapshot,
      authorRole: row.authorRole as SupportMessageDTO["authorRole"],
      createdAt: row.createdAt.toISOString(),
    }));
    return { ticket: ticketDTO(ticket, admin), messages };
  });
}
async function appendMessage(
  tx: Tx,
  ticket: Ticket,
  author: typeof users.$inferSelect,
  message: string,
  admin: boolean,
  status: "open" | "answered" | "closed",
) {
  const [entry] = await tx
    .insert(commerceSupportMessages)
    .values({
      ticketId: ticket.id,
      authorId: author.id,
      authorRole: admin ? "admin" : "student",
      authorNameSnapshot: author.fullName,
      message,
    })
    .returning();
  await tx
    .update(commerceSupportTickets)
    .set({ status, updatedAt: new Date() })
    .where(eq(commerceSupportTickets.id, ticket.id));
  await tx.insert(commerceAudit).values({
    actorId: author.id,
    userId: ticket.userId,
    action: admin ? "support_admin_reply" : "support_student_reply",
    referenceId: ticket.id,
    details: { messageId: entry.id, status, previousStatus: ticket.status },
  });
  await tx
    .insert(notificationOutbox)
    .values({
      kind: admin ? "support_reply" : "support_admin",
      referenceId: `${ticket.id}:${entry.id}`,
      payload: {
        ticketId: ticket.id,
        messageId: entry.id,
        userId: ticket.userId,
        status,
      },
    })
    .onConflictDoNothing();
  return entry;
}
const handle =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error instanceof CommerceError)
        return res
          .status(error.status)
          .json({ message: error.message, code: error.code });
      if (error instanceof z.ZodError)
        return res.status(400).json({
          message: error.issues[0]?.message || "So‘rov noto‘g‘ri",
          code: "INVALID_INPUT",
        });
      console.error("Support request failed", {
        name: error instanceof Error ? error.name : "UnknownError",
        code: commerceDatabaseError(error).code || "UNKNOWN",
      });
      return res.status(500).json({
        message: "Murojaatni saqlab bo‘lmadi. Qayta urinib ko‘ring.",
        code: "SUPPORT_ERROR",
      });
    }
  };
export function registerCommerceSupportRoutes(app: Express) {
  app.get(
    "/api/commerce/support",
    requireAuth,
    handle(async (req, res) => {
      const tickets = await db
        .select()
        .from(commerceSupportTickets)
        .where(eq(commerceSupportTickets.userId, userId(req)))
        .orderBy(desc(commerceSupportTickets.updatedAt))
        .limit(200);
      res.json({ tickets: tickets.map((ticket) => ticketDTO(ticket, false)) });
    }),
  );
  app.post(
    "/api/commerce/support",
    requireAuth,
    rateLimit("support-create", 10, 3600),
    handle(async (req, res) => {
      const input = createSchema.parse(req.body);
      const settings = input.lessonId ? await getCommerceSettings() : null;
      const ticket = await db.transaction(async (tx) => {
        const owner = await actor(tx, userId(req));
        if (input.orderId) {
          const [order] = await tx
            .select({ id: paymentOrders.id })
            .from(paymentOrders)
            .where(
              and(
                eq(paymentOrders.id, input.orderId),
                eq(paymentOrders.userId, owner.id),
              ),
            );
          if (!order) fail(404, "ORDER_NOT_FOUND", "Buyurtma topilmadi");
        }
        if (input.lessonId) {
          const [lesson] = await tx
            .select()
            .from(lessons)
            .where(eq(lessons.id, input.lessonId));
          const [access] = await tx
            .select({ id: lessonAccess.id })
            .from(lessonAccess)
            .where(
              and(
                eq(lessonAccess.userId, owner.id),
                eq(lessonAccess.lessonId, input.lessonId),
                isNull(lessonAccess.revokedAt),
              ),
            );
          if (
            !lesson ||
            (!publishedLesson(lesson) && !access) ||
            (lesson.status === "archived" &&
              !access &&
              settings?.demoLessonId !== lesson.id)
          )
            fail(404, "LESSON_NOT_FOUND", "Dars topilmadi");
        }
        const [created] = await tx
          .insert(commerceSupportTickets)
          .values({
            id: randomUUID(),
            userId: owner.id,
            fullNameSnapshot: owner.fullName,
            category: input.category,
            subject: input.subject,
            orderId: input.orderId,
            lessonId: input.lessonId,
            status: "open",
          })
          .returning();
        await tx.insert(commerceAudit).values({
          actorId: owner.id,
          userId: owner.id,
          action: "support_created",
          referenceId: created.id,
          details: {
            category: created.category,
            orderId: created.orderId,
            lessonId: created.lessonId,
          },
        });
        await appendMessage(tx, created, owner, input.message, false, "open");
        return created;
      });
      res.status(201).json({ ticket: ticketDTO(ticket, false) });
    }),
  );
  app.get(
    "/api/commerce/support/:id",
    requireAuth,
    handle(async (req, res) =>
      res.json(await thread(id(req), userId(req), false)),
    ),
  );
  app.post(
    "/api/commerce/support/:id/reply",
    requireAuth,
    rateLimit("support-reply", 30, 3600),
    handle(async (req, res) => {
      const ticketId = id(req);
      const input = replySchema.parse(req.body);
      await db.transaction(async (tx) => {
        const author = await actor(tx, userId(req));
        const ticket = await ticketFor(tx, ticketId, author.id, false, true);
        await appendMessage(tx, ticket, author, input.message, false, "open");
      });
      res.json(await thread(ticketId, userId(req), false));
    }),
  );
  app.get(
    "/api/admin/commerce/support",
    requireAdmin,
    handle(async (_req, res) => {
      const tickets = await db
        .select()
        .from(commerceSupportTickets)
        .orderBy(
          sql`CASE ${commerceSupportTickets.status} WHEN 'open' THEN 0 WHEN 'answered' THEN 1 ELSE 2 END`,
          desc(commerceSupportTickets.updatedAt),
        )
        .limit(300);
      res.json({ tickets: tickets.map((ticket) => ticketDTO(ticket, true)) });
    }),
  );
  app.get(
    "/api/admin/commerce/support/:id",
    requireAdmin,
    handle(async (req, res) =>
      res.json(await thread(id(req), userId(req), true)),
    ),
  );
  app.post(
    "/api/admin/commerce/support/:id/reply",
    requireAdmin,
    handle(async (req, res) => {
      const ticketId = id(req);
      const input = adminReplySchema.parse(req.body);
      await db.transaction(async (tx) => {
        const author = await actor(tx, userId(req), true);
        const ticket = await ticketFor(tx, ticketId, author.id, true, true);
        await appendMessage(
          tx,
          ticket,
          author,
          input.message,
          true,
          input.status,
        );
      });
      res.json(await thread(ticketId, userId(req), true));
    }),
  );
}
