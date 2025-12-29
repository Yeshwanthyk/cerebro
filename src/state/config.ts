/**
 * Global configuration management
 */
import { join } from "path";
import type { Config } from "../types";
import { getConfigDir } from "./db";

export async function getConfig(): Promise<Config> {
  const configFile = join(getConfigDir(), "config.json");
  const file = Bun.file(configFile);
  if (await file.exists()) {
    try {
      return await file.json();
    } catch {
      // Corrupted file, return defaults
    }
  }
  return { defaultPort: 3030 };
}

export async function saveConfig(config: Config): Promise<void> {
  const configFile = join(getConfigDir(), "config.json");
  await Bun.write(configFile, JSON.stringify(config, null, 2));
}
