import { z } from "zod";

/** Operator-only, one-use recovery. Never runs from a public HTTP request or sign-up. */
export async function recoverAdministrator(
  pool: any,
  input: { email?: string; requestId?: string },
) {
  if (!input.email && !input.requestId) return { status: "disabled" };
  const email = z
    .string()
    .trim()
    .email()
    .max(254)
    .parse(input.email)
    .toLowerCase();
  const requestId = z.string().uuid().parse(input.requestId);
  const key = "_admin_recovery:" + requestId,
    client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO system_settings(key,value) VALUES('_admin_lifecycle_lock','1') ON CONFLICT(key) DO NOTHING",
    );
    await client.query(
      "SELECT key FROM system_settings WHERE key='_admin_lifecycle_lock' FOR UPDATE",
    );
    const prior = (
      await client.query("SELECT value FROM system_settings WHERE key=$1", [
        key,
      ])
    ).rows[0];
    if (prior) {
      const previous = JSON.parse(prior.value);
      if (previous.email !== email)
        throw Error("Recovery request was already used for another identity");
      await client.query("COMMIT");
      return {
        status: "already_applied",
        userId: previous.userId,
        role: "admin",
      };
    }
    // An unverified/password-only account sharing the address must not receive these privileges.
    const matches = (
      await client.query(
        "SELECT id,role,session_version FROM users WHERE lower(trim(email))=$1 AND google_id IS NOT NULL AND email_verified=true AND is_active=true FOR UPDATE",
        [email],
      )
    ).rows;
    if (matches.length !== 1) {
      await client.query("ROLLBACK");
      return {
        status: matches.length
          ? "ambiguous"
          : "verified_google_account_not_found",
      };
    }
    const user = matches[0];
    if (user.role !== "admin") {
      await client.query(
        "UPDATE users SET role='admin',session_version=session_version+1,updated_at=now() WHERE id=$1",
        [user.id],
      );
      await client.query(
        "UPDATE platform_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",
        [user.id],
      );
    }
    await client.query(
      "INSERT INTO commerce_audit(user_id,action,reference_id,idempotency_key,details) VALUES($1,'operator_admin_recovery',$1,$2,$3)",
      [
        user.id,
        key,
        JSON.stringify({
          method: "railway_operator",
          previousRole: user.role,
          role: "admin",
          requestId,
        }),
      ],
    );
    await client.query("INSERT INTO system_settings(key,value) VALUES($1,$2)", [
      key,
      JSON.stringify({
        email,
        userId: user.id,
        appliedAt: new Date().toISOString(),
      }),
    ]);
    await client.query("COMMIT");
    return {
      status: "applied",
      userId: user.id,
      previousRole: user.role,
      role: "admin",
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
