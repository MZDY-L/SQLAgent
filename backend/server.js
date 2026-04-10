const express = require("express");
const dotenv = require("dotenv");
const sql = require("mssql");

const { extractCreatedTables, guardSql } = require("./sql-guard");

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);
const databaseName = String(process.env.DB_NAME || "coze_demo_db").trim();

let db;
let startupError = null;

app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

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

async function createDatabaseIfMissing() {
  const master = new sql.ConnectionPool(getConfig("master"));
  await master.connect();

  try {
    const escapedName = databaseName.replace(/'/g, "''");
    const safeName = `[${databaseName.replace(/]/g, "]]")}]`;
    await master.request().batch(`
      IF DB_ID('${escapedName}') IS NULL
      BEGIN
        EXEC('CREATE DATABASE ${safeName}')
      END
    `);
  } finally {
    await master.close();
  }
}

async function connect() {
  const required = ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME"];
  const missing = required.filter((key) => !process.env[key] || !String(process.env[key]).trim());

  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }

  await createDatabaseIfMissing();

  db = new sql.ConnectionPool(getConfig(databaseName));
  await db.connect();
  await db.request().query("SELECT 1");
}

function sendError(res, message, status = 400) {
  return res.status(status).json({
    success: false,
    executedStatements: 0,
    createdTables: [],
    errorMessage: message
  });
}

function buildSchemaPlan(sqlText) {
  const batches = guardSql(String(sqlText));
  const createdTables = extractCreatedTables(batches);

  return {
    batches,
    createdTables
  };
}

app.get("/health", async (_req, res) => {
  if (startupError || !db?.connected) {
    return res.status(503).json({
      ok: false,
      database: databaseName,
      error: startupError || "Database is not connected."
    });
  }

  try {
    await db.request().query("SELECT 1");
    return res.json({
      ok: true,
      dbConnected: true,
      database: databaseName
    });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      database: databaseName,
      error: error.message
    });
  }
});

app.post("/execute-schema", async (req, res) => {
  if (startupError || !db?.connected) {
    return sendError(res, startupError || "Database is not connected.", 503);
  }

  const { sql: sqlText, confirmToken } = req.body || {};

  if (confirmToken !== true) {
    return sendError(res, "Execution was not confirmed.");
  }

  if (!sqlText || !String(sqlText).trim()) {
    return sendError(res, "sql cannot be empty.");
  }

  let schemaPlan;
  try {
    schemaPlan = buildSchemaPlan(sqlText);
  } catch (error) {
    return sendError(res, error.message);
  }

  const { batches, createdTables } = schemaPlan;

  try {
    for (const batch of batches) {
      await db.request().batch(batch);
    }

    return res.json({
      success: true,
      executedStatements: batches.length,
      createdTables,
      errorMessage: null,
      mode: "execute"
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      executedStatements: 0,
      createdTables,
      errorMessage: error.message,
      mode: "execute"
    });
  }
});

app.post("/preview-schema", (req, res) => {
  const { sql: sqlText } = req.body || {};

  if (!sqlText || !String(sqlText).trim()) {
    return sendError(res, "sql cannot be empty.");
  }

  try {
    const { batches, createdTables } = buildSchemaPlan(sqlText);

    return res.json({
      success: true,
      executedStatements: batches.length,
      createdTables,
      errorMessage: null,
      mode: "preview",
      dbReady: !startupError && Boolean(db?.connected)
    });
  } catch (error) {
    return sendError(res, error.message);
  }
});

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return sendError(res, "Request body is not valid JSON.");
  }

  return sendError(res, "Internal server error.", 500);
});

connect()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
    });
  })
  .catch((error) => {
    startupError = error.message;
    app.listen(port, () => {
      console.error(startupError);
    });
  });
