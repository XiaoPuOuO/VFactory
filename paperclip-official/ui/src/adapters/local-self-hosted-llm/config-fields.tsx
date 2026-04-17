import type { AdapterConfigFieldsProps } from "../types";
import { useTranslation } from "react-i18next";
import { DraftInput, Field, help } from "../../components/agent-config-primitives";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

export function LocalSelfHostedLlmConfigFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
}: AdapterConfigFieldsProps) {
  const { t } = useTranslation("onboarding");
  const { t: tCommon } = useTranslation("common");
  const apiKeyCreate =
    typeof values?.envBindings?.apiKey === "string"
      ? values.envBindings.apiKey
      : "";

  return (
    <>
      <Field label={t("localSelfHostedBaseUrl")} hint={help.baseUrl}>
        <DraftInput
          value={
            isCreate
              ? values!.baseUrl
              : eff("adapterConfig", "baseUrl", String(config.baseUrl ?? ""))
          }
          onCommit={(v) =>
            isCreate ? set!({ baseUrl: v }) : mark("adapterConfig", "baseUrl", v || undefined)
          }
          immediate
          className={inputClass}
          placeholder={t("localSelfHostedBaseUrlPlaceholder")}
        />
      </Field>
      <Field label={t("localSelfHostedModel")} hint={t("localSelfHostedModelHint")}>
        <DraftInput
          value={
            isCreate ? values!.model : eff("adapterConfig", "model", String(config.model ?? ""))
          }
          onCommit={(v) =>
            isCreate ? set!({ model: v }) : mark("adapterConfig", "model", v || undefined)
          }
          immediate
          className={inputClass}
          placeholder={t("localSelfHostedModelPlaceholder")}
        />
      </Field>
      <Field label={t("localSelfHostedApiKey")} hint={t("localSelfHostedApiKeyHint")}>
        <DraftInput
          type="password"
          autoComplete="off"
          value={
            isCreate
              ? apiKeyCreate
              : eff("adapterConfig", "apiKey", String(config.apiKey ?? ""))
          }
          onCommit={(v) => {
            if (isCreate) {
              const nextBindings = { ...(values!.envBindings ?? {}) };
              if (v.trim()) nextBindings.apiKey = v;
              else delete nextBindings.apiKey;
              set!({ envBindings: nextBindings });
            } else {
              mark("adapterConfig", "apiKey", v || undefined);
            }
          }}
          immediate
          className={inputClass}
          placeholder={tCommon("optional")}
        />
      </Field>
    </>
  );
}
