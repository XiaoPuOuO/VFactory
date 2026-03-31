/**
 * Worker／adapter 回報「單一 workflow 步驟」完成時的結構化 payload（與 server HTTP 填 prompt 分離）。
 * 版本欄位便於日後擴充；server 邊界應以 Zod 驗證。
 */
export type WorkflowStepWorkerResultSchemaVersion = 1;

export type WorkflowStepWorkerResultV1 =
  | {
      schemaVersion: 1;
      status: "ok";
      /**
       * 寫入 workflow context 的鍵值對（由引擎依步驟 `output` 等規則合併）。
       */
      outputs?: Record<string, unknown>;
      message?: string;
    }
  | {
      schemaVersion: 1;
      status: "error";
      error: string;
      message?: string;
    };

export type WorkflowStepWorkerResult = WorkflowStepWorkerResultV1;
