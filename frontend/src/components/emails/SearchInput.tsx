"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";

/** Search box that reports its value after the user pauses typing. */
export function SearchInput({ onSearch, placeholder }: { onSearch: (q: string) => void; placeholder: string }) {
  const [value, setValue] = useState("");

  useEffect(() => {
    const t = setTimeout(() => onSearch(value.trim()), 300);
    return () => clearTimeout(t);
  }, [value, onSearch]);

  return (
    <div className="relative w-full max-w-2xl">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-full bg-ink-100 pr-9 pl-9 text-sm placeholder:text-ink-400 transition focus:bg-white focus:ring-2 focus:ring-brand-200 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          onClick={() => setValue("")}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-ink-400 hover:bg-ink-100"
          aria-label="Clear search"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
