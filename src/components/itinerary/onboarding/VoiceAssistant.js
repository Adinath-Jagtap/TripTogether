'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Send, Volume2, VolumeX, AlertTriangle, Sparkles, Check } from 'lucide-react';
import styles from './VoiceAssistant.module.css';

// How long of silence (ms) before we submit what has been said
const SILENCE_TIMEOUT_MS = 4500;

export default function VoiceAssistant({
  destination = '',
  startDate = '',
  currentBookings = [],
  onUpdateDraft,
  onError,
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [manualText, setManualText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [missingElements, setMissingElements] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [silenceCountdown, setSilenceCountdown] = useState(null);

  const recognitionRef = useRef(null);
  const isRecordingRef = useRef(false);          // mirrors state for use inside callbacks
  const deliberateStopRef = useRef(false);       // true when user explicitly taps stop
  const fullTranscriptRef = useRef('');          // accumulates speech across auto-restarts
  const silenceTimerRef = useRef(null);          // setTimeout handle for submit-on-silence
  const submitHandlerRef = useRef(null);         // ref to avoid stale closure
  const utteranceRef = useRef(null);             // prevents browser TTS garbage collection bug

  // Keep ref aligned with state
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);

  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    setSilenceCountdown(null);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    // continuous=false works better on mobile (avoids dead-lock issues);
    // we restart manually on onend to simulate continuous behaviour
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-IN'; // better for Indian-English speakers
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        interim += event.results[i][0].transcript;
      }

      // Accumulate final results into the fullTranscriptRef
      let finalPart = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalPart += event.results[i][0].transcript;
      }
      if (finalPart) {
        fullTranscriptRef.current = (fullTranscriptRef.current + ' ' + finalPart).trim();
      }

      // Show interim + accumulated
      const displayText = (fullTranscriptRef.current + ' ' + interim).trim();
      setTranscript(displayText);

      // Reset the silence timer every time we get speech
      clearSilenceTimer();
      if (isRecordingRef.current && (fullTranscriptRef.current || interim)) {
        // Start countdown: if no new speech for SILENCE_TIMEOUT_MS, auto-submit
        let remaining = SILENCE_TIMEOUT_MS;
        const tick = () => {
          remaining -= 500;
          setSilenceCountdown(remaining > 0 ? Math.ceil(remaining / 1000) : null);
          if (remaining > 0) {
            silenceTimerRef.current = setTimeout(tick, 500);
          } else {
            // Submit
            const capturedText = (fullTranscriptRef.current + ' ' + interim).trim();
            if (submitHandlerRef.current && capturedText) {
              submitHandlerRef.current(capturedText);
            }
          }
        };
        silenceTimerRef.current = setTimeout(tick, 500);
      }
    };

    recognition.onerror = (event) => {
      // 'no-speech' is not a real error — just restart
      if (event.error === 'no-speech') {
        if (isRecordingRef.current && !deliberateStopRef.current) {
          try { recognition.start(); } catch (_) {}
        }
        return;
      }
      console.warn('Speech recognition error:', event.error);
      // aborted = user stopped, not an error
      if (event.error !== 'aborted') {
        setIsRecording(false);
        isRecordingRef.current = false;
        clearSilenceTimer();
      }
    };

    recognition.onend = () => {
      // Auto-restart unless the user deliberately stopped or loading
      if (isRecordingRef.current && !deliberateStopRef.current) {
        try {
          recognition.start();
        } catch (_) {
          setIsRecording(false);
          isRecordingRef.current = false;
        }
      } else {
        setIsRecording(false);
        isRecordingRef.current = false;
      }
    };

    recognitionRef.current = recognition;

    return () => {
      deliberateStopRef.current = true;
      clearSilenceTimer();
      try { recognition.stop(); } catch (_) {}
    };
  }, []);

  // Keep submitHandlerRef updated so the silence-timer closure can call it
  // without going stale
  useEffect(() => {
    submitHandlerRef.current = (text) => {
      deliberateStopRef.current = true;
      setIsRecording(false);
      isRecordingRef.current = false;
      clearSilenceTimer();
      try { recognitionRef.current?.stop(); } catch (_) {}
      // Reset accumulator
      fullTranscriptRef.current = '';
      setTranscript('');
      handleSubmitInput(text);
    };
  });

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      if (onError) onError('Speech Recognition is not supported on this browser. You can type your itinerary below!');
      return;
    }

    if (isRecording) {
      // Manual stop — collect everything accumulated so far
      deliberateStopRef.current = true;
      clearSilenceTimer();
      const collected = fullTranscriptRef.current.trim() || transcript.trim();
      fullTranscriptRef.current = '';
      try { recognitionRef.current.stop(); } catch (_) {}
      setIsRecording(false);
      isRecordingRef.current = false;
      if (collected) {
        setTranscript('');
        handleSubmitInput(collected);
      }
    } else {
      deliberateStopRef.current = false;
      fullTranscriptRef.current = '';
      setTranscript('');
      clearSilenceTimer();
      try {
        recognitionRef.current.start();
        setIsRecording(true);
        isRecordingRef.current = true;
      } catch (err) {
        console.error('Failed to start speech recognition:', err);
      }
    }
  };

  const handleSubmitInput = async (inputText) => {
    const textToSend = inputText || manualText;
    if (!textToSend.trim()) return;

    try {
      setIsLoading(true);
      const newMessages = [...messages, { role: 'user', content: textToSend }];
      setMessages(newMessages);
      setManualText('');
      setTranscript('');

      const res = await fetch('/api/ai/itinerary-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          currentDraft: currentBookings,
          destination,
          startDate,
          userSpeech: textToSend,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to process speech with AI');
      }

      const reply = data.assistant_response || 'Updated your itinerary!';
      setMessages([...newMessages, { role: 'assistant', content: reply }]);

      if (data.missing_elements) {
        setMissingElements(data.missing_elements);
      }

      // If text to speech is enabled, speak the answer with natural voice selection
      if (soundEnabled && typeof window !== 'undefined' && window.speechSynthesis) {
        try {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(reply);
          utteranceRef.current = utterance; // Prevent garbage collection bug
          utterance.rate = 1.05;

          const voices = window.speechSynthesis.getVoices();
          const naturalVoice = voices.find(v =>
            v.lang.startsWith('en') &&
            (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('India'))
          );
          if (naturalVoice) utterance.voice = naturalVoice;

          window.speechSynthesis.speak(utterance);
        } catch (_) {}
      }

      if (onUpdateDraft && data.updated_bookings) {
        onUpdateDraft(data.updated_bookings, data.dependencies || [], data);
      }
    } catch (err) {
      console.error('Itinerary dialogue error:', err);
      if (onError) onError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitInput();
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <div className={styles.title}>
            <Sparkles size={18} color="var(--color-primary)" />
            <span>Voice &amp; AI Itinerary Builder</span>
          </div>
          <p className={styles.subtitle}>
            Speak or type your travel plans. AI structures your schedule in real-time.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSoundEnabled(!soundEnabled)}
          className="btn-ghost"
          style={{ padding: '6px', fontSize: '12px' }}
          title={soundEnabled ? 'Mute AI voice output' : 'Enable AI voice output'}
        >
          {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
      </div>

      <div className={styles.micSection}>
        <button
          type="button"
          onClick={toggleRecording}
          className={`${styles.micButton} ${isRecording ? styles.recording : ''}`}
          disabled={isLoading}
        >
          {isRecording ? <MicOff size={28} /> : <Mic size={28} />}
        </button>

        <div className={styles.transcriptPreview}>
          {isRecording ? (
            <>
              <span>{transcript || 'Listening... Speak clearly (e.g. "We land in Tokyo on Oct 15th at 3pm")'}</span>
              {silenceCountdown !== null && (
                <span style={{ display: 'block', marginTop: 6, fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-primary)', opacity: 0.8 }}>
                  ⏳ Submitting in {silenceCountdown}s… keep speaking or tap stop
                </span>
              )}
            </>
          ) : (
            <span className={styles.transcriptPlaceholder}>
              Tap mic to speak, or type your plans below
            </span>
          )}
        </div>
      </div>

      <div className={styles.inputGroup}>
        <input
          type="text"
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Paste or type (e.g. Flight 6E-2341 BOM to DEL ₹4800 PNR ABC123 or Train 12301)..."
          className={styles.textInput}
          disabled={isLoading || isRecording}
        />
        <button
          type="button"
          onClick={() => handleSubmitInput()}
          disabled={isLoading || !manualText.trim()}
          className={styles.sendButton}
        >
          <Send size={15} />
          <span>{isLoading ? 'Thinking...' : 'Add'}</span>
        </button>
      </div>

      {messages.length === 0 && (
        <div style={{ marginTop: 4, padding: '8px 10px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8 }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Sparkles size={13} color="var(--color-primary)" />
            <span>TRY CLICKING A QUICK PROMPT (OR PASTE YOUR OWN):</span>
          </div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', scrollSnapType: 'x mandatory', maskImage: 'linear-gradient(to right, black 0%, black 90%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to right, black 0%, black 90%, transparent 100%)' }}>
            <style>{`.quickPromptScroll::-webkit-scrollbar { display: none; }`}</style>
            <button
              type="button"
              onClick={() => {
                const prompt = 'Add IndiGo flight 6E-2341 from Mumbai to Delhi for ₹4800, PNR PNR892301';
                setManualText(prompt);
                handleSubmitInput(prompt);
              }}
              disabled={isLoading}
              className="btn-ghost"
              style={{ fontSize: '11px', padding: '5px 12px', background: '#E0F2FE', border: '1.5px solid #7DD3FC', borderRadius: 8, color: '#0369A1', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 700, scrollSnapAlign: 'start' }}
            >
              <span>✈️ Flight 6E-2341 + PNR</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const prompt = 'Add Vande Bharat train 12301 from Delhi to Jaipur for ₹1850, PNR 2839102931';
                setManualText(prompt);
                handleSubmitInput(prompt);
              }}
              disabled={isLoading}
              className="btn-ghost"
              style={{ fontSize: '11px', padding: '5px 12px', background: '#FEF3C7', border: '1.5px solid #FCD34D', borderRadius: 8, color: '#92400E', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 700, scrollSnapAlign: 'start' }}
            >
              <span>🚆 Train 12301 + PNR</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const prompt = 'Plan a 3-day spiritual trip to Nanded for Gurdwara darshan starting next Friday';
                setManualText(prompt);
                handleSubmitInput(prompt);
              }}
              disabled={isLoading}
              className="btn-ghost"
              style={{ fontSize: '11px', padding: '5px 12px', background: '#FFFFFF', border: '1.5px solid #CBD5E1', borderRadius: 8, color: '#1E293B', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 600, scrollSnapAlign: 'start' }}
            >
              <span>🕌 Nanded Pilgrimage</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const prompt = 'Tokyo 5-Day Cherry Blossom Odyssey with Shinkansen bullet train and hotels';
                setManualText(prompt);
                handleSubmitInput(prompt);
              }}
              disabled={isLoading}
              className="btn-ghost"
              style={{ fontSize: '11px', padding: '5px 12px', background: '#FFFFFF', border: '1.5px solid #CBD5E1', borderRadius: 8, color: '#1E293B', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 600, scrollSnapAlign: 'start' }}
            >
              <span>✈️ Tokyo Odyssey</span>
            </button>
          </div>
        </div>
      )}

      {messages.length > 0 && (
        <div className={styles.aiResponseBox}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Sparkles size={14} color="#B45309" />
            <span style={{ fontWeight: 600, fontSize: '0.75rem', color: '#B45309' }}>AI Assistant Updated Canvas</span>
          </div>
          <p className={styles.aiResponseText}>
            {messages[messages.length - 1].content}
          </p>

          {missingElements.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#B91C1C' }}>
                SUGGESTED NEXT DETAILS:
              </span>
              <div className={styles.missingBadgeList}>
                {missingElements.map((el, i) => (
                  <span key={i} className={styles.missingBadge}>
                    <AlertTriangle size={12} />
                    {el}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
