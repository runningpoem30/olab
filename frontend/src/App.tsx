import { useCallback, useEffect, useState } from 'react';
import { Inbox as InboxIcon, LogOut } from 'lucide-react';
import { Compose } from './components/Compose';
import { EmailDetail } from './components/EmailDetail';
import { Inbox } from './components/Inbox';
import { Login } from './components/Login';
import { Sidebar } from './components/Sidebar';
import { disconnectSlack, getCurrentUser, getEmails, getSenders, getSlackConnection, logout, scheduleEmails } from './lib/api';
import type { EmailRecord, Sender, User } from './types/api';

let searchTimer = 0;

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [folder, setFolder] = useState<'scheduled' | 'sent'>('scheduled');
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [counts, setCounts] = useState({ scheduled: 0, sent: 0 });
  const [senders, setSenders] = useState<Sender[]>([]);
  const [slackConnected, setSlackConnected] = useState(false);
  const [slackTeamName, setSlackTeamName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'inbox' | 'compose' | 'detail'>('inbox');
  const [selectedEmail, setSelectedEmail] = useState<EmailRecord | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const loginMessage = new URLSearchParams(window.location.search).get('error');
  const slackStatus = new URLSearchParams(window.location.search).get('slack');

  useEffect(() => {
    let active = true;
    getCurrentUser().then((current) => {
      if (!active) return;
      setUser(current);
      void getSenders().then((items) => { if (active) setSenders(items); }).catch(() => undefined);
      void getSlackConnection().then((connection) => {
        if (!active) return;
        setSlackConnected(connection.connected);
        setSlackTeamName(connection.teamName);
      }).catch(() => undefined);
    }).catch((reason: unknown) => {
      if (active && reason instanceof TypeError) setAuthError('Backend unavailable. Start the API on port 3001, then reload.');
    }).finally(() => { if (active) setAuthLoading(false); });
    return () => { active = false; };
  }, []);

  const refreshEmails = useCallback(async (query = '') => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getEmails(folder, query);
      setEmails(result.data);
      if (!query) setCounts((previous) => ({ ...previous, [folder]: result.total }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load emails.');
      setEmails([]);
    } finally { setLoading(false); }
  }, [folder, user]);

  useEffect(() => { void refreshEmails(); }, [refreshEmails, refreshKey]);

  useEffect(() => {
    const scheduledRefresh = window.setInterval(() => setRefreshKey((key) => key + 1), 30_000);
    return () => window.clearInterval(scheduledRefresh);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function handleSlackDisconnect() {
    try {
      await disconnectSlack();
      setSlackConnected(false);
      setSlackTeamName(null);
      setToast('Slack disconnected.');
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : 'Unable to disconnect Slack.');
    }
  }

  async function handleLogout() {
    try { await logout(); } finally { setUser(null); setView('inbox'); }
  }

  async function handleSchedule(request: Parameters<typeof scheduleEmails>[0]) {
    const result = await scheduleEmails(request);
    setToast(result.duplicate ? 'This schedule was already accepted.' : `${result.accepted} email${result.accepted === 1 ? '' : 's'} scheduled.`);
    void getSenders().then(setSenders).catch(() => undefined);
    setFolder('scheduled');
    setRefreshKey((key) => key + 1);
  }

  function openDetail(email: EmailRecord) {
    setSelectedEmail(email);
    setView('detail');
  }

  if (authLoading) return <div className="boot-screen"><span className="spinner" />Connecting to ReachInbox…</div>;
  if (!user) return <Login message={loginMessage ?? authError} />;

  return (
    <div className="app-frame">
      <Sidebar user={user} activeFolder={folder} counts={counts} onChangeFolder={(next) => { setFolder(next); setView('inbox'); }} onCompose={() => setView('compose')} onLogout={() => void handleLogout()} onSlackConnect={() => { window.location.href = '/auth/slack/connect'; }} slackConnected={slackConnected} slackTeamName={slackTeamName} onSlackDisconnect={() => void handleSlackDisconnect()} />
      <div className="workspace">
        {view === 'compose' ? <Compose user={user} senders={senders} onClose={() => setView('inbox')} onSchedule={handleSchedule} />
          : view === 'detail' && selectedEmail ? <EmailDetail email={selectedEmail} onBack={() => setView('inbox')} />
            : <Inbox folder={folder} emails={emails} loading={loading} error={error} onSearch={(query) => { window.clearTimeout(searchTimer); searchTimer = window.setTimeout(() => { void refreshEmails(query); }, 250); }} onRefresh={() => setRefreshKey((key) => key + 1)} onOpenEmail={openDetail} />}
      </div>
      {(toast || slackStatus) && <div className={slackStatus === 'error' ? 'toast error-toast' : 'toast'} role="status"><InboxIcon size={16} />{toast ?? (slackStatus === 'connected' ? `Slack connected${slackTeamName ? ` to ${slackTeamName}` : ''}.` : 'Slack could not be connected. Check app redirect URLs and try again.')}<button type="button" onClick={() => { setToast(null); if (slackStatus) window.history.replaceState({}, '', window.location.pathname); }} aria-label="Dismiss"><LogOut size={14} /></button></div>}
    </div>
  );
}
