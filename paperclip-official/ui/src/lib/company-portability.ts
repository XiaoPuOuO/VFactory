/**
 * Company portability helpers: official template loading (inline source) and export zip download.
 * Contract: @see doc/SPEC-implementation.md §21
 */
import type {
  CompanyPortabilityCollisionStrategy,
  CompanyPortabilityExportResult,
  CompanyPortabilityManifest,
  CompanyPortabilityPreviewRequest,
} from "@paperclipai/shared";
import { strToU8, zipSync } from "fflate";

export interface OfficialTemplateCatalogEntry {
  id: string;
  manifestPath: string;
  nameKey: string;
  descriptionKey: string;
}

export interface OfficialTemplateCatalog {
  templates: OfficialTemplateCatalogEntry[];
}

function appPublicOriginBase(): string {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return new URL(base, window.location.origin).toString();
}

function dirnameOfManifestPath(manifestPath: string): string {
  const i = manifestPath.lastIndexOf("/");
  return i === -1 ? "" : manifestPath.slice(0, i);
}

export async function fetchOfficialTemplateCatalog(): Promise<OfficialTemplateCatalog> {
  const url = new URL("templates/catalog.json", appPublicOriginBase()).toString();
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load template catalog: ${res.status}`);
  }
  return res.json() as Promise<OfficialTemplateCatalog>;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`);
  }
  return res.text();
}

/**
 * Loads manifest + markdown files for an official template into an inline import source.
 */
export async function loadOfficialTemplateInlineSource(templateId: string): Promise<{
  manifest: CompanyPortabilityManifest;
  files: Record<string, string>;
}> {
  const catalog = await fetchOfficialTemplateCatalog();
  const entry = catalog.templates.find((t) => t.id === templateId);
  if (!entry) {
    throw new Error(`Unknown template: ${templateId}`);
  }
  const manifestUrl = new URL(entry.manifestPath, appPublicOriginBase()).toString();
  const manifestRes = await fetch(manifestUrl);
  if (!manifestRes.ok) {
    throw new Error(`Failed to load manifest: ${manifestRes.status}`);
  }
  const manifest = JSON.parse(await manifestRes.text()) as CompanyPortabilityManifest;
  const dir = dirnameOfManifestPath(entry.manifestPath);
  const files: Record<string, string> = {};

  if (manifest.company?.path) {
    const p = manifest.company.path.replace(/\\/g, "/");
    const fileUrl = new URL(`${dir}/${p}`, appPublicOriginBase()).toString();
    files[p] = await fetchText(fileUrl);
  }
  for (const agent of manifest.agents) {
    const p = agent.path.replace(/\\/g, "/");
    const fileUrl = new URL(`${dir}/${p}`, appPublicOriginBase()).toString();
    files[p] = await fetchText(fileUrl);
  }
  return { manifest, files };
}

export function buildNewCompanyImportRequest(
  manifest: CompanyPortabilityManifest,
  files: Record<string, string>,
  newCompanyName: string,
  collisionStrategy: CompanyPortabilityCollisionStrategy = "rename",
): CompanyPortabilityPreviewRequest {
  return {
    source: { type: "inline", manifest, files },
    include: { company: true, agents: true },
    target: {
      mode: "new_company",
      newCompanyName: newCompanyName.trim() ? newCompanyName.trim() : null,
    },
    agents: "all",
    collisionStrategy,
  };
}

function sanitizeFilenameBase(name: string): string {
  return name.replace(/[^\w\u4e00-\u9fff.-]+/g, "-").replace(/^-+|-+$/g, "") || "company";
}

/**
 * Downloads a zip containing paperclip.manifest.json and all markdown files (CLI-compatible layout).
 */
export function downloadCompanyPortabilityZip(
  result: CompanyPortabilityExportResult,
  suggestedBaseName: string,
): void {
  const zipRecord: Record<string, Uint8Array> = {};
  zipRecord["paperclip.manifest.json"] = strToU8(JSON.stringify(result.manifest, null, 2));
  for (const [relPath, content] of Object.entries(result.files)) {
    const normalized = relPath.replace(/\\/g, "/");
    zipRecord[normalized] = strToU8(content);
  }
  const zipped = zipSync(zipRecord, { level: 6 });
  const blob = new Blob([new Uint8Array(zipped)], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeFilenameBase(suggestedBaseName)}-paperclip-export.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
