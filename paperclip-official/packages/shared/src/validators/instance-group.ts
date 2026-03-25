import { z } from "zod";
import { isInstancePermissionKey } from "../instance-permissions.js";

const groupNameRegex = /^[a-z0-9_-]+$/;
const uuidSchema = z.string().uuid();

export const createInstanceGroupSchema = z.object({
  name: z.string().min(1).max(120).regex(groupNameRegex, "Group name must be lowercase letters, numbers, underscore or hyphen"),
  displayName: z.string().max(120).optional(),
  inheritedGroupIds: z.array(uuidSchema).optional(),
});

export type CreateInstanceGroup = z.infer<typeof createInstanceGroupSchema>;

export const updateInstanceGroupSchema = z.object({
  name: z.string().min(1).max(120).regex(groupNameRegex, "Group name must be lowercase letters, numbers, underscore or hyphen").optional(),
  displayName: z.string().max(120).nullable().optional(),
  inheritedGroupIds: z.array(uuidSchema).optional(),
});

export type UpdateInstanceGroup = z.infer<typeof updateInstanceGroupSchema>;

export const setInstanceGroupPermissionsSchema = z.object({
  permissionKeys: z.array(
    z.string().refine(isInstancePermissionKey, { message: "Invalid instance permission key" }),
  ),
});

export type SetInstanceGroupPermissions = z.infer<typeof setInstanceGroupPermissionsSchema>;

export const setDefaultGroupSchema = z.object({
  defaultGroupName: z
    .string()
    .min(1)
    .max(120)
    .regex(groupNameRegex, "Group name must be lowercase letters, numbers, underscore or hyphen"),
});

export type SetDefaultGroup = z.infer<typeof setDefaultGroupSchema>;
