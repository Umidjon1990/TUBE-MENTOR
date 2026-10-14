import { migrateDatabase } from "../server/migrate";
import { pool, db } from "../server/db";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "../server/auth";
try {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password || password.length < 10 || password.length > 128)
    throw new Error(
      "Set ADMIN_USERNAME and ADMIN_PASSWORD (10–128 characters) before running setup:admin",
    );
  await migrateDatabase();
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.username, username));
  if (existing) {
    if (existing.role !== "admin")
      throw new Error(
        "Username belongs to a non-admin account; choose another username",
      );
    console.log("Administrator already exists; no changes made");
  } else {
    await db
      .insert(users)
      .values({
        username,
        passwordHash: hashPassword(password),
        fullName: process.env.ADMIN_NAME || "Administrator",
        role: "admin",
        onboardingCompleted: true,
        emailVerified: true,
      });
    console.log("Administrator created");
  }
} finally {
  await pool.end();
}
