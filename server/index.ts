import { createApplication } from "./app";
import { serveStatic } from "./static";
import { pool } from "./db";
import { startMaintenance } from "./maintenance";
import { startPaymentMaintenance } from "./payment-bot";
import { log } from "./logger";

async function main() {
  const { app, httpServer } = await createApplication();
  if (process.env.NODE_ENV === "production") serveStatic(app);
  else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }
  const stopMaintenance = startMaintenance();
  const stopPaymentMaintenance = startPaymentMaintenance();
  const port = Number(process.env.PORT || 5000);
  httpServer.listen({ port, host: "0.0.0.0" }, () =>
    log(`serving on port ${port}`),
  );
  for (const signal of ["SIGTERM", "SIGINT"] as const)
    process.once(signal, () => {
      stopMaintenance();
      stopPaymentMaintenance();
      httpServer.close(() => {
        void pool.end().then(() => process.exit(0));
      });
      setTimeout(() => process.exit(1), 10000).unref();
    });
}
main().catch((error) => {
  console.error("Startup failed:", error.message);
  process.exitCode = 1;
});
