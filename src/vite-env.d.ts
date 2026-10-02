/// <reference types="vite/client" />

export type RickyArtifact = {
  title: string;
  kind:
    | "text"
    | "markdown"
    | "code"
    | "table"
    | "notes"
    | "mermaid"
    | "image"
    | "imageLoading"
    | "thumbnailBoard"
    | "progress";
  content: string;
  language?: string;
  fullscreen?: boolean;
};

export type RickyToolSpec = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type RickyToolCall = {
  name: string;
  arguments: Record<string, unknown>;
};

export type RickyToolResult = {
  ok: boolean;
  artifact?: RickyArtifact;
  mode?: "display" | "computer";
  message?: string;
  error?: string;
  [key: string]: unknown;
};

export type LogisticsHealth = "green" | "yellow" | "red";

export type LogisticsFlag = {
  level: LogisticsHealth;
  code: string;
  message: string;
};

export type LogisticsVolume = {
  name: string;
  bsd: string;
  mount: string | null;
  fileSystem: string | null;
  sizeBytes: number | null;
  usedBytes: number | null;
  freeBytes: number | null;
  usedLabel: string;
  freeLabel: string;
  sizeLabel: string;
  percentUsed: number | null;
  role: string | null;
};

export type LogisticsDrive = {
  id: string;
  kind: string;
  name: string;
  model: string;
  serial: string | null;
  firmware: string | null;
  enclosure: string;
  protocol: string;
  bus: string;
  advertisedLink: string;
  currentLink: string;
  linkSpeedGt: number | null;
  linkWidth: number | null;
  smartStatus: string | null;
  smartPercentUsed: number | null;
  temperatureC: number | null;
  ioMBps: number | null;
  ioTps: number | null;
  sizeBytes: number | null;
  sizeLabel: string;
  volumes: LogisticsVolume[];
  flags: LogisticsFlag[];
  health: LogisticsHealth;
};

export type LogisticsThunderboltDevice = {
  id: string;
  name: string;
  model: string | null;
  vendor: string | null;
  uid: string | null;
  firmware: string | null;
  protocol: string;
  hostPort: string;
  advertisedGbps: number;
  currentGbps: number | null;
  currentSpeed: string | null;
  linkStatus: string;
  flags: LogisticsFlag[];
  health: LogisticsHealth;
  children: LogisticsThunderboltDevice[];
};

export type LogisticsThunderboltPort = {
  id: string;
  hostPort: string;
  name: string;
  uid: string | null;
  advertisedGbps: number;
  currentGbps: number | null;
  currentSpeed: string | null;
  linkStatus: string;
  connected: boolean;
  flags: LogisticsFlag[];
  health: LogisticsHealth;
  devices: LogisticsThunderboltDevice[];
};

export type LogisticsSnapshot = {
  collectedAt: string;
  elapsedMs: number;
  host: {
    machine: string;
    modelId: string;
    chip: string;
    thunderboltGeneration: number;
    advertisedLinkGbps: number;
    note: string;
    memory?: string | null;
    serial?: string | null;
  };
  summary: {
    portsConnected: number;
    portsTotal: number;
    driveCount: number;
    thunderboltDevices: number;
    healthCounts: Record<string, number>;
    overall: LogisticsHealth;
    warnings: string[];
  };
  thunderbolt: LogisticsThunderboltPort[];
  drives: LogisticsDrive[];
  limits: string[];
};

declare global {
  interface Window {
    ricky: {
      createRealtimeToken: () => Promise<{ value: string; expiresAt: number | null }>;
      executeTool: (toolCall: RickyToolCall) => Promise<RickyToolResult>;
      getToolSpecs: () => Promise<RickyToolSpec[]>;
      getLogisticsSnapshot: () => Promise<LogisticsSnapshot>;
      openLogisticsWindow: () => Promise<boolean>;
    };
  }
}
