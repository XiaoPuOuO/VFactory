-- 公司與專案圖示：儲存為 asset，無圖示時公司用品牌色 pattern、專案用 color 色塊。
ALTER TABLE "companies" ADD COLUMN "icon_asset_id" uuid REFERENCES "assets"("id") ON DELETE SET NULL;
ALTER TABLE "projects" ADD COLUMN "icon_asset_id" uuid REFERENCES "assets"("id") ON DELETE SET NULL;
