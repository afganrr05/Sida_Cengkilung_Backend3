const { pool } = require('../config/db');
const fs = require('fs');
const path = require('path');
const { saveUploadedFile } = require('../middlewares/upload.middleware');

const getUploadBaseDir = () => {
  if (process.env.UPLOAD_DIR) {
    return path.resolve(process.env.UPLOAD_DIR);
  }
  return path.join(__dirname, '..', '..', 'uploads');
};

// ==================== SERVICE UNTUK MASYARAKAT ====================

// Get jenis surat aktif
const getJenisSuratAktif = async () => {
  const [rows] = await pool.execute(
    `SELECT id_jenis, nama_jenis, deskripsi, fields_config, upload_config, template_surat 
     FROM tb_jenis_surat 
     WHERE status = 'aktif' 
     ORDER BY id_jenis`
  );
  return rows;
};

// Ajukan surat baru
const ajukanSurat = async (userId, idJenis, detailFields, lampiranFiles) => {
  // Mulai transaction
  const connection = await pool.getConnection();
  await connection.beginTransaction();
  
  try {
    // Insert ke tb_pengajuan_surat
    const [result] = await connection.execute(
      `INSERT INTO tb_pengajuan_surat (id_pengguna, id_jenis, status, tanggal_pengajuan) 
       VALUES (?, ?, 'MENUNGGU', NOW())`,
      [userId, idJenis]
    );
    
    const idPengajuan = result.insertId;
    
    // Insert detail fields ke tb_detail_pengajuan
    for (const field of detailFields) {
      await connection.execute(
        `INSERT INTO tb_detail_pengajuan (id_pengajuan, field_name, field_value) 
         VALUES (?, ?, ?)`,
        [idPengajuan, field.name, field.value]
      );
    }
    
    // Simpan lampiran jika ada
    if (lampiranFiles && lampiranFiles.length > 0) {
      const uploadDir = path.join(__dirname, '../uploads/lampiran', String(idPengajuan));
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      for (const file of lampiranFiles) {
        const fileName = `${Date.now()}_${file.originalname}`;
        const filePath = path.join(uploadDir, fileName);
        fs.writeFileSync(filePath, file.buffer);
        
        await connection.execute(
          `INSERT INTO tb_lampiran_surat (id_pengajuan, nama_file, file_path, file_size, file_type) 
           VALUES (?, ?, ?, ?, ?)`,
          [idPengajuan, file.originalname, `uploads/lampiran/${idPengajuan}/${fileName}`, file.size, file.mimetype]
        );
      }
    }
    
    await connection.commit();
    return { id: idPengajuan };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// Get pengajuan by user
const getPengajuanByUser = async (userId) => {
  const [rows] = await pool.execute(
    `SELECT p.*, j.nama_jenis 
     FROM tb_pengajuan_surat p
     JOIN tb_jenis_surat j ON p.id_jenis = j.id_jenis
     WHERE p.id_pengguna = ?
     ORDER BY p.tanggal_pengajuan DESC`,
    [userId]
  );
  
  // Ambil detail fields untuk setiap pengajuan
  for (const row of rows) {
    const [details] = await pool.execute(
      `SELECT field_name, field_value FROM tb_detail_pengajuan WHERE id_pengajuan = ?`,
      [row.id_pengajuan]
    );
    row.detail_fields = details;
  }
  
  return rows;
};

// Get detail pengajuan
const getDetailPengajuan = async (idPengajuan, userId) => {
  const [rows] = await pool.execute(
    `SELECT p.*, j.nama_jenis, j.fields_config,
            u.nama_lengkap as pemohon_nama, u.email as pemohon_email
     FROM tb_pengajuan_surat p
     JOIN tb_jenis_surat j ON p.id_jenis = j.id_jenis
     JOIN tb_pengguna u ON p.id_pengguna = u.id_pengguna
     WHERE p.id_pengajuan = ? AND p.id_pengguna = ?`,
    [idPengajuan, userId]
  );
  
  if (rows.length === 0) throw new Error('Pengajuan tidak ditemukan');
  
  const [details] = await pool.execute(
    `SELECT field_name, field_value FROM tb_detail_pengajuan WHERE id_pengajuan = ?`,
    [idPengajuan]
  );
  
  const [lampiran] = await pool.execute(
    `SELECT * FROM tb_lampiran_surat WHERE id_pengajuan = ?`,
    [idPengajuan]
  );
  
  return { ...rows[0], detail_fields: details, lampiran };
};

// ==================== SERVICE UNTUK ADMIN ====================

// Get semua pengajuan (admin)
const getAllPengajuanAdmin = async (filters = {}) => {
  let query = `
    SELECT p.*, j.id_jenis, j.nama_jenis, j.template_surat, u.nama_lengkap as pemohon_nama, u.email as pemohon_email
    FROM tb_pengajuan_surat p
    JOIN tb_jenis_surat j ON p.id_jenis = j.id_jenis
    JOIN tb_pengguna u ON p.id_pengguna = u.id_pengguna
    WHERE 1=1
  `;
  const params = [];
  
  if (filters.status) {
    query += ' AND p.status = ?';
    params.push(filters.status);
  }
  
  if (filters.jenis) {
    query += ' AND p.id_jenis = ?';
    params.push(filters.jenis);
  }
  
  if (filters.search) {
    query += ' AND u.nama_lengkap LIKE ?';
    params.push(`%${filters.search}%`);
  }
  
  query += ' ORDER BY FIELD(p.status, "MENUNGGU", "DRAFT", "LEGALISI", "SIAP", "SELESAI"), p.tanggal_pengajuan DESC';
  
  const [rows] = await pool.execute(query, params);

  for (const row of rows) {
    const [details] = await pool.execute(
      `SELECT field_name, field_value FROM tb_detail_pengajuan WHERE id_pengajuan = ?`,
      [row.id_pengajuan]
    );
    row.detail_fields = details;
  }

  return rows;
};

// Get detail pengajuan untuk admin (lengkap)
const getDetailPengajuanAdmin = async (idPengajuan) => {
  const [rows] = await pool.execute(
    `SELECT p.*, 
            j.id_jenis, j.nama_jenis, j.fields_config, j.template_surat,
            u.id_pengguna, u.nama_lengkap as pemohon_nama, u.email as pemohon_email
     FROM tb_pengajuan_surat p
     JOIN tb_jenis_surat j ON p.id_jenis = j.id_jenis
     JOIN tb_pengguna u ON p.id_pengguna = u.id_pengguna
     WHERE p.id_pengajuan = ?`,
    [idPengajuan]
  );

  if (rows.length === 0) throw new Error('Pengajuan tidak ditemukan');
  const pengajuan = rows[0];

  const [details] = await pool.execute(
    `SELECT field_name, field_value FROM tb_detail_pengajuan WHERE id_pengajuan = ?`,
    [idPengajuan]
  );

  const [lampiran] = await pool.execute(
    `SELECT id_lampiran, nama_file, file_path, file_size, file_type 
     FROM tb_lampiran_surat 
     WHERE id_pengajuan = ? 
     ORDER BY id_lampiran ASC`,
    [idPengajuan]
  );

  // Penting: log harus scoped ketat per id_pengajuan agar tidak tercampur.
  // Gunakan REGEXP boundary digit supaya "ID 1" tidak match "ID 10".
  const [logsRaw] = await pool.execute(
    `SELECT l.*, p.nama_lengkap as admin_nama
     FROM tb_log_aktivitas l
     LEFT JOIN tb_pengguna p ON p.id_pengguna = l.id_pengguna
     WHERE l.aktivitas = 'UPDATE_SURAT'
       AND l.detail REGEXP CONCAT('ID[[:space:]]*', ?, '([^0-9]|$)')
     ORDER BY l.id_log DESC`,
    [String(idPengajuan)]
  );

  const logs = logsRaw.map((log) => ({
    ...log,
    created_at: log.created_at || log.waktu || log.tanggal || null,
    admin: { nama_lengkap: log.admin_nama || 'Admin' }
  }));

  const pengajuanAwalLog = {
    aktivitas: 'AJUKAN_SURAT',
    detail: `Pengajuan surat dibuat (ID ${idPengajuan})`,
    created_at: pengajuan.tanggal_pengajuan || null,
    admin: { nama_lengkap: pengajuan.pemohon_nama || 'Pemohon' }
  };

  return {
    ...pengajuan,
    pemohon: {
      id_pengguna: pengajuan.id_pengguna,
      nama_lengkap: pengajuan.pemohon_nama,
      email: pengajuan.pemohon_email
    },
    jenis_surat: {
      id_jenis: pengajuan.id_jenis,
      nama_jenis: pengajuan.nama_jenis
    },
    detail_fields: details,
    lampiran,
    logs: [pengajuanAwalLog, ...logs]
  };
};

// Get semua jenis surat (admin)
const getAllJenisSurat = async () => {
  const [rows] = await pool.execute(
    `SELECT * FROM tb_jenis_surat ORDER BY id_jenis`
  );
  return rows;
};

// Create jenis surat
const createJenisSurat = async (data) => {
  const { kategori, nama_jenis, deskripsi, fields_config, upload_config, status } = data;
  const templatePath = data.template_surat ? await saveUploadedFile(data.template_surat, 'template_surat') : null;
  
  const [result] = await pool.execute(
    `INSERT INTO tb_jenis_surat (kategori, nama_jenis, deskripsi, fields_config, upload_config, template_surat, status) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [kategori || 'Surat', nama_jenis, deskripsi, JSON.stringify(fields_config), JSON.stringify(upload_config), templatePath, status]
  );
  
  return { id: result.insertId };
};

// Update jenis surat
const updateJenisSurat = async (id, data) => {
  const { kategori, nama_jenis, deskripsi, fields_config, upload_config, status } = data;
  const templatePath = data.template_surat ? await saveUploadedFile(data.template_surat, 'template_surat') : null;
  const updateTemplate = templatePath ? ', template_surat = ?' : '';
  
  await pool.execute(
    `UPDATE tb_jenis_surat 
     SET kategori = ?, nama_jenis = ?, deskripsi = ?, fields_config = ?, upload_config = ?, status = ?, updated_at = NOW()${updateTemplate}
     WHERE id_jenis = ?`,
    templatePath
      ? [kategori || 'Surat', nama_jenis, deskripsi, JSON.stringify(fields_config), JSON.stringify(upload_config), status, templatePath, id]
      : [kategori || 'Surat', nama_jenis, deskripsi, JSON.stringify(fields_config), JSON.stringify(upload_config), status, id]
  );
  
  return { id };
};

const getTemplateFilePath = async (idJenis) => {
  const [rows] = await pool.execute(
    'SELECT template_surat FROM tb_jenis_surat WHERE id_jenis = ?',
    [idJenis]
  );
  return rows[0]?.template_surat || null;
};

// Delete jenis surat
const deleteJenisSurat = async (id) => {
  await pool.execute(`DELETE FROM tb_jenis_surat WHERE id_jenis = ?`, [id]);
  return { message: 'Jenis surat berhasil dihapus' };
};

// Update status pengajuan
const updateStatusPengajuan = async (id, status, catatanAdmin, noSurat, fileFinal, adminId) => {
  const updateFields = ['status = ?'];
  const params = [status];
  
  if (catatanAdmin !== undefined) {
    updateFields.push('catatan_admin = ?');
    params.push(catatanAdmin);
  }
  
  if (noSurat !== undefined) {
    updateFields.push('no_surat = ?');
    params.push(noSurat);
  }
  
  if (fileFinal) {
    const uploadDir = path.join(getUploadBaseDir(), 'surat_final');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    
    const fileName = `surat_${id}_${Date.now()}.pdf`;
    const filePath = path.join(uploadDir, fileName);
    fs.writeFileSync(filePath, fileFinal.buffer);
    
    updateFields.push('file_final = ?');
    params.push(`uploads/surat_final/${fileName}`.replace(/\\/g, '/'));
  }
  
  updateFields.push('tanggal_update = NOW()');
  params.push(id);
  
  await pool.execute(
    `UPDATE tb_pengajuan_surat SET ${updateFields.join(', ')} WHERE id_pengajuan = ?`,
    params
  );
  
  // Catat log aktivitas ke tb_log_aktivitas
  await pool.execute(
    `INSERT INTO tb_log_aktivitas (id_pengguna, aktivitas, detail) VALUES (?, 'UPDATE_SURAT', ?)`,
    [adminId, `Mengubah status surat ID ${id} menjadi ${status}`]
  );
  
  return { message: `Status berhasil diubah menjadi ${status}` };
};

// Get file path surat
const getSuratFilePath = async (idPengajuan, userId) => {
  const [rows] = await pool.execute(
    `SELECT file_final FROM tb_pengajuan_surat WHERE id_pengajuan = ? AND id_pengguna = ?`,
    [idPengajuan, userId]
  );
  return rows[0]?.file_final;
};

module.exports = {
  getJenisSuratAktif,
  ajukanSurat,
  getPengajuanByUser,
  getDetailPengajuan,
  getAllPengajuanAdmin,
  getDetailPengajuanAdmin,
  getTemplateFilePath,
  getAllJenisSurat,
  createJenisSurat,
  updateJenisSurat,
  deleteJenisSurat,
  updateStatusPengajuan,
  getSuratFilePath
};
