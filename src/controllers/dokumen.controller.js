const dokumenService = require('../services/dokumen.service');
const { successResponse, errorResponse } = require('../utils/response');
const db = require('../config/db');
const fs = require('fs');
const path = require('path');
const { saveUploadedFile } = require('../middlewares/upload.middleware');

// MASYARAKAT CONTROLLERS
const getDokumenPublik = async (req, res) => {
  try {
    const data = await dokumenService.getDokumenPublik();
    return successResponse(res, 'Data dokumen publik berhasil diambil', data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const getDokumenTerbatas = async (req, res) => {
  try {
    const data = await dokumenService.getDokumenTerbatas(req.user.id);
    return successResponse(res, 'Data dokumen terbatas berhasil diambil', data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const getDokumenTerbatasById = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await dokumenService.getDokumenTerbatasById(id);
    return successResponse(res, 'Detail dokumen terbatas berhasil diambil', data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const ajukanPermohonan = async (req, res) => {
  try {
    const dokumenId = req.body.dokumenId ?? req.body.id_dokumen;
    const alasan = req.body.alasan ?? req.body.alasan_permohonan;
    const tanggalPelaksanaan = req.body.tanggal_pelaksanaan;
    const durasiPelaksanaan = req.body.durasi_pelaksanaan;
    const lampiranBerkas = req.file; // File yang diupload
    
    if (!dokumenId || !alasan) {
      return errorResponse(res, 'Dokumen ID dan alasan harus diisi');
    }
    
    if (!tanggalPelaksanaan) {
      return errorResponse(res, 'Tanggal pelaksanaan harus diisi');
    }
    
    if (!durasiPelaksanaan || durasiPelaksanaan <= 0) {
      return errorResponse(res, 'Durasi pelaksanaan harus diisi dan lebih dari 0 hari');
    }

    const result = await dokumenService.ajukanPermohonanDokumen(
      dokumenId,
      req.user.id,
      alasan,
      tanggalPelaksanaan,
      durasiPelaksanaan,
      lampiranBerkas
    );

    // Log aktivitas
    try {
      await db.pool.execute(
        'INSERT INTO tb_log_aktivitas (id_pengguna, aktivitas, detail) VALUES (?, ?, ?)',
        [req.user.id, 'AJUKAN_DOKUMEN', `Mengajukan permohonan dokumen ID: ${dokumenId}`]
      );
    } catch (logError) {
      console.warn('Log aktivitas gagal:', logError.message);
    }

    return successResponse(res, 'Permohonan berhasil diajukan', result, 201);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const getPermohonanSaya = async (req, res) => {
  try {
    const data = await dokumenService.getPermohonanSaya(req.user.id);
    return successResponse(res, 'Data permohonan berhasil diambil', data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

// ADMIN CONTROLLERS
const getAllDokumenAdmin = async (req, res) => {
  try {
    const data = await dokumenService.getAllDokumenAdmin();
    return successResponse(res, 'Data dokumen admin berhasil diambil', data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const getAllPermohonan = async (req, res) => {
  try {
    const { status } = req.query;
    const data = await dokumenService.getAllPermohonanAdmin(status);
    return successResponse(res, 'Data permohonan berhasil diambil', data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const updateStatusPermohonan = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, catatan, catatan_admin } = req.body;
    const catatanFinal = catatan ?? catatan_admin ?? null;

    if (!status || !['diterima', 'ditolak'].includes(status)) {
      return errorResponse(res, 'Status harus "diterima" atau "ditolak"');
    }

    const result = await dokumenService.updateStatusPermohonan(
      id,
      status,
      catatanFinal,
      req.user.id
    );

    // Log aktivitas
    try {
      await db.pool.execute(
        'INSERT INTO tb_log_aktivitas (id_pengguna, aktivitas, detail) VALUES (?, ?, ?)',
        [req.user.id, 'UPDATE_PERMOHONAN', `Mengubah status permohonan ID: ${id} menjadi ${status}`]
      );
    } catch (logError) {
      console.warn('Log aktivitas gagal:', logError.message);
    }

    return successResponse(res, result.message);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const createDokumen = async (req, res) => {
  try {
    const dokumenData = {
      ...req.body,
      deskripsi_dokumen: req.body.deskripsi_dokumen ?? null,
      kategori: req.body.kategori ?? 'Surat' // Tambahkan default kategori
    };

    // Validasi kategori
    if (!dokumenData.kategori) {
      return errorResponse(res, 'Kategori dokumen wajib diisi');
    }

    if (!req.file) {
      return errorResponse(res, 'File dokumen wajib diupload');
    }

    const savedPath = await saveUploadedFile(req.file, 'general');
    if (!savedPath) {
      return errorResponse(res, 'Gagal menyimpan file dokumen');
    }
    dokumenData.file_path = savedPath.replace(/\\/g, '/');

    const result = await dokumenService.createDokumen(dokumenData, req.user.id);

    // Log aktivitas
    try {
      await db.pool.execute(
        'INSERT INTO tb_log_aktivitas (id_pengguna, aktivitas, detail) VALUES (?, ?, ?)',
        [req.user.id, 'CREATE_DOKUMEN', `Membuat dokumen: ${dokumenData.judul_dokumen} (Kategori: ${dokumenData.kategori})`]
      );
    } catch (logError) {
      console.warn('Log aktivitas gagal:', logError.message);
    }

    return successResponse(res, 'Dokumen berhasil dibuat', result, 201);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const updateDokumen = async (req, res) => {
  try {
    const { id } = req.params;
    const dokumenData = {
      ...req.body
    };

    if (Object.prototype.hasOwnProperty.call(req.body, 'deskripsi_dokumen')) {
      dokumenData.deskripsi_dokumen = req.body.deskripsi_dokumen ?? null;
    }

    // Validasi kategori jika dikirim
    if (Object.prototype.hasOwnProperty.call(req.body, 'kategori')) {
      if (!req.body.kategori) {
        return errorResponse(res, 'Kategori dokumen tidak boleh kosong');
      }
      dokumenData.kategori = req.body.kategori;
    }

    if (req.file) {
      const savedPath = await saveUploadedFile(req.file, 'general');
      if (!savedPath) {
        return errorResponse(res, 'Gagal menyimpan file dokumen');
      }
      dokumenData.file_path = savedPath.replace(/\\/g, '/');
    }

    const result = await dokumenService.updateDokumen(id, dokumenData);

    // Log aktivitas
    try {
      await db.pool.execute(
        'INSERT INTO tb_log_aktivitas (id_pengguna, aktivitas, detail) VALUES (?, ?, ?)',
        [req.user.id, 'UPDATE_DOKUMEN', `Memperbarui dokumen ID: ${id}`]
      );
    } catch (logError) {
      console.warn('Log aktivitas gagal:', logError.message);
    }

    return successResponse(res, result.message);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const deleteDokumen = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await dokumenService.deleteDokumen(id);

    // Log aktivitas
    try {
      await db.pool.execute(
        'INSERT INTO tb_log_aktivitas (id_pengguna, aktivitas, detail) VALUES (?, ?, ?)',
        [req.user.id, 'DELETE_DOKUMEN', `Menghapus dokumen ID: ${id}`]
      );
    } catch (logError) {
      console.warn('Log aktivitas gagal:', logError.message);
    }

    return successResponse(res, result.message);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const downloadDokumen = async (req, res) => {
  try {
    const { id } = req.params;
    const dokumen = await dokumenService.getDokumenById(id);

    // Dokumen terbatas hanya boleh didownload admin atau masyarakat yang disetujui
    if (dokumen.hak_akses === 'terbatas' && req.user.role !== 'admin') {
      const approved = await dokumenService.hasApprovedPermohonan(id, req.user.id);
      if (!approved) {
        return errorResponse(res, 'Anda belum memiliki akses untuk mengunduh dokumen ini', 403);
      }
    }

    if (!dokumen.file_path) {
      return errorResponse(res, 'File dokumen tidak tersedia', 404);
    }

    const absolutePath = path.resolve(dokumen.file_path);
    if (!fs.existsSync(absolutePath)) {
      return errorResponse(res, 'File dokumen tidak ditemukan di server', 404);
    }

    const extension = path.extname(absolutePath);
    const safeFilename = `${dokumen.judul_dokumen || 'dokumen'}${extension}`;
    return res.download(absolutePath, safeFilename);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

module.exports = {
  // Masyarakat
  getDokumenPublik,
  getDokumenTerbatas,
  getDokumenTerbatasById,
  ajukanPermohonan,
  getPermohonanSaya,
  // Admin
  getAllDokumenAdmin,
  getAllPermohonan,
  updateStatusPermohonan,
  createDokumen,
  updateDokumen,
  deleteDokumen,
  downloadDokumen
};
