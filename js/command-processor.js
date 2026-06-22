/**
 * CommandProcessor
 * Memproses perintah suara dengan pattern matching fleksibel.
 * Mendukung multiple patterns per command dan normalisasi teks.
 */
class CommandProcessor {
  constructor() {
    /** @type {Array<{patterns: string[], action: Function, displayText?: string}>} */
    this.commands = [];

    // Callbacks
    this.onCommandExecuted = null;  // (displayText: string) => void
    this.onUnknownCommand = null;   // (transcript: string) => void
  }

  /**
   * Daftarkan satu command.
   * @param {{patterns: string[], action: Function, displayText?: string}} config
   */
  register(config) {
    this.commands.push(config);
  }

  /**
   * Daftarkan banyak command sekaligus.
   * @param {Array<{patterns: string[], action: Function, displayText?: string}>} arr
   */
  registerAll(arr) {
    this.commands.push(...arr);
  }

  /**
   * Normalisasi teks: lowercase, hilangkan tanda baca, rapikan spasi.
   * @param {string} text
   * @returns {string}
   */
  normalize(text) {
    return text
      .toLowerCase()
      .replace(/[.,!?;:()"'«»\-–—/\\@#$%^&*~`{}[\]|_+=]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Proses transkrip dan jalankan command yang cocok.
   * @param {string} transcript - Teks hasil speech-to-text.
   * @returns {boolean} - true jika ada command yang cocok.
   */
  process(transcript) {
    const normalized = this.normalize(transcript);

    // Wake word "jarwo" harus ada
    if (!normalized.includes('jarwo')) return false;

    // Coba cocokkan dengan setiap command
    for (const cmd of this.commands) {
      for (const pattern of cmd.patterns) {
        const normPattern = this.normalize(pattern);

        // Cek apakah normalized text mengandung pattern dengan word boundary
        if (this._matchWithBoundary(normalized, normPattern)) {
          if (this.onCommandExecuted) {
            this.onCommandExecuted(cmd.displayText || 'Perintah dijalankan');
          }
          cmd.action();
          return true;
        }
      }
    }

    // Tidak ada yang cocok
    if (this.onUnknownCommand) {
      this.onUnknownCommand(normalized);
    }
    return false;
  }

  /**
   * Cek apakah `text` mengandung `pattern` dengan word boundary.
   * Contoh: "jarwo rekaman" TIDAK cocok dengan pattern "jarwo rekam"
   * karena setelah "rekam" ada huruf "a" (bukan spasi/akhir string).
   * @param {string} text
   * @param {string} pattern
   * @returns {boolean}
   */
  _matchWithBoundary(text, pattern) {
    const idx = text.indexOf(pattern);
    if (idx === -1) return false;

    // Word boundary sebelum pattern (harus spasi atau awal string)
    if (idx > 0 && text[idx - 1] !== ' ') return false;

    // Word boundary setelah pattern (harus spasi atau akhir string)
    const after = idx + pattern.length;
    if (after < text.length && text[after] !== ' ') return false;

    return true;
  }
}
