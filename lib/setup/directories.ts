import { existsSync, mkdirSync } from "fs";

function setupDirectories() {
    // Dirs
    if (!existsSync("./stickers/")) mkdirSync("./stickers/");
}

export default setupDirectories;