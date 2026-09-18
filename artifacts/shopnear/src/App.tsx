import { useMemo, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Bell, Bookmark, BriefcaseBusiness, ChevronRight, CircleUserRound, Clock3, Compass, Heart, Home as HomeIcon, MapPin, Menu, MessageCircle, Search, Send, Settings2, ShieldCheck, ShoppingBag, Sparkles, Star, Store, Tag, UserRound, X } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';

const queryClient = new QueryClient();
const logoPath = '/assets/shopnear-logo.png';

type Tab = 'home' | 'search' | 'favorites' | 'messages' | 'profile';

const categories = [
  { label: 'Groceries', icon: ShoppingBag, count: '24 nearby', tone: 'mint' },
  { label: 'Fashion', icon: Tag, count: '18 nearby', tone: 'peach' },
  { label: 'Home & Living', icon: Store, count: '31 nearby', tone: 'sky' },
  { label: 'Services', icon: BriefcaseBusiness, count: '42 nearby', tone: 'lavender' },
  { label: 'Beauty', icon: Sparkles, count: '16 nearby', tone: 'rose' },
];

const places = [
  { id: 'place-1', name: 'Green Basket Market', type: 'Groceries', distance: '0.4 mi', rating: '4.9', reviews: '128', image: 'market', verified: true, note: 'Fresh produce · Open until 9 pm' },
  { id: 'place-2', name: 'Makers & Co.', type: 'Home goods', distance: '0.8 mi', rating: '4.8', reviews: '74', image: 'makers', verified: true, note: 'Small-batch finds · Open until 7 pm' },
  { id: 'place-3', name: 'Juniper Studio', type: 'Beauty & wellness', distance: '1.2 mi', rating: '4.7', reviews: '56', image: 'studio', verified: false, note: 'Thoughtful care · Open until 8 pm' },
];

const products = [
  { id: 'product-1', name: 'Hand-poured Cedar Candle', shop: 'Makers & Co.', price: '$28', visual: 'candle', saved: false },
  { id: 'product-2', name: 'Stoneware Breakfast Mug', shop: 'Clay Street Studio', price: '$22', visual: 'mug', saved: true },
  { id: 'product-3', name: 'Wildflower Honey, 12 oz', shop: 'Green Basket Market', price: '$14', visual: 'honey', saved: false },
];

const serviceRows = [
  { id: 'service-1', name: 'Moss & Mane Barbers', detail: 'Haircut · 0.6 mi', price: 'from $32', icon: 'scissors' },
  { id: 'service-2', name: 'NeighborFix Repairs', detail: 'Appliance repair · 1.1 mi', price: 'Free quote', icon: 'wrench' },
  { id: 'service-3', name: 'Willow Pet Care', detail: 'Dog walking · 0.9 mi', price: 'from $18', icon: 'pet' },
];

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2 focus-ring" data-testid="link-brand-home">
      <img src={logoPath} alt="ShopNear" className={compact ? 'h-11 w-11 rounded-xl object-contain' : 'h-14 w-14 rounded-2xl object-contain'} data-testid="img-shopnear-logo" />
      {!compact && <span className="font-display text-[19px] font-extrabold tracking-[-.04em] text-[#075d3e]">Shop<span className="text-[#f47716]">Near</span></span>}
    </Link>
  );
}

function IconButton({ label, children, onClick, badge }: { label: string; children: ReactNode; onClick: () => void; badge?: string }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="focus-ring tap relative flex h-11 w-11 items-center justify-center rounded-2xl border border-[#e9e3d8] bg-white text-[#14583d] shadow-[0_4px_14px_rgba(16,72,50,.06)]" data-testid={`button-${label.toLowerCase().replaceAll(' ', '-')}`}>
      {children}
      {badge && <span className="absolute right-[-2px] top-[-2px] flex h-4 min-w-4 items-center justify-center rounded-full bg-[#f47716] px-1 text-[9px] font-bold text-white">{badge}</span>}
    </button>
  );
}

function BottomNav({ active }: { active: Tab }) {
  const items: { id: Tab; label: string; icon: typeof HomeIcon; href: string }[] = [
    { id: 'home', label: 'Home', icon: HomeIcon, href: '/' },
    { id: 'search', label: 'Search', icon: Search, href: '/search' },
    { id: 'favorites', label: 'Favorites', icon: Heart, href: '/favorites' },
    { id: 'messages', label: 'Messages', icon: MessageCircle, href: '/messages' },
    { id: 'profile', label: 'Profile', icon: UserRound, href: '/profile' },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#e8e3d8] bg-[#fffdf9]/95 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl md:bottom-5 md:left-1/2 md:right-auto md:w-[510px] md:-translate-x-1/2 md:rounded-[27px] md:border md:shadow-[0_16px_42px_rgba(13,72,49,.14)]" aria-label="Main navigation" data-testid="nav-bottom">
      <div className="mx-auto flex max-w-lg items-center justify-between">
        {items.map(({ id, label, icon: Icon, href }) => {
          const selected = active === id;
          return (
            <Link key={id} href={href} className={`focus-ring flex min-w-[58px] flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[11px] font-semibold transition-all ${selected ? 'bg-[#e8f5ed] text-[#087044]' : 'text-[#89918a] hover:text-[#1c674b]'}`} data-testid={`link-nav-${id}`}>
              <Icon size={21} strokeWidth={selected ? 2.5 : 1.8} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function Shell({ active, children, toast }: { active: Tab; children: ReactNode; toast?: string }) {
  const [, setLocation] = useLocation();
  const openNotifications = () => setLocation('/messages');
  return (
    <div className="min-h-[100dvh] bg-[#f5f1e9]">
      <div className="app-shell relative min-h-[100dvh] overflow-hidden bg-[#fffdf9] pb-24 md:pb-28 md:shadow-[0_0_70px_rgba(16,72,50,.05)]">
        <header className="flex items-center justify-between px-5 pb-2 pt-5 md:px-10 md:pt-7">
          <Logo />
          <div className="flex items-center gap-2">
            <IconButton label="Open notifications" onClick={openNotifications} badge="2"><Bell size={20} strokeWidth={1.8} /></IconButton>
            <button type="button" onClick={() => setLocation('/profile')} className="focus-ring tap ml-1 flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-[#d9efe1] text-[#087044]" aria-label="Open profile" data-testid="button-open-profile">
              <CircleUserRound size={24} strokeWidth={1.6} />
            </button>
          </div>
        </header>
        <main>{children}</main>
        <BottomNav active={active} />
        {toast && <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[#164d38] px-4 py-2.5 text-xs font-semibold text-white shadow-lg md:bottom-32" role="status" data-testid="status-toast">{toast}</div>}
      </div>
    </div>
  );
}

function SectionHeading({ eyebrow, title, action, onAction }: { eyebrow?: string; title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="mb-1 text-[10px] font-bold uppercase tracking-[.16em] text-[#ee7117]" data-testid={`text-eyebrow-${title.toLowerCase().replaceAll(' ', '-')}`}>{eyebrow}</p>}
        <h2 className="font-display text-[21px] font-extrabold tracking-[-.04em] text-[#164d38] md:text-[24px]">{title}</h2>
      </div>
      {action && <button type="button" className="focus-ring flex items-center gap-0.5 pb-0.5 text-xs font-bold text-[#087044]" onClick={onAction} data-testid={`button-see-${title.toLowerCase().replaceAll(' ', '-')}`}>{action}<ChevronRight size={14} /></button>}
    </div>
  );
}

function CategoryStrip({ onSelect }: { onSelect: (label: string) => void }) {
  return (
    <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1 md:mx-0 md:px-0" data-testid="list-categories">
      {categories.map(({ label, icon: Icon, count, tone }) => (
        <button type="button" key={label} onClick={() => onSelect(label)} className="focus-ring tap min-w-[105px] rounded-[21px] border border-[#eee8dc] bg-white p-3 text-left shadow-[0_5px_18px_rgba(16,72,50,.05)]" data-testid={`button-category-${label.toLowerCase().replaceAll(' ', '-')}`}>
          <span className={`mb-2 flex h-10 w-10 items-center justify-center rounded-[14px] ${tone === 'mint' ? 'bg-[#dff2e6] text-[#087044]' : tone === 'peach' ? 'bg-[#ffeadc] text-[#db6412]' : tone === 'sky' ? 'bg-[#e0eff2] text-[#287382]' : tone === 'lavender' ? 'bg-[#ebe7f7] text-[#685592]' : 'bg-[#fae1e8] text-[#a64f67]'}`}><Icon size={19} strokeWidth={1.8} /></span>
          <span className="block whitespace-nowrap text-xs font-bold text-[#20573f]">{label}</span>
          <span className="mt-0.5 block whitespace-nowrap text-[10px] text-[#89918a]">{count}</span>
        </button>
      ))}
    </div>
  );
}

function AiSearch({ onSearch }: { onSearch: (value: string) => void }) {
  const [value, setValue] = useState('');
  const submit = () => onSearch(value.trim() || 'popular local finds');
  return (
    <div className="relative overflow-hidden rounded-[26px] bg-[#087044] p-5 text-white shadow-[0_12px_30px_rgba(8,112,68,.22)] md:p-6">
      <div className="absolute -right-12 -top-16 h-44 w-44 rounded-full border-[22px] border-[#f47716]/25" />
      <div className="absolute -bottom-20 right-16 h-40 w-40 rounded-full border-[18px] border-[#b9e7c8]/15" />
      <div className="relative">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#f47716]"><Sparkles size={16} fill="currentColor" /></span>
          <p className="text-xs font-bold uppercase tracking-[.15em] text-[#d4f2dd]">ShopNear AI</p>
        </div>
        <h2 className="max-w-[310px] font-display text-[23px] font-extrabold leading-[1.08] tracking-[-.045em] md:text-[27px]">Tell us what you’re looking for nearby.</h2>
        <div className="mt-5 flex items-center gap-2 rounded-2xl bg-white p-1.5 pl-4 shadow-lg">
          <Search size={18} className="shrink-0 text-[#5d8e75]" />
          <input value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && submit()} placeholder="Try “a gift under $40”" className="min-w-0 flex-1 bg-transparent py-2 text-sm text-[#174b37] outline-none placeholder:text-[#99aca0]" data-testid="input-ai-search" />
          <button type="button" onClick={submit} className="focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f47716] text-white transition hover:bg-[#df650c]" aria-label="Search with ShopNear AI" data-testid="button-ai-search"><Send size={17} /></button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {['Open now', 'Under $30', 'Best rated'].map((tag) => <button type="button" key={tag} onClick={() => { setValue(tag); onSearch(tag); }} className="rounded-full border border-white/20 px-3 py-1.5 text-[11px] font-semibold text-[#d9f4e1] transition hover:bg-white/10" data-testid={`button-ai-suggestion-${tag.toLowerCase().replaceAll(' ', '-')}`}>{tag}</button>)}
        </div>
      </div>
    </div>
  );
}

function PlaceCard({ place, onSave, saved }: { place: typeof places[number]; onSave: () => void; saved: boolean }) {
  return (
    <article className="tap min-w-[265px] overflow-hidden rounded-[23px] border border-[#ece7dd] bg-white shadow-[0_6px_20px_rgba(16,72,50,.06)] md:min-w-0" data-testid={`card-place-${place.id}`}>
      <div className={`relative h-32 overflow-hidden ${place.image === 'market' ? 'bg-[#dcefe2]' : place.image === 'makers' ? 'bg-[#f5dfc5]' : 'bg-[#e2e2ef]'}`}>
        <div className={`absolute inset-0 opacity-50 ${place.image === 'market' ? 'bg-[radial-gradient(circle_at_25%_35%,#6ca66a_0_9%,transparent_10%),radial-gradient(circle_at_68%_70%,#ef9f54_0_12%,transparent_13%),linear-gradient(135deg,#d8efd8,#a8d4ae)]' : place.image === 'makers' ? 'bg-[radial-gradient(circle_at_70%_30%,#d77d48_0_13%,transparent_14%),radial-gradient(circle_at_30%_70%,#be8a52_0_17%,transparent_18%),linear-gradient(145deg,#f6dcb9,#d4a47a)]' : 'bg-[radial-gradient(circle_at_30%_30%,#8878ad_0_13%,transparent_14%),radial-gradient(circle_at_68%_72%,#d09cac_0_18%,transparent_19%),linear-gradient(145deg,#e5e2f0,#bdb9dc)]'}`} />
        <div className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold text-[#216046]">{place.distance}</div>
        <button type="button" onClick={onSave} aria-label={`Save ${place.name}`} className={`focus-ring absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full ${saved ? 'bg-[#f47716] text-white' : 'bg-white/90 text-[#216046]'}`} data-testid={`button-save-${place.id}`}><Heart size={15} fill={saved ? 'currentColor' : 'none'} /></button>
      </div>
      <div className="p-3.5">
        <div className="flex items-center gap-1.5">
          <h3 className="truncate text-sm font-bold text-[#174d37]">{place.name}</h3>
          {place.verified && <ShieldCheck size={14} className="shrink-0 text-[#087044]" fill="#dff2e6" />}
        </div>
        <p className="mt-1 truncate text-[11px] text-[#89918a]">{place.note}</p>
        <div className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-[#775d27]"><Star size={13} fill="#f3a820" className="text-[#f3a820]" /> {place.rating} <span className="font-normal text-[#a1a49f]">({place.reviews})</span><span className="ml-auto text-[#087044]">{place.type}</span></div>
      </div>
    </article>
  );
}

function ProductCard({ item, onSave }: { item: typeof products[number]; onSave: () => void }) {
  return (
    <article className="tap min-w-[166px] rounded-[21px] border border-[#ece7dd] bg-white p-2.5 shadow-[0_6px_20px_rgba(16,72,50,.05)] md:min-w-0" data-testid={`card-product-${item.id}`}>
      <div className={`relative flex h-32 items-center justify-center overflow-hidden rounded-[16px] ${item.visual === 'candle' ? 'bg-[#eedacb]' : item.visual === 'mug' ? 'bg-[#dbe8e4]' : 'bg-[#f5e6b8]'}`}>
        <div className={`h-20 w-16 rounded-[12px_12px_17px_17px] shadow-[inset_-8px_-8px_12px_rgba(0,0,0,.10),4px_7px_10px_rgba(52,43,23,.12)] ${item.visual === 'candle' ? 'bg-[#bb714e]' : item.visual === 'mug' ? 'h-14 w-20 rounded-[10px_19px_19px_10px] bg-[#72998e]' : 'h-20 w-14 rounded-[8px_8px_15px_15px] bg-[#d49c37]'}`} />
        <button type="button" onClick={onSave} className="focus-ring absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/85 text-[#1f674b]" aria-label={`Save ${item.name}`} data-testid={`button-save-${item.id}`}><Bookmark size={15} fill={item.saved ? 'currentColor' : 'none'} /></button>
      </div>
      <div className="px-1 pb-1 pt-2">
        <h3 className="truncate text-xs font-bold text-[#174d37]">{item.name}</h3>
        <p className="mt-1 truncate text-[10px] text-[#89918a]">{item.shop}</p>
        <p className="mt-2 text-sm font-extrabold text-[#e56e12]">{item.price}</p>
      </div>
    </article>
  );
}

function HomePage() {
  const [, setLocation] = useLocation();
  const [toast, setToast] = useState('');
  const [saved, setSaved] = useState<string[]>(['product-2']);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2200); };
  const toggleSave = (id: string, name: string) => { setSaved((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]); notify(saved.includes(id) ? `${name} removed from favorites` : `${name} saved to favorites`); };
  return (
    <Shell active="home" toast={toast}>
      <div className="px-5 md:px-10">
        <section className="animate-rise flex items-end justify-between py-4 md:py-7">
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#6d8979]"><MapPin size={14} className="text-[#f47716]" fill="#f47716" />Brooklyn, NY <button type="button" onClick={() => notify('Location picker coming next')} className="ml-1 text-[#087044] underline underline-offset-2" data-testid="button-change-location">Change</button></div>
            <h1 className="font-display text-[30px] font-extrabold leading-[1.05] tracking-[-.05em] text-[#164d38] md:text-[39px]">Good morning,<br /><span className="text-[#f47716]">Maya.</span></h1>
            <p className="mt-2 text-sm text-[#77867c]">Here’s what’s happening around you.</p>
          </div>
          <div className="hidden h-20 w-20 rounded-[24px] bg-[#e5f3e8] p-3 md:flex md:items-center md:justify-center"><Compass size={42} strokeWidth={1.25} className="text-[#087044]" /></div>
        </section>
        <div className="animate-rise delay-1"><AiSearch onSearch={(value) => { setLocation('/search'); notify(`Searching for ${value}`); }} /></div>
        <section className="animate-rise delay-2 py-7">
          <SectionHeading eyebrow="Browse nearby" title="What are you in the mood for?" action="See all" onAction={() => setLocation('/search')} />
          <CategoryStrip onSelect={(label) => { setLocation('/search'); notify(`Showing ${label.toLowerCase()} nearby`); }} />
        </section>
        <section className="animate-rise delay-2 pb-7">
          <SectionHeading eyebrow="Trusted by neighbors" title="Places worth the walk" action="View map" onAction={() => notify('Map view is being prepared')} />
          <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
            {places.map((place) => <PlaceCard key={place.id} place={place} saved={saved.includes(place.id)} onSave={() => toggleSave(place.id, place.name)} />)}
          </div>
        </section>
        <section className="pb-8">
          <SectionHeading eyebrow="Local finds" title="Small things, good stories" action="See all" onAction={() => setLocation('/search')} />
          <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
            {products.map((item) => <ProductCard key={item.id} item={{ ...item, saved: saved.includes(item.id) }} onSave={() => toggleSave(item.id, item.name)} />)}
          </div>
        </section>
        <section className="pb-8">
          <SectionHeading eyebrow="Help around the corner" title="Services nearby" action="Browse all" onAction={() => setLocation('/search')} />
          <div className="grid gap-2.5 md:grid-cols-3">
            {serviceRows.map((service) => <button type="button" key={service.id} onClick={() => notify(`Opening ${service.name}`)} className="focus-ring tap flex items-center gap-3 rounded-[18px] border border-[#eee8dd] bg-white p-3.5 text-left shadow-[0_4px_13px_rgba(16,72,50,.04)]" data-testid={`button-service-${service.id}`}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#fff0df] text-[#e8781a]"><BriefcaseBusiness size={18} /></span>
              <span className="min-w-0 flex-1"><strong className="block truncate text-xs font-bold text-[#174d37]">{service.name}</strong><span className="mt-1 block text-[10px] text-[#8a968d]">{service.detail}</span></span>
              <span className="text-right text-[10px] font-bold text-[#087044]">{service.price}<ChevronRight size={14} className="ml-auto mt-1" /></span>
            </button>)}
          </div>
        </section>
      </div>
    </Shell>
  );
}

function SearchPage() {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [toast, setToast] = useState('');
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2000); };
  const results = useMemo(() => {
    const normalized = query.toLowerCase();
    return places.filter((place) => !normalized || `${place.name} ${place.type} ${place.note}`.toLowerCase().includes(normalized));
  }, [query]);
  const filters = ['All', 'Open now', 'Top rated', 'Products', 'Services'];
  return (
    <Shell active="search" toast={toast}>
      <div className="px-5 py-5 md:px-10 md:py-8">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[.16em] text-[#ee7117]">Explore your neighborhood</p>
        <h1 className="font-display text-[30px] font-extrabold tracking-[-.05em] text-[#164d38]">Find your next local favorite.</h1>
        <div className="mt-5 flex items-center gap-3 rounded-[19px] border border-[#e8e1d6] bg-white px-4 py-3 shadow-[0_6px_20px_rgba(16,72,50,.06)]">
          <Search size={19} className="text-[#087044]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search shops, products, services..." autoFocus className="min-w-0 flex-1 bg-transparent text-sm text-[#174d37] outline-none placeholder:text-[#a4aaa3]" data-testid="input-search" />
          {query && <button type="button" onClick={() => setQuery('')} className="focus-ring text-[#8a968d]" aria-label="Clear search" data-testid="button-clear-search"><X size={17} /></button>}
        </div>
        <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto">
          {filters.map((filter) => <button type="button" key={filter} onClick={() => setActiveFilter(filter)} className={`focus-ring whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition ${activeFilter === filter ? 'bg-[#087044] text-white' : 'border border-[#ebe4d9] bg-white text-[#658071]'}`} data-testid={`button-filter-${filter.toLowerCase().replaceAll(' ', '-')}`}>{filter}</button>)}
        </div>
        <section className="mt-8">
          <SectionHeading eyebrow={query ? `${results.length} results nearby` : 'Curated for you'} title={query ? `Results for “${query}”` : 'Popular near you'} />
          {results.length ? <div className="grid gap-3 md:grid-cols-2">{results.map((place) => <PlaceCard key={place.id} place={place} saved={false} onSave={() => notify(`${place.name} saved to favorites`)} />)}</div> : <EmptyState icon={Search} title="No nearby matches yet" detail="Try a broader search or browse one of the categories below." action="Browse categories" onAction={() => setQuery('')} />}
        </section>
        <section className="mt-9">
          <SectionHeading title="Browse by category" />
          <CategoryStrip onSelect={(label) => { setQuery(label); notify(`Searching ${label}`); }} />
        </section>
      </div>
    </Shell>
  );
}

function EmptyState({ icon: Icon, title, detail, action, onAction }: { icon: typeof Heart; title: string; detail: string; action: string; onAction: () => void }) {
  return (
    <div className="rounded-[25px] border border-dashed border-[#d6ded3] bg-[#f8fbf6] px-6 py-12 text-center" data-testid="empty-state">
      <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[19px] bg-[#e2f2e6] text-[#087044]"><Icon size={25} strokeWidth={1.7} /></span>
      <h3 className="font-display text-lg font-extrabold text-[#164d38]">{title}</h3>
      <p className="mx-auto mt-2 max-w-[280px] text-sm leading-relaxed text-[#76877c]">{detail}</p>
      <button type="button" onClick={onAction} className="focus-ring tap mt-5 rounded-full bg-[#f47716] px-5 py-2.5 text-xs font-bold text-white" data-testid="button-empty-action">{action}</button>
    </div>
  );
}

function FavoritesPage() {
  const [saved, setSaved] = useState(true);
  const [toast, setToast] = useState('');
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2200); };
  return (
    <Shell active="favorites" toast={toast}>
      <div className="px-5 py-6 md:px-10 md:py-9">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[.16em] text-[#ee7117]">Your shortlist</p>
        <div className="flex items-end justify-between"><h1 className="font-display text-[30px] font-extrabold tracking-[-.05em] text-[#164d38]">Favorites</h1><span className="rounded-full bg-[#e4f3e7] px-3 py-1.5 text-[11px] font-bold text-[#087044]">3 saved</span></div>
        <p className="mt-2 text-sm text-[#7a897f]">Keep the local places and finds you want to come back to.</p>
        {saved ? <div className="mt-7 grid gap-3 md:grid-cols-3">{places.map((place) => <PlaceCard key={place.id} place={place} saved onSave={() => { setSaved(false); notify(`${place.name} removed from favorites`); }} />)}</div> : <div className="mt-7"><EmptyState icon={Heart} title="Your favorites are waiting" detail="Tap the heart on a place or product to keep it close." action="Discover nearby" onAction={() => notify('Browse from Search')} /></div>}
        <div className="mt-8 rounded-[23px] bg-[#fff1df] p-5">
          <div className="flex gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#f47716] text-white"><MapPin size={19} /></span><div><h3 className="text-sm font-bold text-[#78441d]">A little local tip</h3><p className="mt-1 text-xs leading-relaxed text-[#9c6945]">Saved places are sorted by what’s closest to you, so your shortlist stays useful.</p></div></div>
        </div>
      </div>
    </Shell>
  );
}

function MessagesPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const threads = [{ id: 'green-basket', name: 'Green Basket Market', message: 'Your order is ready for pickup.', time: '9:42 AM', unread: true, tint: 'bg-[#dcefe2]' }, { id: 'makers-co', name: 'Makers & Co.', message: 'The cedar candles are back in stock.', time: 'Yesterday', unread: false, tint: 'bg-[#f5dfc5]' }];
  return (
    <Shell active="messages">
      <div className="px-5 py-6 md:px-10 md:py-9">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[.16em] text-[#ee7117]">Stay connected</p>
        <div className="flex items-end justify-between"><h1 className="font-display text-[30px] font-extrabold tracking-[-.05em] text-[#164d38]">Messages</h1><button type="button" onClick={() => setSelected('new')} className="focus-ring flex h-10 w-10 items-center justify-center rounded-full bg-[#e4f3e7] text-[#087044]" aria-label="New message" data-testid="button-new-message"><Send size={17} /></button></div>
        <p className="mt-2 text-sm text-[#7a897f]">Updates from the neighborhood businesses you love.</p>
        <div className="mt-7 overflow-hidden rounded-[24px] border border-[#ebe5da] bg-white shadow-[0_8px_25px_rgba(16,72,50,.05)]">
          {threads.map((thread, index) => <button type="button" key={thread.id} onClick={() => setSelected(thread.id)} className={`focus-ring flex w-full items-center gap-3 p-4 text-left transition hover:bg-[#f7faf5] ${index ? 'border-t border-[#f0ece4]' : ''}`} data-testid={`button-thread-${thread.id}`}>
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[17px] ${thread.tint} text-[#267052]`}><Store size={21} strokeWidth={1.7} /></span>
            <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-3"><strong className="truncate text-sm text-[#174d37]">{thread.name}</strong><span className="shrink-0 text-[10px] text-[#9aa19b]">{thread.time}</span></span><span className="mt-1 block truncate text-xs text-[#7c8b80]">{thread.message}</span></span>
            {thread.unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#f47716]" />}
          </button>)}
        </div>
        <div className="mt-8"><EmptyState icon={MessageCircle} title="Looking for a conversation?" detail="Send a message from any business profile when you need a detail before you visit." action="Explore local businesses" onAction={() => setSelected('explore')} /></div>
        {selected && <div className="fixed inset-x-5 bottom-24 z-30 rounded-[23px] bg-[#164d38] p-4 text-white shadow-xl md:bottom-32 md:left-1/2 md:w-[420px] md:-translate-x-1/2"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#b7e7c7]">Messages</p><p className="mt-1 text-sm font-semibold">{selected === 'new' ? 'Choose a business from Search to start a conversation.' : selected === 'explore' ? 'Explore local businesses to start a conversation.' : 'This is where your conversation will live.'}</p></div><button type="button" onClick={() => setSelected(null)} className="focus-ring rounded-full p-1 text-[#b7e7c7]" aria-label="Close message notice" data-testid="button-close-message-notice"><X size={16} /></button></div></div>}
      </div>
    </Shell>
  );
}

function ProfilePage() {
  const [toast, setToast] = useState('');
  const [notifications, setNotifications] = useState(true);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2200); };
  const settings = [{ label: 'Account details', detail: 'Maya Thompson', icon: UserRound }, { label: 'Saved locations', detail: 'Brooklyn, NY', icon: MapPin }, { label: 'Notifications', detail: notifications ? 'On' : 'Off', icon: Bell }, { label: 'Preferences', detail: 'Shopping & local services', icon: Settings2 }];
  return (
    <Shell active="profile" toast={toast}>
      <div className="px-5 py-6 md:px-10 md:py-9">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[.16em] text-[#ee7117]">Your ShopNear</p>
        <h1 className="font-display text-[30px] font-extrabold tracking-[-.05em] text-[#164d38]">Profile</h1>
        <section className="mt-6 flex items-center gap-4 rounded-[24px] bg-[#e4f3e7] p-5">
          <span className="flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-[23px] bg-[#087044] font-display text-2xl font-extrabold text-white">MT</span>
          <div className="min-w-0"><h2 className="font-display text-xl font-extrabold text-[#164d38]">Maya Thompson</h2><p className="mt-1 text-xs text-[#5f806e]">Exploring Brooklyn one find at a time.</p><button type="button" onClick={() => notify('Profile editing is ready for your details')} className="focus-ring mt-2 text-xs font-bold text-[#087044] underline underline-offset-4" data-testid="button-edit-profile">Edit profile</button></div>
        </section>
        <section className="mt-8"><SectionHeading title="Your activity" /><div className="grid grid-cols-3 gap-2.5"><div className="rounded-[18px] bg-[#fff1df] p-3.5"><p className="font-display text-2xl font-extrabold text-[#e56e12]">12</p><p className="mt-1 text-[10px] font-bold text-[#9b6b4a]">Places saved</p></div><div className="rounded-[18px] bg-[#e4f3e7] p-3.5"><p className="font-display text-2xl font-extrabold text-[#087044]">4</p><p className="mt-1 text-[10px] font-bold text-[#5f806e]">Visits planned</p></div><div className="rounded-[18px] bg-[#edf0f4] p-3.5"><p className="font-display text-2xl font-extrabold text-[#486274]">8</p><p className="mt-1 text-[10px] font-bold text-[#687e89]">Reviews shared</p></div></div></section>
        <section className="mt-8"><SectionHeading title="Settings" /><div className="overflow-hidden rounded-[22px] border border-[#ebe5da] bg-white shadow-[0_6px_20px_rgba(16,72,50,.04)]">{settings.map(({ label, detail, icon: Icon }, index) => <button type="button" key={label} onClick={() => label === 'Notifications' ? setNotifications((value) => !value) : notify(`${label} selected`)} className={`focus-ring flex w-full items-center gap-3 p-4 text-left transition hover:bg-[#f8faf6] ${index ? 'border-t border-[#f0ece4]' : ''}`} data-testid={`button-setting-${label.toLowerCase().replaceAll(' ', '-')}`}><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#edf6ef] text-[#087044]"><Icon size={17} strokeWidth={1.8} /></span><span className="min-w-0 flex-1"><strong className="block text-xs font-bold text-[#174d37]">{label}</strong><span className="mt-1 block text-[11px] text-[#89948c]">{detail}</span></span><ChevronRight size={16} className="text-[#a3aaa3]" /></button>)}</div></section>
        <button type="button" onClick={() => notify('You are all set.')} className="focus-ring mt-7 flex w-full items-center justify-center gap-2 rounded-full border border-[#e8ded1] py-3 text-xs font-bold text-[#9a6b47]" data-testid="button-sign-out"><Clock3 size={15} /> Sign out</button>
      </div>
    </Shell>
  );
}

function Router() {
  return <ErrorBoundary resetKey={useLocation()[0]}><Switch><Route path="/" component={HomePage} /><Route path="/search" component={SearchPage} /><Route path="/favorites" component={FavoritesPage} /><Route path="/messages" component={MessagesPage} /><Route path="/profile" component={ProfilePage} /><Route component={HomePage} /></Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;