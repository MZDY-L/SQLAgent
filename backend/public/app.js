const sqlInput = document.getElementById("sqlInput");
const executeButton = document.getElementById("executeButton");
const clearButton = document.getElementById("clearButton");
const statusText = document.getElementById("statusText");
const resultStatus = document.getElementById("resultStatus");
const resultCount = document.getElementById("resultCount");
const resultTables = document.getElementById("resultTables");
const resultOutput = document.getElementById("resultOutput");

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
  resultStatus.textContent = data.success ? "成功" : "失败";
  resultCount.textContent = String(data.executedStatements || 0);
  resultTables.textContent =
    Array.isArray(data.createdTables) && data.createdTables.length > 0
      ? data.createdTables.join(", ")
      : "-";
  resultOutput.value = JSON.stringify(data, null, 2);
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
    const response = await fetch("/execute-schema", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        requirementText: "manual_sql_submit",
        sql,
        confirmToken: true
      })
    });

    const data = await response.json();
    updateResult(data);

    if (!response.ok || !data.success) {
      throw new Error(data.errorMessage || "执行失败");
    }
  } catch (error) {
    alert(error.message || "执行失败");
  } finally {
    executeButton.disabled = false;
    executeButton.textContent = "执行建表";
    refreshHealth();
  }
}

clearButton.addEventListener("click", () => {
  sqlInput.value = "";
  resultStatus.textContent = "未执行";
  resultCount.textContent = "0";
  resultTables.textContent = "-";
  resultOutput.value = "";
});

executeButton.addEventListener("click", executeSchema);

refreshHealth();
