import { useMemo, useState } from 'react';
import { Filter, RefreshCw, Search, Star } from 'lucide-react';
import type { EmailRecord } from '../types/api';

interface InboxProps {
  folder: 'scheduled' | 'sent';
  emails: EmailRecord[];
  loading: boolean;
  error: string | null;
  onSearch: (query: string) => void;
  onRefresh: () => void;
  onOpenEmail: (email: EmailRecord) => void;
}

function shortDate(date: string) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(value);
}

export function Inbox({ folder, emails, loading, error, onSearch, onRefresh, onOpenEmail }: InboxProps) {
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const title = folder === 'scheduled' ? 'Scheduled' : 'Sent';
  const filtered = useMemo(() => emails, [emails]);

  return (
    <section className="inbox-view">
      <header className="inbox-toolbar">
        <div className="search-wrap"><Search size={16} /><input aria-label="Search emails" value={query} onChange={(event) => { setQuery(event.target.value); onSearch(event.target.value); }} placeholder="Search" /></div>
        <button type="button" className={showFilters ? 'icon-button selected' : 'icon-button'} aria-label="Filter emails" onClick={() => setShowFilters(!showFilters)}><Filter size={15} /></button>
        <button type="button" className="icon-button" aria-label="Refresh emails" onClick={onRefresh}><RefreshCw size={15} /></button>
      </header>
      {showFilters && <div className="filter-note">Showing {folder === 'scheduled' ? 'scheduled and sending' : 'sent and failed'} messages</div>}
      {error && <div className="inline-error"><strong>Could not load {title.toLowerCase()} emails.</strong><span>{error}</span><button type="button" onClick={onRefresh}>Try again</button></div>}
      {loading ? <div className="inbox-state"><span className="spinner" />Loading {title.toLowerCase()} emails…</div>
        : !error && filtered.length === 0 ? <div className="empty-state"><div className="empty-icon"><Search size={22} /></div><h2>{query ? 'No matching emails' : `No ${title.toLowerCase()} emails yet`}</h2><p>{query ? 'Try another search term.' : folder === 'scheduled' ? 'Compose an email and schedule it to see it here.' : 'Emails will appear here after they are sent.'}</p></div>
          : <div className="email-list">{filtered.map((email) => (
            <button type="button" className="email-row" key={email.id} onClick={() => onOpenEmail(email)}>
              <span className="email-main"><span className="email-recipient">To: {email.recipient}</span><span className={`status-pill ${email.status.toLowerCase()}`}>{folder === 'scheduled' ? shortDate(email.scheduledAt) : email.status === 'SENT' && email.sentAt ? shortDate(email.sentAt) : email.status.toLowerCase()}</span><span className="email-subject">{email.subject || '(no subject)'}</span><span className="email-preview">— {email.body.replace(/\s+/g, ' ').slice(0, 90)}</span></span>
              <Star className="row-star" size={14} />
            </button>
          ))}</div>}
    </section>
  );
}
