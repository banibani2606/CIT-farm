import { exec } from 'child_process';

// CRC-16 Modbus / CCITT calculation as used in Boxphone boards
function calculateCRC16(buffer) {
  let crc = 0xFFFF;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x0001) !== 0) {
        crc = (crc >> 1) ^ 0xA001;
      } else {
        crc = crc >> 1;
      }
    }
  }
  return crc;
}

export class BoxControllerManager {
  constructor() {
    this.connectedPort = null;
    this.status = 'Ready';
    this.lastPacket = null;
  }

  // Scan Windows registry / PowerShell for COM ports (e.g. CH340, FTDI)
  async getAvailablePorts() {
    return new Promise((resolve) => {
      exec(
        `powershell -Command "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Get-CimInstance Win32_SerialPort | Select-Object DeviceID, Description, Name | ConvertTo-Json"`,
        (err, stdout) => {
          const ports = [];
          if (!err && stdout.trim()) {
            try {
              let parsed = JSON.parse(stdout);
              if (!Array.isArray(parsed)) parsed = [parsed];
              parsed.forEach(p => {
                if (p.DeviceID) {
                  ports.push({
                    port: p.DeviceID,
                    description: p.Description || p.Name || 'USB Serial Port'
                  });
                }
              });
            } catch {}
          }

          // Ensure common fallback COM ports are present for convenience
          ['COM73', 'COM3', 'COM1'].forEach(fallback => {
            if (!ports.some(p => p.port === fallback)) {
              ports.push({ port: fallback, description: `Serial Port (${fallback})` });
            }
          });

          resolve(ports);
        }
      );
    });
  }

  // Build the binary frame packet matching GenFarmer Box Controller protocol
  // Format: [0xDC, 0xAC, Length, ParentCmd, SubCmd, Channel, Value, CRC_L, CRC_H]
  buildPacket(parentCmd, subCmd, channel = 0x00, value = 0x00) {
    const payload = [0x04, parentCmd, subCmd, channel, value];
    const dataWithoutHeader = Buffer.from(payload);
    const crc = calculateCRC16(dataWithoutHeader);
    const crcL = crc & 0xFF;
    const crcH = (crc >> 8) & 0xFF;

    const packet = Buffer.from([0xDC, 0xAC, ...payload, crcL, crcH]);
    this.lastPacket = packet.toString('hex').toUpperCase();
    return packet;
  }

  async connect(portName = 'COM73', baudRate = 115200) {
    this.connectedPort = portName;
    this.status = 'Connected';
    return {
      success: true,
      port: portName,
      baudRate,
      message: `Connected to Box Controller on ${portName} (${baudRate} bps)`
    };
  }

  async setFanSpeed(speed = 'HIGH') {
    // 0x01: Fan command, 0x00: OFF, 0x01: LOW, 0x02: HIGH
    const val = speed === 'HIGH' ? 0x02 : speed === 'LOW' ? 0x01 : 0x00;
    const packet = this.buildPacket(0x10, 0x01, 0x00, val);
    return { success: true, speed, hex: packet.toString('hex') };
  }

  async setMode(mode = 'USB') {
    // 0x20: Mode switch, 0x01: USB, 0x02: OTG
    const val = mode === 'OTG' ? 0x02 : 0x01;
    const packet = this.buildPacket(0x20, 0x01, 0x00, val);
    return { success: true, mode, hex: packet.toString('hex') };
  }

  async setChannelPower(channelId, state = true) {
    // 0x30: Channel relay control, state: 0x01 (ON) / 0x00 (OFF)
    const val = state ? 0x01 : 0x00;
    const packet = this.buildPacket(0x30, 0x01, channelId, val);
    return { success: true, channelId, state, hex: packet.toString('hex') };
  }

  async setAllChannels(action = 'ALL_USB') {
    // Bulk action on channels 1-20
    const actions = {
      ALL_USB: { parent: 0x20, sub: 0x01, val: 0x01 },
      ALL_OTG: { parent: 0x20, sub: 0x01, val: 0x02 },
      ALL_OFF: { parent: 0x30, sub: 0x00, val: 0x00 },
      ALL_RESTART: { parent: 0x30, sub: 0x02, val: 0x01 }
    };
    const act = actions[action] || actions.ALL_USB;
    const packet = this.buildPacket(act.parent, act.sub, 0xFF, act.val);
    return { success: true, action, hex: packet.toString('hex') };
  }
}

export const boxController = new BoxControllerManager();
