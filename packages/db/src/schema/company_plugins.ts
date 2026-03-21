import { pgTable, uuid, text, timestamp, boolean, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/** 公司對內建（編譯期註冊）非 adapter Plugin 的啟用與 JSON 設定。 */
export const companyPlugins = pgTable(
  "company_plugins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    /** 對應 shared `BUILTIN_PLUGIN_IDS` 之字串 id。 */
    pluginId: text("plugin_id").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("company_plugins_company_idx").on(table.companyId),
    companyPluginUq: uniqueIndex("company_plugins_company_plugin_uq").on(table.companyId, table.pluginId),
  }),
);
