/**
 * WakeWordClient
 * Lightweight browser wake loop. This is not openWakeWord yet; it uses the same
 * private ASR backend to detect "halo jarwo" / "jarwo" hands-free.
 */
class WakeWordClient {
  constructor() {
    this.mediaRecorder = null;
    this.stream = null;
    this.isRunning = false;
    this.isPaused = false;
    this.chunkMs = 2800;
    this.cooldownMs = 2200;
    this.wakeWords = ['halo jarwo', 'hallo jarwo', 'hello jarwo', 'jarwo', 'jaro', 'jaru', 'yarwo', 'yaru'];

    this.onWake = null;
    this.onStart = null;
    this.onStop = null;
    this.onTranscript = null;
    this.onError = null;
  }

  async start() {
    if (this.isRunning) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    this.isRunning = true;
    this.isPaused = false;
    if (this.onStart) this.onStart();
    this._recordLoop();
  }

  stop() {
    const wasRunning = this.isRunning;
    this.isRunning = false;
    this.isPaused = false;
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this._releaseStream();
    if (wasRunning && this.onStop) this.onStop();
  }

  pause() {
    this.isPaused = true;
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
  }

  async resume() {
    if (!this.isRunning) return;
    this.isPaused = false;
    if (!this.stream) {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    }
    setTimeout(() => this._recordLoop(), this.cooldownMs);
  }

  _releaseStream() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }

  async _recordLoop() {
    if (!this.isRunning || this.isPaused || !this.stream) return;

    const chunks = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };

    this.mediaRecorder.onstop = async () => {
      if (!this.isRunning || this.isPaused) return;
      try {
        const blob = new Blob(chunks, { type: mimeType });
        await this._checkWake(blob);
      } catch (err) {
        if (this.onError) this.onError(err);
      } finally {
        if (this.isRunning && !this.isPaused) {
          setTimeout(() => this._recordLoop(), 150);
        }
      }
    };

    this.mediaRecorder.start();
    setTimeout(() => {
      if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.stop();
      }
    }, this.chunkMs);
  }

  async _checkWake(blob) {
    const form = new FormData();
    form.append('audio', blob, 'wake.webm');
    const res = await fetch('/api/wake-check', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (data.transcript && this.onTranscript) this.onTranscript(data.transcript, data.detected_lang);
    if (data.wake) {
      this.pause();
      if (this.onWake) await this.onWake(data);
    }
  }
}
