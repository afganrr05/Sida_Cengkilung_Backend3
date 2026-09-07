const express = require('express');
const router = express.Router();
const suratController = require('../controllers/surat.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const roleMiddleware = require('../middlewares/role.middleware');
const { upload } = require('../middlewares/upload.middleware');

// ==================== ROUTES UNTUK MASYARAKAT ====================
// GET - Daftar jenis surat yang aktif (untuk dropdown)
router.get('/jenis/aktif', suratController.getJenisSuratAktif);

// POST - Ajukan surat baru
router.post('/pengajuan', authMiddleware, upload.array('lampiran', 10), suratController.ajukanSurat);

// GET - Riwayat pengajuan surat saya (masyarakat)
router.get('/pengajuan/saya', authMiddleware, suratController.getPengajuanSaya);

// GET - Detail pengajuan surat saya
router.get('/pengajuan/:id', authMiddleware, suratController.getDetailPengajuan);

// ==================== ROUTES UNTUK ADMIN ====================
// GET - Semua pengajuan surat (admin)
router.get('/admin/semua', authMiddleware, roleMiddleware('admin'), suratController.getAllPengajuan);
router.get('/admin/:id/detail', authMiddleware, roleMiddleware('admin'), suratController.getDetailPengajuanAdmin);

// GET - Semua jenis surat (admin)
router.get('/jenis', authMiddleware, roleMiddleware('admin'), suratController.getAllJenisSurat);

// POST - Tambah jenis surat baru
router.post('/jenis', authMiddleware, roleMiddleware('admin'), upload.single('template_surat'), suratController.createJenisSurat);

// PUT - Update jenis surat
router.put('/jenis/:id', authMiddleware, roleMiddleware('admin'), upload.single('template_surat'), suratController.updateJenisSurat);

// DELETE - Hapus jenis surat
router.delete('/jenis/:id', authMiddleware, roleMiddleware('admin'), suratController.deleteJenisSurat);

// PUT - Update status pengajuan surat (admin proses)
router.put('/admin/:id/status', authMiddleware, roleMiddleware('admin'), upload.single('file_final'), suratController.updateStatusPengajuan);

// GET - Download file final surat
router.get('/download/:id', authMiddleware, suratController.downloadSurat);

// GET - Lihat/download template jenis surat
router.get('/jenis/:id/template', authMiddleware, roleMiddleware('admin'), suratController.downloadTemplateSurat);

module.exports = router;
