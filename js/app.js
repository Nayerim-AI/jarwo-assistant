/**
 * JARWO AI ASSISTANT - Main Application
 * Menghubungkan semua manager dan mengelola state aplikasi.
 */
;(async function () {
  'use strict';

  // ================================================================
  // STATE
  // ================================================================
  const state = {
    isAssistantActive: false,
    isListening: false,
    isSpeaking: false,
    isRecording: false,
    hasRecording: false,
    recognitionRestartEnabled: true,
  };

  // ================================================================
  // MANAGERS
  // ================================================================
  const speech    = new SpeechRecognitionManager();
  const tts       = new TextToSpeechManager();
  const recorder  = new AudioRecorderManager();
  const cmdProc   = new CommandProcessor();
  const ui        = new UIManager();

  // ================================================================
  // HELPER: Update tombol dari state
  // ================================================================
  function syncButtons() {
    ui.updateButtons(state);
  }

  // ================================================================
  // HELPER: Bicara + hentikan speech recognition selama bicara
  // ================================================================
  async function speak(text) {
    // Speech recognition akan di-stop oleh TTS onStart callback
    await tts.speak(text);
    // Speech recognition akan di-restart oleh TTS onEnd callback
  }

  // ================================================================
  // SPEECH RECOGNITION CALLBACKS
  // ================================================================
  speech.onResult = (transcript) => {
    ui.setTranscript(transcript);
    cmdProc.process(transcript);
  };

  speech.onInterimResult = (transcript) => {
    ui.setTranscript(transcript);
  };

  speech.onStart = () => {
    state.isListening = true;
    ui.setStatus('LISTENING');
  };

  speech.onEnd = () => {
    state.isListening = false;

    // Auto-restart jika asisten aktif, tidak sedang bicara, dan restart diizinkan
    if (
      state.isAssistantActive &&
      !state.isSpeaking &&
      state.recognitionRestartEnabled &&
      !speech.isDisabled
    ) {
      setTimeout(() => {
        if (state.isAssistantActive && !state.isSpeaking) {
          speech.start();
          // Fallback jika speech.start() gagal
          setTimeout(() => {
            if (!state.isListening && state.isAssistantActive && !state.isSpeaking) {
              ui.setStatus('STANDBY');
            }
          }, 500);
        }
      }, 200);
    }

    // Jika asisten nonaktif, kembalikan ke STANDBY
    if (!state.isAssistantActive && !state.isSpeaking) {
      ui.setStatus('STANDBY');
    }
  };

  speech.onError = (error) => {
    console.warn('[JARWO] SpeechRecognition error:', error);
    if (error === 'not-allowed' || error === 'service-not-allowed') {
      state.isAssistantActive = false;
      state.recognitionRestartEnabled = false;
      ui.setStatus('ERROR');
      ui.setResponse('\u26A0 Akses mikrofon tidak tersedia.');
      syncButtons();
    } else if (error === 'network') {
      ui.setResponse('\u26A0 Koneksi ke server speech terputus. Perintah suara tidak tersedia, gunakan tombol.');
    }
  };

  speech.onDisabled = (lastError) => {
    console.warn('[JARWO] SpeechRecognition disabled after too many errors:', lastError);
    state.recognitionRestartEnabled = false;
    if (state.isAssistantActive) {
      ui.setResponse('\u26A0 Speech recognition tidak tersedia. Gunakan tombol untuk mengontrol.');
      ui.setStatus('STANDBY');
      syncButtons();
    }
  };

  // ================================================================
  // TTS CALLBACKS
  // ================================================================
  tts.onStart = (text) => {
    state.isSpeaking = true;
    ui.setStatus('SPEAKING');
    ui.setResponse(text);

    // Hentikan speech recognition saat bicara
    if (state.isListening) {
      speech.stop();
    }
  };

  tts.onEnd = () => {
    state.isSpeaking = false;
    // Kosongkan response text setelah bicara selesai
    setTimeout(() => {
      if (!state.isSpeaking) {
        ui.setResponse('');
      }
    }, 1500);

    // Restart speech recognition jika asisten masih aktif
    if (state.isAssistantActive && state.recognitionRestartEnabled && !speech.isDisabled) {
      setTimeout(() => {
        if (state.isAssistantActive && !state.isSpeaking) {
          speech.start();
          // Fallback: jika speech.start() gagal (misal null recognition),
          // kembalikan status setelah 500ms
          setTimeout(() => {
            if (!state.isListening && state.isAssistantActive) {
              ui.setStatus('STANDBY');
            }
          }, 500);
        }
      }, 300);
    } else if (!state.isAssistantActive) {
      ui.setStatus('STANDBY');
    } else {
      // Active tapi restart disabled
      ui.setStatus('STANDBY');
    }
  };

  // ================================================================
  // RECORDER CALLBACKS
  // ================================================================
  recorder.onStart = () => {
    state.isRecording = true;
    ui.setStatus('RECORDING');
    ui.showRecordingUI();
    syncButtons();
  };

  recorder.onStop = (blob, url) => {
    state.isRecording = false;
    state.hasRecording = true;
    const duration = recorder.getDuration();
    const timestamp = recorder.getTimestamp();
    ui.hideRecordingUI();
    ui.showAudioPlayer(url, duration, timestamp);
    ui.setStatus(state.isAssistantActive ? 'LISTENING' : 'STANDBY');
    syncButtons();
  };

  recorder.onTimerUpdate = (ms) => {
    ui.updateRecordingTimer(ms);
  };

  recorder.onError = () => {
    state.isRecording = false;
    ui.hideRecordingUI();
    ui.setStatus(state.isAssistantActive ? 'LISTENING' : 'STANDBY');
    ui.setResponse('\u26A0 Gagal merekam audio.');
    syncButtons();
  };

  // ================================================================
  // COMMAND PROCESSOR CALLBACKS
  // ================================================================
  cmdProc.onCommandExecuted = (displayText) => {
    ui.addHistory(displayText);
  };

  cmdProc.onUnknownCommand = (normalized) => {
    const cleaned = normalized.replace(/jarwo\s*/i, '').trim();
    if (cleaned) {
      // speak async — jangan await di sini karena dipanggil dari sync callback
      speak('Maaf, perintah belum saya kenali.');
      ui.addHistory(`Perintah tidak dikenal: ${cleaned}`);
    }
  };

  // ================================================================
  // REGISTER COMMANDS
  // ================================================================
  cmdProc.registerAll([
    // --- Rekam ---
    {
      patterns: [
        'jarwo rekam',
        'jarwo mulai rekam',
        'jarwo mulai merekam',
      ],
      action: startRecording,
      displayText: 'Mulai merekam',
    },
    // --- Berhenti Rekam ---
    {
      patterns: [
        'jarwo berhenti rekam',
        'jarwo stop rekam',
        'jarwo hentikan rekaman',
        'jarwo selesai rekam',
      ],
      action: stopRecording,
      displayText: 'Berhenti merekam',
    },
    // --- Simpan / Download ---
    {
      patterns: [
        'jarwo simpan rekaman',
        'jarwo download rekaman',
        'jarwo unduh rekaman',
      ],
      action: downloadRecording,
      displayText: 'Menyimpan rekaman',
    },
    // --- Hapus Rekaman ---
    {
      patterns: [
        'jarwo hapus rekaman',
        'jarwo buang rekaman',
      ],
      action: clearRecording,
      displayText: 'Menghapus rekaman',
    },
    // --- Jam ---
    {
      patterns: ['jarwo jam berapa'],
      action: tellTime,
      displayText: 'Menanyakan jam',
    },
    // --- Tanggal ---
    {
      patterns: [
        'jarwo tanggal berapa',
        'jarwo hari apa',
        'jarwo hari ini',
      ],
      action: tellDate,
      displayText: 'Menanyakan tanggal',
    },
    // --- Nonaktifkan ---
    {
      patterns: [
        'jarwo berhenti mendengarkan',
        'jarwo mati',
        'jarwo nonaktifkan',
        'jarwo tidur',
      ],
      action: deactivateAssistant,
      displayText: 'Menonaktifkan asisten',
    },
  ]);

  // ================================================================
  // COMMAND ACTIONS
  // ================================================================

  async function startRecording() {
    if (state.isRecording) {
      await speak('Sudah dalam mode rekaman.');
      return;
    }
    try {
      await recorder.startRecording();
      await speak('Baik, rekaman dimulai.');
    } catch (e) {
      ui.setResponse('\u26A0 Gagal memulai rekaman.');
      console.error('[JARWO] startRecording error:', e);
    }
  }

  async function stopRecording() {
    if (!state.isRecording) {
      await speak('Tidak ada rekaman yang berjalan.');
      return;
    }
    recorder.stopRecording();
    // onStop callback akan memperbarui UI.
    // Speak setelah delay kecil agar blob siap.
    await new Promise((r) => setTimeout(r, 300));
    await speak('Rekaman dihentikan dan siap disimpan.');
  }

  function downloadRecording() {
    if (!state.hasRecording) {
      ui.setResponse('\u26A0 Belum ada rekaman untuk diunduh.');
      return;
    }
    recorder.download();
    ui.addHistory('Rekaman diunduh');
  }

  function clearRecording() {
    if (!state.hasRecording) {
      ui.setResponse('\u26A0 Tidak ada rekaman untuk dihapus.');
      return;
    }
    recorder.clear();
    state.hasRecording = false;
    ui.hideAudioPlayer();
    syncButtons();
    ui.addHistory('Rekaman dihapus');
  }

  async function tellTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });
    await speak(`Sekarang pukul ${timeStr}.`);
  }

  async function tellDate() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    await speak(`Hari ini ${dateStr}.`);
  }

  async function activateAssistant() {
    if (state.isAssistantActive) return;

    try {
      await recorder.requestMicrophone();
    } catch (e) {
      ui.setStatus('ERROR');
      ui.setResponse('\u26A0 Akses mikrofon tidak tersedia.');
      console.error('[JARWO] Mic access denied:', e);
      return;
    }

    state.isAssistantActive = true;
    state.recognitionRestartEnabled = true;

    // Reset speech jika sebelumnya dinonaktifkan karena error
    if (speech.isDisabled) {
      speech.enable();
    }

    await speak('Saya mendengarkan.');
    speech.start();
    syncButtons();
  }

  function deactivateAssistant() {
    state.isAssistantActive = false;
    state.recognitionRestartEnabled = false;
    speech.stop();
    ui.setStatus('STANDBY');
    ui.setTranscript('\u2014');
    syncButtons();
  }

  // ================================================================
  // BUTTON HANDLERS
  // ================================================================
  document.getElementById('btnActivate').addEventListener('click', activateAssistant);
  document.getElementById('btnDeactivate').addEventListener('click', deactivateAssistant);
  document.getElementById('btnStartRecording').addEventListener('click', startRecording);
  document.getElementById('btnStopRecording').addEventListener('click', stopRecording);
  document.getElementById('btnDownload').addEventListener('click', downloadRecording);
  document.getElementById('btnClear').addEventListener('click', clearRecording);

  // ================================================================
  // PARTICLE BACKGROUND (futuristic floating dots)
  // ================================================================
  function initParticles() {
    const canvas = document.getElementById('particles');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w, h, particles = [];

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }

    function createParticles(count) {
      particles = [];
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.random() * 1.5 + 0.5,
          dx: (Math.random() - 0.5) * 0.3,
          dy: (Math.random() - 0.5) * 0.3,
          o: Math.random() * 0.4 + 0.1,
        });
      }
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 212, 255, ${p.o})`;
        ctx.fill();
        p.x += p.dx;
        p.y += p.dy;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;
      }

      // Connect nearby particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(0, 212, 255, ${0.06 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      requestAnimationFrame(draw);
    }

    window.addEventListener('resize', resize);
    resize();
    createParticles(80);
    draw();
  }

  // ================================================================
  // INIT
  // ================================================================
  async function init() {
    ui.hideSupportNotice();

    // 1. Cek browser support
    const hasSR = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    const hasMR = !!window.MediaRecorder;
    if (!hasSR || !hasMR) {
      ui.showSupportNotice(
        'Peramban Anda tidak mendukung Web Speech API atau MediaRecorder API. ' +
        'Gunakan Google Chrome atau Microsoft Edge versi terbaru.'
      );
      // Tetap lanjut — mungkin user cuma lihat UI
    }

    // 2. Inisialisasi SpeechRecognition
    if (hasSR) {
      try {
        speech.init();
      } catch (e) {
        ui.showSupportNotice('Web Speech API tidak tersedia.');
        console.error('[JARWO] Speech init error:', e);
      }
    }

    // 3. Inisialisasi TTS (async — muat voices)
    await tts.init();

    // 4. State awal
    ui.setStatus('STANDBY');
    syncButtons();

    // 5. Particle background (tidak esensial)
    try {
      initParticles();
    } catch (_) { /* particle gagal, abaikan */ }

    // 6. Sambutan awal (wrap di try-catch karena autoplay bisa block)
    try {
      await speak('Sistem Jarwo siap digunakan.');
    } catch (_) {
      // Autoplay diblokir, bukan masalah fatal
      console.warn('[JARWO] Sambutan awal tidak dapat diputar (autoplay block)');
    }
  }

  // Jalankan!
  init().catch((err) => {
    console.error('[JARWO] Fatal init error:', err);
    ui.setStatus('ERROR');
    ui.setResponse('\u26A0 Terjadi kesalahan saat inisialisasi.');
  });
})();
