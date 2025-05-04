import { existsSync, mkdirSync } from "fs";
import path from "path";

function setupDirectories(state_directory: string) {
  // Dirs
  const stickers_dir = path.join(state_directory, "stickers");
  if (!existsSync(stickers_dir)) mkdirSync(stickers_dir);
}

export default setupDirectories;

