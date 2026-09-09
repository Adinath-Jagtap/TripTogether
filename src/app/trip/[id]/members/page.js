'use client';
import { useState } from 'react';
import { useTrip } from '../layout';
import { useToast } from '@/context/ToastContext';
import { Copy, Check, Trash2, Crown, Shield, User } from 'lucide-react';
import { getInitials, getAvatarColor } from '@/lib/utils';

export default function MembersPage() {
  const { trip, members, supabase, user, fetchTrip } = useTrip();
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const isOwner = trip?.owner_id === user?.id;

  const copyCode = () => {
    navigator.clipboard.writeText(trip?.invite_code);
    setCopied(true);
    toast.success('Invite code copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const removeMember = async (memberId) => {
    if (!confirm('Remove this member?')) return;
    await supabase.from('trip_members').delete().match({ trip_id: trip.id, user_id: memberId });
    toast.success('Member removed');
    fetchTrip();
  };

  const roleIcon = (role) => {
    if (role === 'owner') return <Crown size={14} style={{ color: 'var(--accent)' }} />;
    if (role === 'admin') return <Shield size={14} style={{ color: 'var(--info)' }} />;
    return <User size={14} style={{ color: 'var(--text-tertiary)' }} />;
  };

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>Members</h2>

      {/* Invite Section */}
      <div className="card" style={{ marginBottom: 32, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h4 style={{ marginBottom: 4 }}>Invite Code</h4>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)' }}>Share this code with your travel companions</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'monospace', fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.1em' }}>
            {trip?.invite_code}
          </span>
          <button className="btn btn-secondary btn-sm" onClick={copyCode}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </div>

      {/* Member List */}
      <h3 style={{ marginBottom: 16 }}>{members.length} Members</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {members.map(m => (
          <div key={m.id} className="card card-flat" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="avatar" style={{ background: getAvatarColor(m.full_name) }}>
              {getInitials(m.full_name)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                {m.full_name} {roleIcon(m.role)}
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>{m.email}</div>
            </div>
            <span className={`badge ${m.role === 'owner' ? 'badge-accent' : m.role === 'admin' ? 'badge-info' : 'badge-neutral'}`}>
              {m.role}
            </span>
            {isOwner && m.id !== user?.id && (
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => removeMember(m.id)}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
