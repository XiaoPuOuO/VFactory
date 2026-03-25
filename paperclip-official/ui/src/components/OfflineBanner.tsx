import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { WifiOff } from "lucide-react";

/**
 * 網路離線時顯示唯讀提示（與 React Query 持久化快取搭配）。
 */
export function OfflineBanner() {
  const { t } = useTranslation();
  const [offline, setOffline] = useState(
    () => typeof navigator !== "undefined" && !navigator.onLine,
  );

  useEffect(() => {
    function onOnline() {
      setOffline(false);
    }
    function onOffline() {
      setOffline(true);
    }
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="offline-banner" role="status">
      <WifiOff className="offline-banner-icon" aria-hidden />
      <span>{t("common.offlineReadOnlyBanner")}</span>
    </div>
  );
}
