import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Bell, Bookmark, BriefcaseBusiness, ChevronRight, CircleUserRound, Clock3, Compass, Heart, Home as HomeIcon, MapPin, Menu, MessageCircle, Pencil, Plus, Search, Send, Settings2, ShieldCheck, ShoppingBag, Sparkles, Star, Store, Tag, Trash2, UserRound, X } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { deleteProduct, deleteService, getBusinessDashboard, getMarketplaceCatalog, getMyBusiness, getMyProducts, getMyServiceProvider, getMyServices, getSession, logout, registerAccount, requestOtp, saveBusiness, saveProduct, saveService, saveServiceProvider, searchMarketplace, updateProfile, verifyOtp, type AccountType, type AuthUser, type BusinessRecord, type MarketplaceProduct, type MarketplaceService, type MarketplaceSearchResult, type ServiceProviderRecord } from '@/lib/auth-api';

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
  const [liveResults, setLiveResults] = useState<MarketplaceSearchResult | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2000); };
  useEffect(() => {
    let active = true;
    setLoadingResults(true);
    const timer = window.setTimeout(() => {
      const request = query.trim()
        ? searchMarketplace(query.trim())
        : Promise.all([getMarketplaceCatalog({ limit: 12 }), searchMarketplace('')]).then(([catalog, discovery]) => ({
          ...discovery,
          products: catalog.products,
          services: catalog.services,
        }));
      request.then((value) => { if (active) setLiveResults(value); }).catch(() => { if (active) setLiveResults(null); }).finally(() => { if (active) setLoadingResults(false); });
    }, 220);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query]);
  const results = useMemo(() => {
    const normalized = query.toLowerCase();
    return places.filter((place) => !normalized || `${place.name} ${place.type} ${place.note}`.toLowerCase().includes(normalized));
  }, [query]);
  const filters = ['All', 'Open now', 'Top rated', 'Products', 'Services'];
  const showProducts = activeFilter === 'All' || activeFilter === 'Products';
  const showServices = activeFilter === 'All' || activeFilter === 'Services';
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
           <SectionHeading eyebrow={loadingResults ? 'Searching the marketplace' : query ? `${results.length + (liveResults?.products.length ?? 0) + (liveResults?.services.length ?? 0)} results nearby` : 'Curated for you'} title={query ? `Results for “${query}”` : 'Popular near you'} />
           {liveResults && (liveResults.products.length > 0 || liveResults.services.length > 0 || liveResults.businesses.length > 0 || liveResults.serviceProviders.length > 0) && <div className="mb-5 space-y-2">
             {showProducts && liveResults.products.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-[#ebe5da] bg-white p-3 shadow-[0_4px_15px_rgba(16,72,50,.04)]"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fff1df] text-[#e8781a]"><ShoppingBag size={17} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-xs text-[#174d37]">{item.name}</strong><span className="mt-1 block truncate text-[11px] text-[#89948c]">{item.brand || item.location || 'Local product'} · {item.tags?.join(', ') || 'Marketplace find'}</span></span><span className="text-xs font-extrabold text-[#e56e12]">{(item.priceCents / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</span></div>)}
             {showServices && liveResults.services.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-[#ebe5da] bg-white p-3 shadow-[0_4px_15px_rgba(16,72,50,.04)]"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e4f3e7] text-[#087044]"><BriefcaseBusiness size={17} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-xs text-[#174d37]">{item.name}</strong><span className="mt-1 block truncate text-[11px] text-[#89948c]">{item.location || 'Nearby service'} · {item.bookingReady ? 'Booking ready' : 'Contact provider'}</span></span><span className="text-xs font-extrabold text-[#087044]">{item.priceFromCents == null ? 'Quote' : `from ${(item.priceFromCents / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}`}</span></div>)}
             {activeFilter === 'All' && liveResults.businesses.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-[#ebe5da] bg-white p-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e4f3e7] text-[#087044]"><Store size={17} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-xs text-[#174d37]">{item.businessName}</strong><span className="mt-1 block truncate text-[11px] text-[#89948c]">{item.category} · {item.verificationStatus === 'approved' ? 'Verified' : 'Verification pending'}</span></span><ChevronRight size={16} className="text-[#a3aaa3]" /></div>)}
           </div>}
           {results.length ? <div className="grid gap-3 md:grid-cols-2">{results.map((place) => <PlaceCard key={place.id} place={place} saved={false} onSave={() => notify(`${place.name} saved to favorites`)} />)}</div> : !liveResults?.products.length && !liveResults?.services.length ? <EmptyState icon={Search} title="No nearby matches yet" detail="Try a broader search or browse one of the categories below." action="Browse categories" onAction={() => setQuery('')} /> : null}
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

function ProfileEditor({ user, onSaved, onCancel }: { user: AuthUser; onSaved: (user: AuthUser) => void; onCancel: () => void }) {
  const [fullName, setFullName] = useState(user.fullName);
  const [city, setCity] = useState(user.city ?? '');
  const [state, setState] = useState(user.state ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { onSaved(await updateProfile({ fullName, city: city || null, state: state || null })); } catch (err) { setError(err instanceof Error ? err.message : 'Could not save profile'); } finally { setBusy(false); }
  };
  return <form onSubmit={submit} className="mt-4 rounded-[22px] border border-[#dcecdf] bg-[#f7fbf7] p-4"><div className="grid gap-3 sm:grid-cols-3"><label className="text-xs font-bold text-[#4d715f] sm:col-span-3">Full name<input required value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#e3e8df] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" /></label><label className="text-xs font-bold text-[#4d715f]">City<input value={city} onChange={(event) => setCity(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#e3e8df] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" /></label><label className="text-xs font-bold text-[#4d715f]">State<input value={state} onChange={(event) => setState(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#e3e8df] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" /></label></div>{error && <p className="mt-3 text-xs font-semibold text-[#b34b32]">{error}</p>}<div className="mt-4 flex gap-2"><button disabled={busy} className="focus-ring rounded-full bg-[#087044] px-4 py-2 text-xs font-bold text-white">{busy ? 'Saving…' : 'Save profile'}</button><button type="button" onClick={onCancel} className="focus-ring rounded-full border border-[#dbe6dc] px-4 py-2 text-xs font-bold text-[#658071]">Cancel</button></div></form>;
}

function BusinessEditor() {
  const [record, setRecord] = useState<BusinessRecord | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => { getMyBusiness().then((value) => { setRecord(value); setBusinessName(value.businessName); setCategory(value.category); setDescription(value.description ?? ''); setBusinessAddress(value.businessAddress ?? ''); setPhone(value.phone ?? ''); }).catch(() => undefined); }, []);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setNotice(''); try { const value = await saveBusiness({ businessName, category, description: description || null, businessAddress: businessAddress || null, phone: phone || null }, record?.id); setRecord(value); setNotice('Business profile saved. It is pending verification.'); } catch (err) { setNotice(err instanceof Error ? err.message : 'Could not save business'); } finally { setBusy(false); } };
  return <form onSubmit={submit} className="mt-4 rounded-[22px] border border-[#f3dfcf] bg-[#fffaf5] p-4"><div className="mb-3"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#ee7117]">Business account</p><h3 className="mt-1 font-display text-lg font-extrabold text-[#164d38]">{record ? 'Edit your business' : 'Register your business'}</h3></div><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-[#4d715f]">Business name<input required value={businessName} onChange={(event) => setBusinessName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#eadfd1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" /></label><label className="text-xs font-bold text-[#4d715f]">Category<input required value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#eadfd1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" /></label><label className="text-xs font-bold text-[#4d715f] sm:col-span-2">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1.5 min-h-20 w-full rounded-xl border border-[#eadfd1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" /></label><label className="text-xs font-bold text-[#4d715f]">Address<input value={businessAddress} onChange={(event) => setBusinessAddress(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#eadfd1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" /></label><label className="text-xs font-bold text-[#4d715f]">Business phone<input value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#eadfd1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" /></label></div>{notice && <p className="mt-3 text-xs font-semibold text-[#087044]">{notice}</p>}<button disabled={busy} className="focus-ring mt-4 rounded-full bg-[#f47716] px-4 py-2.5 text-xs font-bold text-white">{busy ? 'Saving…' : record ? 'Save business' : 'Register business'}</button></form>;
}

function ServiceProviderEditor() {
  const [record, setRecord] = useState<ServiceProviderRecord | null>(null);
  const [profession, setProfession] = useState('');
  const [experience, setExperience] = useState('');
  const [skills, setSkills] = useState('');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => { getMyServiceProvider().then((value) => { setRecord(value); setProfession(value.profession); setExperience(value.experience ?? ''); setSkills(value.skills?.join(', ') ?? ''); setLocation(value.location ?? ''); }).catch(() => undefined); }, []);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setNotice(''); try { const value = await saveServiceProvider({ profession, experience: experience || null, skills: skills.split(',').map((item) => item.trim()).filter(Boolean), location: location || null }, record?.id); setRecord(value); setNotice('Provider profile saved. It is pending verification.'); } catch (err) { setNotice(err instanceof Error ? err.message : 'Could not save provider profile'); } finally { setBusy(false); } };
  return <form onSubmit={submit} className="mt-4 rounded-[22px] border border-[#dfe5f1] bg-[#f8fafc] p-4"><div className="mb-3"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#5871a0]">Service provider</p><h3 className="mt-1 font-display text-lg font-extrabold text-[#164d38]">{record ? 'Edit your provider profile' : 'Register your services'}</h3></div><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-[#4d715f]">Profession<input required value={profession} onChange={(event) => setProfession(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#dfe5f1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" /></label><label className="text-xs font-bold text-[#4d715f]">Experience<input value={experience} onChange={(event) => setExperience(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#dfe5f1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" placeholder="5 years" /></label><label className="text-xs font-bold text-[#4d715f] sm:col-span-2">Skills<input value={skills} onChange={(event) => setSkills(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#dfe5f1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" placeholder="Repairs, installation, maintenance" /></label><label className="text-xs font-bold text-[#4d715f] sm:col-span-2">Service location<input value={location} onChange={(event) => setLocation(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#dfe5f1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" /></label></div>{notice && <p className="mt-3 text-xs font-semibold text-[#087044]">{notice}</p>}<button disabled={busy} className="focus-ring mt-4 rounded-full bg-[#087044] px-4 py-2.5 text-xs font-bold text-white">{busy ? 'Saving…' : record ? 'Save provider profile' : 'Register provider profile'}</button></form>;
}

function ProductManager() {
  const [items, setItems] = useState<MarketplaceProduct[]>([]);
  const [editing, setEditing] = useState<MarketplaceProduct | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [regularPrice, setRegularPrice] = useState('');
  const [discountPrice, setDiscountPrice] = useState('');
  const [brand, setBrand] = useState('');
  const [condition, setCondition] = useState('');
  const [location, setLocation] = useState('');
  const [tags, setTags] = useState('');
  const [images, setImages] = useState('');
  const [primaryImage, setPrimaryImage] = useState('');
  const [status, setStatus] = useState('draft');
  const [description, setDescription] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => getMyProducts().then(setItems).catch(() => setItems([]));
  useEffect(() => { void load(); }, []);
  const reset = () => { setEditing(null); setName(''); setPrice(''); setRegularPrice(''); setDiscountPrice(''); setBrand(''); setCondition(''); setLocation(''); setTags(''); setImages(''); setPrimaryImage(''); setStatus('draft'); setDescription(''); };
  const edit = (item: MarketplaceProduct) => { setEditing(item); setName(item.name); setPrice((item.priceCents / 100).toFixed(2)); setRegularPrice(item.regularPriceCents == null ? '' : (item.regularPriceCents / 100).toFixed(2)); setDiscountPrice(item.discountPriceCents == null ? '' : (item.discountPriceCents / 100).toFixed(2)); setBrand(item.brand ?? ''); setCondition(item.condition ?? ''); setLocation(item.location ?? ''); setTags(item.tags?.join(', ') ?? ''); setImages(item.imagePaths?.join(', ') ?? ''); setPrimaryImage(item.primaryImagePath ?? ''); setStatus(item.status); setDescription(item.description ?? ''); };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setNotice('');
     try {
       const imagePaths = images.split(',').map((item) => item.trim()).filter(Boolean);
       await saveProduct({ name, priceCents: Math.round(Number(price || discountPrice || regularPrice || 0) * 100), regularPriceCents: regularPrice ? Math.round(Number(regularPrice) * 100) : null, discountPriceCents: discountPrice ? Math.round(Number(discountPrice) * 100) : null, primaryImagePath: primaryImage || imagePaths[0] || null, imagePaths, brand: brand || null, condition: condition || null, location: location || null, tags: tags.split(',').map((item) => item.trim()).filter(Boolean), status, description: description || null }, editing?.id);
       await load(); reset(); setNotice('Product saved.');
     }
    catch (err) { setNotice(err instanceof Error ? err.message : 'Could not save product'); } finally { setBusy(false); }
  };
  const remove = async (id: string) => { if (!window.confirm('Delete this product?')) return; await deleteProduct(id); await load(); setNotice('Product deleted.'); };
  return <section className="mt-6 rounded-[22px] border border-[#f3dfcf] bg-[#fffaf5] p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#ee7117]">Marketplace management</p><h3 className="mt-1 font-display text-lg font-extrabold text-[#164d38]">Products</h3></div><button type="button" onClick={() => { reset(); setNotice(''); }} className="focus-ring flex h-9 w-9 items-center justify-center rounded-full bg-[#f47716] text-white" aria-label="Add product" data-testid="button-add-product"><Plus size={17} /></button></div>
     <div className="mt-3 grid gap-2">{items.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-[#eadfd1] bg-white p-3"><div className="min-w-0 flex-1"><strong className="block truncate text-xs text-[#174d37]">{item.name}</strong><span className="mt-1 block text-[11px] text-[#89948c]">{(item.priceCents / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' })} · {item.status} · {item.tags?.length ? `${item.tags.length} tags` : 'No tags'}</span></div><button type="button" onClick={() => saveProduct({ isVisible: !item.isVisible }, item.id).then(load)} className="focus-ring rounded-full border border-[#e6dfd4] px-2 py-1 text-[10px] font-bold text-[#087044]">{item.isVisible ? 'Hide' : 'Show'}</button><button type="button" onClick={() => saveProduct({ isAvailable: !item.isAvailable, status: item.isAvailable ? 'out_of_stock' : 'published' }, item.id).then(load)} className="focus-ring rounded-full border border-[#e6dfd4] px-2 py-1 text-[10px] font-bold text-[#087044]">{item.isAvailable ? 'Out of stock' : 'Stock'}</button><button type="button" onClick={() => edit(item)} className="focus-ring text-[#087044]" aria-label={`Edit ${item.name}`}><Pencil size={15} /></button><button type="button" onClick={() => remove(item.id)} className="focus-ring text-[#b34b32]" aria-label={`Delete ${item.name}`}><Trash2 size={15} /></button></div>)}</div>
     {(!items.length || editing) && <form onSubmit={submit} className="mt-3 rounded-2xl border border-dashed border-[#e5cdb7] p-3"><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-[#4d715f]">Product name<input required value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#eadfd1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" placeholder="Handmade candle" /></label><label className="text-xs font-bold text-[#4d715f]">Current price<input required type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#eadfd1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" placeholder="28.00" /></label><label className="text-xs font-bold text-[#4d715f]">Regular price<input type="number" min="0" step="0.01" value={regularPrice} onChange={(event) => setRegularPrice(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#eadfd1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" /></label><label className="text-xs font-bold text-[#4d715f]">Discount price<input type="number" min="0" step="0.01" value={discountPrice} onChange={(event) => setDiscountPrice(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#eadfd1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" /></label><label className="text-xs font-bold text-[#4d715f]">Brand<input value={brand} onChange={(event) => setBrand(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#eadfd1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" /></label><label className="text-xs font-bold text-[#4d715f]">Condition<input value={condition} onChange={(event) => setCondition(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#eadfd1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" placeholder="New, used, refurbished" /></label><label className="text-xs font-bold text-[#4d715f]">Location<input value={location} onChange={(event) => setLocation(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#eadfd1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" /></label><label className="text-xs font-bold text-[#4d715f]">Status<select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#eadfd1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none"><option value="draft">Draft</option><option value="published">Published</option><option value="hidden">Hidden</option><option value="scheduled">Scheduled</option><option value="out_of_stock">Out of stock</option></select></label><label className="text-xs font-bold text-[#4d715f] sm:col-span-2">Tags<input value={tags} onChange={(event) => setTags(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#eadfd1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" placeholder="handmade, decor, gift" /></label><label className="text-xs font-bold text-[#4d715f] sm:col-span-2">Image gallery paths<input value={images} onChange={(event) => setImages(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#eadfd1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" placeholder="/objects/image-one, /objects/image-two" /></label><label className="text-xs font-bold text-[#4d715f] sm:col-span-2">Primary image path<input value={primaryImage} onChange={(event) => setPrimaryImage(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#eadfd1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" placeholder="Defaults to the first gallery image" /></label><label className="text-xs font-bold text-[#4d715f] sm:col-span-2">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1.5 min-h-16 w-full rounded-xl border border-[#eadfd1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" /></label></div><div className="mt-3 flex gap-2"><button disabled={busy} className="focus-ring rounded-full bg-[#087044] px-4 py-2 text-xs font-bold text-white">{busy ? 'Saving…' : editing ? 'Update product' : 'Create product'}</button>{editing && <button type="button" onClick={reset} className="focus-ring rounded-full border border-[#dbe6dc] px-4 py-2 text-xs font-bold text-[#658071]">Cancel</button>}</div></form>}{notice && <p className="mt-3 text-xs font-semibold text-[#087044]">{notice}</p>}</section>;
}

function ServiceManager() {
  const [items, setItems] = useState<MarketplaceService[]>([]);
  const [editing, setEditing] = useState<MarketplaceService | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [radius, setRadius] = useState('');
  const [duration, setDuration] = useState('');
  const [location, setLocation] = useState('');
  const [tags, setTags] = useState('');
  const [images, setImages] = useState('');
  const [primaryImage, setPrimaryImage] = useState('');
  const [workingHours, setWorkingHours] = useState('');
  const [pricingOptions, setPricingOptions] = useState('');
  const [status, setStatus] = useState('draft');
  const [emergencyService, setEmergencyService] = useState(false);
  const [bookingReady, setBookingReady] = useState(false);
  const [description, setDescription] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => getMyServices().then(setItems).catch(() => setItems([]));
  useEffect(() => { void load(); }, []);
  const reset = () => { setEditing(null); setName(''); setPrice(''); setRadius(''); setDuration(''); setLocation(''); setTags(''); setImages(''); setPrimaryImage(''); setWorkingHours(''); setPricingOptions(''); setStatus('draft'); setEmergencyService(false); setBookingReady(false); setDescription(''); };
  const edit = (item: MarketplaceService) => { setEditing(item); setName(item.name); setPrice(item.priceFromCents == null ? '' : (item.priceFromCents / 100).toFixed(2)); setRadius(item.serviceRadius?.toString() ?? ''); setDuration(item.estimatedDuration?.toString() ?? ''); setLocation(item.location ?? ''); setTags(item.tags?.join(', ') ?? ''); setImages(item.imagePaths?.join(', ') ?? ''); setPrimaryImage(item.primaryImagePath ?? ''); setWorkingHours(item.workingHours ? JSON.stringify(item.workingHours) : ''); setPricingOptions(item.pricingOptions ? JSON.stringify(item.pricingOptions) : ''); setStatus(item.status); setEmergencyService(Boolean(item.emergencyService)); setBookingReady(Boolean(item.bookingReady)); setDescription(item.description ?? ''); };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setNotice('');
     try {
       const imagePaths = images.split(',').map((item) => item.trim()).filter(Boolean);
       const parseJson = (value: string) => value.trim() ? JSON.parse(value) : null;
       await saveService({ name, priceFromCents: price ? Math.round(Number(price) * 100) : null, serviceRadius: radius ? Number(radius) : null, estimatedDuration: duration ? Number(duration) : null, location: location || null, tags: tags.split(',').map((item) => item.trim()).filter(Boolean), imagePaths, primaryImagePath: primaryImage || imagePaths[0] || null, workingHours: parseJson(workingHours), pricingOptions: parseJson(pricingOptions), emergencyService, bookingReady, status, description: description || null }, editing?.id);
       await load(); reset(); setNotice('Service saved.');
     }
    catch (err) { setNotice(err instanceof Error ? err.message : 'Could not save service'); } finally { setBusy(false); }
  };
  const remove = async (id: string) => { if (!window.confirm('Delete this service?')) return; await deleteService(id); await load(); setNotice('Service deleted.'); };
  return <section className="mt-6 rounded-[22px] border border-[#dfe5f1] bg-[#f8fafc] p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#5871a0]">Service management</p><h3 className="mt-1 font-display text-lg font-extrabold text-[#164d38]">Services</h3></div><button type="button" onClick={() => { reset(); setNotice(''); }} className="focus-ring flex h-9 w-9 items-center justify-center rounded-full bg-[#087044] text-white" aria-label="Add service" data-testid="button-add-service"><Plus size={17} /></button></div>
     <div className="mt-3 grid gap-2">{items.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-[#dfe5f1] bg-white p-3"><div className="min-w-0 flex-1"><strong className="block truncate text-xs text-[#174d37]">{item.name}</strong><span className="mt-1 block text-[11px] text-[#89948c]">{item.priceFromCents == null ? 'Quote' : `from ${(item.priceFromCents / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}`} · {item.status} · {item.bookingReady ? 'Booking ready' : 'Inquiry first'}</span></div><button type="button" onClick={() => saveService({ isVisible: !item.isVisible }, item.id).then(load)} className="focus-ring rounded-full border border-[#dfe5f1] px-2 py-1 text-[10px] font-bold text-[#087044]">{item.isVisible ? 'Hide' : 'Show'}</button><button type="button" onClick={() => saveService({ isAvailable: !item.isAvailable, status: item.isAvailable ? 'out_of_stock' : 'published' }, item.id).then(load)} className="focus-ring rounded-full border border-[#dfe5f1] px-2 py-1 text-[10px] font-bold text-[#087044]">{item.isAvailable ? 'Pause' : 'Open'}</button><button type="button" onClick={() => edit(item)} className="focus-ring text-[#087044]" aria-label={`Edit ${item.name}`}><Pencil size={15} /></button><button type="button" onClick={() => remove(item.id)} className="focus-ring text-[#b34b32]" aria-label={`Delete ${item.name}`}><Trash2 size={15} /></button></div>)}</div>
     {(!items.length || editing) && <form onSubmit={submit} className="mt-3 rounded-2xl border border-dashed border-[#cbd8e8] p-3"><div className="grid gap-3 sm:grid-cols-3"><label className="text-xs font-bold text-[#4d715f] sm:col-span-2">Service name<input required value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#dfe5f1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" placeholder="Appliance repair" /></label><label className="text-xs font-bold text-[#4d715f]">From price<input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#dfe5f1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" placeholder="32.00" /></label><label className="text-xs font-bold text-[#4d715f]">Radius (mi)<input type="number" min="0" value={radius} onChange={(event) => setRadius(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#dfe5f1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" /></label><label className="text-xs font-bold text-[#4d715f]">Duration (min)<input type="number" min="0" value={duration} onChange={(event) => setDuration(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#dfe5f1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" /></label><label className="text-xs font-bold text-[#4d715f]">Location<input value={location} onChange={(event) => setLocation(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#dfe5f1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" /></label><label className="text-xs font-bold text-[#4d715f]">Status<select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#dfe5f1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none"><option value="draft">Draft</option><option value="published">Published</option><option value="hidden">Hidden</option><option value="scheduled">Scheduled</option><option value="out_of_stock">Out of stock</option></select></label><label className="text-xs font-bold text-[#4d715f] sm:col-span-3">Tags<input value={tags} onChange={(event) => setTags(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#dfe5f1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" placeholder="repair, emergency, installation" /></label><label className="text-xs font-bold text-[#4d715f] sm:col-span-3">Service image gallery paths<input value={images} onChange={(event) => setImages(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#dfe5f1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" placeholder="/objects/image-one, /objects/image-two" /></label><label className="text-xs font-bold text-[#4d715f] sm:col-span-3">Primary image path<input value={primaryImage} onChange={(event) => setPrimaryImage(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#dfe5f1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" /></label><label className="text-xs font-bold text-[#4d715f] sm:col-span-3">Working hours JSON<input value={workingHours} onChange={(event) => setWorkingHours(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#dfe5f1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" placeholder='{"mon":"09:00-17:00"}' /></label><label className="text-xs font-bold text-[#4d715f] sm:col-span-3">Pricing options JSON<input value={pricingOptions} onChange={(event) => setPricingOptions(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#dfe5f1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" placeholder='[{"label":"Standard","priceCents":3200}]' /></label><label className="flex items-center gap-2 text-xs font-bold text-[#4d715f]"><input type="checkbox" checked={emergencyService} onChange={(event) => setEmergencyService(event.target.checked)} /> Emergency service</label><label className="flex items-center gap-2 text-xs font-bold text-[#4d715f]"><input type="checkbox" checked={bookingReady} onChange={(event) => setBookingReady(event.target.checked)} /> Booking ready</label><label className="text-xs font-bold text-[#4d715f] sm:col-span-3">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1.5 min-h-16 w-full rounded-xl border border-[#dfe5f1] bg-white px-3 py-2.5 text-sm font-normal text-[#174d37] outline-none" /></label></div><div className="mt-3 flex gap-2"><button disabled={busy} className="focus-ring rounded-full bg-[#087044] px-4 py-2 text-xs font-bold text-white">{busy ? 'Saving…' : editing ? 'Update service' : 'Create service'}</button>{editing && <button type="button" onClick={reset} className="focus-ring rounded-full border border-[#dbe6dc] px-4 py-2 text-xs font-bold text-[#658071]">Cancel</button>}</div></form>}{notice && <p className="mt-3 text-xs font-semibold text-[#087044]">{notice}</p>}</section>;
}

function BusinessDashboardPanel() {
  const [metrics, setMetrics] = useState<{
    products: number;
    availableProducts: number;
    services: number;
    visibleProducts: number;
    featuredProducts: number;
    views: number;
    favorites: number;
    messages: number;
    verificationStatus: string;
    visibility: string;
    recentActivity: { label?: string; createdAt?: string }[];
    quickActions: string[];
    sales: { status: string; value: number };
    analytics: { status: string; value: number };
  } | null>(null);
  useEffect(() => { getBusinessDashboard().then((value) => setMetrics(value.metrics)).catch(() => setMetrics(null)); }, []);
  if (!metrics) return null;
  const statCards = [
    ['Products', metrics.products],
    ['Available', metrics.availableProducts],
    ['Services', metrics.services],
    ['Visible', metrics.visibleProducts],
    ['Featured', metrics.featuredProducts],
    ['Views', metrics.views],
    ['Favorites', metrics.favorites],
    ['Messages', metrics.messages],
  ];
  return <section className="mt-6 rounded-[22px] bg-[#164d38] p-4 text-white">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#b7e7c7]">Business dashboard</p><h3 className="mt-1 font-display text-lg font-extrabold">Your marketplace snapshot</h3></div>
      <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold capitalize text-[#d9f4e1]">{metrics.verificationStatus.replaceAll('_', ' ')}</span>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{statCards.map(([label, value]) => <div key={label} className="rounded-2xl bg-white/10 p-2.5"><p className="font-display text-xl font-extrabold">{value}</p><p className="mt-1 text-[9px] text-[#c9e8d2]">{label}</p></div>)}</div>
    <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-[#c9e8d2]">
      <span className="rounded-full bg-white/10 px-2.5 py-1 capitalize">Listing visibility: {metrics.visibility}</span>
      <span className="rounded-full bg-white/10 px-2.5 py-1">Sales: {metrics.sales.status}</span>
      <span className="rounded-full bg-white/10 px-2.5 py-1">Analytics: {metrics.analytics.status}</span>
    </div>
  </section>;
}

function ProfilePage() {
  const [toast, setToast] = useState('');
  const [notifications, setNotifications] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);
  const [, setLocation] = useLocation();
  useEffect(() => {
    getSession().then((session) => {
      setUser(session.user);
      if (session.user) setNotifications(session.user.notificationsEnabled);
    }).finally(() => setLoadingSession(false));
  }, []);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2200); };
  const displayName = user?.fullName ?? 'Maya Thompson';
  const settings = [{ label: 'Account details', detail: displayName, icon: UserRound }, { label: 'Saved locations', detail: user?.city ? `${user.city}${user.state ? `, ${user.state}` : ''}` : 'Brooklyn, NY', icon: MapPin }, { label: 'Notifications', detail: notifications ? 'On' : 'Off', icon: Bell }, { label: 'Preferences', detail: user ? `${user.accountType.replace('_', ' ')} account` : 'Shopping & local services', icon: Settings2 }];
  const saveNotifications = async () => {
    const next = !notifications;
    setNotifications(next);
    if (user) {
      try { await updateProfile({ notificationsEnabled: next }); } catch { setNotifications(!next); notify('Could not update notifications'); }
    }
  };
  const signOut = async () => {
    await logout();
    setUser(null);
    notify('Signed out securely');
  };
  return (
    <Shell active="profile" toast={toast}>
      <div className="px-5 py-6 md:px-10 md:py-9">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[.16em] text-[#ee7117]">Your ShopNear</p>
        <h1 className="font-display text-[30px] font-extrabold tracking-[-.05em] text-[#164d38]">Profile</h1>
        {loadingSession ? <div className="mt-6 rounded-[24px] bg-[#eef6ef] p-5 text-sm text-[#5f806e]">Checking your secure session…</div> : user ? <section className="mt-6 flex items-center gap-4 rounded-[24px] bg-[#e4f3e7] p-5">
          <span className="flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-[23px] bg-[#087044] font-display text-2xl font-extrabold text-white">{user.fullName.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span>
          <div className="min-w-0"><h2 className="font-display text-xl font-extrabold text-[#164d38]">{user.fullName}</h2><p className="mt-1 text-xs text-[#5f806e]">{user.phone} · {user.accountType.replace('_', ' ')}</p><button type="button" onClick={() => setEditingProfile((value) => !value)} className="focus-ring mt-2 text-xs font-bold text-[#087044] underline underline-offset-4" data-testid="button-edit-profile">{editingProfile ? 'Close editor' : 'Edit profile'}</button></div>
        </section> : <section className="mt-6 rounded-[24px] bg-[#e4f3e7] p-5"><div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-[#087044] text-white"><ShieldCheck size={22} /></span><div><h2 className="font-display text-xl font-extrabold text-[#164d38]">Make ShopNear yours.</h2><p className="mt-1 text-xs leading-relaxed text-[#5f806e]">Sign in to sync your profile, save your details, and register as a local business or service provider.</p><button type="button" onClick={() => setLocation('/auth')} className="focus-ring mt-3 rounded-full bg-[#f47716] px-4 py-2 text-xs font-bold text-white" data-testid="button-sign-in">Sign in with phone</button></div></div></section>}
        {user && editingProfile && <ProfileEditor user={user} onSaved={(next) => { setUser(next); setEditingProfile(false); notify('Profile saved'); }} onCancel={() => setEditingProfile(false)} />}
        {user?.accountType === 'business' && <BusinessEditor />}
        {user?.accountType === 'service_provider' && <ServiceProviderEditor />}
         {user?.accountType === 'business' && <BusinessDashboardPanel />}
         {(user?.accountType === 'business' || user?.accountType === 'service_provider') && <ServiceManager />}
         {user?.accountType === 'business' && <ProductManager />}
        <section className="mt-8"><SectionHeading title="Your activity" /><div className="grid grid-cols-3 gap-2.5"><div className="rounded-[18px] bg-[#fff1df] p-3.5"><p className="font-display text-2xl font-extrabold text-[#e56e12]">12</p><p className="mt-1 text-[10px] font-bold text-[#9b6b4a]">Places saved</p></div><div className="rounded-[18px] bg-[#e4f3e7] p-3.5"><p className="font-display text-2xl font-extrabold text-[#087044]">4</p><p className="mt-1 text-[10px] font-bold text-[#5f806e]">Visits planned</p></div><div className="rounded-[18px] bg-[#edf0f4] p-3.5"><p className="font-display text-2xl font-extrabold text-[#486274]">8</p><p className="mt-1 text-[10px] font-bold text-[#687e89]">Reviews shared</p></div></div></section>
        <section className="mt-8"><SectionHeading title="Settings" /><div className="overflow-hidden rounded-[22px] border border-[#ebe5da] bg-white shadow-[0_6px_20px_rgba(16,72,50,.04)]">{settings.map(({ label, detail, icon: Icon }, index) => <button type="button" key={label} onClick={() => label === 'Notifications' ? saveNotifications() : notify(`${label} selected`)} className={`focus-ring flex w-full items-center gap-3 p-4 text-left transition hover:bg-[#f8faf6] ${index ? 'border-t border-[#f0ece4]' : ''}`} data-testid={`button-setting-${label.toLowerCase().replaceAll(' ', '-')}`}><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#edf6ef] text-[#087044]"><Icon size={17} strokeWidth={1.8} /></span><span className="min-w-0 flex-1"><strong className="block text-xs font-bold text-[#174d37]">{label}</strong><span className="mt-1 block text-[11px] text-[#89948c]">{detail}</span></span><ChevronRight size={16} className="text-[#a3aaa3]" /></button>)}</div></section>
        <button type="button" onClick={() => user ? signOut() : setLocation('/auth')} className="focus-ring mt-7 flex w-full items-center justify-center gap-2 rounded-full border border-[#e8ded1] py-3 text-xs font-bold text-[#9a6b47]" data-testid="button-sign-out"><Clock3 size={15} /> {user ? 'Sign out' : 'Sign in'}</button>
      </div>
    </Shell>
  );
}

function AuthPage() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<'phone' | 'otp' | 'profile'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [accountType, setAccountType] = useState<Exclude<AccountType, 'admin'>>('customer');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [developmentOtp, setDevelopmentOtp] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitPhone = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try { const challenge = await requestOtp(phone); setDevelopmentOtp(challenge.developmentOtp); setStep('otp'); } catch (err) { setError(err instanceof Error ? err.message : 'Unable to send code'); } finally { setBusy(false); }
  };
  const submitCode = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try { const result = await verifyOtp(phone, code); if (result.authenticated) setLocation('/profile'); else setStep('profile'); } catch (err) { setError(err instanceof Error ? err.message : 'That code is not valid'); } finally { setBusy(false); }
  };
  const submitProfile = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try { await registerAccount({ fullName, accountType, city: city || undefined, state: state || undefined }); setLocation('/'); } catch (err) { setError(err instanceof Error ? err.message : 'Unable to create account'); } finally { setBusy(false); }
  };
  const inputClass = "mt-2 w-full rounded-2xl border border-[#e5dfd3] bg-white px-4 py-3 text-sm text-[#174d37] outline-none focus:border-[#087044] focus:ring-2 focus:ring-[#d8efdf]";
  return <div className="min-h-[100dvh] bg-[#f5f1e9] px-5 py-7 md:px-10 md:py-10"><div className="mx-auto max-w-xl rounded-[30px] bg-[#fffdf9] p-6 shadow-[0_18px_50px_rgba(16,72,50,.10)] md:p-10"><div className="flex items-center justify-between"><Logo compact /><button type="button" onClick={() => setLocation('/')} className="focus-ring text-xs font-bold text-[#087044]">Back to ShopNear</button></div><p className="mt-10 text-[10px] font-bold uppercase tracking-[.16em] text-[#ee7117]">Secure phone access</p><h1 className="mt-2 font-display text-[32px] font-extrabold leading-tight tracking-[-.05em] text-[#164d38]">{step === 'phone' ? 'Welcome to your neighborhood.' : step === 'otp' ? 'Enter your code.' : 'Tell us about you.'}</h1><p className="mt-3 text-sm leading-relaxed text-[#77867c]">{step === 'phone' ? 'Use your phone number to sign in or create a ShopNear account.' : step === 'otp' ? `We sent a six-digit code to ${phone}.` : 'One quick step, then your ShopNear account is ready.'}</p>{developmentOtp && step === 'otp' && <div className="mt-5 rounded-2xl border border-[#f8d5b9] bg-[#fff1df] p-3 text-xs text-[#8c572f]">Development code: <strong className="tracking-[.2em]">{developmentOtp}</strong></div>}{error && <div className="mt-5 rounded-2xl bg-[#fff0ed] p-3 text-xs font-semibold text-[#b34b32]" role="alert">{error}</div>}{step === 'phone' && <form onSubmit={submitPhone} className="mt-7 space-y-5"><label className="block text-xs font-bold text-[#4d715f]">Phone number<input required value={phone} onChange={(event) => setPhone(event.target.value)} className={inputClass} placeholder="+234 801 234 5678" inputMode="tel" /></label><button disabled={busy} className="focus-ring w-full rounded-full bg-[#087044] px-5 py-3.5 text-sm font-bold text-white disabled:opacity-60">{busy ? 'Sending code…' : 'Send verification code'}</button></form>}{step === 'otp' && <form onSubmit={submitCode} className="mt-7 space-y-5"><label className="block text-xs font-bold text-[#4d715f]">Six-digit code<input required minLength={6} maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} className={`${inputClass} text-center text-xl tracking-[.35em]`} placeholder="123456" inputMode="numeric" /></label><button disabled={busy} className="focus-ring w-full rounded-full bg-[#087044] px-5 py-3.5 text-sm font-bold text-white disabled:opacity-60">{busy ? 'Verifying…' : 'Verify phone'}</button><button type="button" onClick={() => { setStep('phone'); setDevelopmentOtp(null); }} className="focus-ring w-full text-xs font-bold text-[#087044]">Use a different number</button></form>}{step === 'profile' && <form onSubmit={submitProfile} className="mt-7 space-y-5"><label className="block text-xs font-bold text-[#4d715f]">Full name<input required minLength={2} value={fullName} onChange={(event) => setFullName(event.target.value)} className={inputClass} placeholder="Your name" /></label><fieldset><legend className="text-xs font-bold text-[#4d715f]">I’m joining as</legend><div className="mt-2 grid gap-2 sm:grid-cols-3">{([['customer', 'Customer'], ['business', 'Business'], ['service_provider', 'Service provider']] as const).map(([value, label]) => <button type="button" key={value} onClick={() => setAccountType(value)} className={`focus-ring rounded-2xl border px-3 py-3 text-xs font-bold ${accountType === value ? 'border-[#087044] bg-[#e4f3e7] text-[#087044]' : 'border-[#e5dfd3] bg-white text-[#718278]'}`}>{label}</button>)}</div></fieldset><div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-bold text-[#4d715f]">City<input value={city} onChange={(event) => setCity(event.target.value)} className={inputClass} placeholder="Lagos" /></label><label className="block text-xs font-bold text-[#4d715f]">State<input value={state} onChange={(event) => setState(event.target.value)} className={inputClass} placeholder="Lagos" /></label></div><button disabled={busy} className="focus-ring w-full rounded-full bg-[#f47716] px-5 py-3.5 text-sm font-bold text-white disabled:opacity-60">{busy ? 'Creating account…' : 'Finish account setup'}</button></form>}</div></div>;
}

function Router() {
  return <ErrorBoundary resetKey={useLocation()[0]}><Switch><Route path="/auth" component={AuthPage} /><Route path="/" component={HomePage} /><Route path="/search" component={SearchPage} /><Route path="/favorites" component={FavoritesPage} /><Route path="/messages" component={MessagesPage} /><Route path="/profile" component={ProfilePage} /><Route component={HomePage} /></Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;