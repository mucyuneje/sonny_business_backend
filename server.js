require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const app = express();

// ── CORS ──
// Always include both localhost and 127.0.0.1 variants so Live Server works
// regardless of which hostname the browser uses.
const _rawOrigins = process.env.ALLOWED_ORIGINS || 'http://127.0.0.1:5500,http://localhost:5500';
const allowed = _rawOrigins.split(',').map(s => s.trim());

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (Postman, mobile apps, curl, same-origin)
    if (!origin) return cb(null, true);
    if (allowed.includes(origin)) return cb(null, true);
    console.warn(`[CORS] Blocked origin: ${origin}  — allowed: ${allowed.join(', ')}`);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

app.use(express.json());

// ── Routes ──
app.use('/api/auth',  require('./routes/auth'));
app.use('/api/user',  require('./routes/user'));
app.use('/api/admin', require('./routes/admin'));

// ── Health check ──
app.get('/api/health', (_, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ── 404 handler ──
app.use((req, res) => res.status(404).json({ error: `Route ${req.method} ${req.path} not found` }));

// ── Error handler ──
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ── Connect to MongoDB Atlas & start ──
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅  MongoDB Atlas connected');
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () =>
      console.log(`🚀  SONNY API running → http://localhost:${PORT}`)
    );
  })
  .catch(err => {
    console.error('❌  MongoDB connection error:', err.message);
    process.exit(1);
  });
