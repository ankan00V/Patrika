import { FileText, X } from "lucide-react";
import { formatBytes } from "@/lib/format";

interface AttachmentCardProps {
  name: string;
  size: number;
  /** Image thumbnail URL, when the file is an image. */
  previewUrl?: string;
  href?: string;
  onRemove?: () => void;
}

/** Thumbnail card used in compose and on the email page, as in the design. */
export function AttachmentCard({ name, size, previewUrl, href, onRemove }: AttachmentCardProps) {
  const body = (
    <>
      <div className="flex h-[72px] items-center justify-center overflow-hidden bg-ink-100">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URLs / authenticated API images
          <img src={previewUrl} alt="" className="size-full object-cover" />
        ) : (
          <FileText className="size-7 text-ink-400" />
        )}
      </div>
      <div className="px-2.5 py-1.5">
        <p className="truncate text-[11px] font-medium text-ink-900">{name}</p>
        <p className="text-[10px] text-ink-500">{formatBytes(size)}</p>
      </div>
    </>
  );

  return (
    <div className="group relative w-[124px] shrink-0 overflow-hidden rounded-lg border border-ink-200 bg-white transition hover:shadow-card">
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" title={name}>
          {body}
        </a>
      ) : (
        body
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="absolute top-1 right-1 rounded-full bg-white/90 p-0.5 text-ink-500 opacity-0 shadow transition group-hover:opacity-100 hover:text-ink-900 focus:opacity-100"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
