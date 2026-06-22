/**
 * AudioRecorderManager
 * Mengelola MediaRecorder API untuk merekam audio dari mikrofon.
 * Fitur: start/stop recording, timer, download, cleanup.
 */
class AudioRecorderManager {
  constructor() {
    this.stream = null;
    this.mediaRecorder = null;
    this.chunks = [];
    this.blob = null;
    this.blobUrl = null;
    this.audioMimeType = '';
    this.isRecording = false;
    this.startTime = null;
    this.timerInterval = null;

    // Callbacks
    this.onStart = null;                    // () => void
    this.onStop = null;                     // (blob, blobUrl) => void
    this.onTimerUpdate = null;              // (ms) => void
    this.onError = null;                    // (error) => void
  }

  /**
   * Minta akses mikrofon. Panggil sekali di awal.
   * @returns {Promise<MediaStream>}
   */
  async requestMicrophone() {
    if (this.stream) return this.stream;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('getUserMedia tidak didukung browser ini.');
    }

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return this.stream;
  }

  /**
   * Mulai rekaman audio.
   * @returns {Promise<void>}
   */
  startRecording() {
    return new Promise((resolve, reject) => {
      if (!this.stream) {
        reject(new Error('Mikrofon belum tersedia.'));
        return;
      }

      this.chunks = [];
      if (this.blobUrl) {
        URL.revokeObjectURL(this.blobUrl);
        this.blobUrl = null;
      }
      this.blob = null;

      // Cari MIME type yang didukung browser
      const types = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/wav',
      ];
      let selectedType = '';
      for (const t of types) {
        if (MediaRecorder.isTypeSupported(t)) {
          selectedType = t;
          break;
        }
      }

      try {
        this.mediaRecorder = new MediaRecorder(this.stream, {
          mimeType: selectedType || undefined,
        });
      } catch (e) {
        reject(new Error('Gagal membuat MediaRecorder.'));
        return;
      }

      // Simpan MIME type aktual yang digunakan
      this.audioMimeType = this.mediaRecorder.mimeType || 'audio/webm';

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };

      this.mediaRecorder.onstart = () => {
        this.isRecording = true;
        this.startTime = Date.now();
        this._startTimer();
        if (this.onStart) this.onStart();
        resolve();
      };

      this.mediaRecorder.onstop = () => {
        this.isRecording = false;
        this._stopTimer();

        const blob = new Blob(this.chunks, { type: this.audioMimeType });
        this.blob = blob;
        this.blobUrl = URL.createObjectURL(blob);

        if (this.onStop) this.onStop(blob, this.blobUrl);
      };

      this.mediaRecorder.onerror = () => {
        this.isRecording = false;
        this._stopTimer();
        if (this.onError) this.onError(new Error('MediaRecorder error.'));
      };

      // Ambil data setiap 100ms
      this.mediaRecorder.start(100);
    });
  }

  /** Hentikan rekaman */
  stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  /** Timer interval */
  _startTimer() {
    this.timerInterval = setInterval(() => {
      if (this.startTime && this.onTimerUpdate) {
        this.onTimerUpdate(Date.now() - this.startTime);
      }
    }, 100);
  }

  _stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /** Durasi rekaman saat ini */
  getDuration() {
    return this.startTime ? Date.now() - this.startTime : 0;
  }

  /** Waktu mulai rekaman */
  getTimestamp() {
    return this.startTime ? new Date(this.startTime) : new Date();
  }

  /** Generate nama file otomatis */
  getFileName() {
    const d = this.startTime ? new Date(this.startTime) : new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `jarwo-recording-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.webm`;
  }

  /** Download rekaman */
  download() {
    if (!this.blob || !this.blobUrl) return;
    const a = document.createElement('a');
    a.href = this.blobUrl;
    a.download = this.getFileName();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /** Hapus rekaman dari memori */
  clear() {
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
    }
    this.blob = null;
    this.blobUrl = null;
    this.chunks = [];
    this.startTime = null;
  }

  /** Bersihkan semua resource (mikrofon, timer, blob) */
  cleanup() {
    this._stopTimer();
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
  }
}
