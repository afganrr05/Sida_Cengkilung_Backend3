const express = require('express');
const router = express.Router();
const kontenController = require('../controllers/konten.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const roleMiddleware = require('../middlewares/role.middleware');
const { upload } = require('../middlewares/upload.middleware');

// Admin routes
router.get('/admin/semua', authMiddleware, roleMiddleware('admin'), kontenController.getAllKontenAdmin);
router.post('/', authMiddleware, roleMiddleware('admin'), upload.single('thumbnail'), kontenController.createKonten);
router.put('/:id', authMiddleware, roleMiddleware('admin'), upload.single('thumbnail'), kontenController.updateKonten);
router.delete('/:id', authMiddleware, roleMiddleware('admin'), kontenController.deleteKonten);

// Public routes - bisa diakses guest
router.get('/', kontenController.getAllKonten);
router.get('/kategori', kontenController.getKategoriKonten);
router.get('/:id', kontenController.getKontenById);

module.exports = router;
