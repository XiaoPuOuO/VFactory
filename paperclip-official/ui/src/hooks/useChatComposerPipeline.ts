import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { ChatMessage } from "@paperclipai/shared";
import { heartbeatsApi } from "../api/heartbeats";
import { queryKeys } from "../lib/queryKeys";
import { issueIdentifiersAfterLastUserMessage } from "../lib/chatPipelineIssueRefs";

export function useChatComposerPipeline({
  issuePrefix,
  messages,
  activeChatRuns,
}: {
  issuePrefix: string;
  messages: ChatMessage[] | undefined;
  activeChatRuns: { id: string }[] | undefined;
}) {
  const trackedIssueIdentifiers = useMemo(
    () => issueIdentifiersAfterLastUserMessage(messages, issuePrefix),
    [messages, issuePrefix],
  );

  const activeRunQueries = useQueries({
    queries: trackedIssueIdentifiers.map((identifier) => ({
      queryKey: queryKeys.issues.activeRun(identifier),
      queryFn: () => heartbeatsApi.activeRunForIssue(identifier),
      enabled: Boolean(identifier),
      refetchInterval: 3000,
    })),
  });

  const issueFollowUpBusy = activeRunQueries.some((q) => q.data != null);
  const chatRunBusy = Boolean(activeChatRuns && activeChatRuns.length > 0);
  const isPipelineBusy = chatRunBusy || issueFollowUpBusy;

  return {
    isPipelineBusy,
    chatRunBusy,
    issueFollowUpBusy,
    trackedIssueIdentifiers,
  };
}
