
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isPlaceholder = !supabaseUrl || supabaseUrl.includes('placeholder') || !supabaseAnonKey || supabaseAnonKey.includes('placeholder');

if (isPlaceholder) {
  console.warn('Supabase credentials missing or using placeholders. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment variables.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

export const checkSupabaseConnection = async () => {
  if (isPlaceholder) {
    return { 
      success: false, 
      message: 'Konfigurasi Supabase belum lengkap. Silakan atur URL dan API Key di menu Settings.' 
    };
  }
  
  try {
    console.log("Testing connection to:", supabaseUrl);
    const { error } = await supabase.from('materi').select('id').limit(1);
    if (error) {
      console.error("Supabase Error:", error);
      return { 
        success: false, 
        message: `Gagal terhubung ke Supabase: ${error.message}`,
        details: error
      };
    }
    return { success: true, message: 'Koneksi Supabase Berhasil!' };
  } catch (err: any) {
    console.error("Network Error during Supabase check:", err);
    const isFailedToFetch = err.message?.includes('fetch') || 
                           err.message?.includes('Network') || 
                           err.message?.includes('Gagal mengambil data');
    
    let message = `Kesalahan Jaringan: ${err.message || 'Gagal menghubungi server Supabase.'}`;
    if (isFailedToFetch) {
      message = "Kesalahan Jaringan: Gagal menghubungi Supabase (Failed to fetch). Pastikan URL Supabase Anda benar (harus diawali https://) dan tidak ada pemblokir iklan yang aktif.";
    }

    return { 
      success: false, 
      message: message,
      details: err
    };
  }
};
