/**
 * TextToSpeechManager
 * Mengelola SpeechSynthesis API untuk Text-to-Speech.
 * Fitur: voice Indonesia, rate/pitch, Promise-based speak.
 */
class TextToSpeechManager {
  constructor() {
    this.voices = [];
    this.indonesianVoice = null;

    // Callbacks
    this.onStart = null; // (text: string) => void
    this.onEnd = null;   // () => void
  }

  /**
   * Muat daftar suara dan cari voice bahasa Indonesia.
   * Kembalikan Promise yang resolve ketika voices siap.
   */
  init() {
    return new Promise((resolve) => {
      const check = () => {
        this.voices = window.speechSynthesis.getVoices();
        if (this.voices.length > 0) {
          this._findIndonesianVoice();
          resolve();
        }
      };

      // Coba langsung
      check();

      // Jika kosong, tunggu event + fallback polling
      if (this.voices.length === 0) {
        window.speechSynthesis.onvoiceschanged = check;
        // Fallback: polling hingga 4 detik (Chrome bug workaround)
        let elapsed = 0;
        const poll = setInterval(() => {
          elapsed += 200;
          this.voices = window.speechSynthesis.getVoices();
          if (this.voices.length > 0) {
            clearInterval(poll);
            this._findIndonesianVoice();
            resolve();
          } else if (elapsed >= 4000) {
            clearInterval(poll);
            // Fallback: resolve tanpa voice spesifik
            resolve();
          }
        }, 200);
      }
    });
  }

  /** Cari voice dengan lang 'id' (Indonesia) */
  _findIndonesianVoice() {
    this.indonesianVoice =
      this.voices.find((v) => v.lang && v.lang.startsWith('id')) || null;
  }

  /**
   * Ucapkan teks menggunakan SpeechSynthesis.
   * @param {string} text - Teks yang akan diucapkan.
   * @returns {Promise<void>} - Resolve setelah ucapan selesai.
   */
  speak(text) {
    return new Promise((resolve) => {
      // Hentikan ucapan sebelumnya
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'id-ID';
      utterance.rate = 1.0;
      utterance.pitch = 0.95;
      utterance.volume = 1;

      if (this.indonesianVoice) {
        utterance.voice = this.indonesianVoice;
      }

      if (this.onStart) this.onStart(text);

      // Timeout 3 detik: Chrome/Linux kadang silent fail tanpa trigger callback
      const timeout = setTimeout(() => {
        if (this.onEnd) this.onEnd();
        resolve();
      }, 3000);

      utterance.onend = () => {
        clearTimeout(timeout);
        if (this.onEnd) this.onEnd();
        resolve();
      };

      utterance.onerror = () => {
        clearTimeout(timeout);
        // Jika speech gagal, tetap lanjut
        if (this.onEnd) this.onEnd();
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  /** Hentikan semua ucapan */
  stop() {
    window.speechSynthesis.cancel();
  }
}
