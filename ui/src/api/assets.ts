import type { AssetImage } from "@paperclipai/shared";
import { api } from "./client";

/** 圖示上傳最大體積（與後端 MAX_ICON_BYTES 一致，僅前端提示用）。 */
export const MAX_ICON_BYTES = 512 * 1024;

export const assetsApi = {
  uploadImage: async (companyId: string, file: File, namespace?: string) => {
    // Read file data into memory eagerly so the fetch body is self-contained.
    // Clipboard-paste File objects reference transient data that the browser may
    // discard after the paste-event handler returns, causing ERR_ACCESS_DENIED
    // when fetch() later tries to stream the FormData body.
    const buffer = await file.arrayBuffer();
    const safeFile = new File([buffer], file.name, { type: file.type });

    const form = new FormData();
    form.append("file", safeFile);
    if (namespace && namespace.trim().length > 0) {
      form.append("namespace", namespace.trim());
    }
    return api.postForm<AssetImage>(`/companies/${companyId}/assets/images`, form);
  },

  /** 公司/專案圖示上傳：僅 PNG/JPEG、後端會做 magic bytes 驗證。 */
  uploadIcon: async (companyId: string, file: File): Promise<AssetImage> => {
    const buffer = await file.arrayBuffer();
    const safeFile = new File([buffer], file.name, { type: file.type });
    const form = new FormData();
    form.append("file", safeFile);
    return api.postForm<AssetImage>(`/companies/${companyId}/assets/icon`, form);
  },
};

