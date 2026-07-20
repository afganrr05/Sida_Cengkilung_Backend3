require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

// Import database
const db = require('./src/config/db');

// Import routes
const authRoutes = require('./src/routes/auth.routes');
const berandaRoutes = require('./src/routes/beranda.routes');
const profilDesaRoutes = require('./src/routes/profilDesa.routes');
const sejarahDesaRoutes = require('./src/routes/sejarahDesa.routes');
const strukturDesaRoutes = require('./src/routes/strukturDesa.routes');
const statistikDesaRoutes = require('./src/routes/statistikDesa.routes');
const kontenRoutes = require('./src/routes/konten.routes');
const galeriRoutes = require('./src/routes/galeri.routes');
const dokumenRoutes = require('./src/routes/dokumen.routes');
const dashboardUserRoutes = require('./src/routes/dashboardUser.routes');
const dashboardAdminRoutes = require('./src/routes/dashboardAdmin.routes');
const penggunaRoutes = require('./src/routes/pengguna.routes');
const pendudukRoutes = require('./src/routes/penduduk.routes');
const suratRoutes = require('./src/routes/surat.routes');

// Import middleware
const { errorHandler } = require('./src/middlewares/error.middleware');

const app = express();

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  frameguard: false,
  contentSecurityPolicy: false
}));
const corsOptions = require('./src/config/cros'); // sesuaikan path kalau beda

app.use(cors(corsOptions));

// ✅ WAJIB untuk preflight request
app.options('*', cors(corsOptions));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (primary + legacy location)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/uploads', express.static(path.join(__dirname, 'src', 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/beranda', berandaRoutes);
app.use('/api/profil-desa', profilDesaRoutes);
app.use('/api/sejarah-desa', sejarahDesaRoutes);
app.use('/api/struktur-desa', strukturDesaRoutes);
app.use('/api/statistik-desa', statistikDesaRoutes);
app.use('/api/konten', kontenRoutes);
app.use('/api/galeri', galeriRoutes);
app.use('/api/dokumen', dokumenRoutes);
app.use('/api/dashboard-user', dashboardUserRoutes);
app.use('/api/dashboard-admin', dashboardAdminRoutes);
app.use('/api/pengguna', penggunaRoutes);
app.use('/api/penduduk', pendudukRoutes);
app.use('/api/surat', suratRoutes);

// Health check
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'SIDA Cengkilung Backend',
    health: '/api/health'
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'SIDA Cengkilung Backend',
    database: global.dbConnected ? 'connected' : 'checking'
  });
});

// Test database route
app.get('/api/test-db', async (req, res) => {
  try {
    const [rows] = await db.pool.execute('SELECT 1 + 1 as result');
    res.json({ 
      success: true, 
      message: 'Database connected',
      result: rows[0].result 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Database error',
      error: error.message 
    });
  }
});

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint tidak ditemukan'
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server berjalan di port ${PORT}`);
  console.log(`Mode: ${process.env.NODE_ENV || 'development'}`);
});

// Test koneksi database setelah server siap, supaya Railway tidak mendapat 502 saat DB lambat.
db.testConnection().then((connected) => {
  global.dbConnected = connected;
  console.log(`Database: ${connected ? 'Terhubung' : 'Gagal terhubung'}`);
}).catch((err) => {
  global.dbConnected = false;
  console.error('Gagal koneksi database:', err.message);
});
