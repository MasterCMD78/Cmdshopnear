import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import {
  Bell, Check, CheckCheck, ChevronLeft, Flag, LockKeyhole, MessageCircle, MoreHorizontal,
  Send, Settings2, Shield, Star, Store, Trash2,
} from 'lucide-react';
import {
  getGetMyReviewQueryKey, getGetNotificationPreferencesQueryKey,
  getGetNotificationUnreadCountQueryKey, getGetRatingSummaryQueryKey,
  getListAdminReviewsQueryKey, getListChatBlocksQueryKey, getListChatConversationsQueryKey,
  getListChatMessagesQueryKey, getListContentReportsQueryKey,
  getListNotificationsQueryKey, getListReviewsQueryKey,
  useBlockChatUser, useCreateChatConversation, useCreateNotificationAnnouncement,
  useCreateReview, useDeleteChatMessage, useDeleteReview, useGetMyReview,
  useGetNotificationPreferences, useGetNotificationUnreadCount, useGetProfile,
  useGetRatingSummary, useListAdminReviews, useListChatConversations,
  useListChatBlocks, useListChatMessages, useListContentReports, useListNotifications,
  useListReviews,
  useMarkAllNotificationsRead, useMarkNotificationRead, useModerateReview,
  useReportChatConversation, useReportReview, useSendChatMessage,
  useUpdateChatTyping, useUpdateContentReport, useUpdateNotificationPreferences,
  useUnblockChatUser, useUpdateReview,
  type ChatConversation, type ChatMessage, type NotificationPreferences,
  type Review, type ReviewTargetType,
} from '@workspace/api-client-react';

const pageShell = 'mx-auto max-w-6xl px-5 py-6 pb-32 md:px-10 md:py-9';
const eyebrow = 'text-[10px] font-bold uppercase tracking-[.16em] text-[#ee7117]';
const heading = 'font-display text-[30px] font-extrabold tracking-[-.05em] text-[#164d38]';
const quiet = 'text-sm leading-relaxed text-[#77867c]';
const panel = 'rounded-[24px] border border-[#ebe5da] bg-white shadow-[0_8px_25px_rgba(16,72,50,.05)]';
const button = 'focus-ring rounded-full bg-[#087044] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#075d3e] disabled:cursor-not-allowed disabled:opacity-50';
const subtleButton = 'focus-ring rounded-full border border-[#dbe6dc] bg-white px-3.5 py-2 text-xs font-bold text-[#087044] transition hover:bg-[#f4faf5] disabled:opacity-50';
const input = 'w-full rounded-2xl border border-[#e5dfd3] bg-white px-4 py-3 text-sm text-[#174d37] outline-none focus:border-[#087044] focus:ring-2 focus:ring-[#d8efdf]';

function useLiveRefresh(enabled: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => {
      void queryClient.invalidateQueries({ predicate: (query) => {
        const key = String(query.queryKey[0] ?? '');
        return key.includes('/api/chat/') || key.includes('/api/notifications');
      } });
    };
    const source = new EventSource('/api/chat/events', { withCredentials: true });
    source.onopen = refresh;
    source.onmessage = refresh;
    ['update', 'message', 'conversation', 'typing', 'notification', 'read', 'connected'].forEach((name) => {
      source.addEventListener(name, refresh);
    });
    const recovery = window.setInterval(refresh, 30000);
    return () => { source.close(); window.clearInterval(recovery); };
  }, [enabled, queryClient]);
}

function Avatar({ name, photo, size = 'h-11 w-11' }: { name: string; photo?: string | null; size?: string }) {
  return photo
    ? <img src={photo} alt="" className={`${size} shrink-0 rounded-2xl object-cover`} />
    : <span aria-hidden="true" className={`${size} flex shrink-0 items-center justify-center rounded-2xl bg-[#e4f3e7] font-display text-sm font-extrabold text-[#087044]`}>{name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span>;
}

function InlineNotice({ children, tone = 'success' }: { children: string; tone?: 'success' | 'error' }) {
  return <p role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl px-3 py-2 text-xs font-semibold ${tone === 'error' ? 'bg-[#fff0ed] text-[#a24430]' : 'bg-[#e8f5ed] text-[#087044]'}`} data-testid={`status-${tone}`}>{children}</p>;
}

export function MessagesPage() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const profile = useGetProfile({ query: { queryKey: ['/api/profile'], retry: false } });
  const userId = profile.data?.id;
  useLiveRefresh(Boolean(userId));
  const blockList = useListChatBlocks({
    query: {
      queryKey: getListChatBlocksQueryKey(),
      enabled: Boolean(userId),
      refetchOnMount: 'always',
    },
  });
  const initialConversation = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('conversation') : null;
  const [selectedId, setSelectedId] = useState<string | null>(initialConversation);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const conversations = useListChatConversations({ search: search.trim() || undefined, page: 1, limit: 50 }, {
    query: { queryKey: getListChatConversationsQueryKey({ search: search.trim() || undefined, page: 1, limit: 50 }), enabled: Boolean(userId), refetchInterval: 30000, refetchOnMount: 'always' },
  });
  const list = conversations.data?.conversations ?? [];
  const selected = list.find((item) => item.id === selectedId);
  const [messagesParams, setMessagesParams] = useState<{ conversationId: string } | null>(selectedId ? { conversationId: selectedId } : null);
  useEffect(() => { setMessagesParams(selectedId ? { conversationId: selectedId } : null); }, [selectedId]);
  const conversationMessages = useListChatMessages(messagesParams ?? { conversationId: '' }, {
    query: {
      queryKey: getListChatMessagesQueryKey({ conversationId: messagesParams?.conversationId ?? '' }),
      enabled: Boolean(userId && messagesParams?.conversationId),
      refetchInterval: 30000,
      refetchOnMount: 'always',
    },
  });
  const send = useSendChatMessage();
  const typing = useUpdateChatTyping();
  const report = useReportChatConversation();
  const block = useBlockChatUser();
  const unblock = useUnblockChatUser();
  const removeMessage = useDeleteChatMessage();
  const blockedUserIds = useMemo(() => new Set((blockList.data?.blockedUsers ?? []).map((user) => user.id)), [blockList.data]);
  const typingTimer = useRef<number | undefined>(undefined);
  const messages = conversationMessages.data?.messages ?? [];
  const notifyChange = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 2600); };
  const invalidateThread = () => {
    void queryClient.invalidateQueries({ queryKey: getListChatConversationsQueryKey() });
    if (selectedId) void queryClient.invalidateQueries({ queryKey: getListChatMessagesQueryKey({ conversationId: selectedId }) });
  };
  useEffect(() => () => window.clearTimeout(typingTimer.current), []);
  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !selectedId || send.isPending) return;
    send.mutate({ id: selectedId, data: { body } }, {
      onSuccess: () => { setDraft(''); invalidateThread(); },
      onError: () => notifyChange('Your message could not be sent. Try again.'),
    });
  };
  const setTypingState = (value: boolean) => {
    if (!selectedId) return;
    typing.mutate({ id: selectedId, data: { typing: value } });
  };
  const chooseThread = (conversation: ChatConversation) => {
    setSelectedId(conversation.id);
    setLocation(`/messages?conversation=${encodeURIComponent(conversation.id)}`);
  };
  const confirmReport = () => {
    if (!selectedId) return;
    const reason = window.prompt('Why are you reporting this conversation?');
    if (!reason?.trim()) return;
    report.mutate({ id: selectedId, data: { reason: reason.trim(), details: null } }, {
      onSuccess: () => { notifyChange('Report sent to the ShopNear team.'); void queryClient.invalidateQueries({ queryKey: getListContentReportsQueryKey() }); },
      onError: () => notifyChange('Could not send your report.'),
    });
  };
  const confirmBlock = () => {
    if (!selected || !window.confirm(`Block ${selected.otherUser.fullName}? You can unblock them later from this conversation.`)) return;
    block.mutate({ userId: selected.otherUser.id }, {
      onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getListChatBlocksQueryKey() }); notifyChange('This account is blocked.'); invalidateThread(); },
      onError: () => notifyChange('Could not block this account.'),
    });
  };
  const confirmUnblock = () => {
    if (!selected || !window.confirm(`Unblock ${selected.otherUser.fullName}?`)) return;
    unblock.mutate({ userId: selected.otherUser.id }, {
      onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getListChatBlocksQueryKey() }); notifyChange('This account is unblocked.'); invalidateThread(); },
      onError: () => notifyChange('Could not unblock this account.'),
    });
  };

  if (profile.isLoading) return <main className={pageShell}><div className="skeleton h-9 w-52 rounded-xl" /><div className="mt-6 grid gap-4 md:grid-cols-[.8fr_1.2fr]"><div className="skeleton h-[460px] rounded-[24px]" /><div className="skeleton h-[460px] rounded-[24px]" /></div></main>;
  if (!userId) return <main className={pageShell}><p className={eyebrow}>Stay connected</p><h1 className={`${heading} mt-1`}>Messages</h1><section className={`${panel} mt-7 p-8 text-center`}><MessageCircle className="mx-auto text-[#087044]" size={30} /><h2 className="mt-3 font-display text-xl font-extrabold text-[#164d38]">Conversations belong to your account</h2><p className={`mx-auto mt-2 max-w-md ${quiet}`}>Sign in to pick up with local businesses and service providers.</p><button className={`${button} mt-5`} type="button" onClick={() => setLocation('/auth')} data-testid="button-messages-sign-in">Sign in</button></section></main>;

  return <main className={pageShell}>
    <div className="mb-6"><p className={eyebrow}>Stay connected</p><div className="mt-1 flex items-end justify-between gap-3"><div><h1 className={heading}>Messages</h1><p className={`mt-1 ${quiet}`}>A direct line to the people behind your neighborhood finds.</p></div><span className="rounded-full bg-[#e4f3e7] px-3 py-1.5 text-[11px] font-bold text-[#087044]" data-testid="text-unread-conversations">{list.reduce((sum, item) => sum + item.unreadCount, 0)} unread</span></div></div>
    {notice && <div className="mb-4"><InlineNotice>{notice}</InlineNotice></div>}
    {conversations.isError && <div className="mb-4 flex items-center justify-between rounded-xl bg-[#fff0ed] p-3 text-xs text-[#a24430]" role="alert"><span>We couldn’t refresh your conversations.</span><button type="button" onClick={() => void conversations.refetch()} className="font-bold underline" data-testid="button-retry-conversations">Retry</button></div>}
    <div className={`${panel} grid min-h-[540px] overflow-hidden md:grid-cols-[330px_minmax(0,1fr)]`}>
      <aside className={`border-b border-[#eee8dd] md:border-b-0 md:border-r ${selectedId ? 'hidden md:block' : ''}`}>
        <div className="border-b border-[#eee8dd] p-4"><label className="sr-only" htmlFor="conversation-search">Search conversations</label><div className="flex items-center gap-2 rounded-xl bg-[#f7f5ef] px-3"><MessageCircle size={16} className="text-[#779080]" /><input id="conversation-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" className="min-w-0 flex-1 bg-transparent py-3 text-sm text-[#174d37] outline-none placeholder:text-[#9aa69e]" data-testid="input-conversation-search" /></div></div>
        {conversations.isLoading ? <div className="space-y-3 p-4"><div className="skeleton h-16 rounded-xl" /><div className="skeleton h-16 rounded-xl" /><div className="skeleton h-16 rounded-xl" /></div>
          : !list.length ? <div className="p-6 text-center"><Store className="mx-auto text-[#89a895]" size={26} /><h2 className="mt-3 text-sm font-bold text-[#164d38]">{search ? 'No conversations found' : 'No conversations yet'}</h2><p className="mt-1 text-xs leading-relaxed text-[#849188]">{search ? 'Try another name or keyword.' : 'Visit a local listing and use Message the owner to start one.'}</p><button type="button" onClick={() => setLocation('/search')} className={`${subtleButton} mt-4`} data-testid="button-find-businesses">Find a local business</button></div>
          : <div className="max-h-[620px] overflow-y-auto">{list.map((conversation) => <button key={conversation.id} type="button" onClick={() => chooseThread(conversation)} className={`focus-ring flex w-full items-center gap-3 border-b border-[#f1ede6] p-4 text-left transition hover:bg-[#f7faf5] ${conversation.id === selectedId ? 'bg-[#f2f8f2]' : ''}`} data-testid={`button-conversation-${conversation.id}`}>
            <Avatar name={conversation.otherUser.fullName} photo={conversation.otherUser.profilePhoto} />
            <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className="truncate text-sm text-[#174d37]" data-testid={`text-conversation-name-${conversation.id}`}>{conversation.otherUser.fullName}</strong><time className="shrink-0 text-[10px] text-[#96a097]">{conversation.lastMessageAt ? new Date(conversation.lastMessageAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}</time></span><span className="mt-1 block truncate text-xs text-[#829087]">{conversation.lastMessage?.body || 'Start a conversation'}</span></span>
            {conversation.unreadCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#f47716] px-1.5 text-[10px] font-bold text-white" data-testid={`text-unread-${conversation.id}`}>{conversation.unreadCount}</span>}
          </button>)}</div>}
      </aside>
      <section className={`${selectedId ? 'flex' : 'hidden md:flex'} min-h-[540px] flex-col`}>
        {selected ? <>
          <header className="flex items-center gap-3 border-b border-[#eee8dd] px-4 py-3 md:px-5">
            <button type="button" className="focus-ring rounded-full p-2 text-[#688274] md:hidden" onClick={() => { setSelectedId(null); setLocation('/messages'); }} aria-label="Back to conversations" data-testid="button-back-conversations"><ChevronLeft size={20} /></button>
            <Avatar name={selected.otherUser.fullName} photo={selected.otherUser.profilePhoto} size="h-10 w-10" />
            <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-bold text-[#174d37]" data-testid="text-selected-contact">{selected.otherUser.fullName}</h2><p className="text-[10px] capitalize text-[#829087]">{selected.otherUser.accountType.replaceAll('_', ' ')}</p></div>
            <details className="relative"><summary className="focus-ring flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full text-[#688274] hover:bg-[#f3f7f1]" aria-label="Conversation actions" data-testid="button-conversation-actions"><MoreHorizontal size={19} /></summary><div className="absolute right-0 top-10 z-20 w-48 rounded-xl border border-[#e5dfd3] bg-white p-1.5 shadow-lg"><button type="button" onClick={confirmReport} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-[#68584a] hover:bg-[#f8f5ef]" data-testid="button-report-conversation"><Flag size={14} />Report conversation</button>{blockedUserIds.has(selected.otherUser.id) ? <button type="button" onClick={confirmUnblock} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-[#087044] hover:bg-[#f4faf5]" data-testid="button-unblock-contact"><LockKeyhole size={14} />Unblock contact</button> : <button type="button" onClick={confirmBlock} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-[#a24430] hover:bg-[#fff0ed]" data-testid="button-block-contact"><LockKeyhole size={14} />Block contact</button>}</div></details>
          </header>
          {selected.contextType && <div className="border-b border-[#f0ece4] bg-[#fbfaf6] px-5 py-2 text-[10px] text-[#728176]">About this {selected.contextType.replaceAll('_', ' ')}</div>}
          <div className="flex-1 space-y-3 overflow-y-auto bg-[#fcfbf7] px-4 py-5 md:px-7" aria-live="polite" data-testid={`list-messages-${selected.id}`}>
            {conversationMessages.isLoading ? <div className="space-y-3"><div className="skeleton ml-auto h-12 w-2/3 rounded-2xl" /><div className="skeleton h-12 w-1/2 rounded-2xl" /><div className="skeleton ml-auto h-12 w-1/3 rounded-2xl" /></div>
              : conversationMessages.isError ? <div className="text-center"><InlineNotice tone="error">Messages could not be loaded.</InlineNotice><button type="button" onClick={() => void conversationMessages.refetch()} className={`${subtleButton} mt-3`} data-testid="button-retry-messages">Try again</button></div>
                : !messages.length ? <p className="mx-auto mt-20 max-w-xs text-center text-xs leading-relaxed text-[#89948c]" data-testid="text-empty-thread">A good conversation starts with a thoughtful question.</p>
                  : messages.map((message) => <MessageBubble key={message.id} message={message} onDelete={() => { if (window.confirm('Delete this message?')) removeMessage.mutate({ id: message.id }, { onSuccess: invalidateThread }); }} deleting={removeMessage.isPending} />)}
            {conversationMessages.data?.typing && <p className="text-xs italic text-[#8b9a8f]" data-testid="status-contact-typing">{selected.otherUser.fullName} is typing…</p>}
          </div>
          <form onSubmit={sendMessage} className="flex items-end gap-2 border-t border-[#eee8dd] bg-white p-3 md:p-4">
            <label className="sr-only" htmlFor="message-compose">Write a message</label><textarea id="message-compose" rows={1} maxLength={4000} value={draft} onChange={(event) => { setDraft(event.target.value); setTypingState(Boolean(event.target.value)); window.clearTimeout(typingTimer.current); typingTimer.current = window.setTimeout(() => setTypingState(false), 1700); }} onBlur={() => setTypingState(false)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Write a message…" className="max-h-32 min-h-11 flex-1 resize-y rounded-2xl border border-[#e5dfd3] bg-[#fcfbf7] px-4 py-3 text-sm text-[#174d37] outline-none focus:border-[#087044]" data-testid="input-message-compose" />
            <button type="submit" disabled={!draft.trim() || send.isPending} className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#087044] text-white disabled:opacity-50" aria-label="Send message" data-testid="button-send-message">{send.isPending ? <span className="h-4 w-4 animate-pulse rounded-full bg-white" /> : <Send size={17} />}</button>
          </form>
        </> : <div className="flex flex-1 flex-col items-center justify-center p-8 text-center"><span className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-[#e4f3e7] text-[#087044]"><MessageCircle size={27} /></span><h2 className="mt-4 font-display text-xl font-extrabold text-[#164d38]">Your neighborhood, in conversation</h2><p className="mt-2 max-w-sm text-sm leading-relaxed text-[#77867c]">Choose a thread to continue—or open any listing to ask its owner a question.</p></div>}
      </section>
    </div>
  </main>;
}

function MessageBubble({ message, onDelete, deleting }: { message: ChatMessage; onDelete: () => void; deleting: boolean }) {
  return <div className={`group flex ${message.isMine ? 'justify-end' : 'justify-start'}`} data-testid={`message-${message.id}`}>
    <div className={`max-w-[85%] rounded-[20px] px-4 py-3 md:max-w-[72%] ${message.isMine ? 'rounded-br-md bg-[#087044] text-white' : 'rounded-bl-md border border-[#ece7dd] bg-white text-[#345342]'}`}>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.deletedAt ? 'This message was removed.' : message.body}</p>
      <div className={`mt-1.5 flex items-center justify-end gap-2 text-[9px] ${message.isMine ? 'text-[#d1eed9]' : 'text-[#97a198]'}`}><time>{new Date(message.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</time>{message.isMine && <span aria-label={message.status} data-testid={`status-message-${message.id}`}>{message.status === 'read' ? 'Read' : message.status === 'delivered' ? 'Delivered' : 'Sent'}</span>}</div>
    </div>
    {message.isMine && !message.deletedAt && <button type="button" onClick={onDelete} disabled={deleting} aria-label="Delete message" className="focus-ring ml-1 self-center rounded-full p-1 text-[#9b9e91] opacity-0 transition group-hover:opacity-100 focus:opacity-100" data-testid={`button-delete-message-${message.id}`}><Trash2 size={14} /></button>}
  </div>;
}

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const profile = useGetProfile({ query: { queryKey: ['/api/profile'], retry: false } });
  useLiveRefresh(Boolean(profile.data?.id));
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState('');
  const params = useMemo(() => ({ page, limit: 20 }), [page]);
  const notifications = useListNotifications(params, { query: { queryKey: getListNotificationsQueryKey(params), refetchOnMount: 'always', refetchInterval: 60000 } });
  const count = useGetNotificationUnreadCount({ query: { queryKey: getGetNotificationUnreadCountQueryKey(), refetchOnMount: 'always', refetchInterval: 60000 } });
  const preferences = useGetNotificationPreferences({ query: { queryKey: getGetNotificationPreferencesQueryKey(), refetchOnMount: 'always' } });
  const markOne = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const savePreferences = useUpdateNotificationPreferences();
  const invalidateNotifications = () => {
    void queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetNotificationUnreadCountQueryKey() });
  };
  const togglePreference = (key: keyof NotificationPreferences, checked: boolean) => savePreferences.mutate({ data: { [key]: checked } }, {
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getGetNotificationPreferencesQueryKey() }); setNotice('Notification preferences saved.'); },
    onError: () => setNotice('Your preference could not be saved.'),
  });
  const rows = notifications.data?.notifications ?? [];
  return <main className={pageShell}>
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className={eyebrow}>Your neighborhood, in the loop</p><h1 className={`${heading} mt-1`}>Notifications</h1><p className={`mt-1 ${quiet}`}>Updates that bring you back to what matters nearby.</p></div><span className="rounded-full bg-[#fff1df] px-3 py-1.5 text-[11px] font-bold text-[#995018]" data-testid="text-notification-unread-count">{count.data?.unreadCount ?? notifications.data?.unreadCount ?? 0} unread</span></div>
    {notice && <div className="mt-4"><InlineNotice tone={notice.includes('could not') ? 'error' : 'success'}>{notice}</InlineNotice></div>}
    {notifications.isError && <div className="mt-6 rounded-2xl bg-[#fff0ed] p-4 text-sm text-[#a24430]" role="alert">Notification history is unavailable. <button type="button" onClick={() => void notifications.refetch()} className="font-bold underline" data-testid="button-retry-notifications">Retry</button></div>}
    <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_310px]">
      <section className={panel}>
        <header className="flex items-center justify-between border-b border-[#eee8dd] px-4 py-4 md:px-5"><h2 className="font-display text-lg font-extrabold text-[#164d38]">Recent activity</h2><button type="button" disabled={markAll.isPending || !(count.data?.unreadCount ?? notifications.data?.unreadCount)} onClick={() => markAll.mutate(undefined, { onSuccess: invalidateNotifications, onError: () => setNotice('Could not mark notifications as read.') })} className={subtleButton} data-testid="button-mark-all-read">{markAll.isPending ? 'Saving…' : 'Mark all read'}</button></header>
        {notifications.isLoading ? <div className="space-y-3 p-4"><div className="skeleton h-20 rounded-2xl" /><div className="skeleton h-20 rounded-2xl" /><div className="skeleton h-20 rounded-2xl" /></div>
          : rows.length ? <div>{rows.map((item) => <article key={item.id} className={`flex gap-3 border-b border-[#f1ede6] p-4 last:border-b-0 md:p-5 ${item.readAt ? '' : 'bg-[#fbfdf9]'}`} data-testid={`notification-${item.id}`}>
            <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] ${item.readAt ? 'bg-[#f2f0e9] text-[#7d8a80]' : 'bg-[#e4f3e7] text-[#087044]'}`}><Bell size={17} /></span>
            <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><h3 className="text-sm font-bold text-[#174d37]">{item.title}</h3>{!item.readAt && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#f47716]" aria-label="Unread" />}</div><p className="mt-1 text-xs leading-relaxed text-[#718177]">{item.message}</p><time className="mt-2 block text-[10px] text-[#a0a79f]">{new Date(item.createdAt).toLocaleString()}</time></div>
            {!item.readAt && <button type="button" aria-label={`Mark ${item.title} as read`} onClick={() => markOne.mutate({ id: item.id }, { onSuccess: invalidateNotifications, onError: () => setNotice('Could not mark this update as read.') })} disabled={markOne.isPending} className="focus-ring self-center rounded-full p-2 text-[#087044] hover:bg-[#e8f5ed]" data-testid={`button-mark-read-${item.id}`}><Check size={17} /></button>}
          </article>)}</div>
            : <div className="px-6 py-14 text-center"><CheckCheck className="mx-auto text-[#78a58a]" size={30} /><h3 className="mt-3 font-display text-lg font-extrabold text-[#164d38]">All caught up</h3><p className="mt-1 text-xs text-[#7b897f]" data-testid="text-notifications-empty">New messages, reviews, and neighborhood updates will land here.</p></div>}
        {notifications.data?.hasMore && <div className="border-t border-[#eee8dd] p-4 text-center"><button type="button" onClick={() => setPage((value) => value + 1)} className={subtleButton} data-testid="button-more-notifications">Load older updates</button></div>}
      </section>
      <section className={`${panel} p-4 md:p-5`}>
        <div className="flex items-center gap-2"><Settings2 size={17} className="text-[#087044]" /><h2 className="font-display text-lg font-extrabold text-[#164d38]">What reaches you</h2></div>
        <p className="mt-1 text-xs leading-relaxed text-[#7b897f]">Choose which ShopNear updates appear in your inbox.</p>
        {preferences.isLoading ? <div className="mt-5 space-y-3"><div className="skeleton h-9 rounded-xl" /><div className="skeleton h-9 rounded-xl" /><div className="skeleton h-9 rounded-xl" /></div>
          : preferences.isError ? <div className="mt-4 text-xs text-[#a24430]" role="alert">Preferences could not load. <button type="button" onClick={() => void preferences.refetch()} className="font-bold underline" data-testid="button-retry-preferences">Retry</button></div>
            : <div className="mt-4 divide-y divide-[#f0ece4]">{(Object.entries({ messages: 'Messages', favorites: 'Favorites', verification: 'Verification', reviews: 'Reviews', ratings: 'Ratings', announcements: 'Announcements', accountActivity: 'Account activity' }) as [keyof NotificationPreferences, string][]).map(([key, label]) => <label key={key} className="flex cursor-pointer items-center justify-between gap-3 py-3 text-xs font-semibold text-[#46604e]"><span>{label}</span><input type="checkbox" checked={preferences.data?.[key] ?? true} onChange={(event) => togglePreference(key, event.target.checked)} disabled={savePreferences.isPending} className="h-4 w-4 accent-[#087044]" data-testid={`toggle-notification-${key}`} /></label>)}</div>}
      </section>
    </div>
  </main>;
}

function StarPicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <fieldset><legend className="mb-2 text-xs font-bold text-[#4d715f]">Your rating</legend><div className="flex gap-1">{[1, 2, 3, 4, 5].map((star) => <button type="button" key={star} aria-label={`${star} ${star === 1 ? 'star' : 'stars'}`} aria-pressed={value === star} onClick={() => onChange(star)} className="focus-ring rounded-lg p-1" data-testid={`button-rating-${star}`}><Star size={25} fill={value >= star ? '#f3a820' : 'none'} className={value >= star ? 'text-[#f3a820]' : 'text-[#c9c9bd]'} /></button>)}</div></fieldset>;
}

export function ListingReviews({ targetType, targetId }: { targetType: ReviewTargetType; targetId: string }) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const profile = useGetProfile({ query: { queryKey: ['/api/profile'], retry: false } });
  const summary = useGetRatingSummary(targetType, targetId, { query: { queryKey: getGetRatingSummaryQueryKey(targetType, targetId), refetchOnMount: 'always' } });
  const params = useMemo(() => ({ targetType, targetId, page: 1, limit: 30 }), [targetType, targetId]);
  const reviews = useListReviews(params, { query: { queryKey: getListReviewsQueryKey(params), refetchOnMount: 'always' } });
  const myParams = useMemo(() => ({ targetType, targetId }), [targetType, targetId]);
  const myReview = useGetMyReview(myParams, { query: { queryKey: getGetMyReviewQueryKey(myParams), enabled: Boolean(profile.data?.id && profile.data.accountType === 'customer') } });
  const create = useCreateReview();
  const update = useUpdateReview();
  const remove = useDeleteReview();
  const report = useReportReview();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState('');
  const mine = myReview.data?.review ?? null;
  useEffect(() => {
    if (!mine || editing) return;
    setRating(mine.rating); setComment(mine.comment ?? '');
  }, [mine, editing]);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: getListReviewsQueryKey(params) });
    void queryClient.invalidateQueries({ queryKey: getGetRatingSummaryQueryKey(targetType, targetId) });
    void queryClient.invalidateQueries({ queryKey: getGetMyReviewQueryKey(myParams) });
  };
  const submitReview = (event: FormEvent) => {
    event.preventDefault();
    const data = { rating, comment: comment.trim() || null };
    if (mine) update.mutate({ id: mine.id, data }, { onSuccess: () => { setEditing(false); setNotice('Your review has been updated.'); refresh(); }, onError: () => setNotice('Could not save your review.') });
    else create.mutate({ data: { targetType, targetId, ...data } }, { onSuccess: () => { setEditing(false); setNotice('Thanks for sharing your experience.'); refresh(); }, onError: () => setNotice('Could not add your review. Sign in as a customer to continue.') });
  };
  const beginEdit = () => { if (mine) { setRating(mine.rating); setComment(mine.comment ?? ''); } setEditing(true); };
  const deleteMine = () => {
    if (!mine || !window.confirm('Delete your review? This cannot be undone.')) return;
    remove.mutate({ id: mine.id }, { onSuccess: () => { setRating(5); setComment(''); setEditing(false); setNotice('Your review has been deleted.'); refresh(); }, onError: () => setNotice('Could not delete your review.') });
  };
  const reportOther = (review: Review) => {
    const reason = window.prompt('Why are you reporting this review?');
    if (!reason?.trim()) return;
    report.mutate({ id: review.id, data: { reason: reason.trim(), details: null } }, { onSuccess: () => { setNotice('Review report submitted.'); void queryClient.invalidateQueries({ queryKey: getListContentReportsQueryKey() }); }, onError: () => setNotice('Could not submit this report.') });
  };
  const score = summary.data;
  return <section className="mt-9" aria-labelledby={`reviews-heading-${targetId}`}>
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className={eyebrow}>From the neighborhood</p><h2 id={`reviews-heading-${targetId}`} className="mt-1 font-display text-2xl font-extrabold tracking-[-.04em] text-[#164d38]">Ratings & reviews</h2></div>{score && <div className="flex items-center gap-2 rounded-2xl bg-[#fff5df] px-3 py-2" data-testid={`rating-summary-${targetId}`}><Star size={19} fill="#f3a820" className="text-[#f3a820]" /><strong className="font-display text-xl text-[#704d18]">{score.averageRating.toFixed(1)}</strong><span className="text-[10px] text-[#8c7956]">{score.ratingCount} {score.ratingCount === 1 ? 'review' : 'reviews'}</span></div>}</div>
    {score && <div className="mt-4 max-w-lg space-y-1.5" data-testid={`rating-distribution-${targetId}`}>{[5, 4, 3, 2, 1].map((star) => { const total = score.ratingCount ? score.distribution[String(star) as keyof typeof score.distribution] / score.ratingCount * 100 : 0; return <div key={star} className="flex items-center gap-2 text-[10px] text-[#7e8b80]"><span className="w-7">{star} star</span><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#ece9df]"><span className="block h-full rounded-full bg-[#e9aa32]" style={{ width: `${total}%` }} /></span><span className="w-6 text-right">{score.distribution[String(star) as keyof typeof score.distribution]}</span></div>; })}</div>}
    {notice && <div className="mt-4"><InlineNotice tone={notice.startsWith('Could') ? 'error' : 'success'}>{notice}</InlineNotice></div>}
    {profile.isLoading ? <div className="skeleton mt-5 h-28 rounded-[22px]" /> : !profile.data ? <div className="mt-5 rounded-[22px] border border-dashed border-[#dce6dc] bg-[#f9fbf8] p-4"><p className="text-xs text-[#718177]">Sign in to leave a review of this listing.</p><button type="button" onClick={() => setLocation('/auth')} className={`${subtleButton} mt-3`} data-testid={`button-sign-in-review-${targetId}`}>Sign in to review</button></div>
      : profile.data.accountType !== 'customer' ? <p className="mt-5 rounded-xl bg-[#f7f5ef] p-3 text-xs text-[#7a887e]">Customer reviews are available to customer accounts.</p>
        : <form onSubmit={submitReview} className="mt-5 rounded-[22px] border border-[#e9e4d9] bg-[#fffefa] p-4 md:p-5" data-testid={`form-review-${targetId}`}>
          <div className="flex items-start justify-between gap-3"><div><h3 className="font-display text-base font-extrabold text-[#164d38]">{mine ? editing ? 'Edit your review' : 'Your review' : 'Share your experience'}</h3><p className="mt-1 text-[10px] text-[#89948c]">One honest review per listing. You can change it any time.</p></div>{mine && !editing && <button type="button" onClick={beginEdit} className={subtleButton} data-testid={`button-edit-review-${mine.id}`}>Edit review</button>}</div>
          {(!mine || editing) && <><div className="mt-4"><StarPicker value={rating} onChange={setRating} /></div><label className="mt-4 block text-xs font-bold text-[#4d715f]">A few words <span className="font-normal text-[#909b92]">(optional)</span><textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} rows={3} placeholder="What should a neighbor know?" className={`${input} mt-2 resize-y`} data-testid={`input-review-comment-${targetId}`} /></label><div className="mt-3 flex flex-wrap gap-2"><button type="submit" disabled={create.isPending || update.isPending} className={button} data-testid={`button-submit-review-${targetId}`}>{create.isPending || update.isPending ? 'Saving…' : mine ? 'Save changes' : 'Post review'}</button>{mine && <button type="button" onClick={() => { setEditing(false); setRating(mine.rating); setComment(mine.comment ?? ''); }} className={subtleButton} data-testid={`button-cancel-review-${targetId}`}>Cancel</button>}</div></>}
          {mine && !editing && <div className="mt-3 flex items-center justify-between gap-3"><p className="text-sm text-[#5a715f]">{'★'.repeat(mine.rating)}<span className="ml-2 text-xs">{mine.comment || 'No written comment.'}</span></p><button type="button" onClick={deleteMine} disabled={remove.isPending} className="focus-ring rounded-full p-2 text-[#a24430] hover:bg-[#fff0ed]" aria-label="Delete your review" data-testid={`button-delete-review-${mine.id}`}><Trash2 size={16} /></button></div>}
        </form>}
    <div className="mt-5 space-y-3">
      {reviews.isLoading ? <><div className="skeleton h-24 rounded-[22px]" /><div className="skeleton h-24 rounded-[22px]" /></>
        : reviews.isError ? <div className="rounded-xl bg-[#fff0ed] p-4 text-xs text-[#a24430]" role="alert">Reviews could not be loaded. <button type="button" onClick={() => void reviews.refetch()} className="font-bold underline" data-testid={`button-retry-reviews-${targetId}`}>Retry</button></div>
          : (reviews.data?.reviews ?? []).length === 0 ? <div className="rounded-[22px] border border-dashed border-[#dce6dc] bg-[#f9fbf8] p-6 text-center"><Star className="mx-auto text-[#d4a53c]" size={24} /><p className="mt-2 text-sm font-semibold text-[#42634f]">Be the first neighbor to review</p><p className="mt-1 text-xs text-[#849188]">A helpful note can make someone’s next local choice easier.</p></div>
            : reviews.data?.reviews.map((review) => <ReviewCard key={review.id} review={review} isMine={review.author.id === profile.data?.id} onReport={() => reportOther(review)} />)}
    </div>
  </section>;
}

function ReviewCard({ review, isMine, onReport }: { review: Review; isMine: boolean; onReport: () => void }) {
  return <article className="rounded-[22px] border border-[#ebe5da] bg-white p-4 md:p-5" data-testid={`review-${review.id}`}>
    <div className="flex items-start gap-3"><Avatar name={review.author.fullName} photo={review.author.profilePhoto} size="h-10 w-10" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><strong className="text-sm text-[#174d37]">{review.author.fullName}</strong>{review.verifiedCustomer && <span className="rounded-full bg-[#e4f3e7] px-2 py-0.5 text-[9px] font-bold text-[#087044]">Verified customer</span>}</div><time className="mt-0.5 block text-[10px] text-[#929d94]">{new Date(review.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</time></div><div aria-label={`${review.rating} out of 5 stars`} className="shrink-0 text-sm tracking-[-.08em] text-[#e7a629]" data-testid={`text-review-rating-${review.id}`}>{'★'.repeat(review.rating)}<span className="text-[#ddd9ca]">{'★'.repeat(5 - review.rating)}</span></div></div>
    {review.comment && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[#596e60]">{review.comment}</p>}
    {!isMine && <button type="button" onClick={onReport} className="focus-ring mt-3 inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#9a7160] hover:text-[#a24430]" data-testid={`button-report-review-${review.id}`}><Flag size={12} />Report review</button>}
  </article>;
}

export function ListingMessageAction({ targetType, targetId, label = 'Message the owner' }: { targetType: 'business' | 'product' | 'service'; targetId: string; label?: string }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const profile = useGetProfile({ query: { queryKey: ['/api/profile'], retry: false } });
  const create = useCreateChatConversation();
  const [error, setError] = useState('');
  const start = () => {
    if (!profile.data) { setLocation('/auth'); return; }
    create.mutate({ data: { targetType, targetId } }, {
      onSuccess: (conversation) => {
        void queryClient.invalidateQueries({ queryKey: getListChatConversationsQueryKey() });
        setLocation(`/messages?conversation=${encodeURIComponent(conversation.id)}`);
      },
      onError: () => setError('Could not open a conversation. Please try again.'),
    });
  };
  return <span><button type="button" onClick={start} disabled={create.isPending || profile.isLoading} className={`${button} inline-flex items-center gap-2`} data-testid={`button-message-owner-${targetType}-${targetId}`}><MessageCircle size={15} />{create.isPending ? 'Opening…' : label}</button>{error && <span role="alert" className="ml-2 text-[10px] text-[#a24430]">{error}</span>}</span>;
}

export function AdminModerationPage() {
  const queryClient = useQueryClient();
  const profile = useGetProfile({ query: { queryKey: ['/api/profile'], retry: false } });
  const [tab, setTab] = useState<'reports' | 'reviews' | 'announcement'>('reports');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const reports = useListContentReports({ page: 1, limit: 50 }, { query: { queryKey: getListContentReportsQueryKey({ page: 1, limit: 50 }), enabled: profile.data?.accountType === 'admin', refetchOnMount: 'always' } });
  const reviews = useListAdminReviews({ page: 1, limit: 50 }, { query: { queryKey: getListAdminReviewsQueryKey({ page: 1, limit: 50 }), enabled: profile.data?.accountType === 'admin', refetchOnMount: 'always' } });
  const moderate = useModerateReview();
  const resolve = useUpdateContentReport();
  const announce = useCreateNotificationAnnouncement();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: getListContentReportsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListAdminReviewsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListReviewsQueryKey() });
    void queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0] ?? '').startsWith('/api/ratings/') });
  };
  const submitAnnouncement = (event: FormEvent) => {
    event.preventDefault();
    announce.mutate({ data: { title: title.trim(), message: message.trim() } }, { onSuccess: (result) => { setStatus(`Announcement sent to ${result.created} neighbors.`); setTitle(''); setMessage(''); }, onError: () => setStatus('Announcement could not be sent.') });
  };
  if (profile.isLoading) return <main className={pageShell}><div className="skeleton h-9 w-64 rounded-xl" /><div className="skeleton mt-6 h-72 rounded-[24px]" /></main>;
  if (profile.data?.accountType !== 'admin') return <main className={pageShell}><p className={eyebrow}>ShopNear operations</p><h1 className={`${heading} mt-1`}>Moderation</h1><section className={`${panel} mt-6 p-8 text-center`}><Shield className="mx-auto text-[#087044]" size={28} /><h2 className="mt-3 font-display text-xl font-extrabold text-[#164d38]">Admin access required</h2><p className={`mt-2 ${quiet}`}>This space is only available to ShopNear administrators.</p></section></main>;
  return <main className={pageShell}>
    <p className={eyebrow}>ShopNear operations</p><h1 className={`${heading} mt-1`}>Moderation desk</h1><p className={`mt-1 ${quiet}`}>Keep neighborhood conversations and reviews useful, safe, and fair.</p>
    {status && <div className="mt-4"><InlineNotice tone={status.includes('could not') ? 'error' : 'success'}>{status}</InlineNotice></div>}
    <div role="tablist" aria-label="Moderation sections" className="mt-6 flex flex-wrap gap-2">{([['reports', 'Reports'], ['reviews', 'Reviews'], ['announcement', 'Announcement']] as const).map(([key, label]) => <button type="button" role="tab" aria-selected={tab === key} key={key} onClick={() => setTab(key)} className={`focus-ring rounded-full px-4 py-2.5 text-xs font-bold ${tab === key ? 'bg-[#087044] text-white' : 'border border-[#dce6dc] bg-white text-[#688274]'}`} data-testid={`tab-moderation-${key}`}>{label}</button>)}</div>
    {tab === 'reports' && <section className={`${panel} mt-4 overflow-hidden`}><div className="border-b border-[#eee8dd] p-4"><h2 className="font-display text-lg font-extrabold text-[#164d38]">Content reports</h2><p className="mt-1 text-xs text-[#829087]">Review conversation and review reports filed by neighbors.</p></div>
      {reports.isLoading ? <div className="space-y-3 p-4"><div className="skeleton h-20 rounded-xl" /><div className="skeleton h-20 rounded-xl" /></div> : reports.isError ? <div className="p-5 text-sm text-[#a24430]" role="alert">Reports could not load. <button type="button" onClick={() => void reports.refetch()} className="font-bold underline" data-testid="button-retry-reports">Retry</button></div> : !reports.data?.reports.length ? <p className="p-8 text-center text-sm text-[#829087]" data-testid="text-no-reports">No open reports. The neighborhood is looking good.</p>
        : reports.data.reports.map((report) => <article key={report.id} className="flex flex-col gap-3 border-b border-[#f1ede6] p-4 md:flex-row md:items-center" data-testid={`moderation-report-${report.id}`}><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#fff1df] px-2 py-1 text-[9px] font-bold uppercase text-[#995018]">{report.entityType}</span><span className="text-xs font-bold capitalize text-[#45614f]">{report.reason}</span><span className="text-[10px] text-[#9aa49b]">{report.status}</span></div><p className="mt-1 text-xs text-[#77867c]">{report.details || 'No additional details provided.'}</p><p className="mt-1 text-[9px] text-[#a0a79f]">Filed {new Date(report.createdAt).toLocaleString()} · ref {report.entityId}</p></div>{report.status === 'open' && <div className="flex gap-2"><button type="button" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: report.id, data: { status: 'resolved' } }, { onSuccess: refresh, onError: () => setStatus('Could not resolve the report.') })} className={subtleButton} data-testid={`button-resolve-report-${report.id}`}>Resolve</button><button type="button" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: report.id, data: { status: 'dismissed' } }, { onSuccess: refresh, onError: () => setStatus('Could not dismiss the report.') })} className="focus-ring rounded-full border border-[#efded8] px-3.5 py-2 text-xs font-bold text-[#a24430]" data-testid={`button-dismiss-report-${report.id}`}>Dismiss</button></div>}</article>)}</section>}
    {tab === 'reviews' && <section className={`${panel} mt-4 overflow-hidden`}><div className="border-b border-[#eee8dd] p-4"><h2 className="font-display text-lg font-extrabold text-[#164d38]">Public reviews</h2><p className="mt-1 text-xs text-[#829087]">Hide reviews that violate the community guidelines, or restore them.</p></div>
      {reviews.isLoading ? <div className="space-y-3 p-4"><div className="skeleton h-20 rounded-xl" /><div className="skeleton h-20 rounded-xl" /></div> : reviews.isError ? <div className="p-5 text-sm text-[#a24430]" role="alert">Reviews could not load. <button type="button" onClick={() => void reviews.refetch()} className="font-bold underline" data-testid="button-retry-admin-reviews">Retry</button></div> : !reviews.data?.reviews.length ? <p className="p-8 text-center text-sm text-[#829087]">No reviews in this queue.</p>
        : reviews.data.reviews.map((review) => <article key={review.id} className="flex flex-col gap-3 border-b border-[#f1ede6] p-4 md:flex-row md:items-center" data-testid={`moderation-review-${review.id}`}><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-[#174d37]">{review.author.fullName}</strong><span className="text-sm tracking-[-.08em] text-[#e7a629]">{'★'.repeat(review.rating)}</span><span className="rounded-full bg-[#f2f0e9] px-2 py-0.5 text-[9px] capitalize text-[#78867c]">{review.moderationStatus}</span></div><p className="mt-1 text-xs leading-relaxed text-[#718177]">{review.comment || 'No written comment.'}</p><p className="mt-1 text-[9px] text-[#a0a79f]">{review.targetType} · {review.targetId} · {new Date(review.createdAt).toLocaleDateString()}</p></div><button type="button" disabled={moderate.isPending} onClick={() => moderate.mutate({ id: review.id, data: { moderationStatus: review.moderationStatus === 'visible' ? 'hidden' : 'visible' } }, { onSuccess: refresh, onError: () => setStatus('Could not update this review.') })} className={review.moderationStatus === 'visible' ? 'focus-ring rounded-full border border-[#efded8] px-3.5 py-2 text-xs font-bold text-[#a24430]' : subtleButton} data-testid={`button-moderate-review-${review.id}`}>{review.moderationStatus === 'visible' ? 'Hide review' : 'Restore review'}</button></article>)}</section>}
    {tab === 'announcement' && <section className={`${panel} mt-4 max-w-2xl p-5`}><h2 className="font-display text-lg font-extrabold text-[#164d38]">Send a neighborhood announcement</h2><p className="mt-1 text-xs text-[#829087]">Announcements create a persistent notification for ShopNear members.</p><form onSubmit={submitAnnouncement} className="mt-5 space-y-4"><label className="block text-xs font-bold text-[#4d715f]">Headline<input required minLength={2} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} className={`${input} mt-2`} placeholder="A note from ShopNear" data-testid="input-announcement-title" /></label><label className="block text-xs font-bold text-[#4d715f]">Message<textarea required minLength={2} maxLength={1000} rows={5} value={message} onChange={(event) => setMessage(event.target.value)} className={`${input} mt-2 resize-y`} placeholder="Share a useful marketplace update…" data-testid="input-announcement-message" /></label><button type="submit" disabled={announce.isPending} className={button} data-testid="button-send-announcement">{announce.isPending ? 'Sending…' : 'Send announcement'}</button></form></section>}
  </main>;
}