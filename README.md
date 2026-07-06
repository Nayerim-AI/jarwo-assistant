# JARWO AI Assistant

Asisten suara pribadi berbasis web dengan mode **lokal CPU**. Browser hanya merekam audio dengan **MediaRecorder API**, lalu backend lokal melakukan ASR/command/TTS tanpa Web Speech API/cloud ASR.

## Cara Menjalankan

1. Buka terminal di folder `jarwo-assistant`:

```bash
cd jarwo-assistant
```

2. Jalankan server HTTP lokal:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install flask vosk
python server.py
```

Untuk ASR lokal, taruh model Vosk Bahasa Indonesia di:

```text
models/vosk-id/
```

Atau set env:

```bash
JARWO_VOSK_MODEL=/path/to/vosk-model-small-id python server.py
```

Untuk TTS lokal, install salah satu engine: `espeak-ng`, `espeak`, atau lanjutkan nanti dengan Piper.

3. Buka browser dan akses:

```
http://localhost:8095
```

> **Catatan:** Mode ini tidak memakai Web Speech API. Akses mikrofon browser tetap membutuhkan `localhost` atau HTTPS.

## Browser yang Direkomendasikan

- **Google Chrome** (v80+) — dukungan penuh untuk MediaRecorder/getUserMedia
- **Microsoft Edge** (Chromium-based, v80+)
- **Mozilla Firefox** — bisa digunakan selama MediaRecorder/getUserMedia tersedia

## Cara Menggunakan

1. Buka halaman `http://localhost:8095`
2. Klik tombol **Aktifkan Jarwo**
3. Izinkan akses mikrofon saat diminta browser
4. Asisten akan menyapa dan siap digunakan
5. Ucapkan **"Jarwo"** sebagai wake word, atau langsung **"Jarwo <perintah>"**. Listener otomatis mencoba aktif saat halaman dibuka.

## Daftar Perintah Suara

| Perintah | Fungsi |
|----------|--------|
| "Jarwo rekam" | Memulai rekaman audio |
| "Jarwo mulai rekam" | Memulai rekaman audio |
| "Jarwo mulai merekam" | Memulai rekaman audio |
| "Jarwo berhenti rekam" | Menghentikan rekaman |
| "Jarwo stop rekam" | Menghentikan rekaman |
| "Jarwo hentikan rekaman" | Menghentikan rekaman |
| "Jarwo selesai rekam" | Menghentikan rekaman |
| "Jarwo simpan rekaman" | Mengunduh file rekaman |
| "Jarwo download rekaman" | Mengunduh file rekaman |
| "Jarwo unduh rekaman" | Mengunduh file rekaman |
| "Jarwo hapus rekaman" | Menghapus rekaman dari memori |
| "Jarwo buang rekaman" | Menghapus rekaman dari memori |
| "Jarwo jam berapa" | Menampilkan waktu saat ini |
| "Jarwo tanggal berapa" | Menampilkan tanggal saat ini |
| "Jarwo hari apa" | Menampilkan hari dan tanggal |
| "Jarwo hari ini" | Menampilkan hari dan tanggal |
| "Jarwo berhenti mendengarkan" | Menonaktifkan asisten |
| "Jarwo mati" | Menonaktifkan asisten |
| "Jarwo nonaktifkan" | Menonaktifkan asisten |
| "Jarwo tidur" | Menonaktifkan asisten |

## Struktur Project

```
jarwo-assistant/
├── index.html              # Halaman utama
├── css/
│   └── style.css           # Tampilan futuristik (dark theme, animasi)
├── js/
│   ├── app.js              # Main application (state, wiring)
│   ├── speech-recognition.js  # Speech-to-Text manager
│   ├── text-to-speech.js   # Text-to-Speech manager
│   ├── audio-recorder.js   # MediaRecorder manager
│   ├── command-processor.js # Command pattern matching
│   └── ui-manager.js       # DOM manipulation
└── README.md               # Dokumentasi
```

## Keterbatasan

- ASR lokal membutuhkan model Vosk Bahasa Indonesia di `models/vosk-id/`; tanpa model, backend akan melaporkan `missing_vosk_model`
- TTS lokal membutuhkan `espeak-ng`, `espeak`, atau engine lokal lain; tanpa engine, endpoint TTS akan melaporkan `missing_tts_engine`
- **Rekaman hanya tersimpan di memori browser (RAM)** — akan hilang jika halaman di-refresh atau ditutup
- Pastikan mengunduh rekaman sebelum menutup halaman
- Kualitas ASR bergantung model lokal dan kualitas mikrofon

## Privasi

- **Semua pemrosesan suara dilakukan lokal** di backend Jarwo pada mesin ini
- Tidak memakai Web Speech API, SpeechSynthesis API, atau cloud ASR/TTS
- Audio perintah dikirim dari browser ke backend lokal `/api/voice-command`
- Tidak ada rekaman otomatis tanpa izin dan aktivasi pengguna
- File rekaman harus diunduh secara manual agar tersimpan permanen

## Teknologi

- HTML5
- CSS3 (animasi, glassmorphism, glow effects, responsive)
- JavaScript (ES6+ classes, async/await)
- Flask local backend
- Vosk local ASR
- Local TTS engine (`espeak-ng`/`espeak`; Piper planned)
- MediaRecorder API
- Canvas API (partikel background)

## Lisensi

MIT — Gunakan, modifikasi, dan sebarkan secara bebas.
