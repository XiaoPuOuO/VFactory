/** 單一公司在 DB 中對某 built-in plugin 的啟用與設定（與 API 回傳對齊）。 */
export interface CompanyPluginState {
  pluginId: string;
  enabled: boolean;
  config: Record<string, unknown>;
  updatedAt: string;
}

/**
 * GET /companies/:id/plugins 項目：registry 中繼資料與公司狀態合併。
 * 尚未有 DB 列時 enabled 預設 false、updatedAt 為 null。
 */
export interface CompanyPluginDescriptor {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  config: Record<string, unknown>;
  updatedAt: string | null;
}
