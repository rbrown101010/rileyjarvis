const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

const HOST_CAP_GBPS = 40;
const HOST = {
  machine: "Mac Studio",
  modelId: "Mac13,1",
  chip: "Apple M1 Max",
  thunderboltGeneration: 4,
  advertisedLinkGbps: HOST_CAP_GBPS,
  note: "Mac Studio M1 Max is Thunderbolt 4 / USB4, not Thunderbolt 5. 40 Gb/s is the host ceiling.",
};

const KNOWN_VOLUMES = {
  "Macintosh HD": { enclosure: "Internal", role: "OS + apps" },
  "Macintosh HD - Data": { enclosure: "Internal", role: "User data" },
  "AI Models": { enclosure: "StudioStack", role: "AI models" },
  "Lexar-3": { enclosure: "StudioStack", role: "Time Machine — do not erase" },
  "Samsung-1TB": { enclosure: "Express 4M2", role: "Scratch" },
  "Samsung-2TB": { enclosure: "Express 4M2", role: "WORK / Projects" },
  "Lexar-ARES": { enclosure: "Express 4M2", role: "Storage" },
  "Lexar-4TB": { enclosure: "Express 4M2", role: "Media / archives" },
  "Lexar-1": { enclosure: "Express 1M2", role: "THOR PRO" },
  "Lexar-2": { enclosure: "Express 1M2", role: "THOR PRO" },
  Kingston128: { enclosure: "Built-in SDXC", role: "SDXC card" },
  "Kingston-64": { enclosure: "USB SD reader", role: "SD / microSD" },
};

const KNOWN_MODELS = [
  { match: /Fanxiang/i, enclosure: "StudioStack" },
  { match: /9100 PRO 1TB/i, enclosure: "Express 4M2" },
  { match: /9100 PRO 2TB/i, enclosure: "Express 4M2" },
  { match: /ARES/i, enclosure: "Express 4M2" },
  { match: /EQ790/i, enclosure: "Express 4M2" },
  { match: /THOR PRO/i, enclosure: "Express 1M2" },
  { match: /APPLE SSD/i, enclosure: "Internal" },
];

const SKIP_VOLUME_NAMES = new Set([
  "Preboot",
  "Recovery",
  "VM",
  "Update",
  "iSCPreboot",
  "xarts",
  "Hardware",
  "iOS 26.5 Simulator",
  "macintosh HD",
  "AI MODELS",
]);

function execCommand(file, args, timeoutMs = 12000) {
  return execFileAsync(file, args, {
    timeout: timeoutMs,
    maxBuffer: 12 * 1024 * 1024,
    encoding: "utf8",
  }).then(
    (result) => ({ ok: true, stdout: String(result.stdout || ""), stderr: String(result.stderr || "") }),
    (error) => ({
      ok: false,
      stdout: String(error.stdout || ""),
      stderr: String(error.stderr || error.message || String(error)),
      error: error.message || String(error),
    }),
  );
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function parseGbps(value) {
  const match = String(value || "").match(/([\d.]+)\s*Gb\/s/i);
  return match ? Number(match[1]) : null;
}

function parseLinkSpeedGt(value) {
  const match = String(value || "").match(/([\d.]+)\s*GT\/s/i);
  return match ? Number(match[1]) : null;
}

function parseLinkWidth(value) {
  const match = String(value || "").match(/x(\d+)/i);
  return match ? Number(match[1]) : null;
}

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 100 || unit < 2 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

function enclosureForModel(model) {
  for (const entry of KNOWN_MODELS) {
    if (entry.match.test(model || "")) return entry.enclosure;
  }
  return null;
}

function healthFromFlags(flags) {
  if (flags.some((flag) => flag.level === "red")) return "red";
  if (flags.some((flag) => flag.level === "yellow")) return "yellow";
  return "green";
}

function linkStatusLabel(code) {
  const raw = String(code || "").toLowerCase();
  if (raw === "0x2" || raw === "2") return "up";
  if (raw.includes("connected")) return "up";
  if (!raw) return "unknown";
  return raw;
}

function protocolFromMode(mode) {
  const raw = String(mode || "").toLowerCase();
  if (raw === "usb_four" || raw === "usb4") return "USB4";
  if (raw.includes("thunderbolt_5") || raw === "tb5") return "TB5";
  if (raw.includes("thunderbolt_4") || raw === "tb4") return "TB4";
  if (raw.includes("thunderbolt_3") || raw === "tb3") return "TB3";
  return mode ? String(mode) : "USB4";
}

function collectReceptacles(node) {
  const receptacles = [];
  for (const [key, value] of Object.entries(asObject(node))) {
    if (!/_tag$/i.test(key) || typeof value !== "object" || !value) continue;
    const kind = key.replace(/_tag$/i, "").replace(/^receptacle_/i, "");
    receptacles.push({
      id: value.receptacle_id_key || kind,
      kind,
      speed: value.current_speed_key || null,
      speedGbps: parseGbps(value.current_speed_key),
      status: value.receptacle_status_key || null,
      linkStatus: linkStatusLabel(value.link_status_key),
      firmware: value.micro_version_key || null,
    });
  }
  return receptacles;
}

function walkThunderbolt(nodes, parent, hostPort, list) {
  for (const node of asArray(nodes)) {
    if (!node || typeof node !== "object") continue;
    const receptacles = collectReceptacles(node);
    const upstream = receptacles.find((item) => item.kind.includes("upstream")) || receptacles[0] || null;
    const speedGbps = upstream?.speedGbps ?? parent?.speedGbps ?? null;
    const device = {
      id: node.switch_uid_key || node.domain_uuid_key || node._name,
      name: node._name || node.device_name_key || "Unknown",
      model: node.device_name_key || node._name || null,
      vendor: node.vendor_name_key || null,
      uid: node.switch_uid_key || node.domain_uuid_key || null,
      firmware: node.switch_version_key || null,
      protocol: protocolFromMode(node.mode_key),
      hostPort,
      parentName: parent?.name || null,
      advertisedGbps: HOST_CAP_GBPS,
      currentGbps: speedGbps,
      currentSpeed: upstream?.speed || (speedGbps != null ? `${speedGbps} Gb/s` : null),
      linkStatus: upstream?.linkStatus || "unknown",
      receptacles,
      flags: [],
      health: "green",
      children: [],
    };

    if (device.currentGbps == null && device.linkStatus !== "up") {
      device.flags.push({ level: "red", code: "no-link", message: "No Thunderbolt link reported." });
    } else if (device.currentGbps != null && device.currentGbps < HOST_CAP_GBPS) {
      device.flags.push({
        level: device.currentGbps < 20 ? "red" : "yellow",
        code: "cable-or-device",
        message: `Link ${device.currentSpeed} is below the 40 Gb/s this Studio can do — cable or device problem, not the host cap.`,
      });
    } else {
      device.flags.push({
        level: "green",
        code: "capped-by-host",
        message: "40 Gb/s is correct on this Mac. Host is TB4, not TB5.",
      });
    }
    device.health = healthFromFlags(device.flags);

    const nextParent = { name: device.name, speedGbps: device.currentGbps };
    device.children = walkThunderbolt(node._items, nextParent, hostPort, []);
    list.push(device);
  }
  return list;
}

function parseThunderbolt(data) {
  const buses = [];
  for (const bus of asArray(data.SPThunderboltDataType)) {
    const receptacle = asObject(bus.receptacle_1_tag);
    const portId = String(receptacle.receptacle_id_key || bus._name || "?");
    const speed = receptacle.current_speed_key || null;
    const speedGbps = parseGbps(speed);
    const connected = String(receptacle.receptacle_status_key || "").includes("connected");
    const flags = [];
    if (!connected) {
      flags.push({ level: "yellow", code: "empty", message: "Port is empty." });
    } else if (speedGbps != null && speedGbps < HOST_CAP_GBPS) {
      flags.push({
        level: speedGbps < 20 ? "red" : "yellow",
        code: "cable-or-device",
        message: `Host port at ${speed} — below 40 Gb/s. Cable or device problem.`,
      });
    } else {
      flags.push({
        level: "green",
        code: "capped-by-host",
        message: "40 Gb/s is the M1 Max Thunderbolt 4 ceiling — not a cable fault.",
      });
    }

    const port = {
      id: bus._name,
      hostPort: portId,
      name: `Port ${portId}`,
      uid: bus.switch_uid_key || null,
      advertisedGbps: HOST_CAP_GBPS,
      currentGbps: speedGbps,
      currentSpeed: speed,
      linkStatus: connected ? linkStatusLabel(receptacle.link_status_key) : "empty",
      connected,
      flags,
      health: healthFromFlags(flags),
      devices: walkThunderbolt(bus._items, { name: "Mac Studio", speedGbps }, portId, []),
    };
    buses.push(port);
  }
  buses.sort((a, b) => Number(a.hostPort) - Number(b.hostPort));
  return buses;
}

function flattenThunderboltDevices(ports) {
  const devices = [];
  function walk(items, port) {
    for (const item of items) {
      devices.push({ ...item, hostPort: item.hostPort || port, children: undefined });
      walk(item.children || [], port);
    }
  }
  for (const port of ports) walk(port.devices || [], port.hostPort);
  return devices;
}

function parseIoregNvme(text) {
  const blocks = String(text || "").split(/\n\+-o /);
  const byBsd = {};
  for (const block of blocks) {
    const model = (block.match(/"Model Number"\s*=\s*"([^"]+)"/) || [])[1];
    const serial = (block.match(/"Serial Number"\s*=\s*"([^"]+)"/) || [])[1];
    const info = (block.match(/"NVMe Controller Info"\s*=\s*\{([^}]+)\}/) || [])[1] || "";
    const percentUsed = Number((info.match(/"SMART Percentage Used"\s*=\s*(\d+)/) || [])[1]);
    const critical = Number((info.match(/"SMART Critical Warning"\s*=\s*(\d+)/) || [])[1]);
    const mediaErrors = Number((info.match(/"SMART Media Errors"\s*=\s*(\d+)/) || [])[1]);
    const bsdNames = [...block.matchAll(/"BSD Name"\s*=\s*"(disk\d+)"/g)].map((match) => match[1]);
    const record = {
      model: model || null,
      serial: serial || null,
      smartPercentUsed: Number.isFinite(percentUsed) ? percentUsed : null,
      smartCriticalWarning: Number.isFinite(critical) ? critical : null,
      smartMediaErrors: Number.isFinite(mediaErrors) ? mediaErrors : null,
      temperatureC: null,
    };
    for (const bsd of bsdNames) byBsd[bsd] = record;
  }
  return byBsd;
}

function parseIostat(stdout) {
  const lines = String(stdout || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  let disks = [];
  const samples = [];
  for (const line of lines) {
    if (/^disk\d+(\s+disk\d+)*$/i.test(line.replace(/\s+/g, " ").trim()) || /\bdisk\d+\b/.test(line) && !/KB\/t/.test(line) && !/^[\d.\s]+$/.test(line)) {
      const names = line.match(/disk\d+/g) || [];
      if (names.length) {
        disks = names;
        continue;
      }
    }
    if (/KB\/t/.test(line)) continue;
    const nums = line.match(/-?[\d.]+/g);
    if (!nums || !disks.length || nums.length < disks.length * 3) continue;
    const row = {};
    for (let i = 0; i < disks.length; i += 1) {
      row[disks[i]] = {
        kbPerTransfer: Number(nums[i * 3]),
        tps: Number(nums[i * 3 + 1]),
        mbPerSec: Number(nums[i * 3 + 2]),
      };
    }
    samples.push(row);
  }
  return samples.length ? samples[samples.length - 1] : {};
}

function parseDf(stdout) {
  const mounts = [];
  const lines = String(stdout || "").split("\n").slice(1);
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) continue;
    const mount = parts.slice(5).join(" ");
    const filesystem = parts[0];
    const bsd = (filesystem.match(/\/dev\/(disk\d+(?:s\d+)*)/) || [])[1] || null;
    if (!bsd) continue;
    if (mount.includes("/.timemachine/") || mount.includes("CoreSimulator") || mount.includes("AppTranslocation")) continue;
    mounts.push({
      bsd,
      filesystem,
      sizeKb: Number(parts[1]),
      usedKb: Number(parts[2]),
      availKb: Number(parts[3]),
      capacity: parts[4],
      mount,
    });
  }
  return mounts;
}

function physicalBsd(bsd) {
  const match = String(bsd || "").match(/^(disk\d+)/);
  return match ? match[1] : String(bsd || "");
}

function shouldKeepVolume(volume) {
  const name = volume.name || "";
  const mount = volume.mount || "";
  if (SKIP_VOLUME_NAMES.has(name)) return false;
  if (mount.startsWith("/System/Volumes/") && name !== "Macintosh HD - Data") return false;
  if (mount.includes("CoreSimulator") || mount.includes(".timemachine")) return false;
  return Boolean(mount === "/" || mount.startsWith("/Volumes/") || mount === "/System/Volumes/Data");
}

function nvmeHealth({ enclosure, linkSpeedGt, linkWidth, smartStatus, smartCriticalWarning }) {
  const flags = [];
  if (smartStatus && String(smartStatus).toLowerCase() !== "verified") {
    flags.push({ level: "red", code: "smart", message: `SMART status ${smartStatus}` });
  }
  if (smartCriticalWarning) {
    flags.push({ level: "red", code: "smart-critical", message: "NVMe SMART critical warning is set." });
  }
  const expectedWidth = enclosure === "Express 4M2" ? 1 : enclosure === "Internal" ? null : 4;
  if (linkWidth != null && expectedWidth != null && linkWidth < expectedWidth) {
    flags.push({
      level: "red",
      code: "pcie-width",
      message: `PCIe x${linkWidth} is below expected x${expectedWidth} for ${enclosure}.`,
    });
  } else if (enclosure === "Express 4M2" && linkWidth === 1) {
    flags.push({
      level: "yellow",
      code: "shared-bay",
      message: "Express 4M2 shares lanes — x1 per drive is expected, not a bad cable.",
    });
  }
  if (linkSpeedGt != null && linkSpeedGt < 8) {
    flags.push({
      level: "red",
      code: "pcie-speed",
      message: `NVMe link ${linkSpeedGt} GT/s is far below PCIe 4.0.`,
    });
  }
  if (!flags.length) {
    flags.push({ level: "green", code: "ok", message: "Link looks healthy for this bus." });
  }
  return { flags, health: healthFromFlags(flags) };
}

function hydrateVolume(volume, dfByBsd, fallbackSizeLabel) {
  const name = volume.name || volume._name;
  const bsd = volume.bsd || volume.bsd_name;
  const dfRow = dfByBsd.get(bsd) || dfByBsd.get(physicalBsd(bsd));
  const known = KNOWN_VOLUMES[name] || {};
  const sizeBytes = volume.sizeBytes ?? volume.size_in_bytes ?? (dfRow ? dfRow.sizeKb * 1024 : null);
  const availBytes = dfRow ? dfRow.availKb * 1024 : volume.freeBytes ?? volume.free_space_in_bytes ?? null;
  const usedBytes = dfRow ? dfRow.usedKb * 1024 : sizeBytes != null && availBytes != null ? Math.max(0, sizeBytes - availBytes) : null;
  const percentBase = usedBytes != null && availBytes != null ? usedBytes + availBytes : sizeBytes;
  return {
    name,
    bsd,
    mount: volume.mount || volume.mount_point || dfRow?.mount || null,
    fileSystem: volume.fileSystem || volume.file_system || null,
    sizeBytes,
    usedBytes,
    freeBytes: availBytes,
    usedLabel: usedBytes != null ? formatBytes(usedBytes) : "—",
    freeLabel: availBytes != null ? formatBytes(availBytes) : "—",
    sizeLabel: sizeBytes != null ? formatBytes(sizeBytes) : fallbackSizeLabel || "—",
    percentUsed: percentBase ? Math.round(((usedBytes || 0) / percentBase) * 100) : null,
    role: known.role || null,
  };
}

function storageVolumesForNvme(disk, storageItems, modelCounts) {
  const model = disk.device_model || disk._name;
  const named = asArray(disk.volumes)
    .map((volume) => volume._name)
    .filter((name) => name && name !== "EFI" && name !== "Recovery");
  const byModel = storageItems.filter((volume) => asObject(volume.physical_drive).device_name === model);
  if (named.length && (modelCounts.get(model) || 0) > 1) {
    return byModel.filter((volume) => named.includes(volume._name));
  }
  if (byModel.length) return byModel;
  return asArray(disk.volumes);
}

function buildDrives({ nvme, storage, cards, df, iostat, ioreg }) {
  const storageItems = asArray(storage.SPStorageDataType);
  const storageByBsd = new Map();
  for (const volume of storageItems) {
    const pd = asObject(volume.physical_drive);
    const bsd = physicalBsd(volume.bsd_name);
    if (!storageByBsd.has(bsd)) {
      storageByBsd.set(bsd, {
        protocol: pd.protocol || null,
        deviceName: pd.device_name || volume._name,
        medium: pd.medium_type || null,
        smart: pd.smart_status || null,
        internal: pd.is_internal_disk === "yes",
        volumes: [],
      });
    }
    storageByBsd.get(bsd).volumes.push({
      name: volume._name,
      bsd: volume.bsd_name,
      mount: volume.mount_point || null,
      fileSystem: volume.file_system || null,
      sizeBytes: Number(volume.size_in_bytes) || null,
      freeBytes: Number(volume.free_space_in_bytes) || null,
      writable: volume.writable === "yes",
    });
  }

  const dfByBsd = new Map(df.map((row) => [row.bsd, row]));
  const nvmeDisks = asArray(nvme.SPNVMeDataType).flatMap((controller) => asArray(controller._items));
  const modelCounts = new Map();
  for (const disk of nvmeDisks) {
    const model = disk.device_model || disk._name;
    modelCounts.set(model, (modelCounts.get(model) || 0) + 1);
  }
  const drives = [];

  for (const disk of nvmeDisks) {
      const bsd = disk.bsd_name;
      const model = disk.device_model || disk._name;
      const enclosure = enclosureForModel(model) || "Unknown";
      const volumes = storageVolumesForNvme(disk, storageItems, modelCounts)
        .map((volume) => hydrateVolume(volume, dfByBsd, disk.size))
        .filter(shouldKeepVolume);

      const io = iostat[bsd] || {};
      const ioregInfo = ioreg[bsd] || {};
      const linkSpeedGt = parseLinkSpeedGt(disk.spnvme_linkspeed);
      const linkWidth = parseLinkWidth(disk.spnvme_linkwidth);
      const { flags } = nvmeHealth({
        enclosure,
        linkSpeedGt,
        linkWidth,
        smartStatus: disk.smart_status,
        smartCriticalWarning: ioregInfo.smartCriticalWarning,
      });
      if (/9100 PRO/i.test(model) && linkSpeedGt === 16) {
        if (!flags.some((flag) => flag.code === "capped-by-enclosure")) {
          flags.push({
            level: "yellow",
            code: "capped-by-enclosure",
            message: "Samsung 9100 PRO is PCIe 5.0; 16 GT/s x1 is the USB4 / 4-bay cap, not a cable fault.",
          });
        }
      }

      drives.push({
        id: bsd,
        kind: "nvme",
        name: volumes.map((volume) => volume.name).filter(Boolean).join(" · ") || model,
        model,
        serial: disk.device_serial || ioregInfo.serial || null,
        firmware: disk.device_revision || null,
        enclosure,
        protocol: enclosure === "Internal" ? "Apple Fabric" : "NVMe over USB4",
        bus: enclosure === "Internal" ? "Internal NVMe" : "Thunderbolt / USB4",
        advertisedLink: enclosure === "Internal"
          ? "Apple Fabric"
          : enclosure === "Express 4M2"
            ? "PCIe 4.0 x1 shared (4-bay)"
            : "PCIe 4.0 x4 @ 16 GT/s",
        currentLink: disk.spnvme_linkspeed && disk.spnvme_linkwidth
          ? `${disk.spnvme_linkspeed} ${disk.spnvme_linkwidth}`
          : disk.spnvme_linkspeed || "Apple Fabric",
        linkSpeedGt,
        linkWidth,
        smartStatus: disk.smart_status || null,
        smartPercentUsed: ioregInfo.smartPercentUsed,
        temperatureC: ioregInfo.temperatureC,
        ioMBps: Number.isFinite(io.mbPerSec) ? io.mbPerSec : null,
        ioTps: Number.isFinite(io.tps) ? io.tps : null,
        sizeBytes: Number(disk.size_in_bytes) || null,
        sizeLabel: disk.size || formatBytes(disk.size_in_bytes),
        volumes,
        flags,
        health: healthFromFlags(flags),
      });
  }

  for (const reader of asArray(cards.SPCardReaderDataType)) {
    const readerName = reader._name === "spcardreader" ? "Built-in SDXC" : "USB SD reader";
    const protocol = reader._name === "spcardreader" ? "SD" : "USB SD";
    const readerLinkSpeed = reader["spcardreader_link-speed"];
    const readerLinkWidth = reader["spcardreader_link-width"];
    const advertised = readerLinkSpeed
      ? `${readerLinkSpeed} ${readerLinkWidth || ""}`.trim()
      : reader._name === "spcardreader"
        ? "SDXC reader 5.0 GT/s x1"
        : "USB SD reader";
    const current = advertised;
    for (const disk of asArray(reader._items)) {
      const bsd = disk.bsd_name;
      const storageEntry = storageByBsd.get(bsd) || { volumes: [] };
      const volumes = (storageEntry.volumes.length ? storageEntry.volumes : asArray(disk.volumes))
        .map((volume) => hydrateVolume(volume, dfByBsd, disk.size))
        .filter(shouldKeepVolume);
      const io = iostat[bsd] || {};
      const flags = [
        {
          level: "green",
          code: "ok",
          message: readerName === "Built-in SDXC" ? "Built-in SDXC reader is present." : "USB SD reader is present.",
        },
      ];
      drives.push({
        id: bsd,
        kind: protocol === "SD" ? "sd" : "usb-sd",
        name: volumes[0]?.name || disk._name,
        model: disk.spcardreader_card_productname || disk._name || readerName,
        serial: disk.spcardreader_card_serialnumber || reader.spcardreader_serialnumber || null,
        firmware: disk.spcardreader_card_productrevision || reader["spcardreader_revision-id"] || null,
        enclosure: readerName,
        protocol,
        bus: readerName,
        advertisedLink: advertised,
        currentLink: current,
        linkSpeedGt: parseLinkSpeedGt(readerLinkSpeed),
        linkWidth: parseLinkWidth(readerLinkWidth),
        smartStatus: disk.smart_status || null,
        smartPercentUsed: null,
        temperatureC: null,
        ioMBps: Number.isFinite(io.mbPerSec) ? io.mbPerSec : null,
        ioTps: Number.isFinite(io.tps) ? io.tps : null,
        sizeBytes: Number(disk.size_in_bytes) || null,
        sizeLabel: disk.size || formatBytes(disk.size_in_bytes),
        volumes,
        flags,
        health: "green",
      });
    }
  }

  return drives.sort((a, b) => String(a.enclosure).localeCompare(String(b.enclosure)) || String(a.name).localeCompare(String(b.name)));
}

function summarize(ports, drives, warnings) {
  const tbDevices = flattenThunderboltDevices(ports);
  const healthCounts = { green: 0, yellow: 0, red: 0 };
  for (const item of [...ports, ...tbDevices, ...drives]) {
    healthCounts[item.health] = (healthCounts[item.health] || 0) + 1;
  }
  return {
    portsConnected: ports.filter((port) => port.connected).length,
    portsTotal: ports.length,
    driveCount: drives.length,
    thunderboltDevices: tbDevices.length,
    healthCounts,
    overall: healthCounts.red ? "red" : healthCounts.yellow ? "yellow" : "green",
    warnings,
  };
}

async function collectLogisticsSnapshot() {
  const started = Date.now();
  const warnings = [];
  const [
    thunderbolt,
    nvme,
    storage,
    cards,
    hardware,
    df,
    iostatRaw,
    ioregRaw,
    smartctl,
  ] = await Promise.all([
    execCommand("system_profiler", ["SPThunderboltDataType", "-json"]),
    execCommand("system_profiler", ["SPNVMeDataType", "-json"]),
    execCommand("system_profiler", ["SPStorageDataType", "-json"]),
    execCommand("system_profiler", ["SPCardReaderDataType", "-json"]),
    execCommand("system_profiler", ["SPHardwareDataType", "-json"]),
    execCommand("df", ["-kP"]),
    execCommand("iostat", ["-d", "-n", "32", "-w", "1", "-c", "2"], 8000),
    execCommand("ioreg", ["-r", "-c", "IONVMeController", "-l"], 8000),
    execCommand("which", ["smartctl"], 2000),
  ]);

  for (const [name, result] of [
    ["Thunderbolt", thunderbolt],
    ["NVMe", nvme],
    ["Storage", storage],
    ["Card reader", cards],
  ]) {
    if (!result.ok) warnings.push(`${name} profiler failed: ${result.error || result.stderr || "unknown error"}`);
  }

  const hardwareJson = parseJson(hardware.stdout, { SPHardwareDataType: [] });
  const hw = asObject(asArray(hardwareJson.SPHardwareDataType)[0]);
  const ports = parseThunderbolt(parseJson(thunderbolt.stdout, { SPThunderboltDataType: [] }));
  const iostat = parseIostat(iostatRaw.stdout);
  const ioreg = parseIoregNvme(ioregRaw.stdout);
  const drives = buildDrives({
    nvme: parseJson(nvme.stdout, { SPNVMeDataType: [] }),
    storage: parseJson(storage.stdout, { SPStorageDataType: [] }),
    cards: parseJson(cards.stdout, { SPCardReaderDataType: [] }),
    df: parseDf(df.stdout),
    iostat,
    ioreg,
  });

  const smartctlPresent = smartctl.ok && /smartctl/.test(smartctl.stdout);
  if (!smartctlPresent) {
    warnings.push("NVMe temperature is unavailable without smartctl (brew install smartmontools). SMART percent-used still comes from ioreg.");
  }

  const chip = hw.chip_type || HOST.chip;
  const host = {
    ...HOST,
    machine: hw.machine_name || HOST.machine,
    modelId: hw.machine_model || HOST.modelId,
    chip,
    memory: hw.physical_memory || null,
    serial: hw.serial_number || null,
  };

  return {
    collectedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    host,
    summary: summarize(ports, drives, warnings),
    thunderbolt: ports,
    drives,
    limits: [
      "This Mac Studio (M1 Max) is Thunderbolt 4 / USB4. It cannot negotiate Thunderbolt 5 speeds.",
      "Healthy cables on this host read 40 Gb/s. That is capped by the host, not a TB5 cable failure.",
      "Express 4M2 drives at PCIe x1 is expected (shared 4-bay). Express 1M2 should be x4.",
      smartctlPresent
        ? "smartctl is present; temperatures are still only shown when the tool returns them."
        : "Install smartmontools for NVMe temperature. ioreg does not expose drive Celsius on this host.",
    ],
  };
}

module.exports = { collectLogisticsSnapshot, HOST };

if (require.main === module) {
  collectLogisticsSnapshot()
    .then((snapshot) => {
      process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
