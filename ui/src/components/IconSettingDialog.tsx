import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { assetsApi, MAX_ICON_BYTES } from "@/api/assets";
import { cn } from "@/lib/utils";

const ICON_ACCEPT = "image/png,image/jpeg";
const MAX_ICON_MB = MAX_ICON_BYTES / (1024 * 1024);

export type IconSettingMode = "company" | "project";

export interface IconSettingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: IconSettingMode;
  companyId: string;
  /** 目前圖示圖片 URL（/api/assets/:id/content），無則為 null。 */
  currentIconUrl: string | null;
  /** 專案模式時：目前色塊顏色（僅用於預覽，顏色在頁面設定）。 */
  currentColor?: string | null;
  /** 儲存圖示：傳入 assetId 或 null 表示清除。 */
  onSaveIcon: (assetId: string | null) => void | Promise<void>;
  /** 專案模式時：儲存顏色（無圖示時使用）。保留以相容既有呼叫，實際顏色以頁面為主。 */
  onSaveColor?: (color: string) => void | Promise<void>;
  /** 上傳中或儲存中時禁用按鈕。 */
  busy?: boolean;
}

export function IconSettingDialog({
  open,
  onOpenChange,
  mode,
  companyId,
  currentIconUrl,
  onSaveIcon,
  busy = false,
}: IconSettingDialogProps) {
  const { t } = useTranslation(["company", "project", "common"]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const isProject = mode === "project";

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError(null);

    const type = (file.type || "").toLowerCase();
    if (type !== "image/png" && type !== "image/jpeg") {
      setUploadError(t("project:iconFormatError"));
      return;
    }
    if (file.size > MAX_ICON_BYTES) {
      setUploadError(t("project:iconSizeError", { max: String(MAX_ICON_MB) }));
      return;
    }

    setUploading(true);
    try {
      const asset = await assetsApi.uploadIcon(companyId, file);
      await onSaveIcon(asset.assetId);
      onOpenChange(false);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t("common:failed"));
    } finally {
      setUploading(false);
    }
  };

  const handleClear = async () => {
    setUploadError(null);
    try {
      await onSaveIcon(null);
      onOpenChange(false);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t("common:failed"));
    }
  };

  const title = isProject ? t("project:iconSettingTitle") : t("company:iconSettingTitle");
  const description = isProject ? t("project:iconSettingHintShort") : t("company:iconSettingHint");
  const noIconHint = isProject ? t("project:uploadIconOrUseColor") : t("company:uploadIconOrUsePattern");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={true}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 目前預覽：與 Company 一致，無圖示時顯示「無圖示」文字 */}
          <div className="flex items-center gap-4">
            <div
              className={cn(
                "shrink-0 w-14 h-14 rounded-[14px] overflow-hidden flex items-center justify-center",
                "border border-border bg-muted/30",
              )}
            >
              {currentIconUrl ? (
                <img
                  src={currentIconUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-muted-foreground text-xs">
                  {t("company:noIcon")}
                </span>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              {currentIconUrl ? t("company:iconUploaded") : noIconHint}
            </div>
          </div>

          {/* 上傳：僅 PNG/JPEG，有大小限制（與 Company 一致） */}
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={ICON_ACCEPT}
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? t("company:saving") : t("company:uploadIcon")}
            </Button>
            <p className="text-xs text-muted-foreground">
              {t("project:iconFormatAndSize")}
            </p>
          </div>

          {uploadError && (
            <p className="text-sm text-destructive">{uploadError}</p>
          )}
        </div>

        <DialogFooter showCloseButton={false}>
          {currentIconUrl && (
            <Button
              type="button"
              variant="outline"
              disabled={busy || uploading}
              onClick={handleClear}
            >
              {t("company:clearIcon")}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common:close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
