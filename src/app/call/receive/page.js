'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '@/lib/firebase/config';
import {
  collection, query, where, onSnapshot, doc,
  updateDoc, serverTimestamp, addDoc, orderBy,
} from 'firebase/firestore';
import { initPushNotifications } from '@/lib/firebase/messaging';
import {
  Phone, PhoneCall, PhoneOff, Radio, Hotel, Bot, Mic, Send,
  RotateCcw, AlertTriangle, CheckCircle, Sparkles, Clock, ShieldCheck, Zap
} from 'lucide-react';
import styles from './page.module.css';

export default function HotelReceivePage() {
  const [activeCall, setActiveCall] = useState(null);
  const [messages, setMessages] = useState([]);
  const [callStatus, setCallStatus] = useState('waiting'); // waiting | ringing | connected | ended
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [callDuration, setCallDuration] = useState(0);
  const [aiError, setAiError] = useState(null); // string | null — visible error banner
  const [hotelInfo, setHotelInfo] = useState({ name: '', phone: '' });
  const [manualInput, setManualInput] = useState('');
  const recognitionRef = useRef(null);
  const ringingRef = useRef(null);
  const callStatusRef = useRef('waiting');
  const lastSpokenMsgId = useRef(null);
  const timerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const watchdogRef = useRef(null);   // 15-second watchdog
  const lastHotelMsgRef = useRef(''); // for watchdog retry
  const activeCallRef = useRef(null); // keep activeCall accessible in callbacks
  const isCallEndingRef = useRef(false); // true while final message is being spoken inline
  const messagesRef = useRef([]);     // mirror of messages state — readable in stale closures

  // Keep refs in sync with state
  useEffect(() => { callStatusRef.current = callStatus; }, [callStatus]);
  useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // ── FCM: Register push notifications so the hotel gets incoming-call alerts
  // even when the screen is off or the app is backgrounded.
  // Firebase config is hardcoded in the SW, so no postMessage needed.
  useEffect(() => {
    const hotelId = typeof window !== 'undefined'
      ? (localStorage.getItem('hotelPhoneId') || 'hotel-device')
      : 'hotel-device';

    // Register the service worker (config is hardcoded inside it)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' })
        .then(() => console.log('[hotel-receive] SW registered.'))
        .catch(err => console.warn('[hotel-receive] SW registration failed:', err.message));
    }

    initPushNotifications(hotelId, 'hotel').catch(err =>
      console.warn('[hotel-receive] FCM registration error:', err.message)
    );
  }, []);

  // Read stored hotel registration info
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setHotelInfo({
        name: localStorage.getItem('hotelName') || 'Hotel Partner',
        phone: localStorage.getItem('hotelPhoneId') || '',
      });
    }
  }, []);

  const handleManualSend = (e) => {
    e?.preventDefault();
    if (!manualInput.trim()) return;
    const msg = manualInput.trim();
    setManualInput('');
    sendHotelMessage(msg);
  };

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Call duration timer
  useEffect(() => {
    if (callStatus === 'connected') {
      timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setCallDuration(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [callStatus]);

  const formatDuration = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // Listen for incoming calls (status === 'ringing')
  useEffect(() => {
    const q = query(collection(db, 'calls'), where('status', '==', 'ringing'));
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty && callStatusRef.current === 'waiting') {
        const callDoc = snap.docs[0];
        setActiveCall({ id: callDoc.id, ...callDoc.data() });
        setCallStatus('ringing');
        playRingtone();
      }
    });
    return () => unsub();
  }, []);

  // Listen for new messages when connected
  useEffect(() => {
    if (!activeCall?.id || callStatus !== 'connected') return;
    const q = query(
      collection(db, 'calls', activeCall.id, 'messages'),
      orderBy('timestamp', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(msgs);

      // Only speak the latest AI message if not already spoken
      // and if we are NOT already speaking the final message inline
      const lastAiMsg = [...msgs].reverse().find(m => m.sender === 'ai');
      if (lastAiMsg && lastAiMsg.id !== lastSpokenMsgId.current) {
        // Always update ID so we never re-speak this message later
        lastSpokenMsgId.current = lastAiMsg.id;
        clearWatchdog();
        setAiError(null);

        if (isCallEndingRef.current) {
          // Final message is already being spoken inline — skip TTS here.
          // The call will end when the inline speakText onDone fires.
          console.log('[call-receive] onSnapshot: final message already being spoken inline, skipping.');
          return;
        }

        speakText(lastAiMsg.text);
      }
    });
    return () => unsub();
  }, [activeCall?.id, callStatus]);


  const playRingtone = () => {
    try {
      navigator.vibrate && navigator.vibrate([500, 300, 500, 300, 500, 300, 500]);
      // Use a generated beep since ringtone.mp3 doesn't exist
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const playBeep = () => {
        if (callStatusRef.current !== 'ringing') return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 440;
        gain.gain.value = 0.3;
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
        setTimeout(() => {
          if (callStatusRef.current !== 'ringing') return;
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.frequency.value = 523;
          gain2.gain.value = 0.3;
          osc2.start();
          osc2.stop(ctx.currentTime + 0.4);
        }, 500);
        setTimeout(() => playBeep(), 2000);
      };
      playBeep();
      ringingRef.current = ctx;
    } catch (_) {}
  };

  const stopRingtone = () => {
    try {
      if (ringingRef.current) {
        ringingRef.current.close();
        ringingRef.current = null;
      }
      navigator.vibrate && navigator.vibrate(0);
    } catch (_) {}
  };

  const acceptCall = async () => {
    if (callStatusRef.current !== 'ringing') return;
    stopRingtone();
    setCallStatus('connected');
    await updateDoc(doc(db, 'calls', activeCall.id), {
      status: 'connected',
      connected_at: serverTimestamp(),
    });
    // AI sends opening message
    fetchAIResponse('');
  };

  const rejectCall = async () => {
    stopRingtone();
    if (activeCall?.id) {
      await updateDoc(doc(db, 'calls', activeCall.id), {
        status: 'completed',
        outcome: 'rejected',
        ended_at: serverTimestamp(),
      });
    }
    resetCall();
  };

  const endCall = async (outcome = 'completed') => {
    stopListening();
    window.speechSynthesis?.cancel();
    if (activeCall?.id) {
      await updateDoc(doc(db, 'calls', activeCall.id), {
        status: 'completed',
        outcome,
        ended_at: serverTimestamp(),
      });
    }
    setCallStatus('ended');
    setTimeout(() => resetCall(), 4000);
  };

  // ─── Watchdog helpers ──────────────────────────────────────────────────────────

  const clearWatchdog = () => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  };

  /**
   * Start the 15-second watchdog. If no new AI message arrives via onSnapshot
   * within that window, show the error banner and offer a Retry button.
   */
  const startWatchdog = (hotelMsg) => {
    clearWatchdog();
    lastHotelMsgRef.current = hotelMsg;
    watchdogRef.current = setTimeout(() => {
      if (callStatusRef.current === 'connected') {
        setAiError('AI assistant is taking too long to respond. Tap Retry to try again.');
      }
    }, 15000);
  };

  const resetCall = () => {
    clearWatchdog();
    setActiveCall(null);
    setMessages([]);
    setCallStatus('waiting');
    setTranscript('');
    setCallDuration(0);
    setAiError(null);
    lastSpokenMsgId.current = null;
  };

  const [isCallEnding, setIsCallEnding] = useState(false); // true while final AI message is being spoken


  const speakText = (text, onDone) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      onDone?.();
      return;
    }
    // Stop listening while AI speaks
    stopListening();
    window.speechSynthesis.cancel();
    setIsSpeaking(true);

    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.9;
    utt.pitch = 1;
    utt.lang = 'en-IN';

    // Safety net: some browsers never fire onend for long utterances.
    // Estimate reading time: 50ms per character, minimum 6 s.
    const safetyMs = Math.max(6000, text.length * 50);
    let safetyTimer = setTimeout(() => {
      console.warn('[speakText] onend did not fire within safety window — forcing done.');
      finish();
    }, safetyMs);

    const finish = () => {
      clearTimeout(safetyTimer);
      safetyTimer = null;
      setIsSpeaking(false);
      onDone?.();
      // After AI finishes speaking, restart listening — only if call is still live
      // and we are not in the middle of ending the call
      if (callStatusRef.current === 'connected' && !isCallEndingRef.current) {
        setTimeout(() => startListening(), 500);
      }
    };

    utt.onend   = () => finish();
    utt.onerror = (e) => {
      console.warn('[speakText] SpeechSynthesisUtterance error:', e.error);
      finish();
    };

    // Chrome Android bug: synthesis silently stops after ~15s on long texts.
    // Chunking into sentences prevents this.
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    if (sentences.length > 1) {
      // Speak sentence-by-sentence so Chrome doesn't cut off mid-utterance
      clearTimeout(safetyTimer);
      let idx = 0;
      const speakNext = () => {
        if (idx >= sentences.length) { finish(); return; }
        const s = sentences[idx++].trim();
        if (!s) { speakNext(); return; }
        const sub = new SpeechSynthesisUtterance(s);
        sub.rate = 0.9; sub.pitch = 1; sub.lang = 'en-IN';
        sub.onend   = speakNext;
        sub.onerror = speakNext;
        window.speechSynthesis.speak(sub);
      };
      speakNext();
    } else {
      window.speechSynthesis.speak(utt);
    }
  };

  const startListening = useCallback(() => {
    if (typeof window === 'undefined' || callStatusRef.current !== 'connected') return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    // Don't start if already listening
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-IN';
      recognition.maxAlternatives = 1;
      recognitionRef.current = recognition;

      let finalTranscript = '';
      let silenceTimer = null;

      recognition.onstart = () => setIsListening(true);

      recognition.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += t + ' ';
          } else {
            interim = t;
          }
        }
        setTranscript(finalTranscript + interim);

        // Reset silence timer on each result
        if (silenceTimer) clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
          // 2 seconds of silence after speech → send what we have
          if (finalTranscript.trim()) {
            const msg = finalTranscript.trim();
            finalTranscript = '';
            setTranscript('');
            recognition.stop();
            sendHotelMessage(msg);
          }
        }, 2000);
      };

      recognition.onend = () => {
        setIsListening(false);
        if (silenceTimer) clearTimeout(silenceTimer);
        // If we have unsent text, send it
        if (finalTranscript.trim()) {
          const msg = finalTranscript.trim();
          finalTranscript = '';
          setTranscript('');
          sendHotelMessage(msg);
        }
      };

      recognition.onerror = (e) => {
        setIsListening(false);
        // Auto-restart on no-speech or aborted errors
        if (e.error === 'no-speech' && callStatusRef.current === 'connected') {
          setTimeout(() => startListening(), 1000);
        }
      };

      recognition.start();
    } catch (_) {
      setIsListening(false);
    }
  }, []);

  const stopListening = () => {
    try { recognitionRef.current?.stop(); } catch (_) {}
    recognitionRef.current = null;
    setIsListening(false);
  };

  const sendHotelMessage = async (text) => {
    if (!activeCallRef.current?.id || !text) return;
    setTranscript('');
    setAiError(null);

    // Save hotel message to Firestore
    await addDoc(collection(db, 'calls', activeCallRef.current.id, 'messages'), {
      sender: 'hotel',
      text,
      timestamp: serverTimestamp(),
    });

    // Use messagesRef.current (not messages state) so this works correctly even when
    // called from inside stale closures (e.g. startListening useCallback with [] deps).
    // messagesRef is always kept in sync via useEffect.
    const optimisticHistory = [
      ...messagesRef.current,
      { sender: 'hotel', text },
    ];

    // Get AI response
    await fetchAIResponse(text, optimisticHistory);
  };

  /**
   * Fetch an AI turn from /api/ai/call-respond.
   * Fix B: No silent error swallowing. Shows inline banner, auto-retries once,
   *         then shows manual Retry button.
   * @param {string} hotelMessage - the hotel's latest spoken message
   * @param {Array}  history      - the current full conversation history (optimistic)
   * @param {boolean} isRetry     - true if this is the automatic retry attempt
   */
  const fetchAIResponse = async (hotelMessage, history, isRetry = false) => {
    const call = activeCallRef.current;
    if (!call?.id) return;

    // Start watchdog — 15 seconds to get a new AI message from Firestore
    startWatchdog(hotelMessage);

    try {
      const res = await fetch('/api/ai/call-respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callId: call.id,
          conversationHistory: history ?? messages,
          hotelLatestMessage: hotelMessage || null,
          context: {
            hotelName: call.hotelName,
            guestName: call.guestName,
            bookingRef: call.bookingRef,
            changeRequest: call.changeRequest,
            originalTime: call.originalTime,
            newTime: call.newTime,
            reason: call.reason,
            userId: call.userId || null,
            hotelPhone: call.hotelPhone || null,
            tripId: call.tripId || null,
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status} ${res.statusText}`);
      }

      const data = await res.json();

      // Fix B: Surface Firestore write failures to the UI
      if (data.firestoreError) {
        console.error('[call-receive] Firestore write failed on server:', data.message);
        setAiError('AI responded but the message could not be saved. Tap Retry.');
        return;
      }

      // Fix B: Surface server-side errors
      if (data.error) {
        throw new Error(data.message || 'AI failed to generate a response');
      }

      // When is_final: speak the closing message INLINE directly from data.response.
      // Do NOT wait for the Firestore onSnapshot round-trip — the snapshot often
      // fires before this code runs (Firestore write completes before HTTP response
      // returns), causing pending to be null when the snapshot checks it.
      if (data.is_final) {
        setIsCallEnding(true);
        isCallEndingRef.current = true;
        const finalText    = data.response;
        const finalOutcome = data.outcome || 'completed';
        // Speak immediately — endCall fires in the onDone callback after speech finishes
        speakText(finalText, () => {
          setIsCallEnding(false);
          isCallEndingRef.current = false;
          endCall(finalOutcome);
        });
      }
    } catch (err) {
      console.error('[call-receive] fetchAIResponse error:', err.message);
      clearWatchdog();

      if (!isRetry) {
        // Auto-retry once before showing the manual button
        setAiError('AI assistant had trouble responding — retrying…');
        setTimeout(() => fetchAIResponse(hotelMessage, history, true), 2000);
      } else {
        setAiError('AI assistant failed to respond. Tap Retry to try again.');
      }
    }
  };

  const renderTopBar = () => (
    <header className={styles.topBar}>
      <div className={styles.brandGroup}>
        <div className={styles.brandBadge}>
          <Hotel size={20} />
        </div>
        <div>
          <span className={styles.brandTitle}>TripTogether Concierge</span>
          <span className={styles.brandSubtitle}>Hotel Reception AI Switchboard</span>
        </div>
      </div>

      <div className={styles.hotelMetaPill}>
        <div className={styles.statusDotPulse} />
        <span>{hotelInfo.name || 'Verified Hotel'} {hotelInfo.phone ? `(${hotelInfo.phone})` : ''}</span>
        <a href="/hotel/login" className={styles.switchHotelLink}>Edit</a>
      </div>
    </header>
  );

  // 1. Waiting for call
  if (callStatus === 'waiting') {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.ambientGlow} />
        {renderTopBar()}
        <main className={styles.mainContent}>
          <div className={styles.waitingCard}>
            <div className={styles.radarContainer}>
              <div className={styles.radarWave} />
              <div className={`${styles.radarWave} ${styles.radarWaveDelay}`} />
              <div className={styles.radarCenter}>
                <Radio size={28} />
              </div>
            </div>

            <h2 className={styles.waitingTitle}>Concierge Standby</h2>
            <p className={styles.waitingSubtitle}>
              Waiting for incoming AI travel calls from TripTogether guests to assist with check-in adjustments.
            </p>

            <div className={styles.standbyFeatures}>
              <div className={styles.standbyFeatureItem}>
                <Zap size={16} className={styles.standbyFeatureIcon} />
                <span>Automated voice-to-voice AI negotiation</span>
              </div>
              <div className={styles.standbyFeatureItem}>
                <ShieldCheck size={16} className={styles.standbyFeatureIcon} />
                <span>Synchronized itinerary & booking validation</span>
              </div>
              <div className={styles.standbyFeatureItem}>
                <Clock size={16} className={styles.standbyFeatureIcon} />
                <span>Hands-free speech recognition in your browser</span>
              </div>
            </div>

            <div className={styles.hintBanner}>
              <Sparkles size={14} style={{ color: 'var(--accent)' }} />
              <span>Keep this tab active to receive calls instantly</span>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // 2. Ringing
  if (callStatus === 'ringing') {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.ambientGlow} />
        {renderTopBar()}
        <main className={styles.mainContent}>
          <div className={styles.ringingCard}>
            <div className={styles.ringingHeaderBadge}>
              <span className={styles.liveDot} />
              INCOMING AI CALL
            </div>

            <div className={styles.ringingAvatarContainer}>
              <div className={styles.ringingHalo} />
              <div className={styles.ringingAvatar}>
                <PhoneCall size={34} />
              </div>
            </div>

            <h2 className={styles.ringingCallerTitle}>
              {activeCall?.guestName || 'TripTogether Traveler'}
            </h2>
            <p className={styles.ringingSubInfo}>
              Calling regarding reservation changes
            </p>

            <div className={styles.ringingDetailBox}>
              <div className={styles.ringingDetailRow}>
                <span className={styles.ringingDetailLabel}>Booking Ref</span>
                <span className={styles.ringingDetailValue}>{activeCall?.bookingRef || 'HSP-2024'}</span>
              </div>
              <div className={styles.ringingDetailRow}>
                <span className={styles.ringingDetailLabel}>Reason</span>
                <span className={styles.ringingDetailValue} style={{ color: 'var(--accent-dark)' }}>
                  {activeCall?.reason || 'Travel disruption'}
                </span>
              </div>
              {activeCall?.changeRequest && (
                <div className={styles.ringingDetailRow} style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border-default)' }}>
                  <span className={styles.ringingDetailLabel}>Request</span>
                  <span className={styles.ringingDetailValue}>{activeCall.changeRequest}</span>
                </div>
              )}
            </div>

            <div className={styles.ringingActions}>
              <button className={styles.declineButton} onClick={rejectCall}>
                <PhoneOff size={18} /> Decline
              </button>
              <button className={styles.acceptButton} onClick={acceptCall}>
                <PhoneCall size={18} /> Accept Call
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // 3. Ended
  if (callStatus === 'ended') {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.ambientGlow} />
        {renderTopBar()}
        <main className={styles.mainContent}>
          <div className={styles.endedCard}>
            <div className={styles.endedCheckBadge}>
              <CheckCircle size={32} />
            </div>
            <h2 className={styles.waitingTitle}>Call Concluded</h2>
            <p className={styles.waitingSubtitle}>
              Duration: <strong>{formatDuration(callDuration)}</strong>
              <br />
              The conversation outcome has been updated in TripTogether. Returning to standby...
            </p>
            <button className={styles.returnStandbyBtn} onClick={resetCall}>
              Return to Standby Now
            </button>
          </div>
        </main>
      </div>
    );
  }

  // 4. Connected — Active Call
  return (
    <div className={styles.pageContainer}>
      <div className={styles.ambientGlow} />
      {renderTopBar()}
      <main className={styles.mainContent}>
        <div className={styles.activeCallCard}>
          <div className={styles.activeHeader}>
            <div className={styles.activeHeaderMeta}>
              <div className={styles.callLiveBadge}>
                <span className={styles.liveDot} />
                LIVE CALL · {formatDuration(callDuration)}
              </div>
              <div className={styles.activeGuestName}>
                {activeCall?.guestName || 'Traveler'}
              </div>
              <div className={styles.activeBookingInfo}>
                <span className={styles.activeBookingChip}>{activeCall?.bookingRef || 'Booking'}</span>
                <span>•</span>
                <span>{activeCall?.reason || 'Reschedule Request'}</span>
              </div>
            </div>
            <button className={styles.endCallButton} onClick={() => endCall('completed')}>
              <PhoneOff size={15} /> End Call
            </button>
          </div>

          <div className={styles.transcriptArea}>
            {messages.map((msg, i) => (
              <div
                key={msg.id || i}
                className={`${styles.messageRow} ${msg.sender === 'ai' ? styles.aiMessageRow : styles.hotelMessageRow}`}
              >
                <div className={styles.messageSenderTag}>
                  {msg.sender === 'ai' ? (
                    <>
                      <Bot size={13} style={{ color: 'var(--accent)' }} />
                      <span>TripTogether AI</span>
                    </>
                  ) : (
                    <>
                      <span>You (Hotel Staff)</span>
                      <Hotel size={13} style={{ color: 'var(--text-secondary)' }} />
                    </>
                  )}
                </div>
                <div className={msg.sender === 'ai' ? styles.aiBubble : styles.hotelBubble}>
                  {msg.text}
                </div>
              </div>
            ))}

            {messages.length === 0 && (
              <div className={styles.connectingHolder}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--accent-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', marginBottom: 12 }}>
                  <Bot size={24} />
                </div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Connecting to AI Travel Assistant...</div>
                <div style={{ fontSize: '0.8125rem' }}>The assistant will present the traveler&apos;s request shortly.</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className={styles.audioBottomBar}>
            <div className={styles.audioIndicatorBox}>
              {isSpeaking ? (
                <div className={styles.speakingVisualizer}>
                  <div className={styles.soundwaveBars}>
                    {[1, 2, 3, 4, 5].map(i => (
                      <div
                        key={i}
                        className={styles.soundwaveBar}
                        style={{ animationDelay: `${i * 0.1}s` }}
                      />
                    ))}
                  </div>
                  <span>AI Assistant is speaking...</span>
                </div>
              ) : isListening ? (
                <div className={styles.listeningVisualizer}>
                  <div className={styles.micPulseRing} />
                  <span>Listening to your response...</span>
                  {transcript && (
                    <span className={styles.transcriptPreview}>&ldquo;{transcript}&rdquo;</span>
                  )}
                </div>
              ) : aiError ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#DC2626', fontSize: '0.8125rem', fontWeight: 500 }}>
                    <AlertTriangle size={16} />
                    <span>{aiError}</span>
                  </div>
                  {aiError.includes('Retry') && (
                    <button
                      onClick={() => {
                        setAiError(null);
                        fetchAIResponse(lastHotelMsgRef.current, messages, true);
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#DC2626', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.75rem' }}
                    >
                      <RotateCcw size={12} /> Retry
                    </button>
                  )}
                </div>
              ) : isCallEnding ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent)', fontWeight: 600, fontSize: '0.875rem' }}>
                  <Clock size={16} />
                  <span>Call concluding • Finalizing confirmation...</span>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}>
                  <Sparkles size={14} />
                  <span>AI Assistant is listening and processing...</span>
                </div>
              )}
            </div>

            {/* Fallback typing input for hotel reception */}
            <form onSubmit={handleManualSend} className={styles.manualTypeBar}>
              <input
                type="text"
                className={styles.manualInput}
                placeholder="Type a response or speak into your microphone..."
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
              />
              <button
                type="submit"
                className={styles.manualSendBtn}
                disabled={!manualInput.trim()}
                title="Send typed response"
              >
                <Send size={15} />
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
