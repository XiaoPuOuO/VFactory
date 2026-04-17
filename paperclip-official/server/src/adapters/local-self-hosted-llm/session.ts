import type { AdapterSessionCodec } from "@paperclipai/adapter-utils";

/** Pass-through / null-safe session codec (Task 3 baseline; extend if session semantics evolve). */
export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw) {
    return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  },
  serialize(params) {
    return params && Object.keys(params).length > 0 ? params : null;
  },
  getDisplayId(params) {
    const sessionId = params?.sessionId;
    return typeof sessionId === "string" ? sessionId : null;
  },
};
