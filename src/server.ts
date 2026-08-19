import { createApp } from "./app";
import { checkDatabaseConnection } from "./config/database";
import { env } from "./config/env";

async function start(): Promise<void> {
  const app = createApp();

  app.listen(env.port, () => {
    console.log(`Trojan Leave Tracker API listening on port ${env.port}`);
  });

  const dbConnected = await checkDatabaseConnection();
  console.log(
    dbConnected
      ? "MySQL connection verified."
      : "Warning: could not reach MySQL — check backend/.env",
  );
}

start().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
