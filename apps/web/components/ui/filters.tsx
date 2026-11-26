'use client';

import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from './button';
import { inputClasses } from './field';

export function FilterBar({ onSubmit, onClear, children }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void; onClear?: () => void; children: ReactNode }) {
  return (
    <form onSubmit={onSubmit} className="grid items-end gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
      {children}
      <div className="flex gap-2">
        <Button type="submit" variant="primary">Apply</Button>
        {onClear ? <Button type="button" variant="ghost" onClick={onClear}>Clear</Button> : null}
      </div>
    </form>
  );
}

export function SearchSelect({ label, options, value, onChange, placeholder }: {
  label: string;
  options: { id: string; label: string }[];
  value?: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? options.filter(option => option.label.toLowerCase().includes(needle)) : options;
  }, [options, query]);
  return (
    <label className="grid gap-1.5 text-sm font-semibold">
      {label}
      <input className={inputClasses} value={query} placeholder={placeholder ?? `Search ${label.toLowerCase()}`} onChange={event => setQuery(event.target.value)} />
      <select required className={inputClasses} value={value ?? ''} onChange={event => onChange(event.target.value)}>
        <option value="">{filtered.length ? `Select ${label.toLowerCase()}` : 'No matches'}</option>
        {filtered.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>
  );
}
