
import { Topic, Question } from './types';

export const INITIAL_MATERIALS: Record<Topic, { title: string; content: string }> = {
  [Topic.POLA_BILANGAN]: {
    title: "Eksplorasi Mendalam Pola Bilangan",
    content: "Pola bilangan adalah kumpulan bilangan yang memiliki urutan dan aturan tertentu. \n\n1. Pola Aritmatika: Pola yang suku-sukunya memiliki selisih tetap. Contoh: 2, 5, 8, 11 (selisih +3). Rumus umum Un = a + (n-1)b.\n2. Pola Geometri: Pola yang suku-sukunya memiliki rasio/pengali tetap. Contoh: 3, 6, 12, 24 (pengali x2).\n3. Pola Persegi: Bilangan hasil pangkat dua (1, 4, 9, 16).\n4. Pola Fibonacci: Suku berikutnya adalah jumlah dua suku sebelumnya (1, 1, 2, 3, 5, 8).\n\nDalam kehidupan nyata, pola digunakan arsitek untuk menyusun ubin, seniman untuk membuat batik, dan programmer untuk membuat kode."
  },
  [Topic.PECAHAN_DESIMAL]: {
    title: "Mastering Pecahan, Desimal, dan Persen",
    content: "Pecahan adalah bagian dari satu unit utuh. \n\n- Mengubah Pecahan ke Desimal: Bagi pembilang dengan penyebut (Contoh: 1/4 = 1 : 4 = 0,25).\n- Mengubah Desimal ke Persen: Kalikan dengan 100 (Contoh: 0,25 = 25%).\n- Operasi Campuran: Selalu samakan bentuknya terlebih dahulu (semua jadi desimal atau semua jadi pecahan).\n\nKonteks: Saat kamu melihat diskon 50% + 20% di mall, itu bukan berarti diskon 70%, melainkan perhitungan berantai yang menggunakan perkalian desimal!"
  },
  [Topic.KUBUS_BALOK]: {
    title: "Arsitektur Bangun Ruang: Kubus & Balok",
    content: "Memahami volume dan luas permukaan adalah kunci geometri.\n\n- Kubus: Memiliki 6 sisi persegi identik, 12 rusuk sama panjang. Volume = s³, Luas Permukaan = 6 x s².\n- Balok: Memiliki 3 pasang sisi yang berhadapan sama besar. Volume = p x l x t, Luas Permukaan = 2 x (pl + pt + lt).\n\nAplikasi: Menentukan berapa banyak cat yang dibutuhkan untuk mewarnai sebuah ruangan (Luas Permukaan) atau berapa banyak liter air yang bisa ditampung tandon (Volume)."
  },
  [Topic.RASIO]: {
    title: "Rasio, Proporsi, dan Skala",
    content: "Rasio membandingkan dua kuantitas dengan satuan yang sama.\n\n- Skala: Perbandingan jarak pada peta dengan jarak sebenarnya. Skala 1:1.000.000 artinya 1 cm di peta mewakili 10 km sebenarnya.\n- Perbandingan Senilai: Jika satu variabel naik, variabel lain ikut naik (Contoh: Jumlah bensin dan jarak tempuh).\n- Perbandingan Berbalik Nilai: Jika satu naik, yang lain turun (Contoh: Jumlah pekerja dan waktu penyelesaian bangunan)."
  },
  [Topic.PELUANG]: {
    title: "Logika Peluang dan Statistik Dasar",
    content: "Peluang membantu kita mengambil keputusan berdasarkan kemungkinan.\n\n- Ruang Sampel (S): Kumpulan semua hasil yang mungkin.\n- Titik Sampel (n): Anggota dari ruang sampel.\n- Rumus: P(A) = n(A) / n(S).\n\nContoh: Dalam prakiraan cuaca, peluang hujan 80% berarti dari 100 hari dengan kondisi serupa, 80 hari di antaranya terjadi hujan. Ini membantu petani memutuskan kapan harus mulai menanam."
  }
};

/**
 * Helper to shuffle options and track correct index
 */
const createQuestion = (
  id: string,
  topic: Topic,
  q: string,
  correct: string,
  others: string[],
  hint: string,
  difficulty: 'Mudah' | 'Sedang' | 'Sulit' = 'Sedang'
): Question => {
  const options = [correct, ...others].sort(() => Math.random() - 0.5);
  return {
    id,
    topic,
    question: q,
    options,
    correctAnswer: options.indexOf(correct),
    hint,
    difficulty
  };
};

const generateQuestions = (): Question[] => {
  const qs: Question[] = [];
  
  // Topic 1: Pola Bilangan (20 Questions)
  for (let i = 1; i <= 20; i++) {
    const a = 10 + i;
    const b = 5;
    const n = 12;
    const result = a + (n - 1) * b;
    qs.push(createQuestion(
      `pola-${i}`,
      Topic.POLA_BILANGAN,
      `Dalam sebuah gedung pertunjukan, baris pertama memiliki ${a} kursi. Baris di belakangnya selalu bertambah ${b} kursi. Berapa jumlah kursi pada baris ke-${n}?`,
      `${result} Kursi`,
      [`${result - 5} Kursi`, `${result + 10} Kursi`, `${a * n} Kursi`],
      `Gunakan Rumus Suku ke-n Aritmatika: Un = a + (n - 1)b\n\n1. Diketahui a (suku pertama) = ${a}\n2. Diketahui b (beda) = ${b}\n3. Diketahui n (baris yang dicari) = ${n}\n4. Masukkan ke rumus: ${a} + (${n} - 1) x ${b}\n5. Hitung: ${a} + (11 x ${b}) = ${a} + ${11 * b} = ${result}.`,
      'Sedang'
    ));
  }

  // Topic 2: Pecahan dan Desimal (20 Questions)
  for (let i = 1; i <= 20; i++) {
    const harga = 200000 + (i * 10000);
    const diskon = 15;
    const nilaiDiskon = (diskon / 100) * harga;
    const bayar = harga - nilaiDiskon;
    qs.push(createQuestion(
      `pecahan-${i}`,
      Topic.PECAHAN_DESIMAL,
      `Andi ingin membeli sepatu seharga Rp${harga.toLocaleString('id-ID')}. Toko memberikan diskon sebesar ${diskon}%. Berapa rupiah yang harus Andi bayar setelah diskon?`,
      `Rp${bayar.toLocaleString('id-ID')}`,
      [`Rp${(bayar + 5000).toLocaleString('id-ID')}`, `Rp${(harga - 10000).toLocaleString('id-ID')}`, `Rp${(harga / 2).toLocaleString('id-ID')}`],
      `Langkah Penyelesaian:\n\n1. Rumus Diskon = (Persen Diskon / 100) x Harga Awal\n2. Hitung Nilai Diskon: (${diskon} / 100) x ${harga} = Rp${nilaiDiskon.toLocaleString('id-ID')}\n3. Rumus Harga Akhir = Harga Awal - Nilai Diskon\n4. Hitung: Rp${harga.toLocaleString('id-ID')} - Rp${nilaiDiskon.toLocaleString('id-ID')} = Rp${bayar.toLocaleString('id-ID')}.`,
      'Sedang'
    ));
  }

  // Topic 3: Kubus dan Balok (20 Questions)
  for (let i = 1; i <= 20; i++) {
    const s = 10 + i;
    const vol = Math.pow(s, 3);
    qs.push(createQuestion(
      `kubus-${i}`,
      Topic.KUBUS_BALOK,
      `Sebuah kotak kado berbentuk kubus dengan panjang rusuk ${s} cm. Berapakah volume udara yang ada di dalam kotak tersebut jika kosong?`,
      `${vol.toLocaleString('id-ID')} cm³`,
      [`${(vol - 100).toLocaleString('id-ID')} cm³`, `${(s * 6).toLocaleString('id-ID')} cm³`, `${(s * s).toLocaleString('id-ID')} cm³`],
      `Gunakan Rumus Volume Kubus: V = s x s x s\n\n1. Diketahui sisi (s) = ${s} cm\n2. Masukkan ke rumus: ${s} x ${s} x ${s}\n3. Hitung: ${s * s} x ${s} = ${vol} cm³.`,
      'Mudah'
    ));
  }

  // Topic 4: Rasio (20 Questions)
  for (let i = 1; i <= 20; i++) {
    const skala = 250000;
    const jarakPeta = 4 + i;
    const jarakSebenarnyaCm = jarakPeta * skala;
    const jarakKm = jarakSebenarnyaCm / 100000;
    qs.push(createQuestion(
      `rasio-${i}`,
      Topic.RASIO,
      `Pada sebuah peta, jarak kota X ke kota Y adalah ${jarakPeta} cm. Jika skala peta tersebut 1 : ${skala.toLocaleString('id-ID')}, berapakah jarak sebenarnya dalam satuan kilometer?`,
      `${jarakKm} km`,
      [`${jarakKm * 10} km`, `${jarakKm / 10} km`, `${jarakPeta} km`],
      `Gunakan Rumus Jarak Sebenarnya: JS = Jarak Peta x Skala\n\n1. Jarak Peta = ${jarakPeta} cm\n2. Skala = ${skala}\n3. Hitung JS (cm): ${jarakPeta} x ${skala} = ${jarakSebenarnyaCm.toLocaleString('id-ID')} cm\n4. Konversi ke KM (Bagi 100.000): ${jarakSebenarnyaCm} / 100.000 = ${jarakKm} km.`,
      'Sulit'
    ));
  }

  // Topic 5: Peluang (20 Questions)
  for (let i = 1; i <= 20; i++) {
    const kelerengHijau = 4 + i;
    const kelerengKuning = 6;
    const total = kelerengHijau + kelerengKuning;
    qs.push(createQuestion(
      `peluang-${i}`,
      Topic.PELUANG,
      `Di dalam kotak terdapat ${kelerengHijau} kelereng hijau dan ${kelerengKuning} kelereng kuning. Jika diambil satu secara acak, berapakah peluang terambilnya kelereng hijau?`,
      `${kelerengHijau}/${total}`,
      [`${kelerengKuning}/${total}`, `1/${total}`, `${kelerengHijau}/${kelerengKuning}`],
      `Gunakan Rumus Peluang: P(A) = n(A) / n(S)\n\n1. n(A) (jumlah kejadian yang diinginkan/hijau) = ${kelerengHijau}\n2. n(S) (total seluruh kejadian/total kelereng) = ${kelerengHijau} + ${kelerengKuning} = ${total}\n3. Maka Peluang = ${kelerengHijau} / ${total}.`,
      'Mudah'
    ));
  }

  return qs;
};

export const INITIAL_QUESTIONS: Question[] = generateQuestions();
