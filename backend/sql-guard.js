const DANGEROUS_RULES = [
  { label: "DROP", regex: /\bdrop\b/i },
  { label: "DELETE", regex: /\bdelete\b/i },
  { label: "TRUNCATE", regex: /\btruncate\b/i },
  { label: "UPDATE", regex: /\bupdate\b/i },
  { label: "INSERT", regex: /\binsert\b/i },
  { label: "ALTER", regex: /\balter\b/i },
  { label: "EXEC", regex: /\bexec(?:ute)?\b/i },
  { label: "SP_", regex: /\bsp_[a-z0-9_]+\b/i },
  { label: "USE", regex: /\buse\b/i },
  { label: "MERGE", regex: /\bmerge\b/i },
  { label: "GRANT", regex: /\bgrant\b/i },
  { label: "REVOKE", regex: /\brevoke\b/i },
  { label: "DENY", regex: /\bdeny\b/i }
];

const THREE_PART_NAME_REGEX =
  /(?:\[[^\]]+\]|[A-Za-z0-9_]+)\s*\.\s*(?:\[[^\]]+\]|[A-Za-z0-9_]+)\s*\.\s*(?:\[[^\]]+\]|[A-Za-z0-9_]+)/i;

function splitSqlBatches(sqlText) {
  return sqlText
    .split(/^\s*GO\s*$/gim)
    .map((batch) => batch.trim())
    .filter(Boolean);
}

function normalizeSql(sqlText) {
  return sqlText
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();
}

function guardSql(sqlText) {
  const normalized = normalizeSql(sqlText);

  if (!normalized) {
    throw new Error("SQL text cannot be empty.");
  }

  for (const rule of DANGEROUS_RULES) {
    if (rule.regex.test(normalized)) {
      throw new Error(`Blocked dangerous SQL keyword: ${rule.label}`);
    }
  }

  if (THREE_PART_NAME_REGEX.test(normalized)) {
    throw new Error("Cross-database object names are not allowed in this version.");
  }

  const batches = splitSqlBatches(normalized);
  if (batches.length === 0) {
    throw new Error("No executable SQL batches were found.");
  }

  const unsupported = batches.find((batch) => {
    const lowered = batch.toLowerCase();
    return !(
      lowered.startsWith("create table") ||
      lowered.startsWith("create index") ||
      lowered.startsWith("create unique index")
    );
  });

  if (unsupported) {
    throw new Error(
      "Only CREATE TABLE, CREATE INDEX, and CREATE UNIQUE INDEX statements are allowed."
    );
  }

  return batches;
}

function extractCreatedTables(batches) {
  const tableNames = new Set();

  for (const batch of batches) {
    const match = batch.match(
      /create\s+table\s+(?:\[(?<schema>[^\]]+)\]\.)?\[(?<table>[^\]]+)\]|create\s+table\s+(?:(?<schema2>[A-Za-z0-9_]+)\.)?(?<table2>[A-Za-z0-9_]+)/i
    );

    if (!match || !match.groups) {
      continue;
    }

    const schemaName = match.groups.schema || match.groups.schema2;
    const tableName = match.groups.table || match.groups.table2;

    if (tableName) {
      tableNames.add(schemaName ? `${schemaName}.${tableName}` : tableName);
    }
  }

  return Array.from(tableNames);
}

module.exports = {
  extractCreatedTables,
  guardSql,
  normalizeSql,
  splitSqlBatches
};
