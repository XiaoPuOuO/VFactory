import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { usePanel } from "../context/PanelContext";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export function PropertiesPanel() {
  const { t } = useTranslation();
  const { panelContent, panelVisible, setPanelVisible } = usePanel();

  if (!panelContent) return null;

  return (
    <aside
      className="ui-properties-panel"
      style={{ width: panelVisible ? 320 : 0, opacity: panelVisible ? 1 : 0 }}
    >
      <div className="ui-properties-panel-inner">
        <div className="ui-properties-panel-header">
          <span className="ui-properties-panel-title">{t("properties.properties")}</span>
          <Button variant="ghost" size="icon-xs" onClick={() => setPanelVisible(false)}>
            <X className="ui-properties-panel-close-icon" />
          </Button>
        </div>
        <ScrollArea className="ui-properties-panel-scroll">
          <div className="ui-properties-panel-body">{panelContent}</div>
        </ScrollArea>
      </div>
    </aside>
  );
}
