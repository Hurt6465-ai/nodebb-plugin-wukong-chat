#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const file = path.resolve(process.cwd(), 'library.js');
let src = fs.readFileSync(file, 'utf8');

const start = src.indexOf('router.post(`${api}/upload`, ensureLogin,');
const end = src.indexOf('router.post(`${api}/topic-activity/touch`', start);

if (start < 0 || end < 0) {
  console.error('Could not find upload route boundaries in library.js');
  process.exit(1);
}

const route = `router.post(\`\${api}/upload\`, ensureLogin, (req, res, next) => {
    if (!multer) {
      return res.status(500).json({ error: 'missing_upload_deps', install: 'npm i multer' });
    }

    const upload = multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: 80 * 1024 * 1024,
        files: 10,
      },
    }).any();

    upload(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          error: 'upload_parse_failed',
          message: err.message,
          code: err.code,
        });
      }
      next();
    });
  }, asyncHandler(async (req, res) => {
    const current = await getCurrentUser(req);
    if (!current) return res.status(401).json({ error: 'unauthorized' });

    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) return res.status(400).json({ error: 'missing_file' });

    const uploadRoot = path.resolve(PLUGIN_ROOT, '../../public/uploads/wukong-chat');
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const dir = path.join(uploadRoot, day);
    fs.mkdirSync(dir, { recursive: true });

    function safeExt(file) {
      const original = String(file.originalname || '').toLowerCase();
      const fromName = path.extname(original).replace(/[^.a-z0-9]/g, '').slice(0, 12);
      if (fromName) return fromName;
      const mime = String(file.mimetype || '').toLowerCase();
      if (mime.includes('png')) return '.png';
      if (mime.includes('webp')) return '.webp';
      if (mime.includes('gif')) return '.gif';
      if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
      if (mime.includes('mp4')) return '.mp4';
      if (mime.includes('webm')) return '.webm';
      if (mime.includes('ogg')) return '.ogg';
      if (mime.includes('mpeg')) return '.mp3';
      if (mime.includes('wav')) return '.wav';
      return '.bin';
    }

    const saved = [];

    for (const f of files.slice(0, 10)) {
      const mime = String(f.mimetype || 'application/octet-stream').toLowerCase();
      if (!/^(image|video|audio)\\//.test(mime) && mime !== 'application/octet-stream') {
        return res.status(400).json({
          error: 'unsupported_file_type',
          mimetype: f.mimetype,
          filename: f.originalname,
        });
      }

      const ext = safeExt(f);
      const name = [
        String(current.uid),
        Date.now(),
        crypto.randomBytes(6).toString('hex'),
      ].join('_') + ext;

      const abs = path.join(dir, name);
      fs.writeFileSync(abs, f.buffer);

      const url = \`/assets/uploads/wukong-chat/\${day}/\${name}\`;
      saved.push({
        url,
        path: url,
        name,
        filename: f.originalname || name,
        mimetype: f.mimetype || 'application/octet-stream',
        size: f.size || (f.buffer && f.buffer.length) || 0,
      });
    }

    res.json({
      ok: true,
      files: saved,
      uploads: saved,
      response: {
        images: saved,
        files: saved,
      },
    });
  })); `;

src = src.slice(0, start) + route + src.slice(end);
fs.writeFileSync(file, src, 'utf8');

console.log('Patched library.js upload route successfully.');

