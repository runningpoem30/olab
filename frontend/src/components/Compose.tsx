import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bold, Clock3, Italic, List, ListOrdered, Paperclip, Redo2, Send, Underline, Upload, Undo2 } from 'lucide-react';
import Papa from 'papaparse';
import type { ScheduleRequest, Sender, User } from '../types/api';

interface ComposeProps {
  user: User;
  onClose: () => void;
  onSchedule: (request: ScheduleRequest) => Promise<void>;
  senders: Sender[];
}

function extractEmails(input: string): string[] {
  return [...new Set(input.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)?.map((email) => email.toLowerCase()) ?? [])];
}

function localInputDate(date: Date) {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 16);
}

export function Compose({ user, onClose, onSchedule, senders }: ComposeProps) {
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState('');
  const [sender, setSender] = useState(user.defaultSender ?? senders[0]?.address ?? user.email);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [delaySeconds, setDelaySeconds] = useState(2);
  const [hourlyLimit, setHourlyLimit] = useState(200);
  const [scheduleAt, setScheduleAt] = useState(localInputDate(new Date()));
  const [laterMode, setLaterMode] = useState(false);
  const [sendLaterOpen, setSendLaterOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const validRecipients = useMemo(() => recipients.length + extractEmails(recipientInput).length, [recipients, recipientInput]);
  const canSubmit = validRecipients > 0 && subject.trim().length > 0 && body.trim().length > 0 && !submitting;

  function addTypedRecipients() {
    const found = extractEmails(recipientInput);
    setRecipients((previous) => [...new Set([...previous, ...found])]);
    setRecipientInput('');
  }

  async function uploadLeads(file?: File) {
    if (!file) return;
    const text = await file.text();
    const parsed = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true, transformHeader: (header) => header.trim().toLowerCase() });
    const emailColumn = parsed.meta.fields?.find((field) => ['email', 'email address', 'e-mail', 'recipient'].includes(field));
    const fromColumn = emailColumn
      ? parsed.data.flatMap((row) => typeof row[emailColumn] === 'string' ? extractEmails(row[emailColumn] as string) : [])
      : [];
    const found = [...new Set(fromColumn.length > 0 ? fromColumn : extractEmails(text))];
    if (found.length === 0) { setError('No email addresses were found in that file.'); return; }
    setRecipients((previous) => [...new Set([...previous, ...found])]);
    setError(null);
    if (parsed.errors.length > 0) console.info('Some CSV rows could not be parsed', parsed.errors);
  }

  async function submit(useLater = laterMode) {
    addTypedRecipients();
    const allRecipients = [...new Set([...recipients, ...extractEmails(recipientInput)])];
    if (allRecipients.length === 0) { setError('Add at least one recipient or upload a leads file.'); return; }
    if (!subject.trim() || !body.trim()) { setError('Subject and message body are required.'); return; }
    const scheduled = new Date(scheduleAt);
    if (Number.isNaN(scheduled.getTime())) { setError('Choose a valid start date and time.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      await onSchedule({
        sender,
        subject: subject.trim(),
        body: body.trim(),
        recipients: allRecipients,
        startAt: (useLater ? scheduled : new Date()).toISOString(),
        delayBetweenEmailsMs: Math.max(0, delaySeconds) * 1000,
        hourlyLimit: Math.max(1, hourlyLimit),
        idempotencyKey: crypto.randomUUID(),
      });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to schedule emails.');
    } finally { setSubmitting(false); }
  }

  function setPreset(hour: number, minute = 0) {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(hour, minute, 0, 0);
    setScheduleAt(localInputDate(date));
  }

  return (
    <main className="compose-page">
      <header className="compose-header">
        <button type="button" className="back-button" onClick={onClose}><ArrowLeft size={17} />Compose New Email</button>
        <div className="compose-actions">
          <button className="icon-button attach-action" type="button" aria-label="Upload list" onClick={() => fileInput.current?.click()}><Paperclip size={16} /><span>{recipients.length > 0 ? 1 : ''}</span></button>
          <button type="button" className="icon-button green-icon" aria-label="Choose send time" onClick={() => { setLaterMode(true); setSendLaterOpen((open) => !open); }}><Clock3 size={16} /></button>
          <button className="outline-green-button" type="button" onClick={() => { setLaterMode(true); setSendLaterOpen(true); }} disabled={!canSubmit}>Send Later</button>
        </div>
      </header>
      <section className="compose-form">
        <div className="compose-line from-line"><label>From</label><input className="sender-select" aria-label="Sender address" list="sender-addresses" value={sender} onChange={(event) => setSender(event.target.value)} /><datalist id="sender-addresses">{senders.map((item) => <option key={item.id} value={item.address}>{item.label ?? item.address}</option>)}{user.defaultSender && <option value={user.defaultSender} />}</datalist>{senders.length === 0 && <span className="sender-hint">Use an address permitted by your SMTP provider.</span>}</div>
        <div className="compose-line to-line"><label htmlFor="recipients">To</label><div className="recipient-control">
          <div className="recipient-chips">{recipients.slice(0, 3).map((email) => <button type="button" className="recipient-chip" key={email} onClick={() => setRecipients((list) => list.filter((item) => item !== email))}>{email}<span>×</span></button>)}{recipients.length > 3 && <span className="recipient-chip more-chip">+{recipients.length - 3}</span>}
            <input id="recipients" value={recipientInput} onChange={(event) => setRecipientInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); addTypedRecipients(); } }} onBlur={addTypedRecipients} placeholder={recipients.length ? 'Add recipient…' : 'recipient@example.com'} />
          </div>
          <button type="button" className="upload-link" onClick={() => fileInput.current?.click()}><Upload size={13} />Upload List</button>
          <input ref={fileInput} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={(event) => { void uploadLeads(event.target.files?.[0]); event.currentTarget.value = ''; }} />
        </div></div>
        <div className="recipient-count">{validRecipients > 0 ? `${validRecipients} recipient${validRecipients === 1 ? '' : 's'} detected` : ''}</div>
        <div className="compose-line subject-line"><label htmlFor="subject">Subject</label><input id="subject" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject" /></div>
        <div className="compose-settings"><label>Delay between 2 emails <input type="number" min="0" max="86400" value={delaySeconds} onChange={(event) => setDelaySeconds(Number(event.target.value))} aria-label="Delay between emails in seconds" /></label><label>Hourly Limit <input type="number" min="1" value={hourlyLimit} onChange={(event) => setHourlyLimit(Number(event.target.value))} aria-label="Hourly send limit" /></label></div>
        <div className="editor-shell"><div className="editor-placeholder">Type Your Reply…</div><div className="editor-toolbar" aria-label="Formatting toolbar"><button type="button" aria-label="Undo"><Undo2 /></button><button type="button" aria-label="Redo"><Redo2 /></button><i /><button type="button" aria-label="Bold"><Bold /></button><button type="button" aria-label="Italic"><Italic /></button><button type="button" aria-label="Underline"><Underline /></button><i /><button type="button" aria-label="Bulleted list"><List /></button><button type="button" aria-label="Numbered list"><ListOrdered /></button></div><textarea aria-label="Email body" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write your message…" /></div>
        {error && <div className="compose-error" role="alert">{error}</div>}
        {sendLaterOpen && <div className="send-later-popover"><h3>Send Later</h3><label htmlFor="schedule-time">Pick date &amp; time</label><input id="schedule-time" type="datetime-local" value={scheduleAt} min={localInputDate(new Date())} onChange={(event) => setScheduleAt(event.target.value)} /><div className="preset-title">Quick select</div><button type="button" onClick={() => setPreset(10)}>Tomorrow, 10:00 AM</button><button type="button" onClick={() => setPreset(11)}>Tomorrow, 11:00 AM</button><button type="button" onClick={() => setPreset(15)}>Tomorrow, 3:00 PM</button><div className="popover-actions"><button type="button" className="text-button" onClick={() => setSendLaterOpen(false)}>Cancel</button><button type="button" className="outline-green-button" onClick={() => { setLaterMode(true); void submit(true); }} disabled={!canSubmit}>{submitting ? 'Scheduling…' : 'Done'}</button></div></div>}
        <footer className="compose-footer"><span>{validRecipients} recipient{validRecipients === 1 ? '' : 's'}{laterMode ? ` · ${new Date(scheduleAt).toLocaleString()}` : ' · Send now'}</span><button type="button" className="solid-green-button" onClick={() => { setLaterMode(false); void submit(false); }} disabled={!canSubmit}><Send size={15} />{submitting ? 'Scheduling…' : 'Send'}</button></footer>
      </section>
    </main>
  );
}
