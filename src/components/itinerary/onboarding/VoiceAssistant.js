'use client';
import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Send, Volume2, VolumeX, AlertTriangle, Sparkles, Check } from 'lucide-react';
import styles from './VoiceAssistant.module.css';

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

  const recognitionRef = useRef(null);

  useEffect(() => {
    // Initialize Web Speech API if supported
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
          let current = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            current += event.results[i][0].transcript;
          }
          setTranscript(current);
        };

        recognition.onerror = (event) => {
          console.warn('Speech recognition error:', event.error);
          setIsRecording(false);
        };

        recognition.onend = () => {
          setIsRecording(false);
        };

        recognitionRef.current = recognition;
      }
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (_) {}
      }
    };
  }, []);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      if (onError) onError('Speech Recognition is not supported on this browser. You can type your itinerary below!');
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
      if (transcript.trim()) {
        handleSubmitInput(transcript);
      }
    } else {
      setTranscript('');
      try {
        recognitionRef.current.start();
        setIsRecording(true);
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

      // If text to speech is enabled, speak the answer
      if (soundEnabled && typeof window !== 'undefined' && window.speechSynthesis) {
        try {
          const utterance = new SpeechSynthesisUtterance(reply);
          utterance.rate = 1.05;
          window.speechSynthesis.speak(utterance);
        } catch (_) {}
      }

      if (onUpdateDraft && data.updated_bookings) {
        onUpdateDraft(data.updated_bookings, data.dependencies || []);
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
            <span>Voice & Conversational Itinerary Builder</span>
          </div>
          <p className={styles.subtitle}>
            Just speak or describe your schedule. AI structures your flights, hotels, and tours in real-time.
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
          {isRecording ? <MicOff size={30} /> : <Mic size={30} />}
        </button>

        <div className={styles.transcriptPreview}>
          {isRecording ? (
            transcript || 'Listening... Speak clearly (e.g. "We land in Tokyo on Oct 15th at 3pm, staying at Hotel Gracery")'
          ) : (
            <span className={styles.transcriptPlaceholder}>
              Click the microphone and speak your travel plans, or type below
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
          placeholder="Or type here: 'Add paragliding at Solang Valley for ₹3000...'"
          className={styles.textInput}
          disabled={isLoading || isRecording}
        />
        <button
          type="button"
          onClick={() => handleSubmitInput()}
          disabled={isLoading || !manualText.trim()}
          className={styles.sendButton}
        >
          <Send size={16} />
          <span>{isLoading ? 'Thinking...' : 'Add'}</span>
        </button>
      </div>

      {currentBookings && currentBookings.length > 0 && messages.length === 0 && (
        <div style={{ marginTop: 10, padding: '10px 12px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8 }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Sparkles size={13} color="var(--color-primary)" />
            <span>EXISTING CANVAS LOADED ({currentBookings.length} NODES) — QUICK PROMPTS:</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                const prompt = destination?.toLowerCase().includes('tokyo') 
                  ? 'Add Shibuya Sky & teamLab Planets digital art exhibition for ₹3,200' 
                  : 'Add Solang Valley adventure & paragliding tour for ₹3,000';
                setManualText(prompt);
                handleSubmitInput(prompt);
              }}
              disabled={isLoading}
              className="btn-ghost"
              style={{ fontSize: '11px', padding: '4px 9px', background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 6, color: '#1E293B', cursor: 'pointer' }}
            >
              + {destination?.toLowerCase().includes('tokyo') ? 'Shibuya Sky & teamLab' : 'Solang Valley Adventure'}
            </button>
            <button
              type="button"
              onClick={() => {
                const prompt = destination?.toLowerCase().includes('tokyo')
                  ? 'Add Ginza traditional Kaiseki dinner banquet for ₹7,500'
                  : 'Add dinner reservation at Johnson Cafe Manali for ₹1,800';
                setManualText(prompt);
                handleSubmitInput(prompt);
              }}
              disabled={isLoading}
              className="btn-ghost"
              style={{ fontSize: '11px', padding: '4px 9px', background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 6, color: '#1E293B', cursor: 'pointer' }}
            >
              + {destination?.toLowerCase().includes('tokyo') ? 'Ginza Kaiseki Dinner' : 'Dinner at Johnson Cafe'}
            </button>
            <button
              type="button"
              onClick={() => {
                const prompt = destination?.toLowerCase().includes('tokyo')
                  ? 'Add Narita Airport Express departure transfer for ₹2,400'
                  : 'Add return Volvo bus from Manali to Delhi for ₹1,400';
                setManualText(prompt);
                handleSubmitInput(prompt);
              }}
              disabled={isLoading}
              className="btn-ghost"
              style={{ fontSize: '11px', padding: '4px 9px', background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 6, color: '#1E293B', cursor: 'pointer' }}
            >
              + {destination?.toLowerCase().includes('tokyo') ? 'Airport Departure Express' : 'Return Volvo Bus'}
            </button>
          </div>
        </div>
      )}

      {messages.length > 0 && (
        <div className={styles.aiResponseBox}>
          <p className={styles.aiResponseText}>
            {messages[messages.length - 1].content}
          </p>

          {missingElements.length > 0 && (
            <div>
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
