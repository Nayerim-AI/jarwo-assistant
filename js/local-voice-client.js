/**
 * LocalVoiceClient
 * Full-local CPU voice loop. No Web Speech API.
 * Records short audio chunks in the browser and sends them to the local backend.
 */
class LocalVoiceClient {
  constructor() {
    this.mediaRecorder = null;
    this.stream = null;
    this.isListening = false;
    this.chunkMs = 5200;

    this.onListeningStart = null;
    this.onListeningStop = null;
    this.onTranscript = null;
    this.onReply = null;
    this.onError = null;
  }

  async start() {
    if (this.isListening) return;
    if (this.stream) this._releaseStream();
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    this.isListening = true;
    if (this.onListeningStart) this.onListeningStart();
    this._recordOnce();
  }

  stop() {
    const wasListening = this.isListening;
    this.isListening = false;
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this._releaseStream();
    if (wasListening && this.onListeningStop) this.onListeningStop();
  }

  _releaseStream() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }

  async _recordOnce() {
    if (!this.isListening || !this.stream) return;

    const chunks = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };

    this.mediaRecorder.onstop = async () => {
      if (!this.isListening) return;
      this.isListening = false;
      try {
        const blob = new Blob(chunks, { type: mimeType });
        await this._sendAudio(blob);
      } catch (err) {
        if (this.onError) this.onError(err);
      } finally {
        this._releaseStream();
        if (this.onListeningStop) this.onListeningStop();
      }
    };

    this.mediaRecorder.start();
    setTimeout(() => {
      if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.stop();
      }
    }, this.chunkMs);
  }

  async _sendAudio(blob) {
    const form = new FormData();
    form.append('audio', blob, 'jarwo.webm');
    const res = await fetch('/api/voice-command', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    await this.handleCommandData(data);
  }

  async handleCommandData(data) {
    if (data.transcript && this.onTranscript) this.onTranscript(data.transcript, data.detected_lang);
    if (data.reply && data.intent !== 'wake_word_missing') {
      if (this.onReply) await this.onReply(data.reply, data);
      await this._playTts(data.reply);
    }
    if (data.transcript) {
      console.log(`[JARWO] ${data.detected_lang||'?'} | ${data.transcript} | ${data.intent}`);
    }
  }

  async sendTextCommand(text) {
    const res = await fetch('/api/text-command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    await this.handleCommandData(data);
    return data;
  }

  async _playTts(text) {
    const res = await fetch(`/api/tts?text=${encodeURIComponent(text)}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    await new Promise((resolve) => {
      const audio = new Audio(url);
      audio.onended = resolve;
      audio.onerror = resolve;
      audio.play().catch(resolve);
    });
    URL.revokeObjectURL(url);
  }
}
