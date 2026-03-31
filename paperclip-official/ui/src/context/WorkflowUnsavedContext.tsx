import * as React from "react";

/**
 * 工作流程編輯頁在 BrowserRouter 下無法使用 useBlocker（僅 Data Router 支援）。
 * 以 ref 同步「是否有未儲存變更」，供 useNavigate / Link 在離開前 confirm。
 */
export type WorkflowUnsavedContextValue = {
  getDirty: () => boolean;
  setDirty: (dirty: boolean) => void;
};

export const WorkflowUnsavedContext = React.createContext<WorkflowUnsavedContextValue | null>(null);

export function WorkflowUnsavedProvider({ children }: { children: React.ReactNode }) {
  const dirtyRef = React.useRef(false);
  const setDirty = React.useCallback((v: boolean) => {
    dirtyRef.current = v;
  }, []);
  const getDirty = React.useCallback(() => dirtyRef.current, []);
  const value = React.useMemo(
    () => ({ getDirty, setDirty }),
    [getDirty, setDirty],
  );
  return <WorkflowUnsavedContext.Provider value={value}>{children}</WorkflowUnsavedContext.Provider>;
}

export function useWorkflowUnsavedRegistration() {
  return React.useContext(WorkflowUnsavedContext);
}
