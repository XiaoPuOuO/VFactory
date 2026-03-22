import { API } from "@paperclipai/shared";
import { api } from "./client";

export type MentionablesResponse = {
  agents: { id: string; name: string; kind: "agent" }[];
  users: { id: string; name: string; kind: "user" }[];
};

export const mentionablesApi = {
  list: (companyId: string) => api.get<MentionablesResponse>(API.companyMentionables(companyId)),
};
