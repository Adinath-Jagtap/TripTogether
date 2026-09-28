'use client';
import { useState } from 'react';
import { ChevronDown, Copy, Check, Clock, AlertTriangle, FileText, Scale, ArrowRight, Shield, Phone, Mail, ExternalLink, MapPin } from 'lucide-react';
import { checkEntitlements } from '@/lib/entitlementRules';
import styles from './EntitlementChecker.module.css';

function parseEscalationButtons(escalationText, booking) {
  if (!escalationText) return [];
  const text = escalationText;
  const buttons = [];

  // Phone: IRCTC 14646
  if (text.includes('14646')) {
    buttons.push({
      id: 'phone_14646',
      icon: Phone,
      label: 'Call IRCTC Helpline (14646)',
      href: 'tel:14646',
      bg: '#EFF6FF',
      color: '#1D4ED8',
      border: '#93C5FD',
    });
  }

  // Phone: AirSewa 1800-11-4646
  if (text.includes('1800-11-4646')) {
    buttons.push({
      id: 'phone_airsewa',
      icon: Phone,
      label: 'Call AirSewa Helpline (1800-11-4646)',
      href: 'tel:1800114646',
      bg: '#EFF6FF',
      color: '#1D4ED8',
      border: '#93C5FD',
    });
  }

  // Phone: Consumer Helpline 1800-11-4000
  if (text.includes('1800-11-4000')) {
    buttons.push({
      id: 'phone_consumer',
      icon: Phone,
      label: 'Call Consumer Helpline (1800-11-4000)',
      href: 'tel:1800114000',
      bg: '#EFF6FF',
      color: '#1D4ED8',
      border: '#93C5FD',
    });
  }

  // Phone: Railway 139
  if (text.includes('139')) {
    buttons.push({
      id: 'phone_139',
      icon: Phone,
      label: 'Call Railway Enquiry (139)',
      href: 'tel:139',
      bg: '#EFF6FF',
      color: '#1D4ED8',
      border: '#93C5FD',
    });
  }

  // Email: care@irctc.co.in
  if (text.includes('care@irctc.co.in')) {
    const pnr = booking?.pnr || booking?.confirmation_number || '';
    const subject = encodeURIComponent(`Escalation: Delay Refund Query (PNR: ${pnr})`);
    const body = encodeURIComponent(`Hello IRCTC Support,\n\nI am writing regarding PNR: ${pnr}. My train was delayed by over 3 hours. I request an immediate resolution for my refund.\n\nThank you.`);
    buttons.push({
      id: 'email_irctc',
      icon: Mail,
      label: 'Email care@irctc.co.in',
      href: `mailto:care@irctc.co.in?subject=${subject}&body=${body}`,
      bg: '#ECFDF5',
      color: '#047857',
      border: '#A7F3D0',
    });
  }

  // Email: complaints@dgca.nic.in
  if (text.includes('complaints@dgca.nic.in')) {
    const ref = booking?.confirmation_number || '';
    const subject = encodeURIComponent(`DGCA Flight Disruption Escalation (Ref: ${ref})`);
    buttons.push({
      id: 'email_dgca',
      icon: Mail,
      label: 'Email DGCA Complaints',
      href: `mailto:complaints@dgca.nic.in?subject=${subject}`,
      bg: '#ECFDF5',
      color: '#047857',
      border: '#A7F3D0',
    });
  }

  // Web: AirSewa portal
  if (text.includes('airsewa.gov.in')) {
    buttons.push({
      id: 'web_airsewa',
      icon: ExternalLink,
      label: 'File Complaint on AirSewa Portal',
      href: 'https://airsewa.gov.in',
      target: '_blank',
      bg: '#FFFBEB',
      color: '#B45309',
      border: '#FCD34D',
    });
  }

  // Web: Consumer Helpline portal
  if (text.includes('consumerhelpline.gov.in')) {
    buttons.push({
      id: 'web_consumer',
      icon: ExternalLink,
      label: 'Open Consumer Helpline Portal',
      href: 'https://consumerhelpline.gov.in',
      target: '_blank',
      bg: '#FFFBEB',
      color: '#B45309',
      border: '#FCD34D',
    });
  }

  // Web: Indian Rail Enquiry
  if (text.includes('enquiry.indianrail.gov.in')) {
    buttons.push({
      id: 'web_rail',
      icon: ExternalLink,
      label: 'Live Train Enquiry (indianrail.gov.in)',
      href: 'https://enquiry.indianrail.gov.in',
      target: '_blank',
      bg: '#FFFBEB',
      color: '#B45309',
      border: '#FCD34D',
    });
  }

  // In-Person: Station Master
  if (text.toLowerCase().includes('station master') || text.toLowerCase().includes('station')) {
    const pnr = booking?.pnr || booking?.confirmation_number || '';
    buttons.push({
      id: 'station_master',
      icon: MapPin,
      label: `Approach Station Master ${pnr ? '(PNR: ' + pnr + ')' : ''}`,
      copyText: `Station Master Escalation Note:\nTrain PNR: ${pnr || 'N/A'}\nReason: Train delayed 3+ hours. Requesting manual endorsement for TDR refund.`,
      bg: '#F3E8FF',
      color: '#7E22CE',
      border: '#D8B4FE',
    });
  }

  return buttons;
}

/**
 * EntitlementChecker — renders after a disruption is triggered.
 * Shows travelers exactly what they're legally owed based on DGCA / Indian Railways rules.
 */
export default function EntitlementChecker({ booking, disruption, currency }) {
  const [expanded, setExpanded] = useState(false);
  const [openCards, setOpenCards] = useState(new Set());
  const [copiedId, setCopiedId] = useState(null);

  if (!booking || !disruption) return null;

  const entitlements = checkEntitlements(booking, disruption);
  if (entitlements.length === 0 && !expanded) return null;

  const toggleCard = (id) => {
    setOpenCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyScript = async (id, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (_) {}
  };

  const severityClass = (sev) => {
    if (sev === 'critical') return styles.cardSeverityCritical;
    if (sev === 'success') return styles.cardSeveritySuccess;
    return styles.cardSeverityInfo;
  };

  return (
    <div className={styles.checkerWrap}>
      {/* Trigger Button */}
      <button
        type="button"
        className={styles.triggerBtn}
        onClick={() => {
          setExpanded(prev => !prev);
          // Auto-open first card
          if (!expanded && entitlements.length > 0 && openCards.size === 0) {
            setOpenCards(new Set([entitlements[0].id]));
          }
        }}
      >
        <div className={styles.triggerIcon}>
          <Scale size={20} color="#fff" />
        </div>
        <div className={styles.triggerText}>
          <div className={styles.triggerTitle}>
            ⚖️ Know Your Rights — {entitlements.length} Entitlement{entitlements.length !== 1 ? 's' : ''} Found
          </div>
          <div className={styles.triggerSub}>
            {booking.type === 'flight'
              ? 'DGCA rules protect you — tap to see what the airline owes you'
              : booking.type === 'train'
                ? 'Indian Railways refund rules apply — see your rights before deciding'
                : 'Check what you\'re owed before choosing a recovery plan'}
          </div>
        </div>
        <ArrowRight size={18} className={`${styles.triggerArrow} ${expanded ? styles.expandIconOpen : ''}`} style={expanded ? { transform: 'rotate(90deg)' } : {}} />
      </button>

      {/* Expanded Results */}
      {expanded && (
        <div className={styles.resultsPanel}>
          {entitlements.length === 0 ? (
            <div className={styles.noResults}>
              <Shield size={24} color="var(--text-tertiary)" style={{ marginBottom: 8 }} />
              <div>No specific regulatory entitlements found for this disruption type on a <strong>{booking.type}</strong> booking.</div>
              <div style={{ marginTop: 6, fontSize: '0.8125rem' }}>You may still have contractual rights with the operator.</div>
            </div>
          ) : (
            entitlements.map(rule => {
              const isOpen = openCards.has(rule.id);
              return (
                <div key={rule.id} className={`${styles.entitlementCard} ${severityClass(rule.severity)}`}>
                  {/* Card Header — always visible */}
                  <div className={styles.cardHeader} onClick={() => toggleCard(rule.id)}>
                    <span className={styles.cardIcon}>{rule.icon}</span>
                    <div className={styles.cardHeaderText}>
                      <div className={styles.cardTitle}>{rule.title}</div>
                      <div className={styles.cardSummary}>{rule.summary}</div>
                    </div>
                    <ChevronDown size={18} className={`${styles.expandIcon} ${isOpen ? styles.expandIconOpen : ''}`} />
                  </div>

                  {/* Card Body — expanded */}
                  {isOpen && (
                    <div className={styles.cardBody}>
                      {/* What you're entitled to */}
                      <div>
                        <div className={styles.sectionLabel}>What You're Entitled To</div>
                        <ul className={styles.entitlementList}>
                          {rule.entitlements.map((item, i) => (
                            <li key={i} className={styles.entitlementItem}>
                              <Check size={14} className={styles.checkIcon} />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* What to say — copyable script */}
                      {rule.script && (
                        <div>
                          <div className={styles.sectionLabel}>What to Say (Copy & Use)</div>
                          <div className={styles.scriptBox}>
                            <div className={styles.scriptText}>"{rule.script}"</div>
                            <button
                              type="button"
                              className={styles.copyBtn}
                              onClick={(e) => { e.stopPropagation(); copyScript(rule.id, rule.script); }}
                              title="Copy to clipboard"
                            >
                              {copiedId === rule.id ? <Check size={14} /> : <Copy size={14} />}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Common mistakes */}
                      {rule.mistakes && rule.mistakes.length > 0 && (
                        <div>
                          <div className={styles.sectionLabel}>⚠️ Common Mistakes That Cost You</div>
                          <ul className={styles.mistakesList}>
                            {rule.mistakes.map((m, i) => (
                              <li key={i} className={styles.mistakeItem}>
                                <AlertTriangle size={14} className={styles.mistakeIcon} />
                                <span>{m}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Deadline */}
                      {rule.deadline && (
                        <div className={styles.deadlineBox}>
                          <Clock size={16} className={styles.deadlineIcon} />
                          <span>{rule.deadline}</span>
                        </div>
                      )}

                      {/* Escalation Action Buttons */}
                      {rule.escalation && (() => {
                        const buttons = parseEscalationButtons(rule.escalation, booking);
                        return (
                          <div>
                            <div className={styles.sectionLabel}>If They Refuse — Escalation Action Buttons</div>
                            {buttons.length > 0 && (
                              <div className={styles.escalationBtnGrid}>
                                {buttons.map(btn => {
                                  const Icon = btn.icon;
                                  if (btn.href) {
                                    return (
                                      <a
                                        key={btn.id}
                                        href={btn.href}
                                        target={btn.target || '_self'}
                                        rel="noopener noreferrer"
                                        className={styles.escalationActionBtn}
                                        style={{ background: btn.bg, color: btn.color, borderColor: btn.border }}
                                      >
                                        <Icon size={15} />
                                        <span>{btn.label}</span>
                                      </a>
                                    );
                                  }
                                  return (
                                    <button
                                      key={btn.id}
                                      type="button"
                                      className={styles.escalationActionBtn}
                                      style={{ background: btn.bg, color: btn.color, borderColor: btn.border }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (btn.copyText) copyScript(btn.id, btn.copyText);
                                      }}
                                    >
                                      <Icon size={15} />
                                      <span>{btn.label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            <div className={styles.escalationBox} style={{ marginTop: buttons.length > 0 ? 8 : 0 }}>
                              {rule.escalation}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Documents to keep */}
                      {rule.documents && rule.documents.length > 0 && (
                        <div>
                          <div className={styles.sectionLabel}>Documents to Keep</div>
                          <div className={styles.docsList}>
                            {rule.documents.map((doc, i) => (
                              <span key={i} className={styles.docChip}>
                                <FileText size={11} /> {doc}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Legal reference */}
                      {rule.legalRef && (
                        <div className={styles.legalRef}>
                          <Scale size={12} />
                          <span>Legal basis: {rule.legalRef}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

