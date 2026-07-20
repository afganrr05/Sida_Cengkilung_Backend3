const pool = require('../config/db').pool;

const isNil = (value) => value === undefined || value === null;
const toNullIfEmpty = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
};

const getAllKonten = async (filter = {}) => {
  let query = `
    SELECT k.*, kk.nama_kategori 
    FROM tb_konten k
    LEFT JOIN tb_kategori_konten kk ON k.id_kategori_konten = kk.id_kategori_konten
    WHERE k.status_konten = 'published'
  `;
  const params = [];

  if (filter.kategori) {
    query += ' AND kk.nama_kategori = ?';
    params.push(filter.kategori);
  }

  query += ' ORDER BY k.tanggal_publikasi DESC';

  const [rows] = await pool.execute(query, params);
  return rows;
};

const getKontenById = async (id) => {
  const [rows] = await pool.execute(`
    SELECT k.*, kk.nama_kategori 
    FROM tb_konten k
    LEFT JOIN tb_kategori_konten kk ON k.id_kategori_konten = kk.id_kategori_konten
    WHERE k.id_konten = ? AND k.status_konten = 'published'
  `, [id]);

  if (rows.length === 0) {
    throw new Error('Konten tidak ditemukan');
  }

  return rows[0];
};

const getKategoriKonten = async () => {
  const [rows] = await pool.execute('SELECT * FROM tb_kategori_konten ORDER BY nama_kategori');
  return rows;
};

// ADMIN FUNCTIONS
const getAllKontenAdmin = async () => {
  const [rows] = await pool.execute(`
    SELECT 
      k.*, 
      kk.nama_kategori, 
      p.nama_lengkap as penulis,
      p.nama_lengkap as author,
      COALESCE(k.tanggal_diperbarui, k.tanggal_dibuat) as tanggal_terakhir
    FROM tb_konten k
    LEFT JOIN tb_kategori_konten kk ON k.id_kategori_konten = kk.id_kategori_konten
    LEFT JOIN tb_pengguna p ON k.id_pengguna = p.id_pengguna
    ORDER BY k.tanggal_diperbarui DESC, k.tanggal_dibuat DESC
  `);
  return rows;
};

const createKonten = async (kontenData, userId) => {
  const {
    judul,
    ringkasan,
    isi_konten,
    id_kategori_konten,
    status_konten = 'draft',
    thumbnail = null,
    tanggal_publikasi = null
  } = kontenData;

  if (!judul || !isi_konten || !id_kategori_konten) {
    throw new Error('Judul, isi konten, dan kategori wajib diisi');
  }

  const now = new Date();
  let publikasiDate = null;
  
  // Jika status published dan tanggal_publikasi tidak diisi, gunakan sekarang
  if (status_konten === 'published') {
    publikasiDate = tanggal_publikasi ? new Date(tanggal_publikasi) : now;
  } else if (tanggal_publikasi) {
    publikasiDate = new Date(tanggal_publikasi);
  }

  const [result] = await pool.execute(
    `INSERT INTO tb_konten (
      id_pengguna, 
      id_kategori_konten, 
      judul, 
      ringkasan, 
      isi_konten, 
      thumbnail, 
      status_konten, 
      tanggal_dibuat,
      tanggal_diperbarui,
      tanggal_publikasi
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      Number(id_kategori_konten),
      judul,
      toNullIfEmpty(ringkasan),
      isi_konten,
      toNullIfEmpty(thumbnail),
      status_konten,
      now, // tanggal_dibuat
      now, // tanggal_diperbarui (sama dengan tanggal_dibuat untuk data baru)
      publikasiDate
    ]
  );

  return { id: result.insertId };
};

const updateKonten = async (id, kontenData, userId) => {
  const {
    judul,
    ringkasan,
    isi_konten,
    id_kategori_konten,
    status_konten,
    thumbnail,
    tanggal_publikasi,
    tanggal_diperbarui
  } = kontenData;

  const updateFields = [];
  const values = [];

  // Update field-field yang dikirim
  if (!isNil(judul)) { 
    updateFields.push('judul = ?'); 
    values.push(judul); 
  }
  
  if (!isNil(ringkasan)) { 
    updateFields.push('ringkasan = ?'); 
    values.push(toNullIfEmpty(ringkasan)); 
  }
  
  if (!isNil(isi_konten)) { 
    updateFields.push('isi_konten = ?'); 
    values.push(isi_konten); 
  }
  
  if (!isNil(id_kategori_konten)) { 
    updateFields.push('id_kategori_konten = ?'); 
    values.push(Number(id_kategori_konten)); 
  }
  
  if (!isNil(status_konten)) { 
    updateFields.push('status_konten = ?'); 
    values.push(status_konten);
    
    // Jika status berubah menjadi published dan belum ada tanggal_publikasi
    if (status_konten === 'published') {
      // Cek apakah sudah ada tanggal_publikasi
      const [current] = await pool.execute(
        'SELECT tanggal_publikasi FROM tb_konten WHERE id_konten = ?',
        [id]
      );
      if (!current[0]?.tanggal_publikasi && !tanggal_publikasi) {
        updateFields.push('tanggal_publikasi = ?');
        values.push(new Date());
      }
    }
  }
  
  // Handle tanggal_publikasi jika dikirim
  if (!isNil(tanggal_publikasi)) {
    updateFields.push('tanggal_publikasi = ?');
    values.push(tanggal_publikasi ? new Date(tanggal_publikasi) : null);
  }
  
  // Handle thumbnail jika ada file baru
  if (!isNil(thumbnail)) { 
    updateFields.push('thumbnail = ?'); 
    values.push(toNullIfEmpty(thumbnail)); 
  }
  
  // Selalu update tanggal_diperbarui ke waktu sekarang
  updateFields.push('tanggal_diperbarui = ?');
  values.push(tanggal_diperbarui || new Date());

  // Update id_pengguna (penulis terakhir yang mengedit)
  if (!isNil(userId)) {
    updateFields.push('id_pengguna = ?');
    values.push(userId);
  }

  if (updateFields.length === 0) {
    throw new Error('Tidak ada data yang diperbarui');
  }

  values.push(id);

  const query = `UPDATE tb_konten SET ${updateFields.join(', ')} WHERE id_konten = ?`;
  
  const [result] = await pool.execute(query, values);
  
  if (result.affectedRows === 0) {
    throw new Error('Konten tidak ditemukan');
  }

  // Ambil data konten yang sudah diupdate untuk dikembalikan
  const [updatedRows] = await pool.execute(
    `SELECT 
      k.*, 
      kk.nama_kategori, 
      p.nama_lengkap as penulis
    FROM tb_konten k
    LEFT JOIN tb_kategori_konten kk ON k.id_kategori_konten = kk.id_kategori_konten
    LEFT JOIN tb_pengguna p ON k.id_pengguna = p.id_pengguna
    WHERE k.id_konten = ?`,
    [id]
  );

  return { 
    message: 'Konten berhasil diperbarui',
    data: updatedRows[0]
  };
};

const deleteKonten = async (id) => {
  // Hapus file thumbnail jika ada
  const [rows] = await pool.execute(
    'SELECT thumbnail FROM tb_konten WHERE id_konten = ?',
    [id]
  );
  
  if (rows.length > 0 && rows[0].thumbnail) {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(__dirname, '../', rows[0].thumbnail);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`File thumbnail dihapus: ${filePath}`);
      } catch (err) {
        console.warn('Gagal menghapus file thumbnail:', err.message);
      }
    }
  }
  
  const [result] = await pool.execute('DELETE FROM tb_konten WHERE id_konten = ?', [id]);
  
  if (result.affectedRows === 0) {
    throw new Error('Konten tidak ditemukan');
  }

  return { message: 'Konten berhasil dihapus' };
};

module.exports = {
  getAllKonten,
  getKontenById,
  getKategoriKonten,
  getAllKontenAdmin,
  createKonten,
  updateKonten,
  deleteKonten
};
