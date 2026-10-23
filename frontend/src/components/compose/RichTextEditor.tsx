"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronsUpDown,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Type,
  Underline,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Menu, MenuItem } from "../ui/Menu";

const TRACKED = ["bold", "italic", "underline", "strikeThrough", "insertOrderedList", "insertUnorderedList"] as const;
type Tracked = (typeof TRACKED)[number];

const SIZES = [
  { label: "Small", value: "2" },
  { label: "Normal", value: "3" },
  { label: "Large", value: "5" },
  { label: "Huge", value: "6" },
];

const ALIGNMENTS = [
  { label: "Left", command: "justifyLeft", icon: AlignLeft },
  { label: "Center", command: "justifyCenter", icon: AlignCenter },
  { label: "Right", command: "justifyRight", icon: AlignRight },
  { label: "Justify", command: "justifyFull", icon: AlignJustify },
];

interface Props {
  defaultValue?: string;
  onChange: (html: string, isEmpty: boolean) => void;
  placeholder?: string;
  invalid?: boolean;
}

/**
 * Lightweight rich-text editor (contentEditable + execCommand) with the toolbar from the design.
 * The HTML it produces is sanitized again by the backend before it is stored or sent.
 */
export function RichTextEditor({ defaultValue = "", onChange, placeholder, invalid }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const [active, setActive] = useState<Partial<Record<Tracked, boolean>>>({});
  const [empty, setEmpty] = useState(!defaultValue);

  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = defaultValue;
    document.execCommand("defaultParagraphSeparator", false, "p");
    // Only seed the content once; afterwards the DOM is the source of truth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const isEmpty = !el.textContent?.trim() && !el.querySelector("li, img");
    setEmpty(isEmpty);
    onChange(el.innerHTML, isEmpty);
  }, [onChange]);

  // Track formatting at the caret and remember the selection so toolbar menus can restore it.
  useEffect(() => {
    const onSelection = () => {
      const sel = document.getSelection();
      const el = editorRef.current;
      if (!sel || !el || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return;
      savedRange.current = sel.getRangeAt(0).cloneRange();
      setActive(Object.fromEntries(TRACKED.map((c) => [c, document.queryCommandState(c)])));
    };
    document.addEventListener("selectionchange", onSelection);
    return () => document.removeEventListener("selectionchange", onSelection);
  }, []);

  const exec = (command: string, arg?: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = document.getSelection();
    if (savedRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    document.execCommand(command, false, arg);
    emit();
  };

  return (
    <div
      className={cn(
        "rounded-xl bg-ink-50 transition focus-within:ring-2 focus-within:ring-brand-200",
        invalid && "ring-2 ring-red-200",
      )}
    >
      {/* mousedown preventDefault keeps focus (and the selection) inside the editor */}
      <div className="sticky top-0 z-10 px-3 pt-3" onMouseDown={(e) => e.preventDefault()}>
        <div className="flex flex-wrap items-center gap-0.5 rounded-full bg-white px-2 py-1 shadow-card ring-1 ring-ink-200/60">
          <ToolButton label="Undo" onClick={() => exec("undo")}>
            <Undo2 />
          </ToolButton>
          <ToolButton label="Redo" onClick={() => exec("redo")}>
            <Redo2 />
          </ToolButton>
          <Divider />
          <Menu
            label="Text size"
            trigger={() => (
              <span className="flex h-7 items-center gap-0.5 rounded-md px-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900">
                <Type className="size-4" />
                <ChevronsUpDown className="size-3" />
              </span>
            )}
          >
            {SIZES.map((s) => (
              <MenuItem key={s.value} onSelect={() => exec("fontSize", s.value)}>
                {s.label}
              </MenuItem>
            ))}
          </Menu>
          <Divider />
          <ToolButton label="Bold" active={active.bold} onClick={() => exec("bold")}>
            <Bold />
          </ToolButton>
          <ToolButton label="Italic" active={active.italic} onClick={() => exec("italic")}>
            <Italic />
          </ToolButton>
          <ToolButton label="Underline" active={active.underline} onClick={() => exec("underline")}>
            <Underline />
          </ToolButton>
          <Divider />
          <Menu
            label="Alignment"
            trigger={() => (
              <span className="flex h-7 items-center gap-0.5 rounded-md px-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900">
                <AlignCenter className="size-4" />
                <ChevronsUpDown className="size-3" />
              </span>
            )}
          >
            {ALIGNMENTS.map(({ label, command, icon: Icon }) => (
              <MenuItem key={command} icon={<Icon className="size-4" />} onSelect={() => exec(command)}>
                {label}
              </MenuItem>
            ))}
          </Menu>
          <Divider />
          <ToolButton label="Numbered list" active={active.insertOrderedList} onClick={() => exec("insertOrderedList")}>
            <ListOrdered />
          </ToolButton>
          <ToolButton label="Bulleted list" active={active.insertUnorderedList} onClick={() => exec("insertUnorderedList")}>
            <List />
          </ToolButton>
          <ToolButton label="Indent" onClick={() => exec("indent")}>
            <IndentIncrease />
          </ToolButton>
          <ToolButton label="Outdent" onClick={() => exec("outdent")}>
            <IndentDecrease />
          </ToolButton>
          <ToolButton label="Quote" onClick={() => exec("formatBlock", "blockquote")}>
            <Quote />
          </ToolButton>
          <ToolButton label="Clear formatting" onClick={() => exec("removeFormat")}>
            <RemoveFormatting />
          </ToolButton>
          <Divider />
          <ToolButton label="Strikethrough" active={active.strikeThrough} onClick={() => exec("strikeThrough")}>
            <Strikethrough />
          </ToolButton>
        </div>
      </div>

      <div className="relative">
        {empty && (
          <p className="pointer-events-none absolute top-4 left-5 text-sm text-ink-400" aria-hidden>
            {placeholder}
          </p>
        )}
        <div
          ref={editorRef}
          role="textbox"
          aria-multiline
          aria-label="Email body"
          aria-invalid={invalid || undefined}
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onPaste={(e) => {
            // Paste as plain text so foreign styles don't leak into the email.
            e.preventDefault();
            document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
          }}
          className="email-body min-h-[320px] px-5 py-4 outline-none"
        />
      </div>
    </div>
  );
}

function ToolButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded-md text-ink-500 transition hover:bg-ink-100 hover:text-ink-900 [&_svg]:size-4",
        active && "bg-brand-100 text-brand-700 hover:bg-brand-100",
      )}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-1 h-4 w-px bg-ink-200" aria-hidden />;
