/**
 * JARWO AI ASSISTANT - Local CPU Application
 * Full-local mode: browser records audio, local backend performs ASR/command/TTS.
 */
;(async function () {
  'use strict';

  const state = {
    isAssistantActive: false,
    isListening: false,
    isSpeaking: false,
    isRecording: false,
    hasRecording: false,
    recordingAutoStopTimer: null,
  };

  const voice = new LocalVoiceClient();
  const wake = new WakeWordClient();
  const recorder = new AudioRecorderManager();
  const ui = new UIManager();

  function syncButtons() {
    ui.updateButtons(state);
  }

  function setReply(text) {
    ui.setResponse(text);
    setTimeout(() => {
      if (!state.isSpeaking) ui.setResponse('');
    }, 2500);
  }

  voice.onListeningStart = () => {
    state.isListening = true;
    ui.setStatus('LISTENING');
    ui.showListeningUI();
    syncButtons();
  };

  voice.onListeningStop = () => {
    state.isListening = false;
    state.isAssistantActive = false;
    ui.hideListeningUI();
    ui.setStatus('STANDBY');
    syncButtons();
    if (!state.isRecording) wake.resume().catch((err) => console.error('[JARWO] wake resume error:', err));
  };

  voice.onTranscript = (transcript, lang) => {
    ui.setTranscript(transcript || '—');
    if (lang) ui.setStatus(`ASR[${lang}]`);
  };

  voice.onReply = async (reply, data) => {
    if (data.intent === 'start_recording') {
      setReply(reply);
      if (data.transcript) ui.addHistory(`${data.detected_lang||'?'} "${data.transcript}" → start recording`);
      const seconds = data.args?.duration_seconds || 30;
      await startRecording({ fromVoice: true, durationSeconds: seconds });
      return;
    }

    if (data.intent === 'stop_recording') {
      setReply(reply);
      if (data.transcript) ui.addHistory(`${data.detected_lang||'?'} "${data.transcript}" → stop recording`);
      stopRecording({ fromVoice: true });
      return;
    }

    state.isSpeaking = true;
    ui.setStatus('SPEAKING');
    setReply(reply);
    if (data.transcript) {
      ui.addHistory(`${data.detected_lang||'?'} "${data.transcript}" → ${reply}`);
    }
    setTimeout(() => {
      state.isSpeaking = false;
      ui.setStatus('STANDBY');
    }, 1200);
  };

  voice.onError = (err) => {
    console.error('[JARWO] Local voice error:', err);
    ui.setStatus('ERROR');
    ui.setResponse('⚠ Backend suara lokal belum siap. Cek model ASR/TTS lokal.');
  };

  wake.onStart = () => ui.addHistory('Wake mode aktif: ucapkan "halo Jarwo"');
  wake.onTranscript = (transcript, lang) => {
    if (transcript) console.log(`[JARWO WAKE] ${lang||'?'} | ${transcript}`);
  };
  function stripWakeText(text) {
    return (text || '')
      .toLowerCase()
      .replace(/^(halo|hallo|hello)\s+/, '')
      .replace(/^(jarwo|jaro|jaru|yarwo|yaru)\b[,. ]*/, '')
      .trim();
  }

  wake.onWake = async (data) => {
    ui.addHistory(`${data.detected_lang||'?'} "${data.transcript}" → wake`);
    const command = stripWakeText(data.transcript);
    const hasInlineCommand = command && !['jarwo', 'jaro', 'jaru', 'yarwo', 'yaru'].includes(command);
    if (hasInlineCommand && command.length > 4) {
      ui.setResponse('Wake + command terdeteksi.');
      await voice.sendTextCommand(data.transcript);
      wake.resume().catch((err) => console.error('[JARWO] wake resume error:', err));
      return;
    }
    ui.setResponse('Wake terdeteksi. Silakan beri perintah.');
    await activateAssistant({ fromWake: true });
  };
  wake.onError = (err) => console.error('[JARWO] Wake error:', err);


  recorder.onStart = () => {
    state.isRecording = true;
    state.isAssistantActive = false;
    state.isListening = false;
    voice.stop();
    wake.pause();
    ui.hideListeningUI();
    ui.setStatus('RECORDING');
    ui.showRecordingUI();
    syncButtons();
  };

  recorder.onStop = (blob, url) => {
    clearRecordingAutoStop();
    state.isRecording = false;
    state.hasRecording = true;
    const duration = recorder.getDuration();
    const timestamp = recorder.getTimestamp();
    ui.hideRecordingUI();
    ui.showAudioPlayer(url, duration, timestamp);
    ui.setStatus('STANDBY');
    syncButtons();
    wake.resume().catch((err) => console.error('[JARWO] wake resume error:', err));
  };

  recorder.onTimerUpdate = (ms) => ui.updateRecordingTimer(ms);
  recorder.onError = () => {
    clearRecordingAutoStop();
    state.isRecording = false;
    ui.hideRecordingUI();
    ui.setStatus('STANDBY');
    ui.setResponse('⚠ Gagal merekam audio.');
    syncButtons();
    wake.resume().catch((err) => console.error('[JARWO] wake resume error:', err));
  };

  function clearRecordingAutoStop() {
    if (state.recordingAutoStopTimer) {
      clearTimeout(state.recordingAutoStopTimer);
      state.recordingAutoStopTimer = null;
    }
  }

  async function startRecording(options = {}) {
    if (state.isRecording) return setReply('Sudah dalam mode recording.');
    try {
      await recorder.requestMicrophone();
      await recorder.startRecording();
      if (options.durationSeconds) {
        clearRecordingAutoStop();
        state.recordingAutoStopTimer = setTimeout(() => {
          if (state.isRecording) stopRecording({ auto: true });
        }, options.durationSeconds * 1000);
      }
      if (!options.fromVoice) setReply('Recording dimulai.');
    } catch (e) {
      ui.setResponse('⚠ Gagal memulai recording.');
      console.error('[JARWO] startRecording error:', e);
    }
  }

  function stopRecording(options = {}) {
    if (!state.isRecording) return setReply('Tidak ada recording yang berjalan.');
    clearRecordingAutoStop();
    recorder.stopRecording();
    if (options.auto) setReply('Recording otomatis selesai dan siap disimpan.');
    else if (!options.fromVoice) setReply('Recording dihentikan dan siap disimpan.');
  }

  function downloadRecording() {
    if (!state.hasRecording) return ui.setResponse('⚠ Belum ada rekaman untuk diunduh.');
    recorder.download();
    ui.addHistory('Rekaman diunduh');
  }

  function clearRecording() {
    if (!state.hasRecording) return ui.setResponse('⚠ Tidak ada rekaman untuk dihapus.');
    recorder.clear();
    state.hasRecording = false;
    ui.hideAudioPlayer();
    syncButtons();
    ui.addHistory('Rekaman dihapus');
  }

  async function activateAssistant(options = {}) {
    if (state.isAssistantActive || state.isListening) return;
    try {
      if (!options.fromWake) wake.pause();
      state.isAssistantActive = true;
      await voice.start();
      if (!options.fromWake) ui.setResponse('Listening sekali. Ucapkan Jarwo + perintah, lalu sistem kembali standby.');
      else ui.setResponse('Saya mendengarkan. Ucapkan perintah sekarang.');
    } catch (e) {
      state.isAssistantActive = false;
      ui.setStatus('ERROR');
      ui.setResponse('⚠ Akses mikrofon tidak tersedia.');
      console.error('[JARWO] Mic access denied:', e);
    }
    syncButtons();
  }

  function deactivateAssistant() {
    state.isAssistantActive = false;
    voice.stop();
    ui.setStatus('STANDBY');
    ui.setTranscript('—');
    syncButtons();
    wake.resume().catch((err) => console.error('[JARWO] wake resume error:', err));
  }

  document.getElementById('btnActivate').addEventListener('click', activateAssistant);
  document.getElementById('btnDeactivate').addEventListener('click', deactivateAssistant);
  document.getElementById('btnStartRecording').addEventListener('click', startRecording);
  document.getElementById('btnStopRecording').addEventListener('click', stopRecording);
  document.getElementById('btnDownload').addEventListener('click', downloadRecording);
  document.getElementById('btnClear').addEventListener('click', clearRecording);

  function initParticles() {
    const canvas = document.getElementById('particles');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w, h, particles = [];
    function resize() { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; }
    function createParticles(count) {
      particles = [];
      for (let i = 0; i < count; i++) {
        particles.push({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.5 + 0.5, dx: (Math.random() - 0.5) * 0.3, dy: (Math.random() - 0.5) * 0.3, o: Math.random() * 0.4 + 0.1 });
      }
    }
    function draw() {
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = `rgba(0, 212, 255, ${p.o})`; ctx.fill();
        p.x += p.dx; p.y += p.dy;
        if (p.x < 0) p.x = w; if (p.x > w) p.x = 0; if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
      }
      requestAnimationFrame(draw);
    }
    window.addEventListener('resize', resize); resize(); createParticles(80); draw();
  }

  async function init() {
    ui.hideSupportNotice();
    if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) {
      ui.showSupportNotice('Peramban tidak mendukung MediaRecorder/getUserMedia. Gunakan Chrome/Edge terbaru.');
    }
    ui.setStatus('STANDBY');
    syncButtons();
    try { initParticles(); } catch (_) {}
    try {
      const res = await fetch('/api/capabilities');
      const caps = await res.json();
      ui.setResponse(`Mode ${caps.mode}. ASR: ${caps.asr}. TTS: ${caps.tts}.`);
      wake.start().catch((err) => {
        console.error('[JARWO] Wake start error:', err);
        ui.setResponse('Wake mode butuh izin mikrofon. Klik Listening Jarwo sekali jika browser memblokir mic.');
      });
    } catch (_) {
      ui.setResponse('Backend lokal belum tersambung.');
    }
  }

  init().catch((err) => {
    console.error('[JARWO] Fatal init error:', err);
    ui.setStatus('ERROR');
    ui.setResponse('⚠ Terjadi kesalahan saat inisialisasi.');
  });
})();
