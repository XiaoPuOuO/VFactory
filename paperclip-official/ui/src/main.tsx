import "./i18n";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "@/lib/router";
import { WorkflowUnsavedProvider } from "@/context/WorkflowUnsavedContext";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { getQueryPersisterStorageKey, shouldPersistReadonlyIssueQuery } from "./lib/react-query-persist";
import { queryClient } from "./lib/queryClient";
import { App } from "./App";
import { CompanyProvider } from "./context/CompanyContext";
import { LiveUpdatesProvider } from "./context/LiveUpdatesProvider";
import { BreadcrumbProvider } from "./context/BreadcrumbContext";
import { PanelProvider } from "./context/PanelContext";
import { SidebarProvider } from "./context/SidebarContext";
import { DialogProvider } from "./context/DialogContext";
import { ToastProvider } from "./context/ToastContext";
import { ThemeProvider } from "./context/ThemeContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@mdxeditor/editor/style.css";
import "./index.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js");
  });
}

const queryPersister = createSyncStoragePersister({
  storage: window.localStorage,
  key: getQueryPersisterStorageKey(),
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        maxAge: 1000 * 60 * 60 * 24 * 7,
        dehydrateOptions: {
          shouldDehydrateQuery: shouldPersistReadonlyIssueQuery,
        },
      }}
    >
      <ThemeProvider>
        <CompanyProvider>
          <ToastProvider>
            <LiveUpdatesProvider>
              <BrowserRouter>
                <WorkflowUnsavedProvider>
                  <TooltipProvider>
                    <BreadcrumbProvider>
                      <SidebarProvider>
                        <PanelProvider>
                          <DialogProvider>
                            <App />
                          </DialogProvider>
                        </PanelProvider>
                      </SidebarProvider>
                    </BreadcrumbProvider>
                  </TooltipProvider>
                </WorkflowUnsavedProvider>
              </BrowserRouter>
            </LiveUpdatesProvider>
          </ToastProvider>
        </CompanyProvider>
      </ThemeProvider>
    </PersistQueryClientProvider>
  </StrictMode>
);
