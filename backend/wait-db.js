const sql = require("mssql");

const waitDelayMs = Number(process.env.DB_WAIT_DELAY_MS || 2000);
const waitAttempts = Number(process.env.DB_WAIT_MAX_ATTEMPTS || 60);

function getConfig(database) {
  return {
    server: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 1433),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database,
    options: {
      encrypt: String(process.env.DB_ENCRYPT || "false").toLowerCase() === "true",
      trustServerCertificate:
        String(process.env.DB_TRUST_SERVER_CERTIFICATE || "true").toLowerCase() === "true"
    }
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDb() {
  for (let i = 1; i <= waitAttempts; i += 1) {
    const pool = new sql.ConnectionPool(getConfig("master"));

    try {
      await pool.connect();
      await pool.request().query("SELECT 1");
      await pool.close();
      console.log("Database is ready.");
      return;
    } catch (error) {
      try {
        await pool.close();
      } catch (_ignore) {
        // ignore close errors for failed attempts
      }

      if (i === waitAttempts) {
        throw new Error(`Database is not ready after ${waitAttempts} attempts: ${error.message}`);
      }

      console.log(`Waiting for database (${i}/${waitAttempts})...`);
      await sleep(waitDelayMs);
    }
  }
}

waitForDb().catch((error) => {
  console.error(error.message);
  process.exit(1);
});