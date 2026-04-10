const assert = require("node:assert/strict");

const { extractCreatedTables, guardSql, normalizeSql, splitSqlBatches } = require("./sql-guard");

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

test("normalizeSql removes comments", () => {
  const input = `
    -- line comment
    CREATE TABLE users (
      id INT PRIMARY KEY
    );
    /* block comment */
  `;

  const output = normalizeSql(input);

  assert.equal(output.includes("--"), false);
  assert.equal(output.includes("/*"), false);
  assert.match(output, /CREATE TABLE users/i);
});

test("splitSqlBatches splits on GO boundaries", () => {
  const input = `
    CREATE TABLE users (id INT PRIMARY KEY);
    GO
    CREATE UNIQUE INDEX ux_users_id ON users(id);
  `;

  const batches = splitSqlBatches(input);

  assert.equal(batches.length, 2);
  assert.match(batches[0], /CREATE TABLE users/i);
  assert.match(batches[1], /CREATE UNIQUE INDEX/i);
});

test("guardSql accepts create table statements", () => {
  const sql = `
    CREATE TABLE users (
      id INT PRIMARY KEY,
      username NVARCHAR(100) NOT NULL
    );
  `;

  const batches = guardSql(sql);

  assert.equal(batches.length, 1);
});

test("guardSql rejects dangerous statements", () => {
  assert.throws(() => guardSql("DROP TABLE users;"), /DROP/);
  assert.throws(() => guardSql("ALTER TABLE users ADD age INT;"), /ALTER/);
  assert.throws(() => guardSql("USE other_db; CREATE TABLE users(id INT);"), /USE/);
});

test("guardSql rejects explicit cross-database object names", () => {
  const sql = "CREATE TABLE other_db.dbo.users (id INT PRIMARY KEY);";
  assert.throws(() => guardSql(sql), /Cross-database/);
});

test("extractCreatedTables returns schema-qualified names when present", () => {
  const names = extractCreatedTables([
    "CREATE TABLE dbo.users (id INT PRIMARY KEY);",
    "CREATE TABLE [sales].[orders] (id INT PRIMARY KEY);"
  ]);

  assert.deepEqual(names, ["dbo.users", "sales.orders"]);
});

if (!process.exitCode) {
  console.log("All tests passed.");
}
