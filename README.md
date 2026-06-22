# JARWO AI Assistant

Asisten suara pribadi berbasis web dengan teknologi **Web Speech API**, **SpeechSynthesis API**, dan **MediaRecorder API**.

## Cara Menjalankan

1. Buka terminal di folder `jarwo-assistant`:

```bash
cd jarwo-assistant
```

2. Jalankan server HTTP lokal:

```bash
python3 -m http.server 8000
```

3. Buka browser dan akses:

```
http://localhost:8000
```

> **Catatan:** Web Speech API pada beberapa browser (Chrome) membutuhkan koneksi internet. Untuk hasil terbaik, buka melalui `localhost` atau HTTPS.

## Browser yang Direkomendasikan

- **Google Chrome** (v80+) — dukungan penuh untuk Web Speech API dan MediaRecorder
- **Microsoft Edge** (Chromium-based, v80+)
- **Mozilla Firefox** — dukungan terbatas (SpeechRecognition tidak tersedia)

## Cara Menggunakan

1. Buka halaman `http://localhost:8000`
2. Klik tombol **Aktifkan Jarwo**
3. Izinkan akses mikrofon saat diminta browser
4. Asisten akan menyapa dan siap digunakan
5. Ucapkan perintah dengan diawali kata **"Jarwo"**

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

- **Web Speech API** (SpeechRecognition) membutuhkan koneksi internet di Chrome — pengenalan suara diproses oleh server Google
- Akurasi pengenalan bahasa Indonesia mungkin bervariasi tergantung browser dan kualitas mikrofon
- **Rekaman hanya tersimpan di memori browser (RAM)** — akan hilang jika halaman di-refresh atau ditutup
- Pastikan mengunduh rekaman sebelum menutup halaman
- SpeechSynthesis mungkin tidak memiliki suara bahasa Indonesia di semua OS

## Privasi

- **Semua pemrosesan dilakukan di browser** — tidak ada data yang dikirim ke server eksternal (kecuali SpeechRecognition Chrome yang menggunakan server Google)
- Rekaman audio tidak diunggah ke server mana pun
- Rekaman hanya tersimpan sementara di memori browser
- Tidak ada rekaman otomatis tanpa izin dan aktivasi pengguna
- File rekaman harus diunduh secara manual agar tersimpan permanen

## Teknologi

- HTML5
- CSS3 (animasi, glassmorphism, glow effects, responsive)
- JavaScript (ES6+ classes, async/await)
- Web Speech API (SpeechRecognition)
- SpeechSynthesis API
- MediaRecorder API
- Canvas API (partikel background)

## Lisensi

MIT — Gunakan, modifikasi, dan sebarkan secara bebas.
