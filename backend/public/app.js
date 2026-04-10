const requirementInput = document.getElementById("requirementInput");
const cozeOutput = document.getElementById("cozeOutput");
const extractButton = document.getElementById("extractButton");
const parseStatus = document.getElementById("parseStatus");
const sqlInput = document.getElementById("sqlInput");
const previewButton = document.getElementById("previewButton");
const executeButton = document.getElementById("executeButton");
const clearButton = document.getElementById("clearButton");
const statusText = document.getElementById("statusText");
const resultStatus = document.getElementById("resultStatus");
const resultMode = document.getElementById("resultMode");
const resultCount = document.getElementById("resultCount");
const resultTables = document.getElementById("resultTables");
const resultDbReady = document.getElementById("resultDbReady");
const resultOutput = document.getElementById("resultOutput");

const SQL_CODE_BLOCK_REGEX = /```([a-z0-9_-]*)\s*([\s\S]*?)```/gi;

function scoreSqlCandidate(language, text) {
  const lowered = text.toLowerCase();
  let score = 0;

  if (["sql", "tsql", "mssql", "sqlserver"].includes(String(language || "").toLowerCase())) {
    score += 4;
  }

  if (lowered.includes("create table")) score += 4;
  if (lowered.includes("create index")) score += 2;
  if (lowered.includes("primary key")) score += 1;
  if (lowered.includes("foreign key")) score += 1;
  if (lowered.includes("constraint")) score += 1;
  if (lowered.includes("\ngo\n") || lowered.includes("\r\ngo\r\n")) score += 1;

  return score;
}

function extractSqlFromCozeText(rawText) {
  const input = String(rawText || "").trim();
  if (!input) {
    return "";
  }

  const candidates = [];
  let match;
  while ((match = SQL_CODE_BLOCK_REGEX.exec(input)) !== null) {
    const language = (match[1] || "").trim();
    const content = (match[2] || "").trim();

    if (!content) {
      continue;
    }

    candidates.push({
      content,
      score: scoreSqlCandidate(language, content)
    });
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return b.content.length - a.content.length;
    });

    return candidates[0].content;
  }

  const lowered = input.toLowerCase();
  const createTableIndex = lowered.indexOf("create table");
  if (createTableIndex >= 0) {
    return input.slice(createTableIndex).trim();
  }

  return input;
}

async function refreshHealth() {
  statusText.textContent = "检测中";

  try {
    const response = await fetch("/health");
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "服务不可用");
    }

    statusText.textContent = `正常（${data.database}）`;
  } catch (error) {
    statusText.textContent = error.message || "服务不可用";
  }
}

function updateResult(data) {
  const modeText = data.mode === "preview" ? "预检" : data.mode === "execute" ? "执行" : "-";
  const statusLabel =
    data.success && data.mode === "preview"
      ? "预检通过"
      : data.success
        ? "执行成功"
        : "失败";

  resultStatus.textContent = statusLabel;
  resultMode.textContent = modeText;
  resultCount.textContent = String(data.executedStatements || 0);
  resultTables.textContent =
    Array.isArray(data.createdTables) && data.createdTables.length > 0
      ? data.createdTables.join(", ")
      : "-";
  resultDbReady.textContent =
    typeof data.dbReady === "boolean" ? (data.dbReady ? "是" : "否") : "-";
  resultOutput.value = JSON.stringify(data, null, 2);
}

function getRequestPayload(sql, shouldExecute) {
  return {
    requirementText: requirementInput.value.trim(),
    sql,
    confirmToken: shouldExecute ? true : undefined
  };
}

function setButtonBusy(button, busyText) {
  button.disabled = true;
  button.dataset.originalText = button.textContent;
  button.textContent = busyText;
}

function restoreButton(button) {
  button.disabled = false;
  if (button.dataset.originalText) {
    button.textContent = button.dataset.originalText;
  }
}

async function callSchemaApi(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  updateResult(data);

  if (!response.ok || !data.success) {
    throw new Error(data.errorMessage || "请求失败");
  }

  return data;
}

function extractSqlToEditor() {
  const rawText = cozeOutput.value.trim();
  if (!rawText) {
    alert("请先粘贴 Coze 输出内容");
    cozeOutput.focus();
    return;
  }

  const extracted = extractSqlFromCozeText(rawText);
  if (!extracted) {
    parseStatus.textContent = "提取失败：未找到可用 SQL";
    return;
  }

  sqlInput.value = extracted;
  parseStatus.textContent = `提取完成：${extracted.length} 字符`;
}

async function previewSchema() {
  const sql = sqlInput.value.trim();
  if (!sql) {
    alert("请先提取或粘贴 SQL");
    sqlInput.focus();
    return;
  }

  setButtonBusy(previewButton, "预检中...");

  try {
    await callSchemaApi("/preview-schema", getRequestPayload(sql, false));
  } catch (error) {
    alert(error.message || "预检失败");
  } finally {
    restoreButton(previewButton);
  }
}

async function executeSchema() {
  const sql = sqlInput.value.trim();

  if (!sql) {
    alert("请先粘贴 SQL Server 建表脚本");
    sqlInput.focus();
    return;
  }

  executeButton.disabled = true;
  executeButton.textContent = "执行中...";

  try {
    await callSchemaApi("/execute-schema", getRequestPayload(sql, true));
  } catch (error) {
    alert(error.message || "执行失败");
  } finally {
    executeButton.disabled = false;
    executeButton.textContent = "执行建表";
    refreshHealth();
  }
}

clearButton.addEventListener("click", () => {
  requirementInput.value = "";
  cozeOutput.value = "";
  sqlInput.value = "";
  parseStatus.textContent = "未提取";
  resultStatus.textContent = "未执行";
  resultMode.textContent = "-";
  resultCount.textContent = "0";
  resultTables.textContent = "-";
  resultDbReady.textContent = "-";
  resultOutput.value = "";
});

extractButton.addEventListener("click", extractSqlToEditor);
previewButton.addEventListener("click", previewSchema);
executeButton.addEventListener("click", executeSchema);

refreshHealth();
