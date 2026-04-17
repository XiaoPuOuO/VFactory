import { useState } from "react";
import "./DesignGuide.css";
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Command as CommandIcon,
  DollarSign,
  Hexagon,
  History,
  Inbox,
  Info,
  LayoutDashboard,
  ListTodo,
  Mail,
  Plus,
  Search,
  Settings,
  Target,
  Trash2,
  Upload,
  User,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Command,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
  CommandEmpty,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "@/components/ui/avatar";
import { StatusBadge } from "@/components/StatusBadge";
import { StatusIcon } from "@/components/StatusIcon";
import { PriorityIcon } from "@/components/PriorityIcon";
import { agentStatusDot, agentStatusDotDefault } from "@/lib/status-colors";
import { EntityRow } from "@/components/EntityRow";
import { EmptyState } from "@/components/EmptyState";
import { MetricCard } from "@/components/MetricCard";
import { FilterBar, type FilterValue } from "@/components/FilterBar";
import { InlineEditor } from "@/components/InlineEditor";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Identity } from "@/components/Identity";

/* ------------------------------------------------------------------ */
/*  Section wrapper                                                    */
/* ------------------------------------------------------------------ */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="design-guide-section">
      <h3>{title}</h3>
      <Separator />
      {children}
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="design-guide-subsection">
      <h4>{title}</h4>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Color swatch                                                       */
/* ------------------------------------------------------------------ */

function Swatch({ name, cssVar }: { name: string; cssVar: string }) {
  return (
    <div className="design-guide-swatch">
      <div
        className="design-guide-swatch-color"
        style={{ backgroundColor: `var(${cssVar})` }}
        aria-hidden
      />
      <div>
        <p className="design-guide-swatch-var">{cssVar}</p>
        <p className="design-guide-swatch-name">{name}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export function DesignGuide() {
  const [status, setStatus] = useState("todo");
  const [priority, setPriority] = useState("medium");
  const [selectValue, setSelectValue] = useState("in_progress");
  const [menuChecked, setMenuChecked] = useState(true);
  const [collapsibleOpen, setCollapsibleOpen] = useState(false);
  const [inlineText, setInlineText] = useState("Click to edit this text");
  const [inlineTitle, setInlineTitle] = useState("Editable Title");
  const [inlineDesc, setInlineDesc] = useState(
    "This is an editable description. Click to edit it — the textarea auto-sizes to fit the content without layout shift."
  );
  const [filters, setFilters] = useState<FilterValue[]>([
    { key: "status", label: "Status", value: "Active" },
    { key: "priority", label: "Priority", value: "High" },
  ]);
  const [dsSwitchOn, setDsSwitchOn] = useState(false);

  return (
    <div className="design-guide-root">
      <div className="design-guide-header">
        <h2>Design Guide</h2>
        <p>
          Every component, style, and pattern used across VFactory.
        </p>
      </div>

      <Section title="Component Coverage">
        <p className="design-guide-prose">
          This page should be updated when new UI primitives or app-level patterns ship.
        </p>
        <div className="design-guide-grid-2">
          <SubSection title="UI primitives">
            <div className="design-guide-flex-wrap">
              {[
                "avatar", "badge", "breadcrumb", "button", "card", "checkbox", "collapsible",
                "command", "dialog", "dropdown-menu", "input", "label", "popover", "scroll-area",
                "select", "separator", "sheet", "skeleton", "tabs", "textarea", "tooltip",
              ].map((name) => (
                <Badge key={name} variant="outline" className="design-guide-badge-mono">
                  {name}
                </Badge>
              ))}
            </div>
          </SubSection>
          <SubSection title="App components">
            <div className="design-guide-flex-wrap">
              {[
                "StatusBadge", "StatusIcon", "PriorityIcon", "EntityRow", "EmptyState", "MetricCard",
                "FilterBar", "InlineEditor", "PageSkeleton", "Identity", "CommentThread", "MarkdownEditor",
                "PropertiesPanel", "Sidebar", "CommandPalette",
              ].map((name) => (
                <Badge key={name} variant="ghost" className="design-guide-badge-mono">
                  {name}
                </Badge>
              ))}
            </div>
          </SubSection>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  VISUAL CONTRACT — inventory, breakpoints, alerts, layout    */}
      {/* ============================================================ */}
      <Section title="Visual contract & inventory">
        <p className="design-guide-prose">
          完整路由 × 狀態矩陣與元件對照見{" "}
          <code className="design-guide-code-path">paperclip-official/documents/ui-commercial-upgrade-inventory.md</code>
          。本頁作為可商業化 UI 的實機基準；新增 primitive 或路由時請同步更新該文件與下方示範。
        </p>
        <SubSection title="Responsive breakpoints（權杖）">
          <p className="design-guide-prose">
            斷點變數定義於 design-system <code>tokens.css</code>：<code>--breakpoint-sm</code> 至{" "}
            <code>--breakpoint-2xl</code>。請以 <code>min-width</code> 與流體欄寬為主，避免固定寬造成水平捲動；複雜後台在窄螢採單欄降級。
          </p>
          <div className="design-guide-breakpoint-chips" aria-label="Breakpoint reference">
            {[
              ["sm", "var(--breakpoint-sm)"],
              ["md", "var(--breakpoint-md)"],
              ["lg", "var(--breakpoint-lg)"],
              ["xl", "var(--breakpoint-xl)"],
              ["2xl", "var(--breakpoint-2xl)"],
            ].map(([name, raw]) => (
              <span key={String(name)} className="design-guide-breakpoint-chip">
                <span className="design-guide-breakpoint-chip-label">{String(name)}</span>
                <span className="design-guide-breakpoint-chip-value">{raw}</span>
              </span>
            ))}
          </div>
        </SubSection>
        <SubSection title="Inline alerts（success / warning / error / info）">
          <div className="design-guide-vstack-3">
            <div data-slot="inline-alert" data-variant="success" role="status">
              <CheckCircle2 aria-hidden />
              <div>
                <div data-slot="inline-alert-title">操作成功</div>
                變更已儲存，無需重新載入頁面。
              </div>
            </div>
            <div data-slot="inline-alert" data-variant="warning" role="status">
              <AlertTriangle aria-hidden />
              <div>
                <div data-slot="inline-alert-title">請留意</div>
                此動作可能影響其他使用者正在進行的工作流程。
              </div>
            </div>
            <div data-slot="inline-alert" data-variant="error" role="alert">
              <AlertCircle aria-hidden />
              <div>
                <div data-slot="inline-alert-title">無法完成</div>
                請檢查網路連線或稍後再試；若問題持續請聯絡管理員。
              </div>
            </div>
            <div data-slot="inline-alert" data-variant="info" role="status">
              <Info aria-hidden />
              <div>
                <div data-slot="inline-alert-title">說明</div>
                僅具檢視權限時，部分按鈕會停用或隱藏。
              </div>
            </div>
          </div>
        </SubSection>
        <SubSection title="Layout primitives（ds-*）">
          <p className="design-guide-prose">
            容器與堆疊請優先使用 <code>.ds-container</code>、<code>.ds-stack</code>、<code>.ds-grid</code>、<code>.ds-split</code>，減少頁面散落 magic margin。
          </p>
          <div className="ds-container ds-container--narrow design-guide-ds-demo">
            <div className="ds-stack ds-stack--lg">
              <p className="design-guide-prose design-guide-prose-flush">
                <code>.ds-container.ds-container--narrow</code> + <code>.ds-stack.ds-stack--lg</code>
              </p>
              <div className="ds-grid ds-grid--2">
                <div className="design-guide-ds-tile">欄 A</div>
                <div className="design-guide-ds-tile">欄 B</div>
              </div>
              <div className="ds-split">
                <div className="design-guide-ds-tile">主要區</div>
                <div className="design-guide-ds-tile design-guide-ds-tile--muted">次要區（可於窄螢改為單欄）</div>
              </div>
            </div>
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  COLORS                                                       */}
      {/* ============================================================ */}
      <Section title="Colors">
        <SubSection title="Core">
          <div className="design-guide-grid-swatches">
            <Swatch name="Background" cssVar="--background" />
            <Swatch name="Foreground" cssVar="--foreground" />
            <Swatch name="Card" cssVar="--card" />
            <Swatch name="Primary" cssVar="--primary" />
            <Swatch name="Primary foreground" cssVar="--primary-foreground" />
            <Swatch name="Secondary" cssVar="--secondary" />
            <Swatch name="Muted" cssVar="--muted" />
            <Swatch name="Muted foreground" cssVar="--muted-foreground" />
            <Swatch name="Accent" cssVar="--accent" />
            <Swatch name="Destructive" cssVar="--destructive" />
            <Swatch name="Border" cssVar="--border" />
            <Swatch name="Ring" cssVar="--ring" />
          </div>
        </SubSection>

        <SubSection title="Sidebar">
          <div className="design-guide-grid-swatches">
            <Swatch name="Sidebar" cssVar="--sidebar" />
            <Swatch name="Sidebar border" cssVar="--sidebar-border" />
          </div>
        </SubSection>

        <SubSection title="Chart">
          <div className="design-guide-grid-swatches">
            <Swatch name="Chart 1" cssVar="--chart-1" />
            <Swatch name="Chart 2" cssVar="--chart-2" />
            <Swatch name="Chart 3" cssVar="--chart-3" />
            <Swatch name="Chart 4" cssVar="--chart-4" />
            <Swatch name="Chart 5" cssVar="--chart-5" />
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  TYPOGRAPHY                                                   */}
      {/* ============================================================ */}
      <Section title="Typography">
        <div className="design-guide-vstack-3">
          <h2 className="design-guide-typo-page-title" style={{ marginTop: 0 }}>Page Title — text-xl font-bold</h2>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600 }}>Section Title — text-lg font-semibold</h2>
          <h3 className="design-guide-typo-section">Section Heading — text-sm font-semibold uppercase tracking-wide</h3>
          <p style={{ fontSize: "0.875rem", fontWeight: 500 }}>Card Title — text-sm font-medium</p>
          <p style={{ fontSize: "0.875rem", fontWeight: 600 }}>Card Title Alt — text-sm font-semibold</p>
          <p style={{ fontSize: "0.875rem" }}>Body text — text-sm</p>
          <p className="design-guide-prose">Muted description — text-sm text-muted-foreground</p>
          <p className="design-guide-caption">Tiny label — text-xs text-muted-foreground</p>
          <p className="design-guide-prose" style={{ fontFamily: "ui-monospace, monospace" }}>Mono identifier — text-sm font-mono text-muted-foreground</p>
          <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>Large stat — text-2xl font-bold</p>
          <p style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem" }}>Log/code text — font-mono text-xs</p>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  SPACING & RADIUS                                             */}
      {/* ============================================================ */}
      <Section title="Radius">
        <div className="design-guide-flex-wrap-end">
          {[
            ["sm", "var(--radius-sm)"],
            ["md", "var(--radius-md)"],
            ["lg", "var(--radius-lg)"],
            ["xl", "var(--radius-xl)"],
            ["full", "9999px"],
          ].map(([label, radius]) => (
            <div key={String(label)} className="design-guide-flex-col-center">
              <div className="design-guide-radius-swatch" style={{ borderRadius: radius }} aria-hidden />
              <span className="design-guide-caption">{String(label)}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  BUTTONS                                                      */}
      {/* ============================================================ */}
      <Section title="Buttons">
        <SubSection title="Variants">
          <div className="design-guide-flex-row">
            <Button variant="default">Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
          </div>
        </SubSection>

        <SubSection title="Sizes">
          <div className="design-guide-flex-row">
            <Button size="xs">Extra Small</Button>
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
          </div>
        </SubSection>

        <SubSection title="Icon buttons">
          <div className="design-guide-flex-row">
            <Button variant="ghost" size="icon-xs"><Search /></Button>
            <Button variant="ghost" size="icon-sm"><Search /></Button>
            <Button variant="outline" size="icon"><Search /></Button>
            <Button variant="outline" size="icon-lg"><Search /></Button>
          </div>
        </SubSection>

        <SubSection title="With icons">
          <div className="design-guide-flex-row">
            <Button><Plus /> New Issue</Button>
            <Button variant="outline"><Upload /> Upload</Button>
            <Button variant="destructive"><Trash2 /> Delete</Button>
            <Button size="sm"><Plus /> Add</Button>
          </div>
        </SubSection>

        <SubSection title="States">
          <div className="design-guide-flex-row">
            <Button disabled>Disabled</Button>
            <Button variant="outline" disabled>Disabled Outline</Button>
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  BADGES                                                       */}
      {/* ============================================================ */}
      <Section title="Badges">
        <SubSection title="Variants">
          <div className="design-guide-flex-row">
            <Badge variant="default">Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="destructive">Destructive</Badge>
            <Badge variant="ghost">Ghost</Badge>
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  STATUS BADGES & ICONS                                        */}
      {/* ============================================================ */}
      <Section title="Status System">
        <SubSection title="StatusBadge (all statuses)">
          <div className="design-guide-flex-row">
            {[
              "active", "running", "paused", "idle", "archived", "planned",
              "achieved", "completed", "failed", "timed_out", "succeeded", "error",
              "pending_approval", "backlog", "todo", "in_progress", "in_review", "blocked",
              "done", "terminated", "cancelled", "pending", "revision_requested",
              "approved", "rejected",
            ].map((s) => (
              <StatusBadge key={s} status={s} />
            ))}
          </div>
        </SubSection>

        <SubSection title="StatusIcon (interactive)">
          <div className="design-guide-flex-row-gap3">
            {["backlog", "todo", "in_progress", "in_review", "done", "cancelled", "blocked"].map(
              (s) => (
                <div key={s} className="design-guide-inline-item">
                  <StatusIcon status={s} />
                  <span className="design-guide-caption">{s}</span>
                </div>
              )
            )}
          </div>
          <div className="design-guide-inline-row-mt">
            <StatusIcon status={status} onChange={setStatus} />
            <span className="design-guide-prose" style={{ color: "var(--foreground)" }}>Click the icon to change status (current: {status})</span>
          </div>
        </SubSection>

        <SubSection title="PriorityIcon (interactive)">
          <div className="design-guide-flex-row-gap3">
            {["critical", "high", "medium", "low"].map((p) => (
              <div key={p} className="design-guide-inline-item">
                <PriorityIcon priority={p} />
                <span className="design-guide-caption">{p}</span>
              </div>
            ))}
          </div>
          <div className="design-guide-inline-row-mt">
            <PriorityIcon priority={priority} onChange={setPriority} />
            <span className="design-guide-prose" style={{ color: "var(--foreground)" }}>Click the icon to change (current: {priority})</span>
          </div>
        </SubSection>

        <SubSection title="Agent status dots">
          <div className="design-guide-flex-row-gap4">
            {(["running", "active", "paused", "error", "archived"] as const).map((label) => (
              <div key={label} className="design-guide-inline-item">
                <span className="design-guide-agent-dot">
                  <span className={`design-guide-agent-dot-inner ${agentStatusDot[label] ?? agentStatusDotDefault}`} aria-hidden />
                </span>
                <span className="design-guide-caption">{label}</span>
              </div>
            ))}
          </div>
        </SubSection>

        <SubSection title="Run invocation badges">
          <div className="design-guide-flex-row">
            {(["timer", "assignment", "on_demand", "automation"] as const).map((inv) => (
              <span key={inv} className="design-guide-badge-invocation" data-invocation={inv}>
                {inv}
              </span>
            ))}
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  FORM ELEMENTS                                                */}
      {/* ============================================================ */}
      <Section title="Form Elements">
        <div className="design-guide-form-grid">
          <SubSection title="Input">
            <Input placeholder="Default input" />
            <Input placeholder="Disabled input" disabled className="design-guide-mt-2" />
          </SubSection>

          <SubSection title="Textarea">
            <Textarea placeholder="Write something..." />
          </SubSection>

          <SubSection title="Checkbox & Label">
            <div className="design-guide-vstack-3">
              <div className="design-guide-checkbox-row">
                <Checkbox id="check1" defaultChecked />
                <Label htmlFor="check1">Checked item</Label>
              </div>
              <div className="design-guide-checkbox-row">
                <Checkbox id="check2" />
                <Label htmlFor="check2">Unchecked item</Label>
              </div>
              <div className="design-guide-checkbox-row">
                <Checkbox id="check3" disabled />
                <Label htmlFor="check3">Disabled item</Label>
              </div>
            </div>
          </SubSection>

          <SubSection title="Inline Editor">
            <div className="design-guide-vstack-4">
              <div>
                <p className="design-guide-inline-label mb-1">Title (single-line)</p>
                <InlineEditor
                  value={inlineTitle}
                  onSave={setInlineTitle}
                  as="h2"
                  className="design-guide-typo-page-title"
                />
              </div>
              <div>
                <p className="design-guide-inline-label mb-1">Body text (single-line)</p>
                <InlineEditor
                  value={inlineText}
                  onSave={setInlineText}
                  as="p"
                  className="design-guide-comment-body"
                />
              </div>
              <div>
                <p className="design-guide-inline-label mb-1">Description (multiline, auto-sizing)</p>
                <InlineEditor
                  value={inlineDesc}
                  onSave={setInlineDesc}
                  as="p"
                  className="design-guide-prose"
                  placeholder="Add a description..."
                  multiline
                />
              </div>
            </div>
          </SubSection>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  DS PRIMITIVES: table, field, search, switch                  */}
      {/* ============================================================ */}
      <Section title="Design-system primitives">
        <p className="design-guide-prose">
          下列樣式來自 <code className="design-guide-code-path">@paperclipai/design-system</code>，可在列表與表單頁逐步取代散落 margin／寬度。
        </p>
        <SubSection title="Table (.ds-table-wrap, .ds-table, .ds-table--zebra)">
          <div className="ds-table-wrap">
            <table className="ds-table ds-table--zebra">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="ds-table__numeric">
                    Hours
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Design tokens</td>
                  <td>Done</td>
                  <td className="ds-table__numeric">12</td>
                </tr>
                <tr>
                  <td>Layout shell</td>
                  <td>In progress</td>
                  <td className="ds-table__numeric">8</td>
                </tr>
                <tr>
                  <td>QA checklist</td>
                  <td>Backlog</td>
                  <td className="ds-table__numeric">3</td>
                </tr>
              </tbody>
            </table>
          </div>
        </SubSection>
        <SubSection title="Field (.ds-field, hint, error)">
          <div className="ds-stack ds-stack--md design-guide-max-w-md">
            <div className="ds-field">
              <label className="ds-field__label" htmlFor="dg-field-ok">
                Project name
              </label>
              <span className="ds-field__hint">Shown on the board; you can change it later.</span>
              <Input id="dg-field-ok" placeholder="My project" />
            </div>
            <div className="ds-field" data-invalid="true">
              <label className="ds-field__label" htmlFor="dg-field-err">
                Email
              </label>
              <Input id="dg-field-err" placeholder="you@example.com" aria-invalid />
              <span className="ds-field__error">Enter a valid email address.</span>
            </div>
          </div>
        </SubSection>
        <SubSection title="Search (.ds-search)">
          <div className="ds-search design-guide-search-demo">
            <Search aria-hidden />
            <input type="search" placeholder="Search issues…" aria-label="Search demo" />
          </div>
        </SubSection>
        <SubSection title="Switch ([data-slot=&quot;switch&quot;])">
          <div className="design-guide-checkbox-row">
            <button
              type="button"
              role="switch"
              data-slot="switch"
              aria-checked={dsSwitchOn}
              onClick={() => setDsSwitchOn((v) => !v)}
            >
              <span data-slot="switch-thumb" aria-hidden />
            </button>
            <span className="design-guide-foreground-label">
              Notifications {dsSwitchOn ? "on" : "off"}
            </span>
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  SELECT                                                       */}
      {/* ============================================================ */}
      <Section title="Select">
        <div className="design-guide-form-grid">
          <SubSection title="Default size">
            <Select value={selectValue} onValueChange={setSelectValue}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="backlog">Backlog</SelectItem>
                <SelectItem value="todo">Todo</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="in_review">In Review</SelectItem>
                <SelectItem value="done">Done</SelectItem>
              </SelectContent>
            </Select>
            <p className="design-guide-caption">Current value: {selectValue}</p>
          </SubSection>
          <SubSection title="Small trigger">
            <Select defaultValue="high">
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </SubSection>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  DROPDOWN MENU                                                */}
      {/* ============================================================ */}
      <Section title="Dropdown Menu">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Quick Actions
              <ChevronDown style={{ height: "1rem", width: "1rem" }} aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="design-guide-dropdown-content">
            <DropdownMenuItem>
              <Check className="design-guide-icon" aria-hidden />
              Mark as done
              <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <BookOpen className="design-guide-icon" aria-hidden />
              Open docs
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={menuChecked}
              onCheckedChange={(value) => setMenuChecked(value === true)}
            >
              Watch issue
            </DropdownMenuCheckboxItem>
            <DropdownMenuItem variant="destructive">
              <Trash2 className="design-guide-icon" aria-hidden />
              Delete issue
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Section>

      {/* ============================================================ */}
      {/*  POPOVER                                                      */}
      {/* ============================================================ */}
      <Section title="Popover">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">Open Popover</Button>
          </PopoverTrigger>
          <PopoverContent className="design-guide-popover-body">
            <p style={{ fontSize: "0.875rem", fontWeight: 500 }}>Agent heartbeat</p>
            <p className="design-guide-caption">
              Last run succeeded 24s ago. Next timer run in 9m.
            </p>
            <Button size="xs">Wake now</Button>
          </PopoverContent>
        </Popover>
      </Section>

      {/* ============================================================ */}
      {/*  COLLAPSIBLE                                                  */}
      {/* ============================================================ */}
      <Section title="Collapsible">
        <Collapsible open={collapsibleOpen} onOpenChange={setCollapsibleOpen} className="design-guide-collapsible-root">
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm">
              {collapsibleOpen ? "Hide" : "Show"} advanced filters
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="design-guide-collapsible-content">
            <div className="design-guide-vstack-2">
              <Label htmlFor="owner-filter">Owner</Label>
              <Input id="owner-filter" placeholder="Filter by agent name" />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Section>

      {/* ============================================================ */}
      {/*  SHEET                                                        */}
      {/* ============================================================ */}
      <Section title="Sheet">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm">Open Side Panel</Button>
          </SheetTrigger>
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>Issue Properties</SheetTitle>
              <SheetDescription>Edit metadata without leaving the current page.</SheetDescription>
            </SheetHeader>
            <div className="design-guide-sheet-body">
              <div className="design-guide-sheet-field">
                <Label htmlFor="sheet-title">Title</Label>
                <Input id="sheet-title" defaultValue="Improve onboarding docs" />
              </div>
              <div className="design-guide-sheet-field">
                <Label htmlFor="sheet-description">Description</Label>
                <Textarea id="sheet-description" defaultValue="Capture setup pitfalls and screenshots." />
              </div>
            </div>
            <SheetFooter>
              <Button variant="outline">Cancel</Button>
              <Button>Save</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </Section>

      {/* ============================================================ */}
      {/*  SCROLL AREA                                                  */}
      {/* ============================================================ */}
      <Section title="Scroll Area">
        <ScrollArea className="design-guide-scroll-area">
          <div className="design-guide-scroll-inner">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="design-guide-scroll-item">
                Heartbeat run #{i + 1}: completed successfully
              </div>
            ))}
          </div>
        </ScrollArea>
      </Section>

      {/* ============================================================ */}
      {/*  COMMAND                                                      */}
      {/* ============================================================ */}
      <Section title="Command (CMDK)">
        <div className="design-guide-card-border">
          <Command>
            <CommandInput placeholder="Type a command or search..." />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup heading="Pages">
                <CommandItem>
                  <LayoutDashboard className="design-guide-icon" aria-hidden />
                  Dashboard
                </CommandItem>
                <CommandItem>
                  <CircleDot className="design-guide-icon" aria-hidden />
                  Issues
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Actions">
                <CommandItem>
                  <CommandIcon className="design-guide-icon" aria-hidden />
                  Open command palette
                </CommandItem>
                <CommandItem>
                  <Plus className="design-guide-icon" aria-hidden />
                  Create new issue
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  BREADCRUMB                                                   */}
      {/* ============================================================ */}
      <Section title="Breadcrumb">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Projects</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="#">VFactory App</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Issue List</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Section>

      {/* ============================================================ */}
      {/*  CARDS                                                        */}
      {/* ============================================================ */}
      <Section title="Cards">
        <SubSection title="Standard Card">
          <Card>
            <CardHeader>
              <CardTitle>Card Title</CardTitle>
              <CardDescription>Card description with supporting text.</CardDescription>
            </CardHeader>
            <CardContent>
              <p style={{ fontSize: "0.875rem" }}>Card content goes here. This is the main body area.</p>
            </CardContent>
            <CardFooter className="design-guide-card-footer-buttons">
              <Button size="sm">Action</Button>
              <Button variant="outline" size="sm">Cancel</Button>
            </CardFooter>
          </Card>
        </SubSection>

        <SubSection title="Metric Cards">
          <div className="design-guide-metric-grid">
            <MetricCard icon={Bot} value={12} label="Active Agents" description="+3 this week" />
            <MetricCard icon={CircleDot} value={48} label="Open Issues" />
            <MetricCard icon={DollarSign} value="$1,234" label="Monthly Cost" description="Under budget" />
            <MetricCard icon={Zap} value="99.9%" label="Uptime" />
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  TABS                                                         */}
      {/* ============================================================ */}
      <Section title="Tabs">
        <SubSection title="Default (pill) variant">
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="runs">Runs</TabsTrigger>
              <TabsTrigger value="config">Config</TabsTrigger>
              <TabsTrigger value="costs">Costs</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <p className="design-guide-tab-content">Overview tab content.</p>
            </TabsContent>
            <TabsContent value="runs">
              <p className="design-guide-tab-content">Runs tab content.</p>
            </TabsContent>
            <TabsContent value="config">
              <p className="design-guide-tab-content">Config tab content.</p>
            </TabsContent>
            <TabsContent value="costs">
              <p className="design-guide-tab-content">Costs tab content.</p>
            </TabsContent>
          </Tabs>
        </SubSection>

        <SubSection title="Line variant">
          <Tabs defaultValue="summary">
            <TabsList variant="line">
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="comments">Comments</TabsTrigger>
            </TabsList>
            <TabsContent value="summary">
              <p className="design-guide-tab-content">Summary content with underline tabs.</p>
            </TabsContent>
            <TabsContent value="details">
              <p className="design-guide-tab-content">Details content.</p>
            </TabsContent>
            <TabsContent value="comments">
              <p className="design-guide-tab-content">Comments content.</p>
            </TabsContent>
          </Tabs>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  ENTITY ROWS                                                  */}
      {/* ============================================================ */}
      <Section title="Entity Rows">
        <div className="design-guide-entity-wrap">
          <EntityRow
            leading={
              <>
                <StatusIcon status="in_progress" />
                <PriorityIcon priority="high" />
              </>
            }
            identifier="PAP-001"
            title="Implement authentication flow"
            subtitle="Assigned to Agent Alpha"
            trailing={<StatusBadge status="in_progress" />}
            onClick={() => {}}
          />
          <EntityRow
            leading={
              <>
                <StatusIcon status="done" />
                <PriorityIcon priority="medium" />
              </>
            }
            identifier="PAP-002"
            title="Set up CI/CD pipeline"
            subtitle="Completed 2 days ago"
            trailing={<StatusBadge status="done" />}
            onClick={() => {}}
          />
          <EntityRow
            leading={
              <>
                <StatusIcon status="todo" />
                <PriorityIcon priority="low" />
              </>
            }
            identifier="PAP-003"
            title="Write API documentation"
            trailing={<StatusBadge status="todo" />}
            onClick={() => {}}
          />
          <EntityRow
            leading={
              <>
                <StatusIcon status="blocked" />
                <PriorityIcon priority="critical" />
              </>
            }
            identifier="PAP-004"
            title="Deploy to production"
            subtitle="Blocked by PAP-001"
            trailing={<StatusBadge status="blocked" />}
            selected
          />
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  FILTER BAR                                                   */}
      {/* ============================================================ */}
      <Section title="Filter Bar">
        <FilterBar
          filters={filters}
          onRemove={(key) => setFilters((f) => f.filter((x) => x.key !== key))}
          onClear={() => setFilters([])}
        />
        {filters.length === 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setFilters([
                { key: "status", label: "Status", value: "Active" },
                { key: "priority", label: "Priority", value: "High" },
              ])
            }
          >
            Reset filters
          </Button>
        )}
      </Section>

      {/* ============================================================ */}
      {/*  AVATARS                                                      */}
      {/* ============================================================ */}
      <Section title="Avatars">
        <SubSection title="Sizes">
          <div className="design-guide-avatar-row">
            <Avatar size="sm"><AvatarFallback>SM</AvatarFallback></Avatar>
            <Avatar><AvatarFallback>DF</AvatarFallback></Avatar>
            <Avatar size="lg"><AvatarFallback>LG</AvatarFallback></Avatar>
          </div>
        </SubSection>

        <SubSection title="Group">
          <AvatarGroup>
            <Avatar><AvatarFallback>A1</AvatarFallback></Avatar>
            <Avatar><AvatarFallback>A2</AvatarFallback></Avatar>
            <Avatar><AvatarFallback>A3</AvatarFallback></Avatar>
            <AvatarGroupCount>+5</AvatarGroupCount>
          </AvatarGroup>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  IDENTITY                                                     */}
      {/* ============================================================ */}
      <Section title="Identity">
        <SubSection title="Sizes">
          <div className="design-guide-avatar-row-wide">
            <Identity name="Agent Alpha" size="sm" />
            <Identity name="Agent Alpha" />
            <Identity name="Agent Alpha" size="lg" />
          </div>
        </SubSection>

        <SubSection title="Initials derivation">
          <div className="design-guide-identity-col">
            <Identity name="CEO Agent" size="sm" />
            <Identity name="Alpha" size="sm" />
            <Identity name="Quality Assurance Lead" size="sm" />
          </div>
        </SubSection>

        <SubSection title="Custom initials">
          <Identity name="Backend Service" initials="BS" size="sm" />
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  TOOLTIPS                                                     */}
      {/* ============================================================ */}
      <Section title="Tooltips">
        <div className="design-guide-tooltip-row">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm">Hover me</Button>
            </TooltipTrigger>
            <TooltipContent>This is a tooltip</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm"><Settings /></Button>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  DIALOG                                                       */}
      {/* ============================================================ */}
      <Section title="Dialog">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">Open Dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Dialog Title</DialogTitle>
              <DialogDescription>
                This is a sample dialog showing the standard layout with header, content, and footer.
              </DialogDescription>
            </DialogHeader>
            <div className="design-guide-dialog-form">
              <div>
                <Label>Name</Label>
                <Input placeholder="Enter a name" className="design-guide-dialog-field" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea placeholder="Describe..." className="design-guide-dialog-field" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline">Cancel</Button>
              <Button>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Section>

      {/* ============================================================ */}
      {/*  EMPTY STATE                                                  */}
      {/* ============================================================ */}
      <Section title="Empty State">
        <div className="design-guide-entity-wrap">
          <EmptyState
            icon={Inbox}
            message="No items to show. Create your first one to get started."
            action="Create Item"
            onAction={() => {}}
          />
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  PROGRESS BARS                                                */}
      {/* ============================================================ */}
      <Section title="Progress Bars (Budget)">
        <div className="design-guide-progress-list">
          {[
            { label: "Under budget (40%)", pct: 40, state: "ok" as const },
            { label: "Warning (75%)", pct: 75, state: "warn" as const },
            { label: "Over budget (95%)", pct: 95, state: "over" as const },
          ].map(({ label, pct, state }) => (
            <div key={label} className="design-guide-progress-item">
              <div className="design-guide-progress-header">
                <span className="design-guide-caption">{label}</span>
                <span className="design-guide-caption" style={{ fontFamily: "ui-monospace, monospace" }}>{pct}%</span>
              </div>
              <div className="design-guide-progress-track">
                <div
                  className="design-guide-progress-bar"
                  data-state={state}
                  style={{ width: `${pct}%` }}
                  aria-hidden
                />
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  LOG VIEWER                                                   */}
      {/* ============================================================ */}
      <Section title="Log Viewer">
        <div className="design-guide-log-viewer">
          <div className="design-guide-log-line">[12:00:01] INFO  Agent started successfully</div>
          <div className="design-guide-log-line">[12:00:02] INFO  Processing task PAP-001</div>
          <div className="design-guide-log-warn">[12:00:05] WARN  Rate limit approaching (80%)</div>
          <div className="design-guide-log-line">[12:00:08] INFO  Task PAP-001 completed</div>
          <div className="design-guide-log-error">[12:00:12] ERROR Connection timeout to upstream service</div>
          <div className="design-guide-log-sys">[12:00:12] SYS   Retrying connection in 5s...</div>
          <div className="design-guide-log-line">[12:00:17] INFO  Reconnected successfully</div>
          <div className="design-guide-log-live">
            <span className="design-guide-log-live-dot">
              <span className="design-guide-log-live-dot-inner" aria-hidden />
            </span>
            <span className="design-guide-log-live-text">Live</span>
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  PROPERTY ROW PATTERN                                         */}
      {/* ============================================================ */}
      <Section title="Property Row Pattern">
        <div className="design-guide-property-box">
          <div className="design-guide-property-row">
            <span className="design-guide-caption">Status</span>
            <StatusBadge status="active" />
          </div>
          <div className="design-guide-property-row">
            <span className="design-guide-caption">Priority</span>
            <PriorityIcon priority="high" />
          </div>
          <div className="design-guide-property-row">
            <span className="design-guide-caption">Assignee</span>
            <div className="design-guide-property-row-inner">
              <Avatar size="sm"><AvatarFallback>A</AvatarFallback></Avatar>
              <span className="design-guide-caption" style={{ color: "var(--foreground)" }}>Agent Alpha</span>
            </div>
          </div>
          <div className="design-guide-property-row">
            <span className="design-guide-caption">Created</span>
            <span className="design-guide-caption" style={{ color: "var(--foreground)" }}>Jan 15, 2025</span>
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  NAVIGATION PATTERNS                                          */}
      {/* ============================================================ */}
      <Section title="Navigation Patterns">
        <SubSection title="Sidebar nav items">
          <div className="design-guide-sidebar-demo">
            <div className="design-guide-sidebar-item design-guide-sidebar-item-active">
              <LayoutDashboard className="design-guide-icon" aria-hidden />
              Dashboard
            </div>
            <div className="design-guide-sidebar-item design-guide-sidebar-item-inactive">
              <CircleDot className="design-guide-icon" aria-hidden />
              Issues
              <span className="design-guide-sidebar-badge">12</span>
            </div>
            <div className="design-guide-sidebar-item design-guide-sidebar-item-inactive">
              <Bot className="design-guide-icon" aria-hidden />
              Agents
            </div>
            <div className="design-guide-sidebar-item design-guide-sidebar-item-inactive">
              <Hexagon className="design-guide-icon" aria-hidden />
              Projects
            </div>
          </div>
        </SubSection>

        <SubSection title="View toggle">
          <div className="design-guide-view-toggle">
            <button type="button" className="design-guide-view-toggle-btn design-guide-view-toggle-btn-active">
              <ListTodo style={{ height: "0.875rem", width: "0.875rem", display: "inline", marginRight: "0.25rem" }} aria-hidden />
              List
            </button>
            <button type="button" className="design-guide-view-toggle-btn design-guide-view-toggle-btn-inactive">
              <Target style={{ height: "0.875rem", width: "0.875rem", display: "inline", marginRight: "0.25rem" }} aria-hidden />
              Org
            </button>
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  GROUPED LIST (Issues pattern)                                */}
      {/* ============================================================ */}
      <Section title="Grouped List (Issues pattern)">
        <div>
          <div className="design-guide-group-header">
            <StatusIcon status="in_progress" />
            <span className="design-guide-group-header-title">In Progress</span>
            <span className="design-guide-caption" style={{ marginLeft: "0.25rem" }}>2</span>
          </div>
          <div className="design-guide-group-body">
            <EntityRow
              leading={<PriorityIcon priority="high" />}
              identifier="PAP-101"
              title="Build agent heartbeat system"
              onClick={() => {}}
            />
            <EntityRow
              leading={<PriorityIcon priority="medium" />}
              identifier="PAP-102"
              title="Add cost tracking dashboard"
              onClick={() => {}}
            />
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  COMMENT THREAD PATTERN                                       */}
      {/* ============================================================ */}
      <Section title="Comment Thread Pattern">
        <div className="design-guide-comments-section">
          <h3 className="design-guide-comments-title">Comments (2)</h3>
          <div className="design-guide-comments-list">
            <div className="design-guide-comment-card">
              <div className="design-guide-comment-head">
                <span className="design-guide-caption" style={{ fontWeight: 500 }}>Agent</span>
                <span className="design-guide-caption">Jan 15, 2025</span>
              </div>
              <p className="design-guide-comment-body">Started working on the authentication module. Will need API keys configured.</p>
            </div>
            <div className="design-guide-comment-card">
              <div className="design-guide-comment-head">
                <span className="design-guide-caption" style={{ fontWeight: 500 }}>Human</span>
                <span className="design-guide-caption">Jan 16, 2025</span>
              </div>
              <p className="design-guide-comment-body">API keys have been added to the vault. Please proceed.</p>
            </div>
          </div>
          <div className="design-guide-vstack-2">
            <Textarea placeholder="Leave a comment..." rows={3} />
            <Button size="sm">Comment</Button>
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  COST TABLE PATTERN                                           */}
      {/* ============================================================ */}
      <Section title="Cost Table Pattern">
        <div className="design-guide-table-wrap">
          <table className="design-guide-table">
            <thead style={{ borderBottom: "1px solid var(--border)", background: "color-mix(in oklch, var(--accent) 20%, transparent)" }}>
              <tr>
                <th>Model</th>
                <th>Tokens</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <td>claude-sonnet-4-20250514</td>
                <td className="mono">1.2M</td>
                <td className="mono">$18.00</td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <td>claude-haiku-4-20250506</td>
                <td className="mono">500k</td>
                <td className="mono">$1.25</td>
              </tr>
              <tr>
                <td className="fw">Total</td>
                <td className="mono">1.7M</td>
                <td className="mono fw">$19.25</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  SKELETONS                                                    */}
      {/* ============================================================ */}
      <Section title="Skeletons">
        <SubSection title="Individual">
          <div className="design-guide-skeleton-list">
            <Skeleton className="design-guide-skeleton-item-sm" />
            <Skeleton className="design-guide-skeleton-item-md" />
            <Skeleton className="design-guide-skeleton-item-lg" />
          </div>
        </SubSection>

        <SubSection title="Page Skeleton (list)">
          <div className="design-guide-skeleton-box">
            <PageSkeleton variant="list" />
          </div>
        </SubSection>

        <SubSection title="Page Skeleton (detail)">
          <div className="design-guide-skeleton-box">
            <PageSkeleton variant="detail" />
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  SEPARATOR                                                    */}
      {/* ============================================================ */}
      <Section title="Separator">
        <div className="design-guide-divider-section">
          <p className="design-guide-prose">Horizontal</p>
          <Separator />
          <div className="design-guide-divider-row">
            <span style={{ fontSize: "0.875rem" }}>Left</span>
            <Separator orientation="vertical" />
            <span style={{ fontSize: "0.875rem" }}>Right</span>
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  ICON REFERENCE                                               */}
      {/* ============================================================ */}
      <Section title="Common Icons (Lucide)">
        <div className="design-guide-icon-grid">
          {[
            ["Inbox", Inbox],
            ["ListTodo", ListTodo],
            ["CircleDot", CircleDot],
            ["Hexagon", Hexagon],
            ["Target", Target],
            ["LayoutDashboard", LayoutDashboard],
            ["Bot", Bot],
            ["DollarSign", DollarSign],
            ["History", History],
            ["Search", Search],
            ["Plus", Plus],
            ["Trash2", Trash2],
            ["Settings", Settings],
            ["User", User],
            ["Mail", Mail],
            ["Upload", Upload],
            ["Zap", Zap],
          ].map(([name, Icon]) => {
            const LucideIcon = Icon as React.FC<{ className?: string }>;
            return (
              <div key={name as string} className="design-guide-icon-cell">
                <LucideIcon className="design-guide-icon design-guide-icon-muted" aria-hidden />
                <span>{name as string}</span>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  KEYBOARD SHORTCUTS                                           */}
      {/* ============================================================ */}
      <Section title="Keyboard Shortcuts">
        <div className="design-guide-shortcuts-list">
          {[
            ["Cmd+K / Ctrl+K", "Open Command Palette"],
            ["C", "New Issue (outside inputs)"],
            ["[", "Toggle Sidebar"],
            ["]", "Toggle Properties Panel"],
            ["Cmd+Enter / Ctrl+Enter", "Submit markdown comment"],
          ].map(([key, desc]) => (
            <div key={String(key)}>
              <span className="design-guide-prose">{desc}</span>
              <kbd className="design-guide-kbd">{key}</kbd>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
