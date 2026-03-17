# Heartbeat 與模型計費排查

## 排程觸發 vs Heartbeat Timer

本專案有**兩種**會依時間自動觸發 agent 執行的機制，執行路徑相同（皆經 `enqueueWakeup` → run → adapter），但設定與用途不同：

| 機制 | 設定位置 | 觸發來源 | 用途 |
|------|----------|----------|------|
| **Heartbeat Timer** | 各 Agent 的 Configuration → Heartbeat | `source: "timer"` | 固定間隔（例如每 30 分鐘、每 1 小時）重複執行 |
| **日曆排程（Schedules）** | 側邊欄「排程」頁／API | `source: "automation"`, `triggerDetail: "scheduled"` | Cron（每天 8:00）、單次指定時刻、或日期區間內每日執行 |

若看到「固定間隔」的計費，先區分是 Timer（間隔秒數）還是排程（cron/once/ranges）。排程可在 **排程** 頁檢視與停用；Timer 請到各 Agent 的 **Configuration** → **Heartbeat** 設定中調整。

---

## 為什麼會每 30 分鐘觸發一次？

**Heartbeat 排程器（Timer）** 的行為如下：

- Server 每 **30 秒**（`heartbeatSchedulerIntervalMs`，預設 30000）跑一次 `tickTimers`。
- 對每個 **未暫停／未終止** 的 agent，若其 **Timer heartbeat 已啟用** 且 **距上次 heartbeat 已超過設定的間隔**，就會排入一次執行。
- 因此「每 N 分鐘觸發一次」＝**該 agent 的 heartbeat 間隔設為 N×60 秒**。例如間隔 1800 秒＝每 30 分鐘、**3600 秒＝每 1 小時**。

即使你認為沒有開 Timer，只要有一個 agent 的設定是「啟用 Timer + 某個 interval」，就會依該間隔排程執行。若你全部設成 3600，觸發頻率就是**每 1 小時**，不是每 30 分鐘。

### 如何確認是哪個 agent？

1. **逐個檢查**：到每個 agent 的 **Configuration** → **Heartbeat**，確認「Run on a timer」是否勾選，以及「Interval (seconds)」是否為 1800 或你看到的間隔（例如 1800＝30 分鐘、3600＝1 小時）。
2. **關閉 Timer 測試**：在 `.env` 加上 `HEARTBEAT_SCHEDULER_ENABLED=false`，重啟 server。若 30 分鐘一次的計費消失，即可確認是 Timer 觸發。

---

## 為什麼會用 Opus（claude-4.6-opus-high-thinking）被扣款？

你已把介面上的模型都設成 **「auto」**，但帳單仍出現 **opus** 計費，常見原因如下。

### 1. 「auto」由 Cursor 解析，可能選到 Opus

- 使用 **Cursor adapter** 時，Paperclip 會把你在設定裡選的 **model** 原樣傳給 Cursor CLI（例如 `--model auto`）。
- **「auto」對應到哪個實際模型，是由 Cursor 產品端決定**，不是 Paperclip。Cursor 若把「auto」解析成 `claude-4.6-opus-high-thinking`，就會走 Anthropic Opus API 並產生你看到的計費。
- 因此：**在 Paperclip 裡選「auto」≠ 不會用 Opus**，只要 Cursor 端把 auto 對應到 Opus 就會扣款。

### 2. 建議作法（避免 Opus 扣款）

- 在 **每個使用 Cursor adapter 的 agent** 的 **Configuration** 裡，**不要用「auto」**，改為選擇你確定在 Unlimited 或不會額外扣款的模型（例如 **sonnet-4.6**、**sonnet-4.6-thinking** 等，依 Cursor 提供的選項為準）。
- 若你希望完全避免 Opus，就**不要選** `opus-4.6`、`opus-4.6-thinking` 等選項。

### 3. 若使用 Claude Local adapter

- 請在該 agent 的 Configuration 裡確認 **Model** 欄位沒有選到 Opus 系列，改選你允許的模型。

---

## OpenClaw Gateway：為什麼會「gateway closed (1006)」？

使用 **OpenClaw Gateway** adapter 時，若看到 `Error: gateway closed (1006):` 並導致 run 失敗或 process 崩潰，代表 **WebSocket 連線異常中斷**。

### 1006 是什麼？

- **Close code 1006** = **Abnormal Closure**（異常關閉）：連線在**沒有收到正常 close frame** 的情況下就斷開。
- 也就是說，**對端（gateway）或網路在沒有「禮貌關閉」的情況下就斷線了**。

### 常見原因（由 gateway／網路端造成）

| 原因 | 說明 |
|------|------|
| **Gateway 重啟或當掉** | OpenClaw gateway 程序重啟、crash、或被 kill，連線直接被作業系統關閉。 |
| **網路中斷** | WiFi 斷線、拔線、VPN 斷開、防火牆中斷長連線等。 |
| **Gateway 逾時或主動斷線** | Gateway 端有 idle timeout 或資源限制，主動關閉長時間無活動的連線。 |
| **部署／更新** | Gateway 正在 deploy 或更新，舊 process 被關掉。 |

### 你可以怎麼做？

1. **看 gateway 端**：確認 OpenClaw gateway 是否穩定、有無重啟或 crash log。
2. **看網路**：若在遠端或 VPN，檢查是否常斷線；必要時加 keep-alive 或重連邏輯（依 gateway 實作）。
3. **Paperclip 端**：此錯誤會被 adapter 接住並回傳為 **run 失敗**（`errorMessage` / `errorCode`），不會再讓 Node process 崩潰；若仍崩潰，請確認已用最新版 adapter 並重啟 server。

### Paperclip 一送就壞、TUI 也跟著壞（同一台 gateway）

若你 **restart gateway 後用 TUI 測試正常**，但 **Paperclip 一送請求就壞掉，TUI 也一起掛**，代表是 **Paperclip 的連線或請求讓 gateway 出問題**，不是單純網路或重啟。

可能原因與排查：

| 可能原因 | 說明 | 建議排查 |
|----------|------|----------|
| **Gateway 收到 Paperclip 請求後 crash** | gateway 對我們送出的 payload／協定有 bug 或未處理情況（例如某個欄位、過大 message）。 | 1) 重現時**開 gateway 的 log**（stderr/stdout 或檔案），看 Paperclip 連上並送 `agent` 後有沒有 exception 或 crash。2) 看 Paperclip 的 run log：`[openclaw-gateway] outbound message length=... payload ~... bytes`，若 message 或 payload 特別大，可先縮小 adapter 的 prompt 或 context 再試。 |
| **Gateway 只支援單一連線或有限連線** | 同時只能服務一個 client；Paperclip 連上後 TUI 被踢或 gateway 重啟。 | 查 OpenClaw gateway 文件或設定是否有「單一 session／單一連線」限制；必要時錯開 TUI 與 Paperclip 使用，或換成支援多連線的 gateway 設定。 |
| **Payload 與 TUI 差異** | Paperclip 送的 `agent` payload（例如 `message`、`sessionKey`、自訂欄位）與 TUI 不同，觸發 gateway 端錯誤。 | 對比 gateway 收到的 request：TUI 送什麼、Paperclip 送什麼（可從 Paperclip run log 的 redacted payload 與 gateway log 對照），找出差異後在 adapter 設定或程式裡收斂成 gateway 能接受的格式。 |

建議步驟：**先在同一台機器上重現**（gateway + TUI 正常 → 用 Paperclip 送一次），同時看 **gateway 的 log**；若一送就出現 exception 或 process 結束，就能確認是 gateway 被我們的請求弄掛，再依上表縮小範圍（payload 大小、欄位、連線數）。

---

## 總結

| 現象 | 可能原因 | 建議動作 |
|------|----------|----------|
| 每 30 分鐘觸發一次 | 某個 agent 的 Timer heartbeat 啟用且 interval = 1800 秒，或排程頁有設定對應的 cron | 到 Instance Settings / 各 agent Heartbeat 或「排程」頁檢查並關閉/調整 |
| 已設「auto」仍出現 Opus 計費 | Cursor 將「auto」解析為 Opus | 在 Cursor agent 的 Configuration 改設明確模型（如 sonnet-4.6），不要用 auto |

若你已關閉所有 Timer 且所有 agent 都改成非 auto／非 Opus 後，仍出現固定間隔的 Opus 計費，則有可能是 **Cursor 產品本身** 或其他外部排程（例如本機 cron、其他服務）在呼叫 API，需在 Paperclip 以外排查。

---

## 為什麼帳單上每次都是 Input 4、Cache 很大？

若你看到 **Input 固定是 4**、Cache Read/Write 很大、Output 幾百，代表有**重複、輸入極小的請求**在用同一個模型。

### 本專案裡會送出「極短 prompt」的地方

- **只有一處**：Adapter 的 **「Test environment」** probe，會送一句 `"Respond with hello."`（約 4 個 token）給 Cursor/Claude CLI。  
- 這個 probe **只在使用者手動按「Test environment」按鈕時**會跑，**不會**被排程或背景自動觸發。

### 所以「每次 Input 4」通常不是 Paperclip 的 Timer

- Paperclip 的 **Timer heartbeat** 送的是 **Configuration 裡的 prompt 範本**（通常遠超過 4 個 token），不會固定是 Input 4。
- 若你**沒有**在開 Agent Configuration 時常按「Test environment」，但帳單上仍**固定出現 Input 4** 的紀錄，較可能是：
  - **Cursor 產品本身**的 background 行為（例如 session 維持、檢查、索引等）在用極小 input 呼叫 API，或  
  - 其他整合／腳本在打同一個 Cursor/Anthropic 帳號。

建議：在 Cursor 設定或文件中查是否有「background / 背景連線」或「session keep-alive」類選項，必要時可關閉或拉長間隔，再對照帳單是否仍出現固定 Input 4。
