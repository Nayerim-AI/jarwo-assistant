/**
 * UIManager
 * Mengelola seluruh manipulasi DOM dan tampilan website.
 */
class UIManager {
  constructor() {
    // --- Cache DOM Elements ---
    this.radar          = document.getElementById('radar');
    this.statusDot      = document.getElementById('statusDot');
    this.statusText     = document.getElementById('statusText');
    this.transcriptText = document.getElementById('transcriptText');
    this.responseText   = document.getElementById('responseText');
    this.listeningInfo  = document.getElementById('listeningInfo');
    this.listeningTimer = document.getElementById('listeningTimer');
    this.recordingInfo  = document.getElementById('recordingInfo');
    this.recordingTimer = document.getElementById('recordingTimer');
    this.waveBars       = document.getElementById('waveBars');
    this.audioPlayerContainer = document.getElementById('audioPlayerContainer');
    this.audioPlayer    = document.getElementById('audioPlayer');
    this.recordingMeta  = document.getElementById('recordingMeta');
    this.historyList    = document.getElementById('historyList');
    this.supportNotice  = document.getElementById('supportNotice');

    // Buttons
    this.btnActivate   = document.getElementById('btnActivate');
    this.btnDeactivate = document.getElementById('btnDeactivate');
    this.btnStartRec   = document.getElementById('btnStartRecording');
    this.btnStopRec    = document.getElementById('btnStopRecording');
    this.btnDownload   = document.getElementById('btnDownload');
    this.btnClear      = document.getElementById('btnClear');

    // Status color map
    this.statusColors = {
      STANDBY:     { color: '#00d4ff', text: 'STANDBY' },
      LISTENING:   { color: '#10b981', text: 'MENDENGARKAN' },
      SPEAKING:    { color: '#f59e0b', text: 'BERBICARA' },
      RECORDING:   { color: '#ef4444', text: 'MEREKAM' },
      ERROR:       { color: '#ef4444', text: 'ERROR' },
    };
  }

  /**
   * Perbarui status utama (dot + text + radar class).
   * @param {'STANDBY'|'LISTENING'|'SPEAKING'|'RECORDING'|'ERROR'} status
   */
  setStatus(status) {
    const s = this.statusColors[status] || this.statusColors.STANDBY;
    this.statusText.textContent = s.text;
    this.statusText.style.color = s.color;
    this.statusDot.style.backgroundColor = s.color;
    this.statusDot.style.boxShadow = `0 0 10px ${s.color}`;

    // Update radar class
    this.radar.className = 'radar';
    const clsMap = {
      LISTENING: 'listening',
      SPEAKING:  'speaking',
      RECORDING: 'recording',
      ERROR:     'error',
    };
    if (clsMap[status]) {
      this.radar.classList.add(clsMap[status]);
    }
  }

  /** Tampilkan transkrip pengguna */
  setTranscript(text) {
    this.transcriptText.textContent = text || '\u2014';
  }

  /** Tampilkan respons Jarwo */
  setResponse(text) {
    this.responseText.textContent = text || '\u2014';
  }

  /** Perbarui timer rekaman (ms → MM:SS) */
  updateRecordingTimer(ms) {
    const totalSec = Math.floor(ms / 1000);
    const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const s = String(totalSec % 60).padStart(2, '0');
    this.recordingTimer.textContent = `${m}:${s}`;
  }

  /** Tampilkan panel rekaman */
  showListeningUI() {
    if (!this.listeningInfo) return;
    this.listeningInfo.style.display = 'block';
    this.waveBars.classList.add('active');
    if (this.listeningTimer) this.listeningTimer.textContent = '00:00';
  }

  hideListeningUI() {
    if (!this.listeningInfo) return;
    this.listeningInfo.style.display = 'none';
    this.waveBars.classList.remove('active');
  }

  /** Tampilkan panel recording manual */
  showRecordingUI() {
    this.recordingInfo.style.display = 'block';
    this.waveBars.classList.add('active');
    this.recordingTimer.textContent = '00:00';
  }

  /** Sembunyikan panel recording manual */
  hideRecordingUI() {
    this.recordingInfo.style.display = 'none';
    this.waveBars.classList.remove('active');
  }

  /** Tampilkan audio player dengan hasil rekaman */
  showAudioPlayer(blobUrl, durationMs, timestamp) {
    this.audioPlayer.src = blobUrl;
    this.audioPlayerContainer.style.display = 'block';

    const totalSec = Math.floor(durationMs / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const durStr = `${m}:${String(s).padStart(2, '0')}`;
    const timeStr = timestamp.toLocaleString('id-ID', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

    this.recordingMeta.textContent = `Durasi: ${durStr}  \u2022  ${timeStr}`;
  }

  /** Sembunyikan audio player */
  hideAudioPlayer() {
    this.audioPlayerContainer.style.display = 'none';
    this.audioPlayer.removeAttribute('src');
    this.audioPlayer.load();
  }

  /** Tambahkan item ke riwayat perintah */
  addHistory(text) {
    // Hapus placeholder jika ada
    const empty = this.historyList.querySelector('.history-empty');
    if (empty) empty.remove();

    const item = document.createElement('div');
    item.className = 'history-item';
    const time = new Date().toLocaleTimeString('id-ID', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    item.innerHTML = `<span class="time">${time}</span>${this._escapeHtml(text)}`;
    this.historyList.prepend(item);

    // Maks 20 item
    while (this.historyList.children.length > 20) {
      this.historyList.removeChild(this.historyList.lastChild);
    }
  }

  /** Perbarui status enabled/disabled tombol berdasarkan state */
  updateButtons(state) {
    this.btnActivate.disabled   = state.isAssistantActive || state.isRecording;
    this.btnDeactivate.disabled = !state.isAssistantActive;
    this.btnStartRec.disabled   = state.isAssistantActive || state.isRecording;
    this.btnStopRec.disabled    = !state.isRecording;
    this.btnDownload.disabled   = !state.hasRecording;
    this.btnClear.disabled      = !state.hasRecording;
  }

  /** Tampilkan pesan error di panel support notice */
  showSupportNotice(msg) {
    this.supportNotice.textContent = msg;
    this.supportNotice.classList.add('visible');
  }

  /** Sembunyikan support notice */
  hideSupportNotice() {
    this.supportNotice.classList.remove('visible');
  }

  /** Escape HTML untuk keamanan */
  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
