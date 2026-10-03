import { BriefcaseBusiness, CheckCircle2, MapPin, Sparkles, Store, Tag } from "lucide-react";
import { Link } from "wouter";
import type { AIResultCard } from "@workspace/api-client-react";

function itemIcon(type: AIResultCard["type"]) {
  if (type === "business") return Store;
  if (type === "product") return Tag;
  return BriefcaseBusiness;
}

function formatPrice(priceCents: number) {
  return (priceCents / 100).toLocaleString("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  });
}

export function AIListingCard({ item, horizontal = false }: { item: AIResultCard; horizontal?: boolean }) {
  const Icon = itemIcon(item.type);
  return (
    <Link
      href={item.href}
      className={`focus-ring tap block rounded-[18px] border border-[#ebe5da] bg-white p-3.5 text-left shadow-[0_4px_15px_rgba(16,72,50,.04)] transition hover:border-[#bfd8c6] hover:shadow-[0_8px_22px_rgba(16,72,50,.08)] ${horizontal ? "w-[260px] shrink-0" : "w-full"}`}
      data-testid={`ai-result-${item.id}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e4f3e7] text-[#087044]">
          <Icon size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block truncate text-xs font-bold text-[#174d37]">{item.title}</strong>
          <span className="mt-1 block truncate text-[11px] text-[#89948c]">{item.category || item.type.replace("_", " ")}</span>
        </span>
        {item.priceCents !== null && <span className="shrink-0 text-right text-[11px] font-extrabold text-[#e56e12]">{formatPrice(item.priceCents)}</span>}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[#78867d]">
        {item.location && <span className="flex max-w-full items-center gap-1 truncate"><MapPin size={11} />{item.location}</span>}
        {item.distanceKm !== null && <span>{item.distanceKm.toFixed(1)} km</span>}
        {item.rating !== null && <span>★ {item.rating.toFixed(1)}{item.reviewCount ? ` (${item.reviewCount})` : ""}</span>}
        {item.verified && <span className="flex items-center gap-1 text-[#087044]"><CheckCircle2 size={11} />Verified</span>}
        {item.featured && <span className="flex items-center gap-1 text-[#bd5c15]"><Sparkles size={11} />Featured</span>}
      </div>
      {(item.reason || item.description) && <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-[#6c7d72]">{item.reason || item.description}</p>}
    </Link>
  );
}

export function AISuggestionChips({ items, onSelect }: { items: string[]; onSelect: (value: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <button
          type="button"
          key={item}
          onClick={() => onSelect(item)}
          className="focus-ring rounded-full border border-[#dce9de] bg-[#f5faf5] px-3 py-2 text-[11px] font-semibold text-[#087044] transition hover:bg-[#e4f3e7]"
        >
          {item}
        </button>
      ))}
    </div>
  );
}

export function AIListingRail({ title, eyebrow, items }: { title: string; eyebrow?: string; items: AIResultCard[] }) {
  if (!items.length) return null;
  return (
    <section className="pb-7" aria-label={title}>
      <div className="mb-3">
        {eyebrow && <p className="mb-1 text-[10px] font-bold uppercase tracking-[.16em] text-[#ee7117]">{eyebrow}</p>}
        <h2 className="font-display text-lg font-extrabold tracking-[-.03em] text-[#164d38]">{title}</h2>
      </div>
      <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-2 md:mx-0 md:px-0">
        {items.map((item) => <AIListingCard key={`${item.type}-${item.id}`} item={item} horizontal />)}
      </div>
    </section>
  );
}