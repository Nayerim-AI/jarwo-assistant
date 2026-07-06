# JARWO Assistant — Analisis Kondisi & Gap Plan

> Dibuat: 2026-07-06 (WIB). Audit-first. Belum production. Dokumen ini untuk memudahkan compacting/hand-off berikutnya.
> Aturan operasi: **JANGAN ubah port eksisting** — kalau perlu service baru, pakai port baru. Approve dulu sebelum kontrol/edit berisiko.

## 0. KEPUTUSAN ARSITEKTUR (2026-07-06) — ALL ON ECS
- Gateway **TIDAK** dijalankan di OPi5 (takut berat). Semua komponen jarwo jalan di **ECS GPU (ecs-4a53 / 100.74.214.7)**: gateway + ASR + TTS + frontend statis.
- OPi5 = repo source + git push saja. Deploy = `git pull` di ECS `/root/jarwo-assistant`.
- **Port gateway di ECS = 8098** (8095 dipakai edge-gender-detection, 8096 ASR, 8000 TTS — semua tak boleh diubah).
- Karena colocated, gateway panggil ASR/TTS via `127.0.0.1` (bukan Tailscale IP) → lebih cepat.
- Commit + push **setiap** perubahan.


## 1. Arsitektur Aktual (as-is)

```
Browser (MediaRecorder, mic)
   │  webm audio
   ▼
Orange Pi 5 (lokal)  →  server.py  :8095  (Flask, "local-cpu" gateway)
   ├── ffmpeg convert webm→wav 16k mono
   ├── energy VAD (threshold 0.01)
   ├── ASR   → POST http://100.74.214.7:8096/transcribe   (ECS GPU)
   ├── TTS   → POST http://100.74.214.7:8000/tts          (ECS GPU)
   └── command router (deterministik: jam/tanggal/rekam/mati)
```

- Backend lokal hanya **gateway + command router**; ASR & TTS berat didelegasikan ke **ECS GPU (ecs-4a53 / Tesla T4 / TS 100.74.214.7)**.
- ASR: faster-whisper `large-v3` (cuda, float16) via `/root/ASR/jarwo_asr_server.py`.
- TTS: VoxCPM2 (OpenBMB) Bahasa Indonesia, zero-shot voice cloning via reference audio, via `/root/tts-indonesia/scripts/serve_local.py`.

## 2. Status Komponen (per audit 2026-07-06 12:5x WIB)

| Komponen | Lokasi | Port | Status | Catatan |
|---|---|---|---|---|
| Frontend + gateway `server.py` | OPi5 `projects/jarwo-assistant` | 8095 | ❌ MATI | Tidak listening. (PID 3127422 di 5181 itu **CabaiCast advisor**, bukan jarwo) |
| ASR server | ECS `/root/ASR` | 8096 | ✅ JALAN | Manual (PID 2203, `bash -c cd /root/ASR`), **bukan systemd** → tidak auto-restart |
| TTS server (VoxCPM2) | ECS `/root/tts-indonesia` | 8000 | ❌ MATI | Terbukti pernah 200 OK lalu di-shutdown manual. Tidak ada unit systemd |
| Model VoxCPM2 | ECS `models/VoxCPM2` | — | ✅ ADA (6.0G) | Baseline pre-trained |
| LoRA fine-tune ID | ECS `checkpoints/` | — | ❌ KOSONG | Belum training. Pakai baseline zero-shot |
| Dataset training | ECS `manifests/`, `segments/` | — | ❌ KOSONG | 0 segment, 0 manifest → pipeline data belum jalan |
| GPU | ECS Tesla T4 15360 MiB | — | ✅ OK | Free ~14.2G. Terpakai RAMOS people_counting (364M), ASR (100M), live_gpu_webapp (208M). RAMOS main inactive |

## 3. Gap Analysis (kenapa belum production)

### G1 — Tidak ada persistensi service (KRITIS)
- `server.py` (8095), ASR (8096), TTS (8000) semua dijalankan manual. Reboot / crash / SSH logout → mati. TTS sudah mati sekarang.
- **Dampak:** aplikasi tidak bisa diandalkan. Ini blocker production #1.

### G2 — TTS tidak jalan (KRITIS)
- Port 8000 down. `_tts_wav()` di server lokal akan `remote_tts_failed` → asisten bisu.

### G3 — Tidak ada HTTPS / akses non-localhost
- Mic browser butuh `localhost` atau HTTPS. Saat ini hanya `http://localhost:8095` di mesin lokal. Tidak ada akses remote aman (reverse proxy/Pangolin/cloudflared).

### G4 — Fallback ASR lokal dead code
- Di `_transcribe()`, blok CPU whisper fallback berada **setelah `return`** (baris 124) → unreachable. Kalau remote ASR down, langsung gagal tanpa fallback. Model whisper base/tiny lokal sudah terunduh tapi tak terpakai.

### G5 — Command set sangat terbatas
- Hanya jam/tanggal/rekam/stop/deactivate. Tidak ada integrasi nyata (belum ada LLM, query info, kontrol device, dsb). Masih demo voice.

### G6 — Wake word lemah
- Wake via ASR transkrip string-match (`WAKE_WORDS`), bukan wake-word engine. Boros (kirim tiap chunk ke GPU), latensi tinggi, rawan false trigger.

### G7 — Reference audio TTS hardcoded ke path ECS
- `REMOTE_TTS_REFERENCE_AUDIO=/root/tts-indonesia/samples/baseline/baseline_03.wav`. Kalau file hilang / voice mau diganti, harus edit env. Tidak ada voice profile mgmt.

### G8 — Keamanan & config
- Endpoint ECS pakai IP Tailscale hardcoded, HTTP polos (OK di Tailscale tapi bukan best practice). Tidak ada auth di ASR/TTS. Tidak ada `.env`/config terpusat.
- Git repo lokal kotor (banad untracked: server.py, models/, cache/) — belum di-commit.

### G9 — Belum ada monitoring/health aggregation
- Tidak ada healthcheck end-to-end (lokal→ASR→TTS). `/healthz` lokal cuma cek diri sendiri.

### G10 — Fine-tuning voice ID belum jalan (opsional, kualitas)
- Pipeline data (download YouTube → segment → transcribe → manifest → train LoRA) belum dieksekusi. Sekarang suara = zero-shot baseline. Untuk suara ID natural perlu LoRA.

## 4. Rencana Perbaikan (bertahap)

### Fase 0 — Recovery cepat (bikin jalan lagi) — ✅ SELESAI 2026-07-06
- [x] Nyalakan TTS VoxCPM2 di ECS (8000, bind 127.0.0.1).
- [x] Pindahkan gateway ke ECS (`:8098`), delegasi ASR/TTS via loopback.
- [x] Smoke test end-to-end: capabilities, text-command, TTS (200, WAV valid) — hijau.
- [x] Verifikasi ASR (8096) sehat.
- [x] Fix G4 (dead-code fallback) + G8 (gitignore, git bersih, remote SSH).

### Fase 1 — Persistensi — ✅ SELESAI 2026-07-06
- [x] systemd unit ECS: jarwo-asr (8096), jarwo-tts (8000), jarwo-gateway (8098), semua `Restart=always` + `enabled` (auto-start on boot). Tersimpan di `deploy/systemd/`.
- [x] Handover dari nohup → systemd. Ketiga service active+enabled, smoke test hijau.
- [ ] Guard VRAM koeksistensi dgn RAMOS — terdokumentasi di deploy/README (T4 dibagi; VoxCPM2 ~5.3GB).

### Fase 2 — Robustness (belum) — ~2 jam
- [ ] Fix G4: pindahkan fallback ASR lokal ke posisi reachable (try remote → except → CPU whisper). Atau hapus dead code bila fallback tak diinginkan.
- [ ] Health aggregator: endpoint `/api/health-full` cek ASR+TTS+ffmpeg.
- [ ] Voice profile mgmt: reference audio dari config, bukan hardcode.
- [ ] Commit & rapikan git repo (gitignore models/venv/cache).

### Fase 3 — Akses & keamanan — ~2 jam
- [ ] HTTPS/reverse proxy (Pangolin di VPS Utama atau cloudflared) supaya bisa diakses dari device lain dengan mic aktif. **Route baru, jangan tabrak eksisting.**
- [ ] Auth token sederhana untuk endpoint ASR/TTS ECS.

### Fase 4 — Fitur (naik dari demo) — scoping terpisah
- [ ] Integrasi LLM untuk perintah bebas (mis. lewat Hermes/Ollama :11434 yang sudah ada di ECS).
- [ ] Wake-word engine ringan (openWakeWord/porcupine) di client → hemat GPU.
- [ ] Tambah intent nyata (info cuaca, kontrol homelab, dsb) sesuai kebutuhan.

### Fase 5 — Kualitas suara (opsional) — 1+ hari GPU
- [ ] Jalankan pipeline dataset + LoRA fine-tune VoxCPM2 ID (scripts 03→08).
- [ ] Evaluasi WER/kualitas, pasang checkpoint ke TTS server.

## 5. Keputusan yang perlu konfirmasi user
1. Target akses: cukup lokal (localhost) atau perlu remote (butuh HTTPS/proxy)?
2. Prioritas: sekadar hidupkan lagi (Fase 0-1) dulu, atau sekalian tambah fitur LLM (Fase 4)?
3. Fine-tune LoRA suara ID (Fase 5) — perlu sekarang atau nanti? (butuh GPU lama, berbagi dengan RAMOS)
4. Reference voice TTS mau pakai baseline_03 atau ganti sampel lain?

## 6. Catatan hardware (ingat)
- ECS T4 dipakai bareng RAMOS. Cek VRAM sebelum start service besar. RAMOS main saat ini inactive, tapi people_counting + live_gpu_webapp jalan.
- Semua service ECS saat ini manual → prioritaskan systemd.
- Port eksisting yang TIDAK boleh diubah: 8095 (gateway), 8096 (ASR), 8000 (TTS), + port lain di ECS (7860 INSID3, 8001 RAMOS, 11434 ollama, 1935/8554/888x MediaMTX).
