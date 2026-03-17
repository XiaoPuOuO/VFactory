import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  CodeMirrorEditor,
  MDXEditor,
  codeBlockPlugin,
  codeMirrorPlugin,
  type CodeBlockEditorDescriptor,
  type MDXEditorMethods,
  headingsPlugin,
  imagePlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  type RealmPlugin,
} from "@mdxeditor/editor";
import { buildProjectMentionHref, parseProjectMentionHref } from "@paperclipai/shared";

/* ---- Mention types ---- */

export interface MentionOption {
  id: string;
  name: string;
  kind?: "agent" | "project";
  projectId?: string;
  projectColor?: string | null;
}

/* ---- Editor props ---- */

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  contentClassName?: string;
  onBlur?: () => void;
  imageUploadHandler?: (file: File) => Promise<string>;
  bordered?: boolean;
  /** List of mentionable entities. Enables @-mention autocomplete. */
  mentions?: MentionOption[];
  /** Enter 發送；Shift+Enter 換行。未提供時 Enter 為預設換行。 */
  onSubmit?: () => void;
}

export interface MarkdownEditorRef {
  focus: () => void;
}

/* ---- Mention detection helpers ---- */

interface MentionState {
  query: string;
  /** 用於 dropdown 定位（viewport 座標） */
  rectTop: number;
  rectBottom: number;
  rectLeft: number;
  textNode: Text;
  atPos: number;
  endPos: number;
}

const CODE_BLOCK_LANGUAGES: Record<string, string> = {
  txt: "Text",
  md: "Markdown",
  js: "JavaScript",
  jsx: "JavaScript (JSX)",
  ts: "TypeScript",
  tsx: "TypeScript (TSX)",
  json: "JSON",
  bash: "Bash",
  sh: "Shell",
  python: "Python",
  go: "Go",
  rust: "Rust",
  sql: "SQL",
  html: "HTML",
  css: "CSS",
  yaml: "YAML",
  yml: "YAML",
};

const FALLBACK_CODE_BLOCK_DESCRIPTOR: CodeBlockEditorDescriptor = {
  // Keep this lower than codeMirrorPlugin's descriptor priority so known languages
  // still use the standard matching path; this catches malformed/unknown fences.
  priority: 0,
  match: () => true,
  Editor: CodeMirrorEditor,
};

function detectMention(container: HTMLElement): MentionState | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;

  const range = sel.getRangeAt(0);
  const textNode = range.startContainer;
  if (textNode.nodeType !== Node.TEXT_NODE) return null;
  if (!container.contains(textNode)) return null;

  const text = textNode.textContent ?? "";
  const offset = range.startOffset;

  // Walk backwards from cursor to find @
  let atPos = -1;
  for (let i = offset - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === "@") {
      if (i === 0 || /\s/.test(text[i - 1])) {
        atPos = i;
      }
      break;
    }
    if (/\s/.test(ch)) break;
  }

  if (atPos === -1) return null;

  const query = text.slice(atPos + 1, offset);

  const tempRange = document.createRange();
  tempRange.setStart(textNode, atPos);
  tempRange.setEnd(textNode, atPos + 1);
  const rect = tempRange.getBoundingClientRect();

  return {
    query,
    rectTop: rect.top,
    rectBottom: rect.bottom,
    rectLeft: rect.left,
    textNode: textNode as Text,
    atPos,
    endPos: offset,
  };
}

function mentionMarkdown(option: MentionOption): string {
  if (option.kind === "project" && option.projectId) {
    return `[@${option.name}](${buildProjectMentionHref(option.projectId, option.projectColor ?? null)}) `;
  }
  return `@${option.name} `;
}

/** Replace `@<query>` in the markdown string with the selected mention token. */
function applyMention(markdown: string, query: string, option: MentionOption): string {
  const search = `@${query}`;
  const replacement = mentionMarkdown(option);
  const idx = markdown.lastIndexOf(search);
  if (idx === -1) return markdown;
  return markdown.slice(0, idx) + replacement + markdown.slice(idx + search.length);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const trimmed = hex.trim();
  const match = /^#([0-9a-f]{6})$/i.exec(trimmed);
  if (!match) return null;
  const value = match[1];
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function mentionChipStyle(color: string | null): CSSProperties | undefined {
  if (!color) return undefined;
  const rgb = hexToRgb(color);
  if (!rgb) return undefined;
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  const textColor = luminance > 0.55 ? "#111827" : "#f8fafc";
  return {
    borderColor: color,
    backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.22)`,
    color: textColor,
  };
}

/* ---- Component ---- */

export const MarkdownEditor = forwardRef<MarkdownEditorRef, MarkdownEditorProps>(function MarkdownEditor({
  value,
  onChange,
  placeholder,
  className,
  contentClassName,
  onBlur,
  imageUploadHandler,
  bordered = true,
  mentions,
  onSubmit,
}: MarkdownEditorProps, forwardedRef) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ref = useRef<MDXEditorMethods>(null);
  const latestValueRef = useRef(value);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragDepthRef = useRef(0);

  // Stable ref for imageUploadHandler so plugins don't recreate on every render
  const imageUploadHandlerRef = useRef(imageUploadHandler);
  imageUploadHandlerRef.current = imageUploadHandler;

  // Mention state (ref kept in sync so callbacks always see the latest value)
  const [mentionState, setMentionState] = useState<MentionState | null>(null);
  const mentionStateRef = useRef<MentionState | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionActive = mentionState !== null && mentions && mentions.length > 0;
  const projectColorById = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const mention of mentions ?? []) {
      if (mention.kind === "project" && mention.projectId) {
        map.set(mention.projectId, mention.projectColor ?? null);
      }
    }
    return map;
  }, [mentions]);

  const filteredMentions = useMemo(() => {
    if (!mentionState || !mentions) return [];
    const q = mentionState.query.toLowerCase();
    return mentions.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 8);
  }, [mentionState?.query, mentions]);

  useImperativeHandle(forwardedRef, () => ({
    focus: () => {
      ref.current?.focus(undefined, { defaultSelection: "rootEnd" });
    },
  }), []);

  // Whether the image plugin should be included (boolean is stable across renders
  // as long as the handler presence doesn't toggle)
  const hasImageUpload = Boolean(imageUploadHandler);

  const plugins = useMemo<RealmPlugin[]>(() => {
    const imageHandler = hasImageUpload
      ? async (file: File) => {
          const handler = imageUploadHandlerRef.current;
          if (!handler) throw new Error("No image upload handler");
          try {
            const src = await handler(file);
            setUploadError(null);
            return src;
          } catch (err) {
            const message = err instanceof Error ? err.message : "Image upload failed";
            setUploadError(message);
            throw err;
          }
        }
      : undefined;
    const all: RealmPlugin[] = [
      headingsPlugin(),
      listsPlugin(),
      quotePlugin(),
      tablePlugin(),
      linkPlugin(),
      linkDialogPlugin(),
      thematicBreakPlugin(),
      codeBlockPlugin({
        defaultCodeBlockLanguage: "txt",
        codeBlockEditorDescriptors: [FALLBACK_CODE_BLOCK_DESCRIPTOR],
      }),
      codeMirrorPlugin({ codeBlockLanguages: CODE_BLOCK_LANGUAGES }),
      markdownShortcutPlugin(),
    ];
    if (imageHandler) {
      all.push(imagePlugin({ imageUploadHandler: imageHandler }));
    }
    return all;
  }, [hasImageUpload]);

  useEffect(() => {
    if (value !== latestValueRef.current) {
      ref.current?.setMarkdown(value);
      latestValueRef.current = value;
    }
  }, [value]);

  const decorateProjectMentions = useCallback(() => {
    const editable = containerRef.current?.querySelector('[contenteditable="true"]');
    if (!editable) return;
    const links = editable.querySelectorAll("a");
    for (const node of links) {
      const link = node as HTMLAnchorElement;
      const parsed = parseProjectMentionHref(link.getAttribute("href") ?? "");
      if (!parsed) {
        if (link.dataset.projectMention === "true") {
          link.dataset.projectMention = "false";
          link.classList.remove("paperclip-project-mention-chip");
          link.removeAttribute("contenteditable");
          link.style.removeProperty("border-color");
          link.style.removeProperty("background-color");
          link.style.removeProperty("color");
        }
        continue;
      }

      const color = parsed.color ?? projectColorById.get(parsed.projectId) ?? null;
      link.dataset.projectMention = "true";
      link.classList.add("paperclip-project-mention-chip");
      link.setAttribute("contenteditable", "false");
      const style = mentionChipStyle(color);
      if (style) {
        link.style.borderColor = style.borderColor ?? "";
        link.style.backgroundColor = style.backgroundColor ?? "";
        link.style.color = style.color ?? "";
      }
    }
  }, [projectColorById]);

  // Mention detection: listen for selection changes and input events
  const checkMention = useCallback(() => {
    if (!mentions || mentions.length === 0 || !containerRef.current) {
      mentionStateRef.current = null;
      setMentionState(null);
      return;
    }
    const result = detectMention(containerRef.current);
    mentionStateRef.current = result;
    if (result) {
      setMentionState(result);
      setMentionIndex(0);
    } else {
      setMentionState(null);
    }
  }, [mentions]);

  useEffect(() => {
    if (!mentions || mentions.length === 0) return;

    const el = containerRef.current;
    // Listen for input events on the container so mention detection
    // also fires after typing (e.g. space to dismiss).
    const onInput = () => requestAnimationFrame(checkMention);

    document.addEventListener("selectionchange", checkMention);
    el?.addEventListener("input", onInput, true);
    return () => {
      document.removeEventListener("selectionchange", checkMention);
      el?.removeEventListener("input", onInput, true);
    };
  }, [checkMention, mentions]);

  useEffect(() => {
    const editable = containerRef.current?.querySelector('[contenteditable="true"]');
    if (!editable) return;
    decorateProjectMentions();
    const observer = new MutationObserver(() => {
      decorateProjectMentions();
    });
    observer.observe(editable, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, [decorateProjectMentions, value]);

  const selectMention = useCallback(
    (option: MentionOption) => {
      // Read from ref to avoid stale-closure issues (selectionchange can
      // update state between the last render and this callback firing).
      const state = mentionStateRef.current;
      if (!state) return;

      if (option.kind === "project" && option.projectId) {
        const current = latestValueRef.current;
        const next = applyMention(current, state.query, option);
        if (next !== current) {
          latestValueRef.current = next;
          ref.current?.setMarkdown(next);
          onChange(next);
        }
        requestAnimationFrame(() => {
          ref.current?.focus(undefined, { defaultSelection: "rootEnd" });
          decorateProjectMentions();
        });
        mentionStateRef.current = null;
        setMentionState(null);
        return;
      }

      const replacement = mentionMarkdown(option);

      // Replace @query directly via DOM selection so the cursor naturally
      // lands after the inserted text. Lexical picks up the change through
      // its normal input-event handling.
      const sel = window.getSelection();
      if (sel && state.textNode.isConnected) {
        const range = document.createRange();
        range.setStart(state.textNode, state.atPos);
        range.setEnd(state.textNode, state.endPos);
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand("insertText", false, replacement);

        // After Lexical reconciles the DOM, the cursor position set by
        // execCommand may be lost. Explicitly reposition it after the
        // inserted mention text.
        const cursorTarget = state.atPos + replacement.length;
        requestAnimationFrame(() => {
          const newSel = window.getSelection();
          if (!newSel) return;
          // Try the original text node first (it may still be valid)
          if (state.textNode.isConnected) {
            const len = state.textNode.textContent?.length ?? 0;
            if (cursorTarget <= len) {
              const r = document.createRange();
              r.setStart(state.textNode, cursorTarget);
              r.collapse(true);
              newSel.removeAllRanges();
              newSel.addRange(r);
              return;
            }
          }
          // Fallback: search for the replacement in text nodes
          const editable = containerRef.current?.querySelector('[contenteditable="true"]');
          if (!editable) return;
          const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
          let node: Text | null;
          while ((node = walker.nextNode() as Text | null)) {
            const text = node.textContent ?? "";
            const idx = text.indexOf(replacement);
            if (idx !== -1) {
              const pos = idx + replacement.length;
              if (pos <= text.length) {
                const r = document.createRange();
                r.setStart(node, pos);
                r.collapse(true);
                newSel.removeAllRanges();
                newSel.addRange(r);
                return;
              }
            }
          }
        });
      } else {
        // Fallback: full markdown replacement when DOM node is stale
        const current = latestValueRef.current;
        const next = applyMention(current, state.query, option);
        if (next !== current) {
          latestValueRef.current = next;
          ref.current?.setMarkdown(next);
          onChange(next);
        }
        requestAnimationFrame(() => {
          ref.current?.focus(undefined, { defaultSelection: "rootEnd" });
        });
      }

      requestAnimationFrame(() => {
        decorateProjectMentions();
      });

      mentionStateRef.current = null;
      setMentionState(null);
    },
    [decorateProjectMentions, onChange],
  );

  function hasFilePayload(evt: DragEvent<HTMLDivElement>) {
    return Array.from(evt.dataTransfer?.types ?? []).includes("Files");
  }

  const canDropImage = Boolean(imageUploadHandler);

  return (
    <div
      ref={containerRef}
      className={[
        "paperclip-mdxeditor-scope",
        bordered ? "bordered" : "",
        isDragOver ? "is-drag-over" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      onKeyDownCapture={(e) => {
        // Mention keyboard handling（Enter/Tab 在 popup 開啟時用來選擇項目）
        if (mentionActive) {
          // Space dismisses the popup (let the character be typed normally)
          if (e.key === " ") {
            mentionStateRef.current = null;
            setMentionState(null);
            return;
          }
          // Escape always dismisses
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            mentionStateRef.current = null;
            setMentionState(null);
            return;
          }
          // Arrow / Enter / Tab only when there are filtered results
          if (filteredMentions.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              e.stopPropagation();
              setMentionIndex((prev) => Math.min(prev + 1, filteredMentions.length - 1));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              e.stopPropagation();
              setMentionIndex((prev) => Math.max(prev - 1, 0));
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              e.stopPropagation();
              selectMention(filteredMentions[mentionIndex]);
              return;
            }
          }
        }

        // Enter 發送；Shift+Enter 換行（僅在提供 onSubmit 時）
        if (onSubmit && e.key === "Enter") {
          if (e.shiftKey) {
            // Shift+Enter：不攔截，讓編輯器插入換行
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          onSubmit();
        }
      }}
      onDragEnter={(evt) => {
        if (!canDropImage || !hasFilePayload(evt)) return;
        dragDepthRef.current += 1;
        setIsDragOver(true);
      }}
      onDragOver={(evt) => {
        if (!canDropImage || !hasFilePayload(evt)) return;
        evt.preventDefault();
        evt.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        if (!canDropImage) return;
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setIsDragOver(false);
      }}
      onDrop={() => {
        dragDepthRef.current = 0;
        setIsDragOver(false);
      }}
    >
      <MDXEditor
        ref={ref}
        markdown={value}
        placeholder={placeholder}
        onChange={(next) => {
          latestValueRef.current = next;
          onChange(next);
        }}
        onBlur={() => onBlur?.()}
        className={`paperclip-mdxeditor${!bordered ? " paperclip-mdxeditor--borderless" : ""}`}
        contentEditableClassName={contentClassName ? `paperclip-mdxeditor-content ${contentClassName}` : "paperclip-mdxeditor-content"}
        plugins={plugins}
      />

      {/* Mention dropdown：高度隨內容；顯示在上方時用 bottom 錨在輸入框上緣，只留 GAP，避免留白與「太高」 */}
      {mentionActive && filteredMentions.length > 0 && (() => {
        const PAD = 8;
        const GAP = 6;
        const MAX_H = 200;
        const MIN_W = 180;
        const { rectLeft } = mentionState;
        const containerRect = containerRef.current?.getBoundingClientRect();
        const useContainer = containerRect && containerRect.height > 0;
        const anchorBottom = useContainer ? containerRect.bottom : mentionState.rectBottom;
        const anchorTop = useContainer ? containerRect.top : mentionState.rectTop;
        const preferredBelow = anchorBottom + GAP;
        const fitsBelow = preferredBelow + MAX_H <= window.innerHeight - PAD;
        const showAbove = !fitsBelow && anchorTop - GAP >= PAD;

        let left = rectLeft;
        if (left + MIN_W > window.innerWidth - PAD) {
          left = window.innerWidth - PAD - MIN_W;
        }
        if (left < PAD) left = PAD;

        const style: CSSProperties = { left };
        if (showAbove) {
          style.bottom = window.innerHeight - anchorTop + GAP;
        } else {
          style.top = fitsBelow ? preferredBelow : Math.min(preferredBelow, window.innerHeight - PAD - MAX_H);
        }

        const dropdown = (
          <div
            className="ui-mde-mention-dropdown"
            style={style}
          >
            {filteredMentions.map((option, i) => (
              <button
                key={option.id}
                type="button"
                className="ui-mde-mention-item"
                data-selected={i === mentionIndex ? "" : undefined}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectMention(option);
                }}
                onMouseEnter={() => setMentionIndex(i)}
              >
                {option.kind === "project" && option.projectId ? (
                  <span
                    className="ui-mde-mention-dot"
                    style={{ backgroundColor: option.projectColor ?? "#64748b" }}
                  />
                ) : (
                  <span className="ui-mde-mention-at">@</span>
                )}
                <span>{option.name}</span>
                {option.kind === "project" && option.projectId && (
                  <span className="ui-mde-mention-label">
                    Project
                  </span>
                )}
              </button>
            ))}
          </div>
        );
        return createPortal(dropdown, document.body);
      })()}

      {isDragOver && canDropImage && (
        <div className="ui-mde-drop-overlay">
          Drop image to upload
        </div>
      )}
      {uploadError && (
        <p className="ui-mde-upload-error">{uploadError}</p>
      )}
    </div>
  );
});
