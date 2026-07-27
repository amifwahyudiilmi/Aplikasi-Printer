import dotenv from 'dotenv';
dotenv.config(); // <--- Memuat isi file .env ke process.env
import express from 'express';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '20mb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// API Endpoint for Gemini Receipt Vision Processing
app.post('/api/parse-receipt', async (req, res) => {
  try {
    const { imageBase64, mimeType, userApiKey } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'Base64 image data is required' });
    }

    const apiKey = userApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(401).json({
        error: 'API Key Gemini tidak ditemukan. Harap pastikan GEMINI_API_KEY dikonfigurasi atau masukkan API Key di Pengaturan.',
      });
    }

    const ai = new GoogleGenAI({apiKey});

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const systemInstruction = `Anda adalah sistem OCR dan Vision AI perbankan & kasir profesional Indonesia.
Tugas Anda adalah menganalisis foto/gambar resi bukti transfer bank, resi QRIS, e-wallet, atau struk transaksi keuangan di Indonesia.
Ekstrak data dari gambar secara akurat dan rapi dalam format JSON terstruktur.

Data yang WAJIB diekstrak:
1. bankName: Nama Bank / Penyedia Layanan (contoh: BCA, Bank Mandiri, BRI, BNI, QRIS, DANA, GoPay, OVO, ShopeePay, LinkAja, dll).
2. transactionType: Judul / Jenis Transaksi (contoh: Transfer Bank, Pembayaran QRIS, Top Up E-Money, Transfer BI-Fast, Pembayaran Merchant).
3. dateTime: Tanggal & Waktu Transaksi dalam format jelas (contoh: "27 Jul 2026, 14:30 WIB").
4. refNumber: Nomor Referensi / ID Transaksi / No Jurnal. Jika tidak tertera, isikan "-".
5. senderName: Nama Pengirim / Pemilik Rekening Asal. Jika tidak ada, isikan "-".
6. senderAccount: Nomor Rekening / Nomor Handphone Pengirim. Jika disamarkan (misal 123****89), biarkan apa adanya.
7. receiverName: Nama Penerima / Merchant Tujuan.
8. receiverAccount: Nomor Rekening / Nomor Handphone / Akun Penerima.
9. amount: Nominal Pokok Transaksi (misal "150.000" atau "Rp 150.000").
10. adminFee: Biaya Admin / Transaksi (misal "0" atau "2.500" atau "Rp 2.500").
11. totalAmount: Total Pembayaran Keseluruhan (misal "152.500" atau "Rp 152.500").
12. status: Status Transaksi. Harus salah satu dari: "BERHASIL", "GAGAL", "PENDING".
13. notes: Catatan / Keterangan / Berita Transfer jika ada. Jika tidak ada, isikan "-".

Sangat penting: Objek JSON harus valid tanpa teks markdown pembungkus tambahan.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: {
        parts: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType: mimeType || 'image/png',
            },
          },
          {
            text: 'Analisis gambar resi ini dan ekstrak seluruh data transaksi ke dalam format JSON.',
          },
        ],
      },
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            bankName: { type: Type.STRING },
            transactionType: { type: Type.STRING },
            dateTime: { type: Type.STRING },
            refNumber: { type: Type.STRING },
            senderName: { type: Type.STRING },
            senderAccount: { type: Type.STRING },
            receiverName: { type: Type.STRING },
            receiverAccount: { type: Type.STRING },
            amount: { type: Type.STRING },
            adminFee: { type: Type.STRING },
            totalAmount: { type: Type.STRING },
            status: { type: Type.STRING },
            notes: { type: Type.STRING },
          },
          required: [
            'bankName',
            'transactionType',
            'dateTime',
            'refNumber',
            'senderName',
            'senderAccount',
            'receiverName',
            'receiverAccount',
            'amount',
            'adminFee',
            'totalAmount',
            'status',
            'notes',
          ],
        },
      },
    });

    const jsonText = response.text || '{}';
    let parsedData = {};
    try {
      parsedData = JSON.parse(jsonText);
    } catch (pErr) {
      console.warn('Direct JSON parse failed, trying substring cleanup:', jsonText);
      const start = jsonText.indexOf('{');
      const end = jsonText.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        parsedData = JSON.parse(jsonText.substring(start, end + 1));
      }
    }

    return res.json({
      success: true,
      data: parsedData,
    });
  } catch (error: any) {
    console.error('Error parsing receipt with Gemini:', error);
    return res.status(500).json({
      error: error.message || 'Gagal memproses gambar resi dengan Gemini AI.',
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
