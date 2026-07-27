/**
 * app.js - State Management, Image Processing, Gemini AI Call, and UI Controller
 */

import { printerDriver } from './printer.js';

// Predefined Demo Receipts for Quick Testing
const SAMPLE_RECEIPTS = {
  bca: {
    bankName: 'BANK BCA',
    transactionType: 'TRANSFER M-TRANSFER',
    dateTime: '27 JUL 2026 14:35:12 WIB',
    refNumber: 'BCA88910249102',
    senderName: 'BUDI SANTOSO',
    senderAccount: '1234****89',
    receiverName: 'TOKO ELEKTRONIK JAYA',
    receiverAccount: '8820192831',
    amount: 'Rp 250.000',
    adminFee: 'Rp 0',
    totalAmount: 'Rp 250.000',
    status: 'BERHASIL',
    notes: 'Pembayaran Nota #1092'
  },
  qris: {
    bankName: 'QRIS NATIONAL',
    transactionType: 'PEMBAYARAN QRIS',
    dateTime: '27 JUL 2026 15:10:00 WIB',
    refNumber: 'QRS-20260727-88192',
    senderName: 'SITI AMINAH',
    senderAccount: 'DANA (0812****99)',
    receiverName: 'WARUNG KOPI BAROKAH',
    receiverAccount: 'ID10293847561',
    amount: 'Rp 45.000',
    adminFee: 'Rp 0',
    totalAmount: 'Rp 45.000',
    status: 'BERHASIL',
    notes: 'Kopi Susu & Roti Bakar'
  },
  mandiri: {
    bankName: 'BANK MANDIRI',
    transactionType: 'TRANSFER BI-FAST',
    dateTime: '27 JUL 2026 09:15:40 WIB',
    refNumber: 'MDR-20260727-0091',
    senderName: 'AHMAD RIFAI',
    senderAccount: '140001928374',
    receiverName: 'HENDRA KUSUMA',
    receiverAccount: 'BRI 019283748291',
    amount: 'Rp 1.500.000',
    adminFee: 'Rp 2.500',
    totalAmount: 'Rp 1.502.500',
    status: 'BERHASIL',
    notes: 'Pelunasan Bahan Baku'
  }
};

class AppController {
  constructor() {
    this.currentReceiptData = { ...SAMPLE_RECEIPTS.bca };
    this.uploadedImageBase64 = null;
    this.paperWidth = '58'; // '58' or '80'
    this.storeHeader = 'TOKO BAROKAH JAYA';
    this.cashierName = 'Kasir 01';
    this.storeFooter = 'Terima kasih telah berbelanja!';
    this.customApiKey = localStorage.getItem('GEMINI_CUSTOM_API_KEY') || '';

    this.initElements();
    this.bindEvents();
    this.setupPrinterListener();
    this.setupPWA();
    this.renderForm();
    this.renderThermalPreview();
  }

  initElements() {
    this.dropZone = document.getElementById('dropZone');
    this.fileInput = document.getElementById('fileInput');
    this.cameraInput = document.getElementById('cameraInput');
    this.uploadBtn = document.getElementById('uploadBtn');
    this.cameraBtn = document.getElementById('cameraBtn');
    this.imagePreviewContainer = document.getElementById('imagePreviewContainer');
    this.imagePreview = document.getElementById('imagePreview');
    this.loadingOverlay = document.getElementById('loadingOverlay');
    this.loadingText = document.getElementById('loadingText');

    // Thermal Preview & Settings
    this.thermalPreview = document.getElementById('thermalPreview');
    this.paperSizeSelect = document.getElementById('paperSizeSelect');
    this.storeHeaderInput = document.getElementById('storeHeaderInput');
    this.cashierNameInput = document.getElementById('cashierNameInput');
    this.storeFooterInput = document.getElementById('storeFooterInput');

    // Form Inputs
    this.formFields = [
      'bankName', 'transactionType', 'dateTime', 'refNumber',
      'senderName', 'senderAccount', 'receiverName', 'receiverAccount',
      'amount', 'adminFee', 'totalAmount', 'status', 'notes'
    ];

    // Printer Connection UI
    this.btnConnectPrinter = document.getElementById('btnConnectPrinter');
    this.btnPrintReceipt = document.getElementById('btnPrintReceipt');
    this.btnPrintTest = document.getElementById('btnPrintTest');
    this.printerStatusBadge = document.getElementById('printerStatusBadge');
    this.printerStatusText = document.getElementById('printerStatusText');

    // API Key & Modals
    this.btnSettings = document.getElementById('btnSettings');
    this.settingsModal = document.getElementById('settingsModal');
    this.closeSettingsBtn = document.getElementById('closeSettingsBtn');
    this.apiKeyInput = document.getElementById('apiKeyInput');
    this.saveApiKeyBtn = document.getElementById('saveApiKeyBtn');

    // Help Modal
    this.btnHelp = document.getElementById('btnHelp');
    this.helpModal = document.getElementById('helpModal');
    this.closeHelpBtn = document.getElementById('closeHelpBtn');
  }

  bindEvents() {
    // File Upload & Drag-and-Drop
    this.uploadBtn.addEventListener('click', () => this.fileInput.click());
    this.cameraBtn.addEventListener('click', () => this.cameraInput.click());

    this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files[0]));
    this.cameraInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files[0]));

    this.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropZone.classList.add('border-blue-500', 'bg-blue-50/10');
    });

    this.dropZone.addEventListener('dragleave', () => {
      this.dropZone.classList.remove('border-blue-500', 'bg-blue-50/10');
    });

    this.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropZone.classList.remove('border-blue-500', 'bg-blue-50/10');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        this.handleFileSelect(e.dataTransfer.files[0]);
      }
    });

    // Sample Receipt Buttons
    document.querySelectorAll('.btn-sample').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const sampleKey = e.currentTarget.dataset.sample;
        if (SAMPLE_RECEIPTS[sampleKey]) {
          this.currentReceiptData = { ...SAMPLE_RECEIPTS[sampleKey] };
          this.renderForm();
          this.renderThermalPreview();
          this.showToast(`Resi demo ${sampleKey.toUpperCase()} berhasil dimuat.`);
        }
      });
    });

    // Store Customization Inputs
    this.paperSizeSelect.addEventListener('change', (e) => {
      this.paperWidth = e.target.value;
      this.renderThermalPreview();
    });

    this.storeHeaderInput.addEventListener('input', (e) => {
      this.storeHeader = e.target.value;
      this.renderThermalPreview();
    });

    this.cashierNameInput.addEventListener('input', (e) => {
      this.cashierName = e.target.value;
      this.renderThermalPreview();
    });

    this.storeFooterInput.addEventListener('input', (e) => {
      this.storeFooter = e.target.value;
      this.renderThermalPreview();
    });

    // Printer Actions
    this.btnConnectPrinter.addEventListener('click', () => this.togglePrinterConnection());
    this.btnPrintReceipt.addEventListener('click', () => this.printReceipt());
    this.btnPrintTest.addEventListener('click', () => this.printTestPage());

    // Settings Modal
    if (this.btnSettings) {
      this.btnSettings.addEventListener('click', () => {
        this.apiKeyInput.value = this.customApiKey;
        this.settingsModal.classList.remove('hidden');
      });
    }

    if (this.closeSettingsBtn) {
      this.closeSettingsBtn.addEventListener('click', () => {
        this.settingsModal.classList.add('hidden');
      });
    }

    if (this.saveApiKeyBtn) {
      this.saveApiKeyBtn.addEventListener('click', () => {
        this.customApiKey = this.apiKeyInput.value.trim();
        localStorage.setItem('GEMINI_CUSTOM_API_KEY', this.customApiKey);
        this.settingsModal.classList.add('hidden');
        this.showToast('API Key Gemini berhasil disimpan secara lokal.');
      });
    }

    // Help Modal
    if (this.btnHelp) {
      this.btnHelp.addEventListener('click', () => this.helpModal.classList.remove('hidden'));
    }
    if (this.closeHelpBtn) {
      this.closeHelpBtn.addEventListener('click', () => this.helpModal.classList.add('hidden'));
    }
  }

  setupPrinterListener() {
    printerDriver.setStatusCallback((status) => {
      this.updatePrinterUI(status);
    });
  }

  updatePrinterUI(status) {
    if (status.isConnected) {
      this.printerStatusBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
      this.printerStatusText.textContent = `Terhubung: ${status.deviceName}`;
      this.btnConnectPrinter.textContent = 'Putuskan Printer';
      this.btnConnectPrinter.className = 'w-full sm:w-auto px-4 py-2 text-sm font-semibold rounded-xl text-rose-300 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 transition-all';
      this.btnPrintReceipt.disabled = false;
      this.btnPrintTest.disabled = false;
    } else {
      this.printerStatusBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-700/50 text-slate-400 border border-slate-600/50';
      this.printerStatusText.textContent = 'Belum Terhubung';
      this.btnConnectPrinter.textContent = 'Hubungkan Printer Bluetooth';
      this.btnConnectPrinter.className = 'w-full sm:w-auto px-4 py-2 text-sm font-semibold rounded-xl text-white bg-blue-600 hover:bg-blue-500 transition-all shadow-md shadow-blue-600/30';
      this.btnPrintReceipt.disabled = false; // allow attempting print which triggers connect
      this.btnPrintTest.disabled = false;
    }

    if (status.message) {
      this.showToast(status.message, status.error ? 'error' : 'info');
    }
  }

  async togglePrinterConnection() {
    if (printerDriver.isConnected) {
      printerDriver.disconnect();
    } else {
      try {
        await printerDriver.connect();
      } catch (err) {
        // Handled in callback
      }
    }
  }

  async printReceipt() {
    if (!printerDriver.isConnected) {
      this.showToast('Membuka dialog pencarian Bluetooth printer...', 'info');
      try {
        await printerDriver.connect();
      } catch (e) {
        return;
      }
    }

    try {
      this.showToast('Mengirim data resi ke printer thermal...', 'info');
      await printerDriver.printReceipt(this.currentReceiptData, {
        paperWidth: this.paperWidth,
        storeHeader: this.storeHeader,
        cashierName: this.cashierName,
        storeFooter: this.storeFooter
      });
      this.showToast('Resi berhasil dicetak!', 'success');
    } catch (err) {
      console.error('Print error:', err);
      this.showToast(`Gagal mencetak: ${err.message}`, 'error');
    }
  }

  async printTestPage() {
    if (!printerDriver.isConnected) {
      this.showToast('Membuka dialog pencarian Bluetooth printer...', 'info');
      try {
        await printerDriver.connect();
      } catch (e) {
        return;
      }
    }

    try {
      this.showToast('Mengirim halaman tes...', 'info');
      await printerDriver.printTestPage(this.paperWidth);
      this.showToast('Halaman tes berhasil dicetak!', 'success');
    } catch (err) {
      this.showToast(`Gagal cetak tes: ${err.message}`, 'error');
    }
  }

  /**
   * File selection & image compression
   */
  async handleFileSelect(file) {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.showToast('Harap pilih file gambar (PNG/JPG/JPEG).', 'error');
      return;
    }

    this.showLoading(true, 'Membaca gambar resi...');

    try {
      const resizedBase64 = await this.compressImage(file, 1200, 1200, 0.85);
      this.uploadedImageBase64 = resizedBase64;
      this.imagePreview.src = resizedBase64;
      this.imagePreviewContainer.classList.remove('hidden');

      this.showLoading(true, 'Menganalisis data resi dengan Gemini AI Vision...');
      await this.parseReceiptWithGemini(resizedBase64, file.type);
    } catch (err) {
      console.error('File process error:', err);
      this.showToast(`Gagal memproses gambar: ${err.message}`, 'error');
    } finally {
      this.showLoading(false);
    }
  }

  /**
   * Call backend Gemini API
   */
  async parseReceiptWithGemini(imageBase64, mimeType) {
    try {
      const response = await fetch('/api/parse-receipt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          imageBase64,
          mimeType,
          userApiKey: this.customApiKey || undefined
        })
      });

      const resData = await response.json();

      if (!response.ok || !resData.success) {
        throw new Error(resData.error || 'Gagal mengekstrak data dari resi.');
      }

      this.currentReceiptData = { ...this.currentReceiptData, ...resData.data };
      this.renderForm();
      this.renderThermalPreview();
      this.showToast('Analisis AI berhasil! Silakan periksa atau edit data sebelum mencetak.', 'success');
    } catch (err) {
      console.error('Gemini API Error:', err);
      this.showToast(err.message, 'error');
    }
  }

  /**
   * Compress image to fast Base64
   */
  compressImage(file, maxWidth, maxHeight, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (e) => {
        const img = new Image();
        img.src = e.target.result;
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > maxWidth || height > maxHeight) {
            if (width > height) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL(file.type || 'image/jpeg', quality));
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  }

  /**
   * Render Interactive Editable Form
   */
  renderForm() {
    this.formFields.forEach((field) => {
      const inputEl = document.getElementById(`input_${field}`);
      if (inputEl) {
        inputEl.value = this.currentReceiptData[field] || '';

        // Bind real-time change listener
        inputEl.oninput = (e) => {
          this.currentReceiptData[field] = e.target.value;
          this.renderThermalPreview();
        };
      }
    });
  }

  /**
   * Render Digital Thermal Receipt Preview
   */
  renderThermalPreview() {
    const data = this.currentReceiptData;
    const is80mm = this.paperWidth === '80';
    const charWidth = is80mm ? 48 : 32;

    const formatRow = (label, val) => {
      label = String(label || '');
      val = String(val || '');
      const space = charWidth - label.length - val.length;
      if (space >= 1) {
        return `<div><span>${this.escapeHtml(label)}</span><span class="float-right font-semibold">${this.escapeHtml(val)}</span></div>`;
      }
      return `<div class="flex justify-between gap-1"><span>${this.escapeHtml(label)}:</span><span class="font-semibold text-right">${this.escapeHtml(val)}</span></div>`;
    };

    const divider = `<div class="my-1.5 border-b border-dashed border-slate-400"></div>`;

    let html = '';

    // Header Store (if configured)
    if (this.storeHeader.trim()) {
      html += `<div class="text-center font-bold text-sm tracking-wide uppercase">${this.escapeHtml(this.storeHeader)}</div>`;
      if (this.cashierName.trim()) {
        html += `<div class="text-center text-xs text-slate-600 mb-1">Kasir: ${this.escapeHtml(this.cashierName)}</div>`;
      }
      html += divider;
    }

    // Bank Title
    html += `<div class="text-center font-black text-base uppercase tracking-wider">${this.escapeHtml(data.bankName || 'RESI TRANSAKSI')}</div>`;
    if (data.transactionType) {
      html += `<div class="text-center font-bold text-xs uppercase text-slate-700">${this.escapeHtml(data.transactionType)}</div>`;
    }

    // Status Badge
    const statusVal = (data.status || 'BERHASIL').toUpperCase();
    const statusBg = statusVal === 'BERHASIL' ? 'bg-emerald-100 text-emerald-800' : (statusVal === 'PENDING' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800');
    html += `<div class="text-center my-1.5"><span class="px-2 py-0.5 text-[11px] font-black tracking-widest rounded ${statusBg}">*** ${statusVal} ***</span></div>`;

    html += divider;

    // Transaction Meta
    if (data.dateTime) html += formatRow('Tanggal', data.dateTime);
    if (data.refNumber) html += formatRow('No. Ref', data.refNumber);

    html += divider;

    // Sender & Receiver
    if (data.senderName && data.senderName !== '-') {
      html += formatRow('Pengirim', data.senderName);
    }
    if (data.senderAccount && data.senderAccount !== '-') {
      html += formatRow('No. Rek Asal', data.senderAccount);
    }

    if ((data.senderName || data.senderAccount) && (data.receiverName || data.receiverAccount)) {
      html += divider;
    }

    if (data.receiverName && data.receiverName !== '-') {
      html += formatRow('Penerima', data.receiverName);
    }
    if (data.receiverAccount && data.receiverAccount !== '-') {
      html += formatRow('No. Rek Tujuan', data.receiverAccount);
    }

    html += `<div class="my-1.5 border-b-2 border-slate-800"></div>`;

    // Monetary Values
    if (data.amount) html += formatRow('Nominal', data.amount);
    if (data.adminFee) html += formatRow('Biaya Admin', data.adminFee);

    html += `<div class="flex justify-between font-extrabold text-sm mt-1"><span>TOTAL</span><span class="text-right">${this.escapeHtml(data.totalAmount || data.amount || '0')}</span></div>`;

    html += divider;

    // Notes
    if (data.notes && data.notes !== '-') {
      html += `<div class="text-xs"><span>Catatan:</span> <span class="italic text-slate-700">${this.escapeHtml(data.notes)}</span></div>`;
      html += divider;
    }

    // Footer
    const footerText = this.storeFooter.trim() || 'Simpan resi ini sebagai bukti sah.';
    html += `<div class="text-center text-xs text-slate-600 mt-2">${this.escapeHtml(footerText)}</div>`;
    html += `<div class="text-center font-bold text-xs uppercase mt-0.5">Terima Kasih</div>`;

    // Apply container width styling
    this.thermalPreview.style.maxWidth = is80mm ? '360px' : '280px';
    this.thermalPreview.innerHTML = html;
  }

  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  showLoading(show, message = 'Memproses...') {
    if (show) {
      this.loadingText.textContent = message;
      this.loadingOverlay.classList.remove('hidden');
    } else {
      this.loadingOverlay.classList.add('hidden');
    }
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    const bgColors = {
      success: 'bg-emerald-600 text-white',
      error: 'bg-rose-600 text-white',
      info: 'bg-slate-800 text-white border border-slate-700'
    };

    toast.className = `flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-xl text-sm font-medium transform transition-all duration-300 translate-y-2 opacity-0 ${bgColors[type] || bgColors.info}`;
    toast.innerHTML = `<span>${this.escapeHtml(message)}</span>`;

    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
    });

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  setupPWA() {
    // Register Service Worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then((reg) => {
          console.log('PWA Service Worker registered:', reg.scope);
        }).catch((err) => {
          console.warn('Service Worker registration failed:', err);
        });
      });
    }

    // PWA Install Prompt
    let deferredPrompt;
    const btnInstall = document.getElementById('btnInstallPWA');

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (btnInstall) {
        btnInstall.classList.remove('hidden');
        btnInstall.onclick = () => {
          btnInstall.classList.add('hidden');
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
              console.log('User accepted PWA installation');
            }
            deferredPrompt = null;
          });
        };
      }
    });
  }
}

// Initialize application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new AppController();
});
