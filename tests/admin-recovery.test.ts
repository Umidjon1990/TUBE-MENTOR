import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { recoverAdministrator } from "../server/admin-recovery";
test("operator recovery promotes only the exact verified Google identity, revokes sessions and cannot replay", async () => {
  const db = new PGlite();
  await db.waitReady;
  await db.exec(`CREATE TABLE users(id text PRIMARY KEY,email text,google_id text,email_verified boolean,is_active boolean,role text,session_version int,updated_at timestamptz);CREATE TABLE system_settings(key text PRIMARY KEY,value text);CREATE TABLE platform_sessions(user_id text,revoked_at timestamptz);CREATE TABLE commerce_audit(user_id text,action text,reference_id text,idempotency_key text UNIQUE,details jsonb);
 INSERT INTO users VALUES('owner','owner@example.test','verified-google',true,true,'student',3,NULL),('password-account','owner@example.test',NULL,true,true,'student',0,NULL),('unverified','not-verified@example.test','google-unverified',false,true,'student',0,NULL),('other','other@example.test','other-google',true,true,'student',0,NULL);INSERT INTO platform_sessions VALUES('owner',NULL),('other',NULL);`);
  const pool = {
    connect: async () => ({
      query: (sql: string, params?: any[]) => db.query(sql, params),
      release() {},
    }),
  };
  try {
    assert.equal((await recoverAdministrator(pool, {})).status, "disabled");
    assert.equal(
      (
        await recoverAdministrator(pool, {
          email: "not-verified@example.test",
          requestId: randomUUID(),
        })
      ).status,
      "verified_google_account_not_found",
    );
    const input = { email: " OWNER@example.test ", requestId: randomUUID() };
    assert.equal((await recoverAdministrator(pool, input)).status, "applied");
    let rows = (await db.query<any>("SELECT * FROM users ORDER BY id")).rows;
    assert.equal(rows.find((x) => x.id === "owner").role, "admin");
    assert.equal(rows.find((x) => x.id === "owner").session_version, 4);
    assert.equal(rows.find((x) => x.id === "password-account").role, "student");
    assert.equal(rows.find((x) => x.id === "other").role, "student");
    assert.ok(
      (
        await db.query<any>(
          "SELECT revoked_at FROM platform_sessions WHERE user_id='owner'",
        )
      ).rows[0].revoked_at,
    );
    assert.equal(
      (
        await db.query<any>(
          "SELECT revoked_at FROM platform_sessions WHERE user_id='other'",
        )
      ).rows[0].revoked_at,
      null,
    );
    assert.equal(
      (await recoverAdministrator(pool, input)).status,
      "already_applied",
    );
    await assert.rejects(() =>
      recoverAdministrator(pool, { ...input, email: "other@example.test" }),
    );
    await db.exec("UPDATE users SET role='student' WHERE id='owner'");
    assert.equal(
      (await recoverAdministrator(pool, input)).status,
      "already_applied",
    );
    assert.equal(
      (await db.query<any>("SELECT role FROM users WHERE id='owner'")).rows[0]
        .role,
      "student",
    );
    assert.equal(
      (await db.query<any>("SELECT count(*)::int AS n FROM commerce_audit"))
        .rows[0].n,
      1,
    );
  } finally {
    await db.close();
  }
});
