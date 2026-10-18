-- Aikeeva database schema
-- Portable: MySQL 5.7+/8.x dan MariaDB 10.3+ (utf8mb4_unicode_ci)
-- Urutan tabel penting: tabel yang direferensikan harus dibuat lebih dulu.

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(190) NOT NULL,
  name VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY users_email_unique (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  id CHAR(64) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY sessions_user_id_index (user_id),
  KEY sessions_expires_at_index (expires_at),
  CONSTRAINT sessions_user_id_foreign
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Satu baris per video. Prompt asli user, prompt final yang dikirim ke model,
-- dan fitur yang tidak bisa dipetakan ke parameter model disimpan di sini.
CREATE TABLE IF NOT EXISTS video_generations (
  id CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(40) NOT NULL DEFAULT 'leonardo',
  provider_generation_id CHAR(36) NULL,
  model VARCHAR(80) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  progress VARCHAR(40) NULL,
  user_prompt TEXT NOT NULL,
  compiled_prompt TEXT NOT NULL,
  unsupported_features JSON NULL,
  end_frame_leonardo_id CHAR(36) NULL,
  start_frame_leonardo_id CHAR(36) NULL,
  audio_reference_leonardo_id CHAR(36) NULL,
  voiceover_url TEXT NULL,
  voiceover_generation_id CHAR(36) NULL,
  voiceover_language VARCHAR(10) NULL,
  voiceover_voice_id VARCHAR(60) NULL,
  duration_seconds INT NOT NULL,
  aspect_ratio VARCHAR(10) NOT NULL DEFAULT '16:9',
  width INT NOT NULL,
  height INT NOT NULL,
  with_audio TINYINT(1) NOT NULL DEFAULT 0,
  request_payload JSON NULL,
  video_url TEXT NULL,
  thumbnail_url TEXT NULL,
  api_credit_cost DECIMAL(12,4) NULL,
  error_message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY video_generations_user_id_index (user_id),
  KEY video_generations_status_index (status),
  KEY video_generations_provider_generation_id_index (provider_generation_id),
  CONSTRAINT video_generations_user_id_foreign
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Video panjang (mis. 60s) dipecah menjadi beberapa klip. Satu baris per klip.
CREATE TABLE IF NOT EXISTS generation_clips (
  id CHAR(36) NOT NULL,
  generation_id CHAR(36) NOT NULL,
  clip_index INT NOT NULL,
  provider_generation_id CHAR(36) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  compiled_prompt TEXT NOT NULL,
  negative_prompt TEXT NULL,
  scenes JSON NULL,
  video_url TEXT NULL,
  error_message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY generation_clips_order_unique (generation_id, clip_index),
  KEY generation_clips_generation_id_index (generation_id),
  CONSTRAINT generation_clips_generation_id_foreign
    FOREIGN KEY (generation_id) REFERENCES video_generations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
