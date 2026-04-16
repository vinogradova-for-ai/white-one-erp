"use client";

import { useState } from "react";

export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = "Добавьте тег…",
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  function addTag(tag: string) {
    const t = tag.trim();
    if (!t || value.includes(t)) return;
    onChange([...value, t]);
    setInput("");
  }

  function removeTag(tag: string) {
    onChange(value.filter((x) => x !== tag));
  }

  const filteredSuggestions = suggestions.filter(
    (s) => s.toLowerCase().includes(input.toLowerCase()) && !value.includes(s),
  ).slice(0, 10);

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-1 rounded-lg border border-slate-300 bg-white p-2">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
          >
            #{tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="text-slate-400 hover:text-red-600"
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              if (input.trim()) addTag(input);
            } else if (e.key === "Backspace" && !input && value.length > 0) {
              removeTag(value[value.length - 1]);
            }
          }}
          placeholder={value.length === 0 ? placeholder : ""}
          className="min-w-[120px] flex-1 outline-none text-sm bg-transparent"
        />
      </div>

      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute top-full left-0 z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {filteredSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                addTag(s);
              }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-100"
            >
              #{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
