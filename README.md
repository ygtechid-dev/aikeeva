# Keeva AI

AI video ad generator (Next.js 16 + MySQL + Leonardo.Ai).

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in the values:

   | Variable | Keterangan |
   | --- | --- |
   | `MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_USER` / `MYSQL_PASSWORD` | Koneksi MySQL |
   | `MYSQL_DATABASE` | Nama database (dibuat otomatis oleh migrate) |
   | `LEONARDO_API_KEY` | Production API key dari <https://app.leonardo.ai/api-access> |
   | `LEONARDO_VIDEO_MODEL` | Default model jika request tidak menyebut model (`hailuo-03` default, `wan-2.6`, `kling-2.6`, `bytedance/seedance-2.5`) |

3. Jalankan migrasi (membuat database + tabel `users`, `sessions`, `video_generations`):

   ```bash
   npm run db:migrate
   ```

4. Jalankan dev server:

   ```bash
   npm run dev
   ```

## API

Semua endpoint generation butuh sesi login (cookie `keeva_session`, httpOnly).

| Method | Endpoint | Deskripsi |
| --- | --- | --- |
| `POST` | `/api/auth/register` | `{ email, name, password }` → daftar + login |
| `POST` | `/api/auth/login` | `{ email, password }` → login |
| `POST` | `/api/auth/logout` | hapus sesi |
| `GET` | `/api/auth/me` | user aktif atau `null` |
| `GET` | `/api/models` | katalog model + durasi/rasio/audio yang didukung |
| `POST` | `/api/generations` | buat video (multipart/form-data, lihat bawah) |
| `GET` | `/api/generations` | riwayat video milik user (otomatis sync status) |
| `GET` | `/api/generations/[id]` | detail satu video (polling, otomatis sync status) |

### `POST /api/generations`

| Field | Wajib | Keterangan |
| --- | --- | --- |
| `prompt` | ya | Brief iklan, maks 5000 karakter |
| `model` | tidak | `hailuo-03` (default), `wan-2.6`, `kling-2.6`, `bytedance/seedance-2.5` |
| `duration` | tidak | Total video 5–60 detik, kelipatan panjang klip model |
| `aspectRatio` | tidak | `16:9` (default), `9:16`, `1:1` |
| `withAudio` | tidak | `true`/`false`, default `true` |
| `scenes` | tidak | JSON array `{ index, start, end, visual, narration }` |
| `options` | tidak | JSON `{ style, bgm, voiceEnabled, voiceMode, voiceId, voiceSpeed, voiceLanguage, voiceFileName }` |
| `startFrame` | tidak | File gambar (JPG/PNG/WEBP, maks 15MB) |

### Durasi panjang (hingga 60 detik)

Video > satu klip dipecah otomatis:

1. `planClips()` membagi total durasi menjadi klip sepanjang `clipDuration` model
   (semua model 5s). Scene yang lebih panjang dipotong, scene
   pendek digabung dalam satu klip.
2. Tiap klip dikirim sebagai request terpisah ke Leonardo dan dicatat di tabel
   `generation_clips`.
3. Setelah semua klip selesai, `ffmpeg` menormalkan resolusi/fps/audio lalu
   menggabungkannya (concat) menjadi satu MP4 di `/api/media/<id>.mp4`.

Progress tersimpan di `video_generations.progress` (mis. `3/12 klip selesai`).

### Anti "look AI" (realistis)

Supaya video tidak terlihat seperti render AI:

1. `src/lib/openai/scenario.ts` — prompt sistem menulis brief ala camera operator:
   shot size + gerakan kamera, device nyata (iPhone 15 Pro / Sony FX3), lensa,
   sumber cahaya nyata, dan satu ketidaksempurnaan (handheld sway, framing
   miring, orang lewat). Wajah dideskripsikan sebagai orang biasa (pori-pori,
   makeup minimal, baju kusut). Kata pemicu look-AI dilarang.
2. `stripAiLookWords()` — membuang kata terlarang dari output OpenAI bila tetap muncul.
3. `src/lib/generation/prompt.ts` — `REALISM_DIRECTIVE` disisipkan ke setiap prompt,
   `stripAiLookTerms()` membersihkan teks scene, dan gaya "UGC / Natural" /
   "Sinematik" memakai deskripsi kamera nyata.
4. `REALISM_NEGATIVE_PROMPT` dikirim sebagai `negative_prompt` ke model yang
   mendukungnya (Wan 2.6). Model lain mendapat instruksi anti-AI di prompt utama
   dan fitur `negative_prompt` dicatat di `unsupported_features`.
5. Batas prompt mengikuti API: Hailuo 7000, Kling 2500, Wan 1500, Seedance 9999.

### Model

| Model | ID | Durasi/klip | Audio |
| --- | --- | --- | --- |
| MiniMax Hailuo 03 (default) | `hailuo-03` | 5–15s | ya |
| Wan 2.6 | `wan-2.6` | 5 / 10 / 15s | ya |
| Kling 2.6 | `kling-2.6` | 5 / 10s | ya |
| Seedance 2.5 | `bytedance/seedance-2.5` | 4–30s | ya |

### Voiceover

Voiceover AI dihasilkan **langsung oleh model video** (Kling 2.6 / Seedance 2.5),
tidak ada TTS terpisah. Narasi tiap scene ditulis ke prompt sebagai `Spoken line: "..."`,
plus instruksi bahasa dan tone suara, sehingga audio keluar bersama MP4.

Konsekuensinya aksen mengikuti kemampuan model video — kalau butuh aksen Indonesia
yang benar-benar native, perlu TTS terpisah lalu di-mux (belum aktif).

### Fitur yang belum didukung model

Leonardo hanya menerima satu prompt + parameter terbatas. Semua yang tidak bisa
dipetakan ke parameter model (multi-scene storyboard, voiceover/TTS, file suara
sendiri, BGM terpisah, gaya visual, end frame di Kling) **tetap disimpan**:

- `video_generations.unsupported_features` — JSON detail tiap fitur + payload aslinya.
- `video_generations.compiled_prompt` — prompt final yang benar-benar dikirim ke model
  (semua instruksi di atas sudah ditulis ulang ke dalam prompt).

Prompt asli user disimpan di `video_generations.user_prompt`.

## Scripts

```bash
npm run dev        # dev server
npm run build      # production build
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
npm run db:migrate # apply db/schema.sql
```

## Deploy ke Vercel

### 1. Siapkan database MySQL publik

Vercel tidak menyediakan MySQL. Pakai layanan terkelola (PlanetScale, Aiven,
Railway, TiDB Cloud, atau RDS) dan ambil kredensialnya. Pastikan koneksi
mengizinkan akses dari luar (SSL biasanya wajib).

### 2. Push repo ke GitHub

```bash
git add -A
git commit -m "feat: ai video generator"
git remote add origin git@github.com:USER/REPO.git
git push -u origin main
```

### 3. Import di Vercel

Dashboard Vercel → **Add New → Project** → pilih repo. Framework terdeteksi
otomatis sebagai Next.js.

Atau lewat CLI:

```bash
npm i -g vercel
vercel link
vercel env add MYSQL_HOST production
# ulangi untuk semua variabel di bawah
vercel --prod
```

### 4. Environment variables (Production + Preview)

| Key | Contoh |
| --- | --- |
| `MYSQL_HOST` | `xxx.aws.tidbcloud.com` |
| `MYSQL_PORT` | `4000` |
| `MYSQL_USER` | `xxxxxxxx.root` |
| `MYSQL_PASSWORD` | `********` |
| `MYSQL_DATABASE` | `aikeeva` |
| `LEONARDO_API_KEY` | `c1c2...` |
| `LEONARDO_VIDEO_MODEL` | `hailuo-03` |
| `OPENAI_API_KEY` | `sk-proj-...` |
| `OPENAI_MODEL` | `gpt-4.1-mini` |

`LEONARDO_API_BASE_URL` dan `OPENAI_BASE_URL` opsional.

### 5. Jalankan migrasi ke database produksi

Dari mesin lokal, dengan env produksi:

```bash
MYSQL_HOST=... MYSQL_USER=... MYSQL_PASSWORD=... MYSQL_DATABASE=aikeeva \
  npm run db:migrate
```

### 6. Batasan penting di Vercel

1. **Filesystem read-only & ephemeral.** Video hasil concat disimpan di
   `.data/media` (lokal). Di Vercel file itu hilang setelah instance didaur
   ulang. Untuk produksi, ganti `src/lib/media/storage.ts` agar mengunggah ke
   object storage (Vercel Blob / S3 / R2), lalu simpan URL publiknya.
2. **Durasi function.** Route `POST /api/generations` mengirim semua klip secara
   berurutan. Untuk 60 detik (12 klip) ini bisa melewati batas waktu. Set
   `maxDuration` di route (butuh plan Pro) atau ubah alur menjadi:
   kirim 1 klip per request, lalu gabungkan saat polling.
3. **ffmpeg.** `ffmpeg-static` (~80MB) membuat bundle function besar. Kalau
   melewati limit, hapus dependency tersebut dan set `FFMPEG_PATH` ke binary
   yang tersedia, atau pindahkan concat ke worker terpisah.
4. **MySQL connection limit.** `mysql2` pool dibuat per instance; kurangi
   `MYSQL_POOL_SIZE` (mis. `3`) di serverless.
5. **Cookie sesi** otomatis `secure` karena `NODE_ENV=production`, jadi harus
   diakses lewat HTTPS (domain Vercel sudah HTTPS).

## Deploy ke VPS Ubuntu (FE + BE sekaligus)

Aplikasi ini **satu proses**: Next.js menyajikan halaman (FE) dan route
`/api/*` (BE) dari server yang sama. Tidak perlu dua service terpisah.

Arsitektur di VPS:

```
Internet → Caddy (:80/:443) → Next.js (127.0.0.1:3000) → MySQL (:3306)
                                  └─ MEDIA_DIR (file MP4 hasil concat)
```

### 1. Prasyarat di VPS (Ubuntu 22.04/24.04)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git mysql-server ffmpeg

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v20.x
```

`ffmpeg` dari apt dipakai sebagai fallback kalau binary `ffmpeg-static` bermasalah.

### 2. Siapkan database

```bash
sudo mysql
```

```sql
CREATE DATABASE aikeeva CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'aikeeva'@'localhost' IDENTIFIED BY 'PASSWORD_KUAT';
GRANT ALL PRIVILEGES ON aikeeva.* TO 'aikeeva'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 3. Folder aplikasi

Kode sudah ada di `/root/aikeeva` (hasil clone). Pastikan dependensi terpasang:

```bash
cd /root/aikeeva
npm ci
```

Aplikasi dijalankan sebagai **root** karena folder ada di `/root`. Kalau mau
lebih aman, pindahkan ke `/var/www/aikeeva` dan buat user khusus (opsional):

```bash
# opsional, lebih aman
sudo adduser --system --group --home /var/www/aikeeva aikeeva
sudo mkdir -p /var/www/aikeeva
sudo rsync -a /root/aikeeva/ /var/www/aikeeva/
sudo chown -R aikeeva:aikeeva /var/www/aikeeva
```
Kalau memilih opsi ini, ganti `WorkingDirectory` di `deploy/aikeeva.service`
menjadi `/var/www/aikeeva` dan jalankan `npm` sebagai `sudo -u aikeeva`.

### 4. Environment produksi

```bash
cd /root/aikeeva
nano .env.production
```

```env
NODE_ENV=production
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=aikeeva
MYSQL_PASSWORD=PASSWORD_KUAT
MYSQL_DATABASE=aikeeva
MYSQL_POOL_SIZE=10

LEONARDO_API_KEY=xxxx
LEONARDO_VIDEO_MODEL=hailuo-03
OPENAI_API_KEY=sk-proj-xxxx
OPENAI_MODEL=gpt-4.1-mini

MEDIA_DIR=/root/aikeeva/.data/media
COOKIE_SECURE=true
```

`COOKIE_SECURE=true` mewajibkan HTTPS. Kalau tes lewat `http://IP:3000`,
set `false` dulu.

### 5. Migrasi database

```bash
cd /root/aikeeva
npm run db:migrate:prod
```

### 6. Build

```bash
cd /root/aikeeva
npm run build
```

### 7. Jalankan sebagai service (systemd)

```bash
sudo cp /root/aikeeva/deploy/aikeeva.service /etc/systemd/system/aikeeva.service
sudo systemctl daemon-reload
sudo systemctl enable --now aikeeva
sudo systemctl status aikeeva
curl -I http://127.0.0.1:3000
```

Log: `journalctl -u aikeeva -f`

### 8. Caddy (reverse proxy + HTTPS otomatis)

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

sudo cp /root/aikeeva/deploy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile     # ganti aikeeva.example.com dengan domain kamu
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy langsung menerbitkan sertifikat Let's Encrypt untuk domain itu (pastikan
DNS A record sudah mengarah ke IP VPS dan port 80/443 terbuka). Cek:

```bash
sudo systemctl status caddy
curl -I https://aikeeva.example.com
sudo journalctl -u caddy -f
```

Kalau hanya punya IP tanpa domain, ganti blok site menjadi:

```
:80 {
	reverse_proxy 127.0.0.1:3000
}
```

dan set `COOKIE_SECURE=false` di `.env.production`.

### 9. Update versi baru

```bash
cd /root/aikeeva
git pull
npm ci
npm run db:migrate:prod   # kalau ada perubahan schema
npm run build
sudo systemctl restart aikeeva
```

### Catatan produksi

- **Video tersimpan di disk VPS** (`MEDIA_DIR`). Backup `/root/aikeeva/.data/media`
  bersama database. Kalau nanti pindah ke multi-server/serverless, ganti
  `src/lib/media/storage.ts` ke object storage (S3/R2).
- **Render panjang**: `POST /api/generations` mengirim semua klip berurutan.
  60 detik = 12 klip, bisa 3–6 menit. `deploy/Caddyfile` sudah menyetel
  `read_timeout`/`write_timeout` 600s; jangan turunkan di bawah itu.
- **Disk**: tiap video 5–20MB. Pantau `df -h`; bersihkan media lama bila perlu.
- **Firewall**: cukup buka 22/80/443. MySQL dan port 3000 tetap lokal.
  ```bash
  sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable
  ```
- **Tanpa domain** (hanya IP): pakai site `:80` di Caddy, set
  `COOKIE_SECURE=false`, akses via `http://IP`.
