import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Pencil, Trash2, Shield, Search } from "lucide-react";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { instanceGroupsApi, type InstanceGroup } from "../api/instanceGroups";
import { queryKeys } from "../lib/queryKeys";
import { useToast } from "../context/ToastContext";
import type { InstancePermissionKey } from "@paperclipai/shared";
import { COMPANY_CREATE_AMOUNT_PLACEHOLDER_KEY } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import "./InstanceGroupManagement.css";

const ADMIN_GROUP_NAME = "admin";

export function InstanceGroupManagement() {
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDisplayName, setNewGroupDisplayName] = useState("");
  const [newGroupInheritedIds, setNewGroupInheritedIds] = useState<string[]>([]);
  const [editGroup, setEditGroup] = useState<InstanceGroup | null>(null);
  const [editName, setEditName] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editInheritedIds, setEditInheritedIds] = useState<string[]>([]);
  const [permsGroup, setPermsGroup] = useState<InstanceGroup | null>(null);
  const [permsDraft, setPermsDraft] = useState<InstancePermissionKey[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [defaultGroupInput, setDefaultGroupInput] = useState("");
  const [groupSearchQuery, setGroupSearchQuery] = useState("");
  const [permissionSearchQuery, setPermissionSearchQuery] = useState("");
  const [allPermsSearchQuery, setAllPermsSearchQuery] = useState("");
  const [allPermsCategoryFilter, setAllPermsCategoryFilter] = useState<string>("");
  const [permissionCategoryFilter, setPermissionCategoryFilter] = useState<string>("");
  const [addAmountInput, setAddAmountInput] = useState("");

  const { data: groups = [], isLoading, error } = useQuery({
    queryKey: queryKeys.instanceGroups.all,
    queryFn: () => instanceGroupsApi.list(),
  });

  const { data: defaultGroupData } = useQuery({
    queryKey: queryKeys.instanceGroups.defaultGroup,
    queryFn: () => instanceGroupsApi.getDefaultGroup(),
  });

  const { data: permissionsRegistry } = useQuery({
    queryKey: queryKeys.instanceGroups.permissionsRegistry,
    queryFn: () => instanceGroupsApi.getPermissionsRegistry(),
  });

  const permissions = permissionsRegistry?.permissions ?? [];

  /** company.create.amount.{number} = 可建立 N 家；company.create.amount.infinite = 不限制 */
  const getPermissionLabel = (key: string, labelKey: string): string => {
    if (key === "company.create.amount.infinite") return t("instance.permissionKey_company_create_amount_infinite");
    if (key === COMPANY_CREATE_AMOUNT_PLACEHOLDER_KEY) return t("instance.permissionKey_company_create_amount_number");
    const m = key.match(/^company\.create\.amount\.(\d+)$/);
    if (m) return t("instance.permissionKey_company_create_amount", { count: parseInt(m[1], 10) });
    return t(labelKey) || key;
  };

  const filteredGroups = useMemo(() => {
    const q = groupSearchQuery.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        (g.displayName ?? "").toLowerCase().includes(q),
    );
  }, [groups, groupSearchQuery]);

  /** 依 ID 解析群組名稱（含顯示名稱） */
  const getGroupDisplayLabel = (g: InstanceGroup): string =>
    g.displayName?.trim() ? `${g.displayName} (${g.name})` : g.name;

  const allFilteredPermissions = useMemo(() => {
    let list = permissions;
    const q = allPermsSearchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => {
        const label = getPermissionLabel(p.key, p.labelKey);
        return (
          p.key.toLowerCase().includes(q) ||
          (label || "").toLowerCase().includes(q)
        );
      });
    }
    if (allPermsCategoryFilter) {
      list = list.filter((p) => p.category === allPermsCategoryFilter);
    }
    return list;
  }, [permissions, allPermsSearchQuery, allPermsCategoryFilter, t]);

  const filteredPermissionsForDialog = useMemo(() => {
    let list = permissions;
    const q = permissionSearchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => {
        const label = getPermissionLabel(p.key, p.labelKey);
        return (
          p.key.toLowerCase().includes(q) ||
          (label || "").toLowerCase().includes(q)
        );
      });
    }
    if (permissionCategoryFilter) {
      list = list.filter((p) => p.category === permissionCategoryFilter);
    }
    return list;
  }, [permissions, permissionSearchQuery, permissionCategoryFilter, t]);

  /** 對話框表格行 = API 權限 + 已選的 company.create.amount.N（動態） */
  const dialogTableRows = useMemo(() => {
    const fromApi = filteredPermissionsForDialog;
    const amountKeysInDraft = permsDraft.filter((k) => /^company\.create\.amount\.\d+$/.test(k));
    const synthetic = amountKeysInDraft.map((key) => ({
      key,
      labelKey: "instance.permissionKey_company_create_amount",
      category: "company",
    }));
    const apiKeys = new Set(fromApi.map((p) => p.key));
    const added = synthetic.filter((s) => !apiKeys.has(s.key));
    return [...fromApi, ...added];
  }, [filteredPermissionsForDialog, permsDraft]);

  useEffect(() => {
    if (defaultGroupData?.defaultGroupName != null) {
      setDefaultGroupInput(defaultGroupData.defaultGroupName);
    }
  }, [defaultGroupData?.defaultGroupName]);

  useEffect(() => {
    setBreadcrumbs([
      { label: t("instance.instanceSettings") },
      { label: t("instance.groupManagement") },
    ]);
  }, [setBreadcrumbs, t]);

  const createMutation = useMutation({
    mutationFn: (data: { name: string; displayName?: string | null; inheritedGroupIds?: string[] }) =>
      instanceGroupsApi.create(data),
    onSuccess: () => {
      setNewGroupOpen(false);
      setNewGroupName("");
      setNewGroupDisplayName("");
      setNewGroupInheritedIds([]);
      void queryClient.invalidateQueries({ queryKey: queryKeys.instanceGroups.all });
      pushToast({ title: t("instance.groupCreated"), tone: "success" });
    },
    onError: (err) => {
      pushToast({
        title: err instanceof Error ? err.message : t("instance.groupCreateFailed"),
        tone: "error",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      name,
      displayName,
      inheritedGroupIds,
    }: {
      id: string;
      name?: string;
      displayName?: string | null;
      inheritedGroupIds?: string[];
    }) => instanceGroupsApi.update(id, { name, displayName, inheritedGroupIds }),
    onSuccess: () => {
      setEditGroup(null);
      setEditName("");
      setEditDisplayName("");
      setEditInheritedIds([]);
      void queryClient.invalidateQueries({ queryKey: queryKeys.instanceGroups.all });
      pushToast({ title: t("instance.groupUpdated"), tone: "success" });
    },
    onError: (err) => {
      pushToast({
        title: err instanceof Error ? err.message : t("instance.groupUpdateFailed"),
        tone: "error",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => instanceGroupsApi.remove(id),
    onSuccess: () => {
      setDeleteConfirmId(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.instanceGroups.all });
      pushToast({ title: t("instance.groupDeleted"), tone: "success" });
    },
    onError: (err) => {
      pushToast({
        title: err instanceof Error ? err.message : t("instance.groupDeleteFailed"),
        tone: "error",
      });
    },
  });

  const permissionsMutation = useMutation({
    mutationFn: ({ id, permissionKeys }: { id: string; permissionKeys: InstancePermissionKey[] }) =>
      instanceGroupsApi.setPermissions(id, permissionKeys),
    onSuccess: () => {
      setPermsGroup(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.instanceGroups.all });
      pushToast({ title: t("instance.groupPermissionsUpdated"), tone: "success" });
    },
    onError: (err) => {
      pushToast({
        title: err instanceof Error ? err.message : t("instance.groupPermissionsUpdateFailed"),
        tone: "error",
      });
    },
  });

  const setDefaultGroupMutation = useMutation({
    mutationFn: (name: string) => instanceGroupsApi.setDefaultGroup(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.instanceGroups.defaultGroup });
      pushToast({ title: t("instance.defaultGroupUpdated"), tone: "success" });
    },
    onError: (err) => {
      pushToast({
        title: err instanceof Error ? err.message : t("instance.defaultGroupUpdateFailed"),
        tone: "error",
      });
    },
  });

  const openEdit = (g: InstanceGroup) => {
    setEditGroup(g);
    setEditName(g.name);
    setEditDisplayName(g.displayName ?? "");
    setEditInheritedIds([...g.inheritedGroupIds]);
  };

  const openPerms = (g: InstanceGroup) => {
    setPermsGroup(g);
    setPermsDraft([...g.permissionKeys] as InstancePermissionKey[]);
    setPermissionSearchQuery("");
    setPermissionCategoryFilter("");
  };

  const togglePerm = (key: InstancePermissionKey) => {
    setPermsDraft((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  /** 依註冊表或後備規則取得權限顯示名稱 */
  const permissionKeyLabel = (key: string) => {
    const entry = permissions.find((p) => p.key === key);
    if (entry) return getPermissionLabel(key, entry.labelKey);
    const suffix = key === "*" ? "all" : key.replace(/\./g, "_");
    const i18nKey = `instance.permissionKey_${suffix}` as const;
    return t(i18nKey) || key;
  };

  if (isLoading) {
    return (
      <div className="instance-group-management-page">
        <p className="instance-group-management-loading">{t("common.loading")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="instance-group-management-page">
        <p className="instance-group-management-error">
          {error instanceof Error ? error.message : t("instance.groupListFailed")}
        </p>
      </div>
    );
  }

  return (
    <div className="instance-group-management-page">
      <div className="instance-group-management-header">
        <div className="instance-group-management-title-row">
          <div className="instance-group-management-title-wrap">
            <Users />
            <h1 className="instance-group-management-title">
              {t("instance.groupManagement")}
            </h1>
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              setNewGroupOpen(true);
              setNewGroupName("");
            }}
          >
            <Plus />
            {t("instance.addGroup")}
          </Button>
        </div>
        <p className="instance-group-management-desc">
          {t("instance.groupManagementDesc")}
        </p>
      </div>

      <Card className="instance-group-management-all-perms-card">
        <CardContent className="instance-group-management-all-perms-content">
          <h2 className="instance-group-management-all-perms-title">
            {t("instance.allPermissionsTitle")}
          </h2>
          <p className="instance-group-management-all-perms-desc">
            {t("instance.allPermissionsDesc")}
          </p>
          {permissions.length === 0 ? (
            <p className="instance-group-management-perms-empty">
              {t("common.loading")}
            </p>
          ) : (
            <>
              <div className="instance-group-management-all-perms-toolbar">
                <div className="instance-group-management-search-wrap">
                  <span className="instance-group-management-search-icon-wrap" aria-hidden>
                    <Search className="instance-group-management-search-icon" />
                  </span>
                  <Input
                    type="search"
                    value={allPermsSearchQuery}
                    onChange={(e) => setAllPermsSearchQuery(e.target.value)}
                    placeholder={t("instance.searchPermission")}
                    className="instance-group-management-search-input"
                    aria-label={t("instance.searchPermission")}
                  />
                </div>
                <Select
                  value={allPermsCategoryFilter || "all"}
                  onValueChange={(v) => setAllPermsCategoryFilter(v === "all" ? "" : v)}
                >
                  <SelectTrigger className="instance-group-management-filter-trigger" size="sm">
                    <SelectValue placeholder={t("instance.filterCategoryAll")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("instance.filterCategoryAll")}</SelectItem>
                    <SelectItem value="instance">{t("instance.categoryInstance")}</SelectItem>
                    <SelectItem value="company">{t("instance.categoryCompany")}</SelectItem>
                    <SelectItem value="model">{t("instance.categoryModel")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="instance-group-management-all-perms-table-wrap">
                <table className="instance-group-management-all-perms-table">
                  <thead>
                    <tr>
                      <th scope="col">{t("instance.allPermsColKey")}</th>
                      <th scope="col">{t("instance.allPermsColLabel")}</th>
                      <th scope="col">{t("instance.allPermsColCategory")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allFilteredPermissions.map((p) => (
                      <tr key={p.key}>
                        <td><code className="instance-group-management-all-perms-key">{p.key}</code></td>
                        <td>{getPermissionLabel(p.key, p.labelKey)}</td>
                        <td>
                          {p.category === "instance"
                            ? t("instance.categoryInstance")
                            : p.category === "company"
                              ? t("instance.categoryCompany")
                              : t("instance.categoryModel")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="instance-group-management-default-card">
        <CardContent className="instance-group-management-default-content">
          <Label htmlFor="default-group-name" className="instance-group-management-default-label">
            {t("instance.defaultGroupLabel")}
          </Label>
          <div className="instance-group-management-default-row">
            <Input
              id="default-group-name"
              value={defaultGroupInput}
              onChange={(e) => setDefaultGroupInput(e.target.value)}
              placeholder="default"
              className="instance-group-management-default-input"
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={
                setDefaultGroupMutation.isPending ||
                defaultGroupInput.trim().toLowerCase() ===
                  (defaultGroupData?.defaultGroupName ?? "").toLowerCase()
              }
              onClick={() =>
                setDefaultGroupMutation.mutate(defaultGroupInput.trim().toLowerCase())
              }
            >
              {setDefaultGroupMutation.isPending ? t("common.loading") : t("common.save")}
            </Button>
          </div>
          <p className="instance-group-management-default-hint">
            {t("instance.defaultGroupHint")}
          </p>
        </CardContent>
      </Card>

      {groups.length === 0 ? (
        <EmptyState
          icon={Users}
          message={t("instance.noGroupsYet")}
        />
      ) : (
        <>
          <div className="instance-group-management-search-wrap">
            <span className="instance-group-management-search-icon-wrap" aria-hidden>
              <Search className="instance-group-management-search-icon" />
            </span>
            <Input
              type="search"
              value={groupSearchQuery}
              onChange={(e) => setGroupSearchQuery(e.target.value)}
              placeholder={t("instance.searchGroup")}
              className="instance-group-management-search-input"
              aria-label={t("instance.searchGroup")}
            />
          </div>
          <div className="instance-group-management-table-wrap">
            <table className="instance-group-management-table">
              <thead>
                <tr>
                  <th scope="col">{t("instance.groupsTableColId")}</th>
                  <th scope="col">{t("instance.groupsTableColDisplayName")}</th>
                  <th scope="col">{t("instance.groupsTableColInherits")}</th>
                  <th scope="col">{t("instance.groupsTableColPermissions")}</th>
                  <th scope="col">{t("instance.groupsTableColActions")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredGroups.map((group) => {
                  const isAdmin = group.name === ADMIN_GROUP_NAME;
                  const isDeleting = deleteConfirmId === group.id;
                  const inheritedLabels = group.inheritedGroupIds
                    .map((id) => groups.find((g) => g.id === id))
                    .filter(Boolean)
                    .map((g) => g!.displayName?.trim() || g!.name);
                  return (
                    <tr key={group.id}>
                      <td>
                        <span className="instance-group-management-table-id">
                          {group.name}
                          {isAdmin && (
                            <span className="instance-group-management-admin-badge">
                              <Shield />
                              {t("instance.adminGroup")}
                            </span>
                          )}
                        </span>
                      </td>
                      <td>
                        <span className="instance-group-management-table-display-name">
                          {group.displayName?.trim() || "—"}
                        </span>
                      </td>
                      <td>
                        <span className="instance-group-management-table-inherits">
                          {inheritedLabels.length === 0
                            ? "—"
                            : inheritedLabels.join(", ")}
                        </span>
                      </td>
                      <td>
                        {group.permissionKeys.length === 0 ? (
                          <span className="instance-group-management-perms-empty">
                            {t("instance.noPermissions")}
                          </span>
                        ) : group.permissionKeys.length > 3 ? (
                          t("instance.permissionCount", { count: group.permissionKeys.length })
                        ) : (
                          <span className="instance-group-management-perm-tags">
                            {group.permissionKeys.map((key) => (
                              <span
                                key={key}
                                className="instance-group-management-perm-tag"
                              >
                                {permissionKeyLabel(key)}
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="instance-group-management-actions">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openPerms(group)}
                            aria-label={t("instance.managePermissions")}
                          >
                            <Shield />
                            {t("instance.managePermissions")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(group)}
                            aria-label={t("common.edit")}
                          >
                            <Pencil />
                          </Button>
                          {!isAdmin &&
                            (!isDeleting ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="instance-group-management-delete-btn"
                                onClick={() => setDeleteConfirmId(group.id)}
                                aria-label={t("common.delete")}
                              >
                                <Trash2 />
                              </Button>
                            ) : (
                              <div className="instance-group-management-confirm">
                                <span className="instance-group-management-confirm-text">
                                  {t("instance.confirmDeleteGroup")}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setDeleteConfirmId(null)}
                                  disabled={deleteMutation.isPending}
                                >
                                  {t("common.cancel")}
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => deleteMutation.mutate(group.id)}
                                  disabled={deleteMutation.isPending}
                                >
                                  {deleteMutation.isPending
                                    ? t("common.loading")
                                    : t("common.delete")}
                                </Button>
                              </div>
                            ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* New group dialog */}
      <Dialog open={newGroupOpen} onOpenChange={setNewGroupOpen}>
        <DialogContent className="instance-group-dialog instance-group-dialog-wide">
          <DialogHeader>
            <DialogTitle>{t("instance.addGroup")}</DialogTitle>
          </DialogHeader>
          <div className="instance-group-dialog-body">
            <div className="instance-group-dialog-field">
              <Label htmlFor="new-group-name">{t("instance.groupName")}</Label>
              <Input
                id="new-group-name"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="e.g. editors"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const name = newGroupName.trim().toLowerCase();
                    if (name) createMutation.mutate({ name, displayName: newGroupDisplayName.trim() || null, inheritedGroupIds: newGroupInheritedIds.length > 0 ? newGroupInheritedIds : undefined });
                  }
                }}
              />
              <p className="instance-group-dialog-hint">{t("instance.groupNameHint")}</p>
            </div>
            <div className="instance-group-dialog-field">
              <Label htmlFor="new-group-display-name">{t("instance.displayNameLabel")}</Label>
              <Input
                id="new-group-display-name"
                value={newGroupDisplayName}
                onChange={(e) => setNewGroupDisplayName(e.target.value)}
                placeholder={t("instance.displayNamePlaceholder")}
              />
            </div>
            {groups.length > 0 && (
              <div className="instance-group-dialog-field">
                <Label>{t("instance.inheritFromLabel")}</Label>
                <p className="instance-group-dialog-hint">{t("instance.inheritFromPlaceholder")}</p>
                <div className="instance-group-inherit-checkboxes">
                  {groups.map((g) => (
                    <label key={g.id} className="instance-group-inherit-checkbox">
                      <input
                        type="checkbox"
                        checked={newGroupInheritedIds.includes(g.id)}
                        onChange={(e) =>
                          setNewGroupInheritedIds((prev) =>
                            e.target.checked ? [...prev, g.id] : prev.filter((id) => id !== g.id),
                          )
                        }
                      />
                      <span>{getGroupDisplayLabel(g)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewGroupOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!newGroupName.trim() || createMutation.isPending}
              onClick={() =>
                createMutation.mutate({
                  name: newGroupName.trim().toLowerCase(),
                  displayName: newGroupDisplayName.trim() || null,
                  inheritedGroupIds: newGroupInheritedIds.length > 0 ? newGroupInheritedIds : undefined,
                })
              }
            >
              {createMutation.isPending ? t("common.loading") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit group dialog */}
      <Dialog open={!!editGroup} onOpenChange={(open) => !open && setEditGroup(null)}>
        <DialogContent className="instance-group-dialog instance-group-dialog-wide">
          <DialogHeader>
            <DialogTitle>{t("instance.editGroup")}</DialogTitle>
          </DialogHeader>
          <div className="instance-group-dialog-body">
            <div className="instance-group-dialog-field">
              <Label htmlFor="edit-group-name">{t("instance.groupName")}</Label>
              <Input
                id="edit-group-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="e.g. editors"
                autoFocus
              />
              <p className="instance-group-dialog-hint">{t("instance.groupNameHint")}</p>
            </div>
            <div className="instance-group-dialog-field">
              <Label htmlFor="edit-group-display-name">{t("instance.displayNameLabel")}</Label>
              <Input
                id="edit-group-display-name"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                placeholder={t("instance.displayNamePlaceholder")}
              />
            </div>
            {groups.filter((g) => g.id !== editGroup?.id).length > 0 && (
              <div className="instance-group-dialog-field">
                <Label>{t("instance.inheritFromLabel")}</Label>
                <p className="instance-group-dialog-hint">{t("instance.inheritFromPlaceholder")}</p>
                <div className="instance-group-inherit-checkboxes">
                  {groups
                    .filter((g) => g.id !== editGroup?.id)
                    .map((g) => (
                      <label key={g.id} className="instance-group-inherit-checkbox">
                        <input
                          type="checkbox"
                          checked={editInheritedIds.includes(g.id)}
                          onChange={(e) =>
                            setEditInheritedIds((prev) =>
                              e.target.checked ? [...prev, g.id] : prev.filter((id) => id !== g.id),
                            )
                          }
                        />
                        <span>{getGroupDisplayLabel(g)}</span>
                      </label>
                    ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditGroup(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={
                !editGroup ||
                !editName.trim() ||
                (editName.trim().toLowerCase() === editGroup?.name &&
                  (editDisplayName ?? "") === (editGroup?.displayName ?? "") &&
                  editInheritedIds.length === editGroup?.inheritedGroupIds?.length &&
                  editInheritedIds.every((id) => editGroup?.inheritedGroupIds?.includes(id))) ||
                updateMutation.isPending
              }
              onClick={() =>
                editGroup &&
                updateMutation.mutate({
                  id: editGroup.id,
                  name: editName.trim().toLowerCase(),
                  displayName: editDisplayName.trim() || null,
                  inheritedGroupIds: editInheritedIds,
                })
              }
            >
              {updateMutation.isPending ? t("common.loading") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permissions dialog — 重新設計：標題／說明／篩選／表格／已選摘要 */}
      <Dialog open={!!permsGroup} onOpenChange={(open) => !open && setPermsGroup(null)}>
        <DialogContent className="instance-group-dialog instance-group-perms-dialog instance-group-perms-modal-content">
          <DialogHeader className="instance-group-perms-modal-header">
            <DialogTitle className="instance-group-perms-modal-title">
              {t("instance.managePermissions")}
              {permsGroup && ` — ${permsGroup.name}`}
            </DialogTitle>
            <DialogDescription className="instance-group-perms-modal-desc">
              {t("instance.groupPermissionsHint")}
            </DialogDescription>
          </DialogHeader>
          <div className="instance-group-perms-modal-body">
            <div className="instance-group-perms-toolbar">
              <div className="instance-group-perms-search-wrap">
                <span className="instance-group-perms-search-icon-wrap" aria-hidden>
                  <Search className="instance-group-perms-search-icon" />
                </span>
                <Input
                  type="search"
                  value={permissionSearchQuery}
                  onChange={(e) => setPermissionSearchQuery(e.target.value)}
                  placeholder={t("instance.searchPermission")}
                  className="instance-group-perms-search-input"
                  aria-label={t("instance.searchPermission")}
                />
              </div>
              <Select
                value={permissionCategoryFilter || "all"}
                onValueChange={(v) => setPermissionCategoryFilter(v === "all" ? "" : v)}
              >
                <SelectTrigger className="instance-group-management-filter-trigger" size="sm">
                  <SelectValue placeholder={t("instance.filterCategoryAll")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("instance.filterCategoryAll")}</SelectItem>
                  <SelectItem value="instance">{t("instance.categoryInstance")}</SelectItem>
                  <SelectItem value="company">{t("instance.categoryCompany")}</SelectItem>
                  <SelectItem value="model">{t("instance.categoryModel")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="instance-group-perms-summary" aria-live="polite">
              {t("instance.permissionsSelectedCount", { count: permsDraft.length })}
            </p>
            <div className="instance-group-perms-table-wrap">
              <table className="instance-group-perms-table">
                <thead>
                  <tr>
                    <th scope="col" className="instance-group-perms-col-check" />
                    <th scope="col">{t("instance.allPermsColKey")}</th>
                    <th scope="col">{t("instance.allPermsColLabel")}</th>
                    <th scope="col">{t("instance.allPermsColCategory")}</th>
                  </tr>
                </thead>
                <tbody>
                  {dialogTableRows.map((entry) => {
                    const isPlaceholder = entry.key === COMPANY_CREATE_AMOUNT_PLACEHOLDER_KEY;
                    return (
                      <tr key={entry.key}>
                        <td className="instance-group-perms-col-check">
                          {isPlaceholder ? (
                            <span className="instance-group-perms-add-amount">
                              <Input
                                type="number"
                                min={1}
                                className="instance-group-perms-amount-input"
                                value={addAmountInput}
                                onChange={(e) => setAddAmountInput(e.target.value)}
                                placeholder="N"
                                aria-label={t("instance.addAmountPlaceholder")}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    const n = addAmountInput.trim();
                                    if (/^\d+$/.test(n)) {
                                      setPermsDraft((prev) =>
                                        prev.includes(`company.create.amount.${n}` as InstancePermissionKey)
                                          ? prev
                                          : [...prev, `company.create.amount.${n}` as InstancePermissionKey],
                                      );
                                      setAddAmountInput("");
                                    }
                                  }
                                }}
                              />
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  const n = addAmountInput.trim();
                                  if (/^\d+$/.test(n)) {
                                    setPermsDraft((prev) =>
                                      prev.includes(`company.create.amount.${n}` as InstancePermissionKey)
                                        ? prev
                                        : [...prev, `company.create.amount.${n}` as InstancePermissionKey],
                                    );
                                    setAddAmountInput("");
                                  }
                                }}
                              >
                                {t("instance.addAmount")}
                              </Button>
                            </span>
                          ) : (
                            <input
                              type="checkbox"
                              checked={permsDraft.includes(entry.key as InstancePermissionKey)}
                              onChange={() => togglePerm(entry.key as InstancePermissionKey)}
                              aria-label={getPermissionLabel(entry.key, entry.labelKey)}
                            />
                          )}
                        </td>
                        <td><code className="instance-group-management-all-perms-key">{entry.key}</code></td>
                        <td>{getPermissionLabel(entry.key, entry.labelKey)}</td>
                        <td>
                          {entry.category === "instance"
                            ? t("instance.categoryInstance")
                            : entry.category === "company"
                              ? t("instance.categoryCompany")
                              : t("instance.categoryModel")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <DialogFooter className="instance-group-perms-modal-footer">
            <Button variant="outline" onClick={() => setPermsGroup(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={
                !permsGroup ||
                permissionsMutation.isPending ||
                (permsGroup &&
                  permsDraft.length === permsGroup.permissionKeys.length &&
                  permsDraft.every((k) => permsGroup!.permissionKeys.includes(k)) &&
                  permsGroup.permissionKeys.every((k) =>
                    permsDraft.includes(k as InstancePermissionKey),
                  ))
              }
              onClick={() =>
                permsGroup &&
                permissionsMutation.mutate({ id: permsGroup.id, permissionKeys: permsDraft })
              }
            >
              {permissionsMutation.isPending ? t("common.loading") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
