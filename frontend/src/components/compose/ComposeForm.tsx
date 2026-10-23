"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Clock3, Info, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/api";
import { estimateLastSend } from "@/lib/estimate";
import { fileToBase64, randomId } from "@/lib/files";
import { formatDateTime, formatDuration } from "@/lib/format";
import { useCreateCampaign } from "@/lib/queries";
import { AttachmentCard } from "../ui/AttachmentCard";
import { RecipientsField } from "./RecipientsField";
import { RichTextEditor } from "./RichTextEditor";
import { SendLaterPopover } from "./SendLaterPopover";
import { SenderSelect } from "./SenderSelect";

const MAX_FILES = 5;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;
const MAX_HOURLY_LIMIT = 1000;

type Errors = Partial<Record<"recipients" | "subject" | "body" | "delay" | "hourlyLimit", string>>;

interface LocalFile {
  id: string;
  file: File;
  previewUrl?: string;
}

const numberOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

export function ComposeForm() {
  const router = useRouter();
  const createCampaign = useCreateCampaign();

  const [senderId, setSenderId] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState({ html: "", empty: true });
  const [delay, setDelay] = useState("");
  const [hourlyLimit, setHourlyLimit] = useState("");
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [popoverOpen, setPopoverOpen] = useState(false);
  // One key per compose session: double-clicking "Done" can't create two campaigns.
  const [idempotencyKey] = useState(randomId);
  const [openedAt] = useState(() => Date.now());
  const fileInput = useRef<HTMLInputElement>(null);

  const dirty = recipients.length > 0 || subject !== "" || !body.empty || files.length > 0;

  useEffect(() => {
    if (!dirty || createCampaign.isSuccess) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, createCampaign.isSuccess]);

  // Release image previews when leaving the page.
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  useEffect(() => () => filesRef.current.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl)), []);

  const onBodyChange = useCallback((html: string, empty: boolean) => setBody({ html, empty }), []);

  const validate = (): Errors => {
    const next: Errors = {};
    if (recipients.length === 0) next.recipients = "Add at least one recipient or upload a list";
    if (!subject.trim()) next.subject = "Subject is required";
    if (body.empty) next.body = "Write the email body";
    const d = numberOrNull(delay) ?? 0;
    if (!Number.isInteger(d) || d < 0 || d > 3600) next.delay = "0–3600 seconds";
    const h = numberOrNull(hourlyLimit);
    if (h === null) next.hourlyLimit = "Required";
    else if (!Number.isInteger(h) || h < 1 || h > MAX_HOURLY_LIMIT) next.hourlyLimit = `1–${MAX_HOURLY_LIMIT}`;
    return next;
  };

  const openSendLater = () => {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast.error(Object.values(found)[0]);
      return;
    }
    setPopoverOpen((v) => !v);
  };

  const schedule = async (startAt: Date) => {
    let attachments;
    try {
      attachments = await Promise.all(
        files.map(async ({ file }) => ({
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          contentBase64: await fileToBase64(file),
        })),
      );
    } catch (err) {
      toast.error(errorMessage(err));
      return;
    }

    createCampaign.mutate(
      {
        idempotencyKey,
        subject: subject.trim(),
        body: body.html,
        recipients,
        startAt: startAt.toISOString(),
        delayBetweenSeconds: numberOrNull(delay) ?? 0,
        hourlyLimit: Number(hourlyLimit),
        senderId: senderId || undefined,
        attachments,
      },
      {
        onSuccess: (res) => {
          setPopoverOpen(false);
          const s = res.summary;
          toast.success(
            s ? `Scheduled ${s.scheduled.toLocaleString()} emails` : "This campaign was already scheduled",
            {
              description: s
                ? `First send ${formatDateTime(s.firstSendAt)}, last ${formatDateTime(s.lastSendAt)}` +
                  (s.deferredByHourlyLimit ? `. ${s.deferredByHourlyLimit} pushed to later hours by the hourly limit.` : ".")
                : undefined,
            },
          );
          router.push("/dashboard/scheduled");
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = [...list];
    if (files.length + incoming.length > MAX_FILES) {
      toast.error(`You can attach up to ${MAX_FILES} files`);
      return;
    }
    const total = [...files.map((f) => f.file), ...incoming].reduce((sum, f) => sum + f.size, 0);
    if (total > MAX_TOTAL_BYTES) {
      toast.error("Attachments can be at most 5 MB in total");
      return;
    }
    setFiles((prev) => [
      ...prev,
      ...incoming.map((file) => ({
        id: randomId(),
        file,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      })),
    ]);
  };

  const estimate = useMemo(() => {
    const limit = Number(hourlyLimit);
    if (recipients.length < 2 || !Number.isInteger(limit) || limit < 1) return null;
    const delayMs = (numberOrNull(delay) ?? 0) * 1000;
    return estimateLastSend(recipients.length, openedAt, delayMs, limit) - openedAt;
  }, [recipients.length, delay, hourlyLimit, openedAt]);

  const goBack = () => {
    if (dirty && !confirm("Discard this email?")) return;
    router.push("/dashboard/scheduled");
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 bg-white/90 px-4 backdrop-blur sm:px-6">
        <button onClick={goBack} className="rounded-lg p-1.5 text-ink-900 hover:bg-ink-100" aria-label="Back">
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-lg font-medium text-ink-900 sm:text-xl">Compose New Email</h1>

        <div className="relative ml-auto flex items-center gap-1">
          <button
            onClick={() => fileInput.current?.click()}
            className="relative rounded-lg p-2 text-brand-600 hover:bg-brand-50"
            aria-label="Attach files"
            title="Attach files"
          >
            <Paperclip className="size-[18px]" />
            {files.length > 0 && (
              <span className="absolute right-1 bottom-0.5 text-[10px] leading-none font-semibold">{files.length}</span>
            )}
          </button>
          <button
            data-send-later-trigger
            onClick={openSendLater}
            className="rounded-lg p-2 text-brand-600 hover:bg-brand-50"
            aria-label="Schedule"
            title="Schedule"
          >
            <Clock3 className="size-[18px]" />
          </button>
          <button
            data-send-later-trigger
            onClick={openSendLater}
            className="ml-1 h-8 rounded-full border border-brand-500 px-4 text-sm font-medium text-brand-600 transition hover:bg-brand-50"
          >
            Send Later
          </button>
          <SendLaterPopover
            open={popoverOpen}
            onClose={() => setPopoverOpen(false)}
            onConfirm={schedule}
            submitting={createCampaign.isPending}
          />
          <input
            ref={fileInput}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </header>

      <div className="mx-auto max-w-[880px] px-4 pt-4 pb-16 sm:px-6">
        <div className="space-y-1">
          <Row label="From">
            <SenderSelect value={senderId} onChange={setSenderId} />
          </Row>

          <Row label="To" error={errors.recipients}>
            <RecipientsField
              value={recipients}
              onChange={(v) => {
                setRecipients(v);
                if (v.length) setErrors((e) => ({ ...e, recipients: undefined }));
              }}
              invalid={!!errors.recipients}
            />
          </Row>

          <Row label="Subject" error={errors.subject}>
            <input
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setErrors((x) => ({ ...x, subject: undefined }));
              }}
              placeholder="Subject"
              maxLength={300}
              aria-label="Subject"
              className={cn(
                "h-10 w-full border-b bg-transparent text-sm placeholder:text-ink-400 focus:border-brand-500 focus:outline-none",
                errors.subject ? "border-red-300" : "border-ink-200",
              )}
            />
          </Row>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-ink-900">
          <NumberBox
            label="Delay between 2 emails"
            suffix="sec"
            value={delay}
            onChange={(v) => {
              setDelay(v);
              setErrors((x) => ({ ...x, delay: undefined }));
            }}
            error={errors.delay}
            max={3600}
          />
          <NumberBox
            label="Hourly Limit"
            value={hourlyLimit}
            onChange={(v) => {
              setHourlyLimit(v);
              setErrors((x) => ({ ...x, hourlyLimit: undefined }));
            }}
            error={errors.hourlyLimit}
            max={MAX_HOURLY_LIMIT}
          />
          {estimate !== null && (
            <p className="flex items-center gap-1.5 text-xs text-ink-500">
              <Info className="size-3.5" />
              {recipients.length.toLocaleString()} emails go out over about {formatDuration(estimate)}
            </p>
          )}
        </div>

        <div className="mt-5">
          <RichTextEditor onChange={onBodyChange} placeholder="Type Your Reply..." invalid={!!errors.body} />
          {errors.body && <p className="mt-1.5 text-xs text-red-600">{errors.body}</p>}
        </div>

        {files.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3">
            {files.map((f) => (
              <AttachmentCard
                key={f.id}
                name={f.file.name}
                size={f.file.size}
                previewUrl={f.previewUrl}
                onRemove={() => {
                  if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
                  setFiles((prev) => prev.filter((x) => x.id !== f.id));
                }}
              />
            ))}
          </div>
        )}

        <p className="mt-6 text-xs text-ink-400">
          Sending is spread across your sender mailboxes and never exceeds their hourly limits. Need the live queue?{" "}
          <Link href="/admin/queues" target="_blank" className="underline underline-offset-2 hover:text-ink-700">
            Open the queue dashboard
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function Row({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <span className="w-14 shrink-0 pt-2.5 text-sm text-ink-900">{label}</span>
      <div className="min-w-0 flex-1">
        {children}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}

function NumberBox({
  label,
  value,
  onChange,
  error,
  max,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  max: number;
  suffix?: string;
}) {
  return (
    <label className="flex items-center gap-2.5">
      <span>{label}</span>
      <span className="relative">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="00"
          aria-invalid={!!error || undefined}
          className={cn(
            "h-9 w-16 rounded-md border bg-white px-2.5 text-sm tabular-nums placeholder:text-ink-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none",
            error ? "border-red-300" : "border-ink-200",
          )}
        />
        {error && <span className="absolute top-full left-0 mt-0.5 text-[11px] whitespace-nowrap text-red-600">{error}</span>}
      </span>
      {suffix && <span className="-ml-1 text-xs text-ink-400">{suffix}</span>}
    </label>
  );
}
