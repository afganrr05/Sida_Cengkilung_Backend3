const { pool } = require('../config/db');
const fs = require('fs');
const path = require('path');

const getUploadBaseDir = () => {
  if (process.env.UPLOAD_DIR) {
    return path.resolve(process.env.UPLOAD_DIR);
  }
  return path.join(__dirname, '..', '..', 'uploads');
};

// PUBLIC - hanya untuk masyarakat yang login
const getDokumenPublik = async () => {
  const [rows] = await pool.execute(`
    SELECT d.*, 
           COALESCE(d.kategori, 
             CASE 
               WHEN d.jenis_dokumen IN ('Awig-awig', 'Perarem', 'Peraturan Desa', 'Keputusan Paruman', 'Lainnya') 
                 THEN 'Dokumen Adat/Desa'
               ELSE 'Surat'
             END
           ) as kategori
    FROM tb_dokumen d
    WHERE d.hak_akses = 'publik' AND d.status_dokumen = 'aktif'
    ORDER BY d.tanggal_upload DESC
  `);
  
  return rows;
};

const getDokumenTerbatas = async (userId) => {
  const [rows] = await pool.execute(`
    SELECT d.*,
           COALESCE(d.kategori, 
             CASE 
               WHEN d.jenis_dokumen IN ('Awig-awig', 'Perarem', 'Peraturan Desa', 'Keputusan Paruman', 'Lainnya') 
                 THEN 'Dokumen Adat/Desa'
               ELSE 'Surat'
             END
           ) as kategori
    FROM tb_dokumen d
    WHERE d.hak_akses = 'terbatas' 
      AND d.status_dokumen = 'aktif'
    ORDER BY d.tanggal_upload DESC
  `);
  
  return rows;
};

const getDokumenTerbatasById = async (id) => {
  const [rows] = await pool.execute(
    `SELECT d.*, 
            COALESCE(d.kategori, 
              CASE 
                WHEN d.jenis_dokumen IN ('Awig-awig', 'Perarem', 'Peraturan Desa', 'Keputusan Paruman', 'Lainnya') 
                  THEN 'Dokumen Adat/Desa'
                ELSE 'Surat'
              END
            ) as kategori
     FROM tb_dokumen d 
     WHERE d.id_dokumen = ? AND d.hak_akses = 'terbatas' AND d.status_dokumen = 'aktif'`,
    [id]
  );

  if (rows.length === 0) {
    throw new Error('Dokumen terbatas tidak ditemukan');
  }

  return rows[0];
};

const ajukanPermohonanDokumen = async (dokumenId, userId, alasan, tanggalPelaksanaan, durasiPelaksanaan, lampiranBerkas = null) => {
  // Cek apakah sudah ada permohonan
  const [existing] = await pool.execute(
    'SELECT * FROM tb_permohonan_dokumen WHERE id_pengguna = ? AND id_dokumen = ?',
    [userId, dokumenId]
  );

  let lampiranPath = null;
  
  // Upload lampiran jika ada
  if (lampiranBerkas) {
    // Buat direktori jika belum ada
    const uploadDir = path.join(getUploadBaseDir(), 'permohonan');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    // Generate nama file unik
    const fileExtension = path.extname(lampiranBerkas.originalname);
    const fileName = `permohonan_${Date.now()}_${userId}${fileExtension}`;
    const filePath = path.join(uploadDir, fileName);
    
    // Simpan file
    fs.writeFileSync(filePath, lampiranBerkas.buffer);
    lampiranPath = `uploads/permohonan/${fileName}`;
  }

  if (existing.length > 0) {
    const permohonan = existing[0];

    // Jika sebelumnya ditolak, boleh ajukan ulang -> reset ke menunggu
    if (permohonan.status_permohonan === 'ditolak') {
      await pool.execute(
        `UPDATE tb_permohonan_dokumen
         SET alasan_permohonan = ?,
             tanggal_pelaksanaan = ?,
             durasi_pelaksanaan = ?,
             lampiran_berkas = COALESCE(?, lampiran_berkas),
             status_permohonan = 'menunggu',
             catatan_admin = NULL,
             tanggal_respon = NULL,
             tanggal_permohonan = NOW()
         WHERE id_permohonan = ?`,
        [alasan, tanggalPelaksanaan, durasiPelaksanaan, lampiranPath, permohonan.id_permohonan]
      );

      return { id: permohonan.id_permohonan, resubmitted: true };
    }

    // Menunggu / diterima tidak boleh ajukan ulang
    throw new Error('Anda sudah mengajukan permohonan untuk dokumen ini');
  }

  // Insert permohonan baru
  const [result] = await pool.execute(
    `INSERT INTO tb_permohonan_dokumen (
      id_pengguna, 
      id_dokumen, 
      alasan_permohonan, 
      tanggal_pelaksanaan,
      durasi_pelaksanaan,
      lampiran_berkas,
      tanggal_permohonan, 
      status_permohonan
    ) VALUES (?, ?, ?, ?, ?, ?, NOW(), 'menunggu')`,
    [userId, dokumenId, alasan, tanggalPelaksanaan, durasiPelaksanaan, lampiranPath]
  );

  return { id: result.insertId };
};

const getPermohonanSaya = async (userId) => {
  const [rows] = await pool.execute(`
    SELECT pd.*, 
           d.judul_dokumen, 
           d.jenis_dokumen,
           COALESCE(d.kategori, 
             CASE 
               WHEN d.jenis_dokumen IN ('Awig-awig', 'Perarem', 'Peraturan Desa', 'Keputusan Paruman', 'Lainnya') 
                 THEN 'Dokumen Adat/Desa'
               ELSE 'Surat'
             END
           ) as kategori,
           d.file_path as dokumen_file_path
    FROM tb_permohonan_dokumen pd
    LEFT JOIN tb_dokumen d ON pd.id_dokumen = d.id_dokumen
    WHERE pd.id_pengguna = ?
    ORDER BY pd.tanggal_permohonan DESC
  `, [userId]);
  
  return rows;
};

// ADMIN FUNCTIONS
const getAllDokumenAdmin = async () => {
  const [rows] = await pool.execute(`
    SELECT d.*, 
           COALESCE(d.kategori, 
             CASE 
               WHEN d.jenis_dokumen IN ('Awig-awig', 'Perarem', 'Peraturan Desa', 'Keputusan Paruman', 'Lainnya') 
                 THEN 'Dokumen Adat/Desa'
               ELSE 'Surat'
             END
           ) as kategori,
           COALESCE(pd.jumlah_permohonan, 0) as jumlah_permohonan
    FROM tb_dokumen d
    LEFT JOIN (
      SELECT id_dokumen, COUNT(*) as jumlah_permohonan
      FROM tb_permohonan_dokumen
      GROUP BY id_dokumen
    ) pd ON d.id_dokumen = pd.id_dokumen
    ORDER BY d.tanggal_upload DESC
  `);
  
  // Log untuk debugging
  console.log('Data dokumen admin:', rows.map(r => ({ id: r.id_dokumen, judul: r.judul_dokumen, kategori: r.kategori, jenis: r.jenis_dokumen })));
  
  return rows;
};

const getAllPermohonanAdmin = async (status = null) => {
  let query = `
    SELECT pd.*, 
           d.judul_dokumen, 
           d.jenis_dokumen,
           COALESCE(d.kategori, 
             CASE 
               WHEN d.jenis_dokumen IN ('Awig-awig', 'Perarem', 'Peraturan Desa', 'Keputusan Paruman', 'Lainnya') 
                 THEN 'Dokumen Adat/Desa'
               ELSE 'Surat'
             END
           ) as kategori,
           p.nama_lengkap,
           p.email
    FROM tb_permohonan_dokumen pd
    LEFT JOIN tb_dokumen d ON pd.id_dokumen = d.id_dokumen
    LEFT JOIN tb_pengguna p ON pd.id_pengguna = p.id_pengguna
  `;
  
  const params = [];
  
  if (status) {
    query += ' WHERE pd.status_permohonan = ?';
    params.push(status);
  }
  
  query += ' ORDER BY pd.tanggal_permohonan DESC';
  
  const [rows] = await pool.execute(query, params);
  return rows;
};

const updateStatusPermohonan = async (permohonanId, status, catatan, adminId) => {
  const [result] = await pool.execute(
    `UPDATE tb_permohonan_dokumen 
     SET status_permohonan = ?, 
         catatan_admin = ?, 
         tanggal_respon = NOW()
     WHERE id_permohonan = ?`,
    [status, catatan, permohonanId]
  );

  if (result.affectedRows === 0) {
    throw new Error('Permohonan tidak ditemukan');
  }

  return { message: `Status permohonan berhasil diubah menjadi ${status}` };
};

const createDokumen = async (dokumenData, userId) => {
  const {
    judul_dokumen,
    deskripsi_dokumen,
    jenis_dokumen,
    kategori, // Jangan beri default di sini, biarkan controller yang menentukan
    file_path,
    hak_akses = 'publik',
    status_dokumen = 'aktif'
  } = dokumenData;

  if (!judul_dokumen || !jenis_dokumen) {
    throw new Error('Judul dan jenis dokumen wajib diisi');
  }

  // Tentukan kategori: gunakan dari input atau tentukan berdasarkan jenis_dokumen
  let finalKategori = kategori;
  if (!finalKategori) {
    // Tentukan kategori berdasarkan jenis_dokumen
    const dokumenAdatTypes = ['Awig-awig', 'Perarem', 'Peraturan Desa', 'Keputusan Paruman', 'Lainnya'];
    finalKategori = dokumenAdatTypes.includes(jenis_dokumen) ? 'Dokumen Adat/Desa' : 'Surat';
  }

  if (!file_path) {
    throw new Error('File dokumen wajib diupload');
  }

  console.log('Creating dokumen with kategori:', finalKategori); // Debug

  const [result] = await pool.execute(
    `INSERT INTO tb_dokumen (
      id_pengguna, judul_dokumen, deskripsi_dokumen,
      jenis_dokumen, kategori, file_path, hak_akses, status_dokumen, tanggal_upload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      userId,
      judul_dokumen,
      deskripsi_dokumen ?? null,
      jenis_dokumen,
      finalKategori,
      file_path,
      hak_akses || 'publik',
      status_dokumen || 'aktif'
    ]
  );

  return { id: result.insertId, kategori: finalKategori };
};

const updateDokumen = async (id, dokumenData) => {
  const updateFields = [];
  const values = [];
  const hasOwn = (key) => Object.prototype.hasOwnProperty.call(dokumenData, key);
  const isDefined = (value) => value !== undefined;

  if (hasOwn('judul_dokumen') && isDefined(dokumenData.judul_dokumen)) {
    updateFields.push('judul_dokumen = ?');
    values.push(dokumenData.judul_dokumen);
  }
  if (hasOwn('deskripsi_dokumen') && isDefined(dokumenData.deskripsi_dokumen)) {
    updateFields.push('deskripsi_dokumen = ?');
    values.push(dokumenData.deskripsi_dokumen);
  }
  if (hasOwn('jenis_dokumen') && isDefined(dokumenData.jenis_dokumen)) {
    updateFields.push('jenis_dokumen = ?');
    values.push(dokumenData.jenis_dokumen);
  }
  // Update kategori - gunakan nilai yang dikirim
  if (hasOwn('kategori') && isDefined(dokumenData.kategori) && dokumenData.kategori !== '') {
    updateFields.push('kategori = ?');
    values.push(dokumenData.kategori);
    console.log('Updating kategori to:', dokumenData.kategori); // Debug
  }
  if (hasOwn('file_path') && isDefined(dokumenData.file_path)) {
    updateFields.push('file_path = ?');
    values.push(dokumenData.file_path);
  }
  if (hasOwn('hak_akses') && isDefined(dokumenData.hak_akses)) {
    updateFields.push('hak_akses = ?');
    values.push(dokumenData.hak_akses);
  }
  if (hasOwn('status_dokumen') && isDefined(dokumenData.status_dokumen)) {
    updateFields.push('status_dokumen = ?');
    values.push(dokumenData.status_dokumen);
  }

  if (updateFields.length === 0) {
    throw new Error('Tidak ada data yang diperbarui');
  }

  values.push(id);

  const query = `UPDATE tb_dokumen SET ${updateFields.join(', ')} WHERE id_dokumen = ?`;
  console.log('Update query:', query); // Debug
  console.log('Update values:', values); // Debug
  
  const [result] = await pool.execute(query, values);
  
  if (result.affectedRows === 0) {
    throw new Error('Dokumen tidak ditemukan');
  }

  return { message: 'Dokumen berhasil diperbarui' };
};

const deleteDokumen = async (id) => {
  // Hapus file lampiran terkait jika ada
  const [permohonanFiles] = await pool.execute(
    'SELECT lampiran_berkas FROM tb_permohonan_dokumen WHERE id_dokumen = ? AND lampiran_berkas IS NOT NULL',
    [id]
  );
  
  // Hapus file-file lampiran
  for (const file of permohonanFiles) {
    if (file.lampiran_berkas) {
      const relativePath = String(file.lampiran_berkas).replace(/^\/+/, '');
      const primaryPath = path.join(__dirname, '..', '..', relativePath);
      const legacyPath = path.join(__dirname, '..', relativePath);

      if (fs.existsSync(primaryPath)) {
        fs.unlinkSync(primaryPath);
      } else if (fs.existsSync(legacyPath)) {
        fs.unlinkSync(legacyPath);
      }
    }
  }
  
  const [result] = await pool.execute('DELETE FROM tb_dokumen WHERE id_dokumen = ?', [id]);
  
  if (result.affectedRows === 0) {
    throw new Error('Dokumen tidak ditemukan');
  }

  return { message: 'Dokumen berhasil dihapus' };
};

const getDokumenById = async (id) => {
  const [rows] = await pool.execute(
    `SELECT id_dokumen, judul_dokumen, file_path, hak_akses, 
            COALESCE(kategori, 
              CASE 
                WHEN jenis_dokumen IN ('Awig-awig', 'Perarem', 'Peraturan Desa', 'Keputusan Paruman', 'Lainnya') 
                  THEN 'Dokumen Adat/Desa'
                ELSE 'Surat'
              END
            ) as kategori,
            jenis_dokumen
     FROM tb_dokumen WHERE id_dokumen = ?`,
    [id]
  );

  if (rows.length === 0) {
    throw new Error('Dokumen tidak ditemukan');
  }

  return rows[0];
};

const hasApprovedPermohonan = async (dokumenId, userId) => {
  const [rows] = await pool.execute(
    `SELECT id_permohonan
     FROM tb_permohonan_dokumen
     WHERE id_dokumen = ? AND id_pengguna = ? AND status_permohonan = 'diterima'
     LIMIT 1`,
    [dokumenId, userId]
  );

  return rows.length > 0;
};

module.exports = {
  // Public/Masyarakat
  getDokumenPublik,
  getDokumenTerbatas,
  getDokumenTerbatasById,
  ajukanPermohonanDokumen,
  getPermohonanSaya,
  // Admin
  getAllDokumenAdmin,
  getAllPermohonanAdmin,
  updateStatusPermohonan,
  createDokumen,
  updateDokumen,
  deleteDokumen,
  getDokumenById,
  hasApprovedPermohonan
};
