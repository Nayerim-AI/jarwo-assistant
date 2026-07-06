# Deploy JARWO — All on ECS GPU (ecs-4a53 / 100.74.214.7)

Semua komponen jarwo jalan di ECS GPU. OPi5 = repo source saja.

## Topologi port (JANGAN ubah port eksisting)
- `8098` gateway + frontend (Flask) — panggil ASR/TTS via loopback
- `8096` ASR (faster-whisper large-v3, GPU)
- `8000` TTS (VoxCPM2 ID, GPU, bind 127.0.0.1)

Port lain di ECS yang dipakai service lain: 8095 (edge-gender-detection), 8001 (RAMOS), 7860 (INSID3), 11434 (ollama), 1935/8554/888x (MediaMTX). Jangan tabrak.

## Install systemd (persistensi, auto-restart on boot)
```bash
cd /root/jarwo-assistant && git pull origin master
cp deploy/systemd/jarwo-*.service /etc/systemd/system/
systemctl daemon-reload
# stop proses nohup lama dulu (kalau ada), lalu:
systemctl enable --now jarwo-asr jarwo-tts jarwo-gateway
```

## Update / redeploy
```bash
cd /root/jarwo-assistant && git pull origin master
systemctl restart jarwo-gateway   # (atau jarwo-tts / jarwo-asr sesuai perubahan)
```

## Healthcheck
```bash
curl -s http://127.0.0.1:8098/api/capabilities | jq
curl -s "http://127.0.0.1:8098/api/tts?text=Halo%20saya%20Jarwo" -o /tmp/t.wav && file /tmp/t.wav
```

## Catatan GPU
- T4 15GB dibagi dengan RAMOS/edge-detection. VoxCPM2 ~5.3GB VRAM. Cek `nvidia-smi` sebelum menambah beban.
