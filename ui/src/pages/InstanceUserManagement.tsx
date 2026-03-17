import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserCog, Pencil, Ban, Trash2, ShieldCheck } from "lucide-react";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import {
  instanceUsersApi,
  type InstanceUser,
  isUserBanned,
} from "../api/instanceUsers";
import { instanceGroupsApi } from "../api/instanceGroups";
import { queryKeys } from "../lib/queryKeys";
import { useToast } from "../context/ToastContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/EmptyState";
import "./InstanceUserManagement.css";

/** 下拉選項中「預設群組」的代表值（不可為空字串，Radix Select 保留空字串用途），送出時轉成 null */
const DEFAULT_GROUP_VALUE = "__default__";

/** 封禁時長選項：{ labelKey, count?, value: seconds | null 表示永久 } */
const BAN_DURATION_OPTIONS: { value: number | null; labelKey: string; count?: number }[] = [
  { value: 1, labelKey: "banDurationSeconds", count: 1 },
  { value: 60, labelKey: "banDurationMinutes", count: 1 },
  { value: 3600, labelKey: "banDurationHours", count: 1 },
  { value: 86400, labelKey: "banDurationDays", count: 1 },
  { value: 604800, labelKey: "banDurationDays", count: 7 },
  { value: 2592000, labelKey: "banDurationDays", count: 30 },
  { value: 31557600, labelKey: "banDurationYears", count: 1 },
  { value: 315576000, labelKey: "banDurationYears", count: 10 },
  { value: null, labelKey: "banDurationPermanent" },
];

export function InstanceUserManagement() {
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [banUserTarget, setBanUserTarget] = useState<InstanceUser | null>(null);
  const [banReason, setBanReason] = useState("");
  const [banDurationSeconds, setBanDurationSeconds] = useState<number | null>(null);
  const [editNameTarget, setEditNameTarget] = useState<InstanceUser | null>(null);
  const [editNameValue, setEditNameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<InstanceUser | null>(null);

  const { data: users = [], isLoading: usersLoading, error: usersError } = useQuery({
    queryKey: queryKeys.instanceUsers.all,
    queryFn: () => instanceUsersApi.list(),
  });

  const { data: groups = [] } = useQuery({
    queryKey: queryKeys.instanceGroups.all,
    queryFn: () => instanceGroupsApi.list(),
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: t("instance.instanceSettings") },
      { label: t("instance.userManagement") },
    ]);
  }, [setBreadcrumbs, t]);

  const setGroupMutation = useMutation({
    mutationFn: ({ userId, group }: { userId: string; group: string | null }) =>
      instanceUsersApi.setGroup(userId, group),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.instanceUsers.all });
    },
    onError: (err) => {
      pushToast({
        title: err instanceof Error ? err.message : t("instance.userGroupUpdateFailed"),
        tone: "error",
      });
    },
  });

  const updateNameMutation = useMutation({
    mutationFn: ({ userId, name }: { userId: string; name: string }) =>
      instanceUsersApi.updateName(userId, name),
    onSuccess: () => {
      setEditNameTarget(null);
      setEditNameValue("");
      void queryClient.invalidateQueries({ queryKey: queryKeys.instanceUsers.all });
      pushToast({ title: t("instance.userNameUpdated"), tone: "success" });
    },
    onError: (err) => {
      pushToast({
        title: err instanceof Error ? err.message : t("instance.userNameUpdateFailed"),
        tone: "error",
      });
    },
  });

  const banMutation = useMutation({
    mutationFn: ({ userId, reason, durationSeconds }: { userId: string; reason: string; durationSeconds: number | null }) =>
      instanceUsersApi.ban(userId, { reason, durationSeconds }),
    onSuccess: () => {
      setBanUserTarget(null);
      setBanReason("");
      setBanDurationSeconds(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.instanceUsers.all });
      pushToast({ title: t("instance.banSuccess"), tone: "success" });
    },
    onError: (err) => {
      pushToast({
        title: err instanceof Error ? err.message : t("instance.banFailed"),
        tone: "error",
      });
    },
  });

  const unbanMutation = useMutation({
    mutationFn: (userId: string) => instanceUsersApi.unban(userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.instanceUsers.all });
      pushToast({ title: t("instance.unbanSuccess"), tone: "success" });
    },
    onError: (err) => {
      pushToast({
        title: err instanceof Error ? err.message : t("instance.unbanFailed"),
        tone: "error",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => instanceUsersApi.delete(userId),
    onSuccess: () => {
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.instanceUsers.all });
      pushToast({ title: t("instance.deleteUserSuccess"), tone: "success" });
    },
    onError: (err) => {
      pushToast({
        title: err instanceof Error ? err.message : t("instance.deleteUserFailed"),
        tone: "error",
      });
    },
  });

  const handleGroupChange = (userId: string, value: string) => {
    const group = value === DEFAULT_GROUP_VALUE ? null : value;
    setGroupMutation.mutate({ userId, group });
  };

  const openEditName = (user: InstanceUser) => {
    setEditNameTarget(user);
    setEditNameValue(user.name);
  };

  const submitEditName = () => {
    if (!editNameTarget || !editNameValue.trim()) return;
    updateNameMutation.mutate({ userId: editNameTarget.id, name: editNameValue.trim() });
  };

  const openBan = (user: InstanceUser) => {
    setBanUserTarget(user);
    setBanReason("");
    setBanDurationSeconds(BAN_DURATION_OPTIONS[0].value);
  };

  const submitBan = () => {
    if (!banUserTarget || !banReason.trim()) return;
    banMutation.mutate({
      userId: banUserTarget.id,
      reason: banReason.trim(),
      durationSeconds: banDurationSeconds ?? null,
    });
  };

  const submitDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id);
  };

  if (usersLoading) {
    return (
      <div className="instance-user-management-page">
        <p className="instance-user-management-loading">{t("common.loading")}</p>
      </div>
    );
  }

  if (usersError) {
    return (
      <div className="instance-user-management-page">
        <p className="instance-user-management-error">
          {usersError instanceof Error ? usersError.message : t("instance.userListFailed")}
        </p>
      </div>
    );
  }

  return (
    <div className="instance-user-management-page">
      <div className="instance-user-management-header">
        <div className="instance-user-management-title-wrap">
          <UserCog />
          <h1 className="instance-user-management-title">
            {t("instance.userManagement")}
          </h1>
        </div>
        <p className="instance-user-management-desc">
          {t("instance.userManagementDesc")}
        </p>
      </div>

      {users.length === 0 ? (
        <EmptyState
          icon={UserCog}
          message={t("instance.noUsersYet")}
        />
      ) : (
        <Card>
          <CardContent className="instance-user-management-card-content">
            <table className="instance-user-management-table">
              <thead>
                <tr>
                  <th className="instance-user-management-th-name">{t("instance.userName")}</th>
                  <th className="instance-user-management-th-email">{t("instance.userEmail")}</th>
                  <th className="instance-user-management-th-group">{t("instance.userGroup")}</th>
                  <th className="instance-user-management-th-status">{t("instance.userStatus")}</th>
                  <th className="instance-user-management-th-actions">{t("instance.userActions")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="instance-user-management-td-name">{user.name}</td>
                    <td className="instance-user-management-td-email">{user.email}</td>
                    <td className="instance-user-management-td-group">
                      <Select
                        value={user.group ?? DEFAULT_GROUP_VALUE}
                        onValueChange={(value) => handleGroupChange(user.id, value)}
                        disabled={setGroupMutation.isPending}
                      >
                        <SelectTrigger className="instance-user-management-select-trigger" size="sm">
                          <SelectValue placeholder={t("instance.defaultGroupOption")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={DEFAULT_GROUP_VALUE}>
                            {t("instance.defaultGroupOption")}
                          </SelectItem>
                          {groups.map((g) => (
                            <SelectItem key={g.id} value={g.name}>
                              {g.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="instance-user-management-td-status">
                      {isUserBanned(user) ? (
                        <span className="instance-user-management-status-banned">
                          <Ban className="instance-user-management-status-icon" />
                          {t("instance.userStatusBanned")}
                        </span>
                      ) : (
                        <span className="instance-user-management-status-active">
                          <ShieldCheck className="instance-user-management-status-icon" />
                          {t("instance.userStatusActive")}
                        </span>
                      )}
                    </td>
                    <td className="instance-user-management-td-actions">
                      <div className="instance-user-management-actions">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={t("instance.editUserName")}
                          onClick={() => openEditName(user)}
                          disabled={updateNameMutation.isPending}
                        >
                          <Pencil className="instance-user-management-action-icon" />
                        </Button>
                        {isUserBanned(user) ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={t("instance.unbanUser")}
                            onClick={() => unbanMutation.mutate(user.id)}
                            disabled={unbanMutation.isPending}
                          >
                            <ShieldCheck className="instance-user-management-action-icon" />
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={t("instance.banUser")}
                            onClick={() => openBan(user)}
                            disabled={banMutation.isPending}
                          >
                            <Ban className="instance-user-management-action-icon" />
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={t("instance.deleteUser")}
                          onClick={() => setDeleteTarget(user)}
                          disabled={deleteMutation.isPending}
                          className="instance-user-management-delete-btn"
                        >
                          <Trash2 className="instance-user-management-action-icon" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* 修改名稱對話框 */}
      <Dialog open={!!editNameTarget} onOpenChange={(open) => !open && setEditNameTarget(null)}>
        <DialogContent className="dialog-max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("instance.editUserName")}</DialogTitle>
            <DialogDescription>
              {editNameTarget?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="instance-user-management-dialog-field">
            <Label htmlFor="edit-user-name">{t("instance.userName")}</Label>
            <Input
              id="edit-user-name"
              value={editNameValue}
              onChange={(e) => setEditNameValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitEditName()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditNameTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={submitEditName}
              disabled={!editNameValue.trim() || updateNameMutation.isPending}
            >
              {updateNameMutation.isPending ? t("common.loading") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 封禁對話框 */}
      <Dialog open={!!banUserTarget} onOpenChange={(open) => !open && setBanUserTarget(null)}>
        <DialogContent className="dialog-max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("instance.banUser")}</DialogTitle>
            <DialogDescription>
              {banUserTarget?.name} ({banUserTarget?.email})
            </DialogDescription>
          </DialogHeader>
          <div className="instance-user-management-dialog-fields">
            <div className="instance-user-management-dialog-field">
              <Label htmlFor="ban-reason">{t("instance.banReason")}</Label>
              <Input
                id="ban-reason"
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder={t("instance.banReasonPlaceholder")}
              />
            </div>
            <div className="instance-user-management-dialog-field">
              <Label htmlFor="ban-duration">{t("instance.banDuration")}</Label>
              <Select
                value={banDurationSeconds === null ? "permanent" : String(banDurationSeconds)}
                onValueChange={(v) => setBanDurationSeconds(v === "permanent" ? null : parseInt(v, 10))}
              >
                <SelectTrigger id="ban-duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BAN_DURATION_OPTIONS.map((opt) => (
                    <SelectItem
                      key={opt.value ?? "permanent"}
                      value={opt.value === null ? "permanent" : String(opt.value)}
                    >
                      {opt.count != null
                        ? t(`instance.${opt.labelKey}`, { count: opt.count })
                        : t(`instance.${opt.labelKey}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBanUserTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={submitBan}
              disabled={!banReason.trim() || banMutation.isPending}
            >
              {banMutation.isPending ? t("common.loading") : t("instance.banUser")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 刪除確認對話框 */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="dialog-max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("instance.deleteUser")}</DialogTitle>
            <DialogDescription>
              {t("instance.confirmDeleteUser")}
              {deleteTarget && (
                <span className="instance-user-management-delete-confirm-user">
                  {deleteTarget.name} ({deleteTarget.email})
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => submitDelete()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? t("common.loading") : t("instance.deleteUser")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
