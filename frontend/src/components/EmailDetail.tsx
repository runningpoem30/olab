import { ArrowLeft, Archive, MoreHorizontal, Star, Trash2 } from 'lucide-react';
import type { EmailRecord } from '../types/api';

interface EmailDetailProps {
  email: EmailRecord;
  onBack: () => void;
}

export function EmailDetail({ email, onBack }: EmailDetailProps) {
  const date = email.sentAt ?? email.scheduledAt;
  return (
    <main className="detail-page">
      <header className="detail-toolbar"><button type="button" className="icon-button back-icon" onClick={onBack} aria-label="Back to inbox"><ArrowLeft size={17} /></button><div className="detail-tools"><button type="button" className="icon-button" aria-label="Star email"><Star size={15} /></button><button type="button" className="icon-button" aria-label="Archive"><Archive size={15} /></button><button type="button" className="icon-button" aria-label="Delete"><Trash2 size={15} /></button><button type="button" className="icon-button" aria-label="More options"><MoreHorizontal size={17} /></button></div></header>
      <article className="message-detail">
        <h1>{email.subject || '(no subject)'}</h1>
        <div className="sender-details"><div className="sender-avatar">{email.sender.slice(0, 1).toUpperCase()}</div><div><strong>{email.sender}</strong><small>to {email.recipient}</small></div><time>{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(date))}</time></div>
        <div className="message-body">{email.body.split('\n').map((line, index) => <p key={`${index}-${line.slice(0, 8)}`}>{line || '\u00a0'}</p>)}</div>
        {email.status === 'FAILED' && email.failureReason && <div className="inline-error"><strong>Delivery failed</strong><span>{email.failureReason}</span></div>}
        {email.status === 'SCHEDULED' && <div className="detail-schedule-note">Scheduled for {new Date(email.scheduledAt).toLocaleString()}</div>}
      </article>
    </main>
  );
}
