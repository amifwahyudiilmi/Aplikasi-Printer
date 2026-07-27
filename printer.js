/**
 * printer.js - Direct Bluetooth Thermal Printer Driver using Web Bluetooth API & ESC/POS Commands
 */

export class BluetoothThermalPrinter {
  constructor() {
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.isConnected = false;
    this.deviceName = 'Tidak Terhubung';
    this.onStatusChangeCallback = null;

    // Standard & Common Bluetooth Thermal Printer Service UUIDs
    this.targetServices = [
      '000018f0-0000-1000-8000-00805f9b34fb', // Standard Printer Service
      '00001101-0000-1000-8000-00805f9b34fb', // SPP (Serial Port Profile)
      '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Transparent Data
      '0000af00-0000-1000-8000-00805f9b34fb',
      '0000e781-0000-1000-8000-00805f9b34fb',
      '0000ff00-0000-1000-8000-00805f9b34fb',
      '0000ffe0-0000-1000-8000-00805f9b34fb',
      'e7810a71-73ae-499d-8c15-faa9aef0c3f2'
    ];
  }

  setStatusCallback(callback) {
    this.onStatusChangeCallback = callback;
  }

  notifyStatus(statusMsg, isConn = false, err = null) {
    this.isConnected = isConn;
    if (this.onStatusChangeCallback) {
      this.onStatusChangeCallback({
        isConnected: this.isConnected,
        deviceName: this.deviceName,
        message: statusMsg,
        error: err
      });
    }
  }

  /**
   * Request Bluetooth device and connect GATT server
   */
  async connect() {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth API tidak didukung di browser ini. Gunakan Google Chrome (Android/Desktop) atau WebBLE/Blueify di iOS.');
    }

    try {
      this.notifyStatus('Mencari printer Bluetooth...', false);

      this.device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: this.targetServices
      });

      this.deviceName = this.device.name || 'Printer Thermal';
      this.notifyStatus(`Menghubungkan ke ${this.deviceName}...`, false);

      this.device.addEventListener('gattserverdisconnected', () => {
        this.isConnected = false;
        this.characteristic = null;
        this.notifyStatus(`Terputus dari ${this.deviceName}`, false);
      });

      this.server = await this.device.gatt.connect();
      
      // Locate writable GATT characteristic
      this.characteristic = await this.findWritableCharacteristic();

      if (!this.characteristic) {
        throw new Error('Karakteristik Bluetooth untuk pengiriman data (Write) tidak ditemukan pada printer ini.');
      }

      this.isConnected = true;
      this.notifyStatus(`Terhubung dengan ${this.deviceName}`, true);
      return true;
    } catch (error) {
      console.error('Koneksi Bluetooth Gagal:', error);
      this.isConnected = false;
      this.notifyStatus(error.message || 'Gagal terhubung ke printer', false, error);
      throw error;
    }
  }

  /**
   * Find a writable characteristic across available GATT services
   */
  async findWritableCharacteristic() {
    if (!this.server) return null;

    // Try getting primary services
    let services = [];
    try {
      services = await this.server.getPrimaryServices();
    } catch (e) {
      console.warn('Gagal mengambil seluruh primary services, mencoba UUID terdaftar...', e);
      for (const serviceUuid of this.targetServices) {
        try {
          const s = await this.server.getPrimaryService(serviceUuid);
          if (s) services.push(s);
        } catch (sErr) {
          // ignore service not found
        }
      }
    }

    for (const service of services) {
      try {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            console.log('Found writable characteristic:', char.uuid, 'in service:', service.uuid);
            return char;
          }
        }
      } catch (cErr) {
        console.warn('Gagal memeriksa karakteristik pada service:', service.uuid, cErr);
      }
    }

    return null;
  }

  /**
   * Disconnect printer
   */
  disconnect() {
    if (this.device && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this.isConnected = false;
    this.characteristic = null;
    this.notifyStatus('Printer terputus', false);
  }

  /**
   * Write binary data to printer in small chunks (prevent GATT buffer overflow)
   */
  async writeBytes(bytes) {
    if (!this.characteristic) {
      throw new Error('Printer belum terhubung. Silakan hubungkan printer Bluetooth terlebih dahulu.');
    }

    const chunkSize = 128; // safe chunk size for small ESC/POS printers
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize);
      const buffer = Uint8Array.from(chunk);
      
      if (this.characteristic.properties.writeWithoutResponse) {
        await this.characteristic.writeValueWithoutResponse(buffer);
      } else {
        await this.characteristic.writeValue(buffer);
      }

      // Small delay to prevent printer queue overflow
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }

  /**
   * Generate ESC/POS Bytes for Bank Receipt
   * @param {Object} data Receipt Fields
   * @param {Object} options Options like paperWidth (58 or 80), storeHeader, storeFooter
   */
  buildEscPosCommands(data, options = {}) {
    const width = parseInt(options.paperWidth) === 80 ? 48 : 32; // 32 chars for 58mm, 48 chars for 80mm
    const commands = [];

    // ESC/POS Constants
    const ESC = 0x1B;
    const GS = 0x1D;

    // Helper to push text with optional encoding
    const textEncoder = new TextEncoder();
    const addText = (str) => {
      const encoded = textEncoder.encode(str);
      for (let b of encoded) {
        commands.push(b);
      }
    };

    const addCmd = (array) => {
      commands.push(...array);
    };

    // 1. Initialize Printer
    addCmd([ESC, 0x40]);

    // Set Code Page to CP858 / Latin-1 for standard currency symbols
    addCmd([ESC, 0x74, 0x13]);

    // 2. Custom Store Header (if filled)
    if (options.storeHeader && options.storeHeader.trim()) {
      addCmd([ESC, 0x61, 0x01]); // Align Center
      addCmd([ESC, 0x45, 0x01]); // Bold ON
      addText(options.storeHeader.trim() + '\n');
      addCmd([ESC, 0x45, 0x00]); // Bold OFF
      if (options.cashierName && options.cashierName.trim()) {
        addText(`Kasir: ${options.cashierName.trim()}\n`);
      }
      addText('-'.repeat(width) + '\n');
    }

    // 3. Bank / Service Name (Header Title)
    addCmd([ESC, 0x61, 0x01]); // Align Center
    addCmd([ESC, 0x45, 0x01]); // Bold ON
    addCmd([GS, 0x21, 0x11]);  // Double Height & Width
    addText((data.bankName || 'BUKTI TRANSAKSI').toUpperCase() + '\n');
    addCmd([GS, 0x21, 0x00]);  // Normal size

    if (data.transactionType) {
      addText((data.transactionType || 'STRUK PEMBAYARAN').toUpperCase() + '\n');
    }
    addCmd([ESC, 0x45, 0x00]); // Bold OFF

    // Status Badge
    addCmd([ESC, 0x61, 0x01]); // Center
    const statusText = `*** ${(data.status || 'BERHASIL').toUpperCase()} ***`;
    addCmd([ESC, 0x45, 0x01]); // Bold
    addText(statusText + '\n');
    addCmd([ESC, 0x45, 0x00]); // Bold Off

    // Divider
    addCmd([ESC, 0x61, 0x00]); // Align Left
    addText('='.repeat(width) + '\n');

    // Helper for formatting Key - Value rows
    const formatRow = (label, value) => {
      label = String(label || '');
      value = String(value || '');
      
      const labelWidth = Math.floor(width * 0.42);
      const valueWidth = width - labelWidth - 1;

      // If value fits on one row
      if ((label + ' ' + value).length <= width) {
        const spaces = width - label.length - value.length;
        return label + ' '.repeat(Math.max(1, spaces)) + value + '\n';
      }

      // If needs multi-line padding
      let result = '';
      let remainingLabel = label;
      let remainingVal = value;

      const space = width - label.length - value.length;
      if (space >= 1) {
        return label + ' '.repeat(space) + value + '\n';
      }

      // Fallback two-line or stacked format
      return `${label}:\n  ${value}\n`;
    };

    // 4. Transaction Info
    if (data.dateTime) addText(formatRow('Tanggal', data.dateTime));
    if (data.refNumber) addText(formatRow('No. Ref', data.refNumber));

    addText('-'.repeat(width) + '\n');

    // 5. Sender & Receiver Details
    if (data.senderName && data.senderName !== '-') {
      addText(formatRow('Pengirim', data.senderName));
    }
    if (data.senderAccount && data.senderAccount !== '-') {
      addText(formatRow('No. Rek Asal', data.senderAccount));
    }

    if ((data.senderName || data.senderAccount) && (data.receiverName || data.receiverAccount)) {
      addText('-'.repeat(width) + '\n');
    }

    if (data.receiverName && data.receiverName !== '-') {
      addText(formatRow('Penerima', data.receiverName));
    }
    if (data.receiverAccount && data.receiverAccount !== '-') {
      addText(formatRow('No. Rek Tujuan', data.receiverAccount));
    }

    addText('='.repeat(width) + '\n');

    // 6. Financial Details
    if (data.amount) addText(formatRow('Nominal', data.amount));
    if (data.adminFee) addText(formatRow('Biaya Admin', data.adminFee));

    addCmd([ESC, 0x45, 0x01]); // Bold Total
    addText(formatRow('TOTAL', data.totalAmount || data.amount || '0'));
    addCmd([ESC, 0x45, 0x00]); // Bold OFF

    addText('-'.repeat(width) + '\n');

    // 7. Notes
    if (data.notes && data.notes !== '-') {
      addText(`Catatan:\n${data.notes}\n`);
      addText('-'.repeat(width) + '\n');
    }

    // 8. Custom Footer
    addCmd([ESC, 0x61, 0x01]); // Align Center
    const footerMsg = (options.storeFooter && options.storeFooter.trim()) 
      ? options.storeFooter.trim() 
      : 'Simpan resi ini sebagai bukti transaksi sah.';
    addText(`${footerMsg}\n`);
    addText('Terima Kasih\n');

    // 9. Feed & Paper Cut
    addCmd([ESC, 0x64, 0x04]); // Feed 4 lines
    addCmd([GS, 0x56, 0x41, 0x00]); // Paper Cut (if supported)

    return new Uint8Array(commands);
  }

  /**
   * Print test page to verify connection
   */
  async printTestPage(paperWidth = 58) {
    const testData = {
      bankName: 'PRINTER TEST',
      transactionType: 'TES KONEKSI BLUETOOTH',
      dateTime: new Date().toLocaleString('id-ID'),
      refNumber: 'TEST-12345678',
      senderName: 'Sistem Kasir PWA',
      senderAccount: 'DEV-MODE',
      receiverName: 'Printer Thermal',
      receiverAccount: this.deviceName,
      amount: 'Rp 1.000',
      adminFee: 'Rp 0',
      totalAmount: 'Rp 1.000',
      status: 'BERHASIL',
      notes: 'Tes koneksi Web Bluetooth GATT & Perintah ESC/POS berhasil.'
    };

    const bytes = this.buildEscPosCommands(testData, { paperWidth });
    await this.writeBytes(bytes);
  }

  /**
   * Print extracted receipt
   */
  async printReceipt(receiptData, options = {}) {
    const bytes = this.buildEscPosCommands(receiptData, options);
    await this.writeBytes(bytes);
  }
}

export const printerDriver = new BluetoothThermalPrinter();
