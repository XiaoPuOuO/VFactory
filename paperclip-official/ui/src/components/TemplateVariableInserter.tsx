import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import "./TemplateVariableInserter.css";

const SYSTEM_VARIABLES: { token: string; labelKey: string }[] = [
  { token: "companyId", labelKey: "companyId" },
  { token: "agentId", labelKey: "agentId" },
  { token: "skillName", labelKey: "skillName" },
];

export type PriorOutputVar = { outputKey: string; stepLabel: string };

/**
 * 與受控 Textarea 搭配：在游標位置插入 {{token}}。
 */
export function useTextareaVariableInsert(value: string, onChange: (next: string) => void) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selRef = useRef({ start: 0, end: 0 });

  const captureSelection = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    selRef.current = { start: el.selectionStart, end: el.selectionEnd };
  }, []);

  const insertToken = useCallback(
    (token: string) => {
      const { start, end } = selRef.current;
      const snippet = `{{${token}}}`;
      const next = value.slice(0, start) + snippet + value.slice(end);
      onChange(next);
      const pos = start + snippet.length;
      queueMicrotask(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(pos, pos);
        selRef.current = { start: pos, end: pos };
      });
    },
    [value, onChange],
  );

  return { textareaRef, captureSelection, insertToken };
}

export type TemplateVariableInserterProps = {
  insertToken: (token: string) => void;
  argumentNames: string[];
  priorOutputs: PriorOutputVar[];
  disabled?: boolean;
};

export function TemplateVariableInserter({
  insertToken,
  argumentNames,
  priorOutputs,
  disabled,
}: TemplateVariableInserterProps) {
  const { t } = useTranslation("companySkills");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled} className="template-var-inserter-trigger">
          {t("insertVariable")}
          <ChevronDown className="template-var-inserter-chevron" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="template-var-inserter-menu">
        <DropdownMenuLabel>{t("varGroupSystem")}</DropdownMenuLabel>
        {SYSTEM_VARIABLES.map((v) => (
          <DropdownMenuItem key={v.token} onSelect={() => insertToken(v.token)}>
            <code className="template-var-code">{`{{${v.token}}}`}</code>
            <span className="template-var-label">{v.labelKey}</span>
          </DropdownMenuItem>
        ))}
        {argumentNames.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t("varGroupArguments")}</DropdownMenuLabel>
            {argumentNames.map((name) => {
              const trimmed = name.trim();
              if (!trimmed) return null;
              return (
                <DropdownMenuItem key={trimmed} onSelect={() => insertToken(trimmed)}>
                  <code className="template-var-code">{`{{${trimmed}}}`}</code>
                </DropdownMenuItem>
              );
            })}
          </>
        )}
        {priorOutputs.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t("varGroupPriorOutputs")}</DropdownMenuLabel>
            {priorOutputs.map((o) => (
              <DropdownMenuItem key={o.outputKey} onSelect={() => insertToken(o.outputKey)}>
                <code className="template-var-code">{`{{${o.outputKey}}}`}</code>
                <span className="template-var-label">{o.stepLabel}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
