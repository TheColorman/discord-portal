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
     * Convert a web APNG file to a local .gif file.
     * @param url Web URL of the APNG file
     * @param id ID used to name the file
     * @returns Path to local .gif file
     */
    public async convertAPNGtoGIF(url: string, id: string) {
        // Create file
        const res = await fetch(url);
        if (!res.body) return null;
        const PNGstream = fs.createWriteStream(`./stickers/${id}.png`);
        res.body.pipe(PNGstream);
        // Output as .gif
        ffmpeg(`./stickers/${id}.png`).saveToFile(`./stickers/${id}.gif`);
        return `./stickers/${id}.gif`;
    }

    /**
     * Clean out .png files and limit the number of .gif files on disk.
     */
    public cleanStickerCache() {
        // Delete all PNG files.
        // Then, if there are more than 20 .gif files, delete the oldest ones
        const stickerFiles = fs.readdirSync("./stickers/");
        for (const file of stickerFiles) {
            if (file.endsWith(".png")) {
                try {
                    fs.unlinkSync(`./stickers/${file}`);
                } catch (err) {
                    console.error(err);
                }
            }
        }
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
        if (!stickerFile) this.convertAPNGtoGIF(sticker.url, sticker.id);

        // Update "last modified" time
        try {
            fs.utimesSync(
                `./stickers/${sticker.id}.gif`,
                new Date(),
                new Date()
            );
        } catch (err) {
            console.error(err);
        }
        return `./stickers/${sticker.id}.gif`;
    }
}
