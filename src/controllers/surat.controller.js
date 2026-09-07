const suratService = require('../services/surat.service');
const { successResponse, errorResponse } = require('../utils/response');
const db = require('../config/db');

const validateTemplateFile = (file) => {
  if (!file) return;
  const allowedExtensions = ['.pdf', '.doc', '.docx'];
  const extension = require('path').extname(file.originalname).toLowerCase();
  if (!allowedExtensions.includes(extension)) {
    throw new Error('Format template tidak didukung. Gunakan PDF, DOC, atau DOCX');
  }
};

// ==================== CONTROLLER UNTUK MASYARAKAT ====================

// Get jenis surat yang aktif (untuk dropdown di masyarakat)
const getJenisSuratAktif = async (req, res) => {
  try {
    const data = await suratService.getJenisSuratAktif();
    return successResponse(res, 'Data jenis surat berhasil diambil', data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

// Ajukan surat baru
const ajukanSurat = async (req, res) => {
  try {
    const { id_jenis, detail_fields } = req.body;
    const lampiran = req.files || [];
    
    if (!id_jenis) {
      return errorResponse(res, 'Jenis surat harus dipilih');
    }
    
    // Parse detail_fields dari JSON string
    let fields = [];
    if (detail_fields) {
      fields = typeof detail_fields === 'string' ? JSON.parse(detail_fields) : detail_fields;
    }
    
    const result = await suratService.ajukanSurat(
      req.user.id,
      id_jenis,
      fields,
      lampiran
    );
    
    // Log aktivitas
    await db.pool.execute(
      'INSERT INTO tb_log_aktivitas (id_pengguna, aktivitas, detail) VALUES (?, ?, ?)',
      [req.user.id, 'AJUKAN_SURAT', `Mengajukan surat jenis ID: ${id_jenis}`]
    );
    
    return successResponse(res, 'Pengajuan surat berhasil', result, 201);
  } catch (error) {
    console.error('Error ajukan surat:', error);
    return errorResponse(res, error.message);
  }
};

// Get pengajuan surat saya (masyarakat)
const getPengajuanSaya = async (req, res) => {
  try {
    const data = await suratService.getPengajuanByUser(req.user.id);
    return successResponse(res, 'Data pengajuan surat berhasil diambil', data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

// Get detail pengajuan surat
const getDetailPengajuan = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await suratService.getDetailPengajuan(id, req.user.id);
    return successResponse(res, 'Detail pengajuan surat berhasil diambil', data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

// ==================== CONTROLLER UNTUK ADMIN ====================

// Get semua pengajuan surat (admin)
const getAllPengajuan = async (req, res) => {
  try {
    const { status, jenis, search } = req.query;
    const data = await suratService.getAllPengajuanAdmin({ status, jenis, search });
    return successResponse(res, 'Data pengajuan surat berhasil diambil', data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

// Get detail pengajuan surat (admin)
const getDetailPengajuanAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await suratService.getDetailPengajuanAdmin(id);
    return successResponse(res, 'Detail pengajuan surat berhasil diambil', data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

// Get semua jenis surat (admin)
const getAllJenisSurat = async (req, res) => {
  try {
    const data = await suratService.getAllJenisSurat();
    return successResponse(res, 'Data jenis surat berhasil diambil', data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

// Create jenis surat baru
const createJenisSurat = async (req, res) => {
  try {
    validateTemplateFile(req.file);
    const { kategori, nama_jenis, deskripsi, fields_config, upload_config, status } = req.body;
    
    // Parse JSON jika string
    const fieldsConfig = typeof fields_config === 'string' ? JSON.parse(fields_config) : fields_config;
    const uploadConfig = typeof upload_config === 'string' ? JSON.parse(upload_config) : upload_config;
    
    const result = await suratService.createJenisSurat({
      kategori,
      nama_jenis,
      deskripsi,
      fields_config: fieldsConfig,
      upload_config: uploadConfig,
      status: status || 'aktif',
      template_surat: req.file
    });
    
    return successResponse(res, 'Jenis surat berhasil dibuat', result, 201);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

// Update jenis surat
const updateJenisSurat = async (req, res) => {
  try {
    validateTemplateFile(req.file);
    const { id } = req.params;
    const { kategori, nama_jenis, deskripsi, fields_config, upload_config, status } = req.body;
    
    const fieldsConfig = typeof fields_config === 'string' ? JSON.parse(fields_config) : fields_config;
    const uploadConfig = typeof upload_config === 'string' ? JSON.parse(upload_config) : upload_config;
    
    const result = await suratService.updateJenisSurat(id, {
      kategori,
      nama_jenis,
      deskripsi,
      fields_config: fieldsConfig,
      upload_config: uploadConfig,
      status,
      template_surat: req.file
    });
    
    return successResponse(res, 'Jenis surat berhasil diperbarui', result);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

// Delete jenis surat
const deleteJenisSurat = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await suratService.deleteJenisSurat(id);
    return successResponse(res, 'Jenis surat berhasil dihapus', result);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

// Update status pengajuan surat (admin proses)
const updateStatusPengajuan = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, catatan_admin, no_surat } = req.body;
    const fileFinal = req.file;
    
    const result = await suratService.updateStatusPengajuan(
      id,
      status,
      catatan_admin,
      no_surat,
      fileFinal,
      req.user.id
    );
    
    return successResponse(res, result.message);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

// Download file final surat
const downloadSurat = async (req, res) => {
  try {
    const { id } = req.params;
    const filePath = await suratService.getSuratFilePath(id, req.user.id);
    
    if (!filePath) {
      return errorResponse(res, 'File tidak ditemukan', 404);
    }
    
    const path = require('path');
    const fs = require('fs');

    const normalizedPath = String(filePath).replace(/\\/g, '/');
    const relativePath = normalizedPath.replace(/^\/+/, '');
    const absoluteDirect = path.isAbsolute(filePath) ? filePath : null;
    const absolutePrimary = path.join(__dirname, '..', '..', relativePath);
    const absoluteLegacy = path.join(__dirname, '..', relativePath);
    const absolutePath = absoluteDirect && fs.existsSync(absoluteDirect)
      ? absoluteDirect
      : fs.existsSync(absolutePrimary)
        ? absolutePrimary
        : absoluteLegacy;

    if (!fs.existsSync(absolutePath)) {
      return errorResponse(res, 'File tidak ditemukan di server', 404);
    }
    
    const filename = path.basename(absolutePath);
    res.download(absolutePath, filename);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

// Download atau preview template jenis surat (admin)
const downloadTemplateSurat = async (req, res) => {
  try {
    const filePath = await suratService.getTemplateFilePath(req.params.id);
    if (!filePath) return errorResponse(res, 'Template surat belum tersedia', 404);

    const path = require('path');
    const fs = require('fs');
    const normalizedPath = String(filePath).replace(/\\/g, '/');
    const relativePath = normalizedPath.replace(/^\/+/, '');
    const absoluteDirect = path.isAbsolute(filePath) ? filePath : null;
    const absolutePrimary = path.join(__dirname, '..', '..', relativePath);
    const absoluteLegacy = path.join(__dirname, '..', relativePath);
    const absolutePath = absoluteDirect && fs.existsSync(absoluteDirect)
      ? absoluteDirect
      : fs.existsSync(absolutePrimary) ? absolutePrimary : absoluteLegacy;

    if (!fs.existsSync(absolutePath)) return errorResponse(res, 'File template tidak ditemukan di server', 404);
    res.download(absolutePath, path.basename(absolutePath));
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

module.exports = {
  // Masyarakat
  getJenisSuratAktif,
  ajukanSurat,
  getPengajuanSaya,
  getDetailPengajuan,
  // Admin
  getAllPengajuan,
  getDetailPengajuanAdmin,
  getAllJenisSurat,
  createJenisSurat,
  updateJenisSurat,
  deleteJenisSurat,
  updateStatusPengajuan,
  downloadSurat,
  downloadTemplateSurat
};
