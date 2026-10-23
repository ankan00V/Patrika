"use client";

import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { CheckCircle2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { isEmail, parseLeads } from "@/lib/leads";

const VISIBLE_CHIPS = 3;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

interface Props {
  value: string[];
  onChange: (emails: string[]) => void;
  invalid?: boolean;
}

/** "To" row: typed/pasted addresses become chips, and "Upload List" reads a CSV/TXT of leads. */
export function RecipientsField({ value, onChange, invalid }: Props) {
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [source, setSource] = useState<{ file: string; found: number; duplicates: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const add = (emails: string[]) => {
    const merged = [...new Set([...value, ...emails.map((e) => e.toLowerCase())])];
    onChange(merged);
    return merged.length - value.length;
  };

  const commitDraft = () => {
    const candidate = draft.trim().replace(/[,;]$/, "");
    if (!candidate) return;
    if (isEmail(candidate)) {
      add([candidate]);
      setDraft("");
    } else {
      toast.error(`“${candidate}” isn't a valid email address`);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (["Enter", ",", ";", " ", "Tab"].includes(e.key) && draft.trim()) {
      e.preventDefault();
      commitDraft();
    } else if (e.key === "Backspace" && !draft && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const { emails } = parseLeads(e.clipboardData.getData("text"));
    if (emails.length > 1) {
      e.preventDefault();
      add(emails);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      toast.error("That file is larger than 5 MB");
      return;
    }
    const { emails, duplicates } = parseLeads(await file.text());
    if (emails.length === 0) {
      toast.error(`No email addresses found in ${file.name}`);
      return;
    }
    add(emails);
    setSource({ file: file.name, found: emails.length, duplicates });
    toast.success(`${emails.length.toLocaleString()} email addresses detected in ${file.name}`);
  };

  const visible = expanded ? value.slice(0, 500) : value.slice(0, VISIBLE_CHIPS);
  const hidden = value.length - visible.length;

  return (
    <div>
      <div className={cn("flex items-start gap-3 border-b py-2", invalid ? "border-red-300" : "border-ink-200")}>
        <div className="flex min-h-8 flex-1 flex-wrap items-center gap-1.5">
          {visible.map((email) => (
            <span
              key={email}
              className="group inline-flex items-center gap-1 rounded-full border border-brand-400 bg-brand-50 py-0.5 pr-1 pl-2.5 text-xs text-ink-900"
            >
              {email}
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v !== email))}
                aria-label={`Remove ${email}`}
                className="rounded-full p-0.5 text-ink-400 hover:bg-brand-100 hover:text-ink-900"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="rounded-full border border-brand-400 bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-ink-900 hover:bg-brand-100"
            >
              +{hidden.toLocaleString()}
            </button>
          )}
          {expanded && value.length > VISIBLE_CHIPS && (
            <button type="button" onClick={() => setExpanded(false)} className="text-xs text-ink-500 hover:text-ink-900">
              Show less
            </button>
          )}
          <input
            type="email"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onBlur={commitDraft}
            placeholder={value.length === 0 ? "recipient@example.com" : ""}
            aria-label="Recipients"
            className="h-7 min-w-36 flex-1 bg-transparent text-sm placeholder:text-ink-400 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="mt-1 flex shrink-0 items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          <Upload className="size-4" />
          Upload List
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {value.length > 0 && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-500">
          <CheckCircle2 className="size-3.5 text-brand-500" />
          <span>
            <strong className="font-semibold text-ink-900">{value.length.toLocaleString()}</strong>{" "}
            {value.length === 1 ? "email address" : "email addresses"}
            {source && ` · ${source.found.toLocaleString()} detected in ${source.file}`}
            {source && source.duplicates > 0 && `, ${source.duplicates} duplicates skipped`}
          </span>
          <button
            type="button"
            onClick={() => {
              onChange([]);
              setSource(null);
              setExpanded(false);
            }}
            className="ml-1 text-ink-400 underline-offset-2 hover:text-ink-900 hover:underline"
          >
            Clear
          </button>
        </p>
      )}
    </div>
  );
}
