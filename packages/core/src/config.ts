import type { DocStore } from "./docs.ts";
import { SETTINGS_FORMAT, checkFormat } from "./format.ts";
import type { DacEntry } from "./dac-scope.ts";

export interface InstanceConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  /**
   * Optional hard caps, e.g. what the DAC accepts. HQPlayer's own rate list
   * already seems to follow the output device (inferred from two instances);
   * these are a second line of defence. Rates above them are never offered.
   */
  limits?: { maxPcmRate?: number; maxDsdRate?: number };
  /** The listener's answers about this instance's DAC and use (setup.ts). Absent: not answered.
   *  With named DACs (dac-scope.ts), these are the main DAC's; another DAC keeps its own. */
  setup?: InstanceSetup;
  /** Named DACs behind this HQPlayer (dac-scope.ts); absent: just the one. */
  dacs?: DacEntry[];
  /** The DAC in use, by id; absent: the main one. */
  dac?: string;
  /** HQPlayer's meter port; absent: the control port + 1 (measured). Tests point it at the fake's. */
  meterPort?: number;
  /** After HQPlayer restarts, lower its volume to at most this (dB); absent: off (restart-guard.ts). */
  restartVolumeCap?: number;
}

/**
 * What the modulator and dither advice needs to know, and HQPlayer can't tell us.
 * Each answer is optional: unanswered questions keep the advice that needs them off.
 */
export interface InstanceSetup {
  /** How the DAC takes DSD (apps/web/src/lib/dacs.ts, DsdPath). */
  dsd?: "older-ess" | "remodulates" | "direct" | "converts";
  /** How the DAC converts PCM. */
  pcm?: "delta-sigma" | "ladder";
  /** Whether the power amplifier is class-D or tube: Signalyst then suggests fifth order. */
  amp?: "class-d-or-tube" | "other" | "unsure";
  /** How the signal reaches the DAC: USB or network (NAA); S/PDIF, AES or optical; or I2S. */
  link?: "usb" | "spdif" | "i2s";
  /** HQPlayer is the volume control, or it stays at about −3 dB or on its fixed volume. */
  volume?: "hqplayer" | "fixed";
}

export interface AppConfig {
  instances: InstanceConfig[];
}

/** With no config file the app talks to the fake server only, never port 4321. */
export const DEV_DEFAULT: AppConfig = {
  instances: [{ id: "fake", name: "Fake (dev)", host: "127.0.0.1", port: 14321 }],
};

export const ID_PATTERN = /^[a-z0-9-]+$/;

/** The instances document (docs.ts). */
export const CONFIG_DOC = "instances.json";

/**
 * Load the instances. With none saved, production starts empty (discovery and Settings
 * fill it); development starts with the fake, so nothing can reach a real HQPlayer by
 * accident. One that can't be parsed stops the start: it's the listener's own file.
 */
export async function loadConfig(docs: DocStore, production: boolean): Promise<AppConfig> {
  const path = CONFIG_DOC;
  const raw = await docs.read(path).catch(() => null);
  if (raw === null) return production ? { instances: [] } : structuredClone(DEV_DEFAULT);
  const cfg = JSON.parse(raw) as AppConfig;
  checkFormat(path, cfg);
  const ids = new Set<string>();
  for (const i of cfg.instances) {
    if (!ID_PATTERN.test(i.id)) throw new Error(`${path}: instance id "${i.id}" must be [a-z0-9-]`);
    if (ids.has(i.id)) throw new Error(`${path}: duplicate instance id "${i.id}"`);
    ids.add(i.id);
  }
  return cfg;
}

/** The instances document's text. The app owns it while it runs. */
export const configText = (cfg: AppConfig) =>
  JSON.stringify({ format: SETTINGS_FORMAT, instances: cfg.instances }, null, 2) + "\n";
