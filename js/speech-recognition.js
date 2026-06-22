/**
 * SpeechRecognitionManager
 * Mengelola Web Speech API untuk Speech-to-Text.
 * Fitur: continuous listening, auto-restart, pause/resume saat TTS.
 */
class SpeechRecognitionManager {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.lang = 'id-ID';
    this.consecutiveErrors = 0;
    this.maxConsecutiveErrors = 3;
    this.isDisabled = false;

    // Callbacks
    this.onResult = null;       // (finalTranscript: string) => void
    this.onInterimResult = null; // (interimTranscript: string) => void
    this.onStart = null;        // () => void
    this.onEnd = null;          // () => void
    this.onError = null;        // (error: string) => void
    this.onDisabled = null;     // (error: string) => void
  }

  /**
   * Inisialisasi SpeechRecognition.
   * Melempar error jika browser tidak mendukung.
   */
  init() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      throw new Error('Web Speech API tidak didukung browser ini.');
    }

    this.recognition = new SR();
    this.recognition.lang = this.lang;
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;

    // --- Event: result ---
    this.recognition.onresult = (event) => {
      let final = '';
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      if (final && this.onResult) {
        this.onResult(final);
      }
      if (interim && this.onInterimResult) {
        this.onInterimResult(interim);
      }
    };

    // --- Event: start ---
    this.recognition.onstart = () => {
      this.isListening = true;
      this.consecutiveErrors = 0; // Reset setelah sukses start
      if (this.onStart) this.onStart();
    };

    // --- Event: end ---
    this.recognition.onend = () => {
      this.isListening = false;
      if (this.onEnd) this.onEnd();
    };

    // --- Event: error ---
    this.recognition.onerror = (event) => {
      // 'no-speech' dan 'aborted' adalah normal, jangan propagate sebagai error
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return;
      }
      this.consecutiveErrors++;
      // Nonaktifkan permanen setelah N error berturut-turut
      if (this.consecutiveErrors >= this.maxConsecutiveErrors && !this.isDisabled) {
        this.isDisabled = true;
        if (this.onDisabled) this.onDisabled(event.error);
      }
      if (this.onError) this.onError(event.error);
    };
  }

  /** Mulai mendengarkan */
  start() {
    if (!this.recognition || this.isDisabled) return;
    try {
      this.recognition.start();
    } catch (_) {
      // Kadang ganda start, ignore
    }
  }

  /** Aktifkan ulang setelah sebelumnya dinonaktifkan karena error */
  enable() {
    this.isDisabled = false;
    this.consecutiveErrors = 0;
  }

  /** Hentikan listening */
  stop() {
    if (!this.recognition) return;
    try {
      this.recognition.stop();
    } catch (_) { /* ignore */ }
  }

  /** Abort listening tanpa event 'end' */
  abort() {
    if (!this.recognition) return;
    try {
      this.recognition.abort();
    } catch (_) { /* ignore */ }
  }
}
