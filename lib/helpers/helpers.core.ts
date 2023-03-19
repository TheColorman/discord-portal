import { Interaction, Sticker } from "discord.js";
import * as fs from "fs";
import fetch from "node-fetch";
import ffmpeg from "fluent-ffmpeg";
import { MAX_STICKERS_ON_DISK } from "../../config.json";
import { emojiSuggestions, nameSuggestions } from "../const";

export default class BaseHelpersCore {
    /**
     * Send an ephemeral message to the user that the interaction has expired.
     * @param interaction Discord interaction
     */
    public sendExpired(interaction: Interaction) {
        if (interaction.isRepliable())
            interaction.reply({ content: "Expired.", ephemeral: true });
    }

    /**
     * Generate a random name suggestion for a portal.
     * @returns A random name suggestion
     */
    public generateName(): string {
        return `${
            nameSuggestions.beginning[
                Math.floor(Math.random() * nameSuggestions.beginning.length)
            ]
        } ${
            nameSuggestions.middle[
                Math.floor(Math.random() * nameSuggestions.middle.length)
            ]
        } ${
            nameSuggestions.end[
                Math.floor(Math.random() * nameSuggestions.end.length)
            ]
        }`;
    }

    /**
     * Generate a random emoji suggestion for a portal.
     * @returns A random emoji suggestion for a portal.
     */
    public generateEmoji(): string {
        return emojiSuggestions[
            Math.floor(Math.random() * emojiSuggestions.length)
        ];
    }

    /**
     * Convert a web APNG file to a local .gif file. If it fails, returns local .png file.
     * @param url Web URL of the APNG file
     * @param id ID used to name the file
     * @returns Path to local .gif file or .png file if conversion fails
     */
    public async convertAPNGtoGIF(url: string, id: string) {
        // Create file
        const response = await fetch(url);
        if (!response.body) return null;
        const PNGstream = fs.createWriteStream(`./stickers/${id}.png`);
        response.body.pipe(PNGstream);
        // Wait for file to be created
        await new Promise((resolve) => {
            PNGstream.on("finish", resolve);
        });

        // Output as .gif
        try {
            // Wait for conversion to finishimage.png
            await new Promise((resolve, reject) => {
                ffmpeg(`./stickers/${id}.png`)
                    .addOption([
                        "-gifflags -offsetting",
                        "-lavfi split[v],palettegen,[v]paletteuse",
                    ])
                    .saveToFile(`./stickers/${id}.gif`)
                    .on("end", resolve)
                    .on("error", reject);
            });
            return `./stickers/${id}.gif`;
        } catch (err) {
            // console.error(err);
            // There was an error, so the .gif file is likely corrupted.
            // Delete it and return the .png file instead.
            if (fs.existsSync(`./stickers/${id}.gif`))
                fs.unlinkSync(`./stickers/${id}.gif`);
            return `./stickers/${id}.png`;
        }
    }

    /**
     * Clean out .png files and limit the number of .gif files on disk.
     */
    public cleanStickerCache() {
        // Delete all PNG files.
        // Then, if there are more than 20 .gif files, delete the oldest ones
        let stickerFiles = fs.readdirSync("./stickers/");
        for (const file of stickerFiles) {
            if (file.endsWith(".png")) {
                try {
                    fs.unlinkSync(`./stickers/${file}`);
                } catch (err) {
                    console.error(err);
                }
            }
        }
        stickerFiles = fs.readdirSync("./stickers/");
        if (stickerFiles.length > MAX_STICKERS_ON_DISK) {
            stickerFiles.sort((a, b) => {
                return (
                    fs.statSync(`./stickers/${a}`).mtime.getTime() -
                    fs.statSync(`./stickers/${b}`).mtime.getTime()
                );
            });
            for (
                let i = 0;
                i < stickerFiles.length - MAX_STICKERS_ON_DISK;
                i++
            ) {
                try {
                    fs.unlinkSync(`./stickers/${stickerFiles[i]}`);
                } catch (err) {
                    console.error(err);
                }
            }
        }
    }

    /**
     * Convert a Discord Sticker object to a local .gif file.
     * @param sticker Discord Sticker object
     * @returns Path to local .gif file
     */
    public async stickerToGIF(sticker: Sticker) {
        const stickerFile = fs
            .readdirSync("./stickers/")
            .find((f) => f === `${sticker.id}.gif`);
        const stickerPath = stickerFile
            ? `./stickers/${stickerFile}`
            : await this.convertAPNGtoGIF(sticker.url, sticker.id);

        if (!stickerPath) return null;
        // Update "last modified" time
        try {
            fs.utimesSync(stickerPath, new Date(), new Date());
        } catch (err) {
            console.error(err);
        }
        return stickerPath;
    }
}
