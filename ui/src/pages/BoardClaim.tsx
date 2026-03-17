import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "@/lib/router";
import { accessApi } from "../api/access";
import { authApi } from "../api/auth";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import "./BoardClaim.css";

export function BoardClaimPage() {
  const queryClient = useQueryClient();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const token = (params.token ?? "").trim();
  const code = (searchParams.get("code") ?? "").trim();
  const currentPath = useMemo(
    () => `/board-claim/${encodeURIComponent(token)}${code ? `?code=${encodeURIComponent(code)}` : ""}`,
    [token, code],
  );

  const sessionQuery = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });
  const statusQuery = useQuery({
    queryKey: ["board-claim", token, code],
    queryFn: () => accessApi.getBoardClaimStatus(token, code),
    enabled: token.length > 0 && code.length > 0,
    retry: false,
  });

  const claimMutation = useMutation({
    mutationFn: () => accessApi.claimBoard(token, code),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
      await queryClient.invalidateQueries({ queryKey: queryKeys.health });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.stats });
      await statusQuery.refetch();
    },
  });

  if (!token || !code) {
    return <div className="board-claim-page error">Invalid board claim URL.</div>;
  }

  if (statusQuery.isLoading || sessionQuery.isLoading) {
    return <div className="board-claim-page muted">Loading claim challenge...</div>;
  }

  if (statusQuery.error) {
    return (
      <div className="board-claim-page">
        <div className="board-claim-card">
          <h1>Claim challenge unavailable</h1>
          <p className="board-claim-card-desc">
            {statusQuery.error instanceof Error ? statusQuery.error.message : "Challenge is invalid or expired."}
          </p>
        </div>
      </div>
    );
  }

  const status = statusQuery.data;
  if (!status) {
    return <div className="board-claim-page error">Claim challenge unavailable.</div>;
  }

  if (status.status === "claimed") {
    return (
      <div className="board-claim-page">
        <div className="board-claim-card">
          <h1>Board ownership claimed</h1>
          <p className="board-claim-card-desc">
            This instance is now linked to your authenticated user.
          </p>
          <Button asChild className="board-claim-card-actions">
            <Link to="/">Open board</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!sessionQuery.data) {
    return (
      <div className="board-claim-page">
        <div className="board-claim-card">
          <h1>Sign in required</h1>
          <p className="board-claim-card-desc">
            Sign in or create an account, then return to this page to claim Board ownership.
          </p>
          <Button asChild className="board-claim-card-actions">
            <Link to={`/auth?next=${encodeURIComponent(currentPath)}`}>Sign in / Create account</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="board-claim-page">
      <div className="board-claim-card">
        <h1 className="lg">Claim Board ownership</h1>
        <p className="board-claim-card-desc">
          This will promote your user to instance admin and migrate company ownership access from local trusted mode.
        </p>

        {claimMutation.error && (
          <p className="board-claim-card-error">
            {claimMutation.error instanceof Error ? claimMutation.error.message : "Failed to claim board ownership"}
          </p>
        )}

        <Button
          className="board-claim-card-actions cta"
          onClick={() => claimMutation.mutate()}
          disabled={claimMutation.isPending}
        >
          {claimMutation.isPending ? "Claiming…" : "Claim ownership"}
        </Button>
      </div>
    </div>
  );
}
