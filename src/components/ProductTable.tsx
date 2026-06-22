"use client";

import { useState, useMemo } from "react";

interface Product {
  name: string;
  brand: string;
  type: "white" | "tobacco";
  nicotine_mg_per_portion: number;
  portions: number;
  price_sek: number;
  format: string;
  flavor: string;
  strength: string;
  store: string;
  url: string;
  npk: number;
  total_nicotine_mg: number;
}

type SortKey = "npk" | "price_sek" | "nicotine_mg_per_portion" | "total_nicotine_mg" | "name";

const PAGE_SIZE = 50;

export function ProductTable({ products }: { products: Product[] }) {
  const [typeFilter, setTypeFilter] = useState<"all" | "white" | "tobacco">("all");
  const [storeFilter, setStoreFilter] = useState<"all" | "snusbolaget" | "minprilla">("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("npk");
  const [sortAsc, setSortAsc] = useState(false);
  const [maxPrice, setMaxPrice] = useState(200);
  const [minNicotine, setMinNicotine] = useState(0);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let items = products.filter((p) => {
      if (typeFilter !== "all" && p.type !== typeFilter) return false;
      if (storeFilter !== "all" && p.store !== storeFilter) return false;
      if (p.price_sek > maxPrice) return false;
      if (p.nicotine_mg_per_portion < minNicotine) return false;
      if (p.npk > 100) return false; // filter outliers
      if (search) {
        const q = search.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          p.flavor.toLowerCase().includes(q)
        );
      }
      return true;
    });

    items.sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === "string" && typeof bv === "string") {
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });

    return items;
  }, [products, typeFilter, storeFilter, search, sortKey, sortAsc, maxPrice, minNicotine]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === "name");
    }
    setPage(1);
  }

  function resetFilters() {
    setTypeFilter("all");
    setStoreFilter("all");
    setSearch("");
    setMaxPrice(200);
    setMinNicotine(0);
    setSortKey("npk");
    setSortAsc(false);
    setPage(1);
  }

  const SortHeader = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => (
    <th
      className={`px-3 py-2 text-left cursor-pointer hover:text-white select-none whitespace-nowrap ${className ?? ""}`}
      onClick={() => handleSort(k)}
    >
      {label}
      {sortKey === k ? (sortAsc ? " ▲" : " ▼") : ""}
    </th>
  );

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-4 items-end">
        <div>
          <label className="block text-xs text-[var(--muted)] mb-1">Typ</label>
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value as typeof typeFilter); setPage(1); }}
            className="bg-[var(--card)] border border-[var(--border)] rounded px-3 py-1.5 text-sm"
          >
            <option value="all">Alla</option>
            <option value="white">Vita nikotinpåsar</option>
            <option value="tobacco">Tobakssnus</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-[var(--muted)] mb-1">Butik</label>
          <select
            value={storeFilter}
            onChange={(e) => { setStoreFilter(e.target.value as typeof storeFilter); setPage(1); }}
            className="bg-[var(--card)] border border-[var(--border)] rounded px-3 py-1.5 text-sm"
          >
            <option value="all">Alla</option>
            <option value="snusbolaget">Snusbolaget</option>
            <option value="minprilla">Minprilla</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-[var(--muted)] mb-1">
            Max pris: {maxPrice} kr
          </label>
          <input
            type="range"
            min={10}
            max={200}
            value={maxPrice}
            onChange={(e) => { setMaxPrice(Number(e.target.value)); setPage(1); }}
            className="w-32"
          />
        </div>

        <div>
          <label className="block text-xs text-[var(--muted)] mb-1">
            Min nikotin: {minNicotine} mg
          </label>
          <input
            type="range"
            min={0}
            max={50}
            value={minNicotine}
            onChange={(e) => { setMinNicotine(Number(e.target.value)); setPage(1); }}
            className="w-32"
          />
        </div>

        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-[var(--muted)] mb-1">Sök</label>
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Sök namn, märke eller smak..."
            className="bg-[var(--card)] border border-[var(--border)] rounded px-3 py-1.5 text-sm w-full"
          />
        </div>

        <button
          onClick={resetFilters}
          className="text-sm text-[var(--muted)] hover:text-white underline pb-0.5"
        >
          Återställ
        </button>
      </div>

      <p className="text-sm text-[var(--muted)] mb-2">
        Visar {filtered.length} produkter
      </p>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--card)] text-[var(--muted)] text-xs uppercase tracking-wider">
            <tr>
              <th className="px-3 py-2 text-left w-10">#</th>
              <SortHeader k="npk" label="NPK" className="text-[var(--accent)]" />
              <SortHeader k="name" label="Namn" />
              <th className="px-3 py-2 text-left">Typ</th>
              <SortHeader k="nicotine_mg_per_portion" label="mg/prilla" />
              <th className="px-3 py-2 text-left">Portioner</th>
              <SortHeader k="total_nicotine_mg" label="Total mg" />
              <SortHeader k="price_sek" label="Pris" />
              <th className="px-3 py-2 text-left">Butik</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((p, i) => {
              const rank = (page - 1) * PAGE_SIZE + i + 1;
              return (
                <tr
                  key={`${p.store}-${p.url}`}
                  className="border-t border-[var(--border)] hover:bg-[var(--card)] transition-colors"
                >
                  <td className="px-3 py-2 text-[var(--muted)]">{rank}</td>
                  <td className="px-3 py-2 font-mono font-bold text-[var(--accent)]">
                    {p.npk.toFixed(2)}
                  </td>
                  <td className="px-3 py-2">
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-[var(--accent)] hover:underline"
                    >
                      {p.name}
                    </a>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        p.type === "white"
                          ? "bg-blue-500/20 text-blue-400"
                          : "bg-amber-600/20 text-amber-400"
                      }`}
                    >
                      {p.type === "white" ? "Vitt" : "Tobak"}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono">{p.nicotine_mg_per_portion}</td>
                  <td className="px-3 py-2 font-mono">{p.portions}</td>
                  <td className="px-3 py-2 font-mono">{p.total_nicotine_mg}</td>
                  <td className="px-3 py-2 font-mono">{p.price_sek} kr</td>
                  <td className="px-3 py-2 text-[var(--muted)] capitalize">{p.store}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-1 rounded bg-[var(--card)] border border-[var(--border)] disabled:opacity-30 hover:bg-[var(--border)] text-sm"
          >
            Föregående
          </button>
          <span className="text-sm text-[var(--muted)]">
            Sida {page} av {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 rounded bg-[var(--card)] border border-[var(--border)] disabled:opacity-30 hover:bg-[var(--border)] text-sm"
          >
            Nästa
          </button>
        </div>
      )}

      <footer className="mt-8 text-xs text-[var(--muted)] text-center">
        <p>
          NPK = (Nikotin mg/prilla &times; Antal portioner) &divide; Pris i kr.
          Högre NPK = mer nikotin per krona.
        </p>
        <p className="mt-1">
          Data hämtad från{" "}
          <a href="https://snusbolaget.se" className="underline hover:text-white" target="_blank" rel="noopener noreferrer">snusbolaget.se</a>
          {" "}och{" "}
          <a href="https://minprilla.se" className="underline hover:text-white" target="_blank" rel="noopener noreferrer">minprilla.se</a>.
        </p>
      </footer>
    </div>
  );
}
