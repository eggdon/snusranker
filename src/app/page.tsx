import { ProductTable } from "@/components/ProductTable";
import products from "@/data/products.json";

export default function Home() {
  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-white">SnusRanker</h1>
        <p className="text-[var(--muted)] mt-1">
          Snus sorterat efter{" "}
          <span className="text-[var(--accent)] font-semibold">NPK</span>{" "}
          (Nikotin Per Krona) — mest nikotin för pengarna.
        </p>
        <p className="text-[var(--muted)] text-sm mt-1">
          {products.length} produkter från Snusbolaget och Minprilla.
        </p>
      </header>
      <ProductTable products={products} />
    </main>
  );
}
