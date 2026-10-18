import { ChevronDown, CircleHelp, Inbox, LogOut, Send, Settings2, SquarePen } from 'lucide-react';
import type { User } from '../types/api';

interface SidebarProps {
  user: User;
  activeFolder: 'scheduled' | 'sent';
  counts: { scheduled: number; sent: number };
  onChangeFolder: (folder: 'scheduled' | 'sent') => void;
  onCompose: () => void;
  onLogout: () => void;
  onSlackConnect: () => void;
  slackConnected: boolean;
  slackTeamName: string | null;
  onSlackDisconnect: () => void;
}

export function Sidebar({ user, activeFolder, counts, onChangeFolder, onCompose, onLogout, onSlackConnect, slackConnected, slackTeamName, onSlackDisconnect }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand-mark"><span>O</span>MB</div>
      <button className="profile-button" type="button" onClick={onLogout} title="Logout">
        <span className="avatar-wrap">
          {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <span>{user.name.slice(0, 1).toUpperCase()}</span>}
        </span>
        <span className="profile-copy"><strong>{user.name}</strong><small>{user.email}</small></span>
        <ChevronDown size={14} />
      </button>
      <button className="compose-button" type="button" onClick={onCompose}><SquarePen size={15} />Compose</button>
      <div className="sidebar-section-label">CORE</div>
      <nav className="folder-nav" aria-label="Mailbox folders">
        <button className={activeFolder === 'scheduled' ? 'folder-link active' : 'folder-link'} onClick={() => onChangeFolder('scheduled')} type="button">
          <Inbox size={16} /><span>Scheduled</span><span className="folder-count">{counts.scheduled}</span>
        </button>
        <button className={activeFolder === 'sent' ? 'folder-link active' : 'folder-link'} onClick={() => onChangeFolder('sent')} type="button">
          <Send size={15} /><span>Sent</span><span className="folder-count">{counts.sent}</span>
        </button>
      </nav>
      <div className="sidebar-bottom">
        {slackConnected ? <button type="button" className="quiet-nav slack-nav connected" onClick={onSlackDisconnect}><span className="connection-dot" /><Settings2 size={15} />Slack connected{slackTeamName ? ` · ${slackTeamName}` : ''}</button> : <button type="button" className="quiet-nav slack-nav" onClick={onSlackConnect}><span className="connection-dot offline" /><Settings2 size={15} />Connect Slack</button>}
        <a className="quiet-nav" href="mailto:support@reachinbox.ai"><CircleHelp size={15} />Help</a>
        <button type="button" className="quiet-nav logout-link" onClick={onLogout}><LogOut size={15} />Log out</button>
      </div>
    </aside>
  );
}
