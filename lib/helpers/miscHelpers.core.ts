import {
    AttachmentBuilder,
    Collection,
    Embed,
    Interaction,
    Message,
    Sticker,
} from "discord.js";
import * as fs from "fs";
import fetch from "node-fetch";
import { MAX_STICKERS_ON_DISK } from "../../config.json";
import { emojiSuggestions, nameSuggestions, osType } from "../const";
import { MessageEvent, Queue } from "../messageEventClasses";
import { exec } from "child_process";

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
     * @param id ID used to name the file. /!\ Warning: this value is passed directly to a binary.
     * @returns Path to local .gif file or .png file if conversion fails
     */
    public async convertAPNGtoGIF(url: string, id: string) {
        // Create file
        const response = await fetch(url);
        if (!response.body) return null;
        const PNGstream = fs.createWriteStream(`./stickers/${id}.png`, {
            mode: 0o777,
        });
        response.body.pipe(PNGstream);
        // Wait for file to be created
        await new Promise((resolve) => {
            PNGstream.on("finish", resolve);
        });

        // Convert to .gif using apng2gif
        const promise = new Promise<string | null>((resolve, reject) => {
            const command = `/home/node/app/bin/apng2gif${
                osType === "Windows" ? ".exe" : ""
            } /home/node/app/stickers/${id}.png /home/node/app/stickers/${id}.gif`;
            exec(command, (err, stdout, stderr) => {
                if (err) {
                    console.error(err);
                    console.error(stderr);
                    resolve(null);
                } else {
                    resolve(`./stickers/${id}.gif`);
                }
            });
        });

        // Wait for conversion to finish
        try {
            const result = await promise;
            return result;
        } catch (err) {
            console.error(err);
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

    /**
     * Enqueue a message event.
     * This is used to prevent situations such as a message being edited before it has been sent out to the Portal.
     * Any function that depends on PortalMessages existing should use this.
     * @param messageEvent Message event to enqueue
     */
    public async enqueueMessageEvent(messageEvent: MessageEvent) {
        // Get event queue for this message
        const messageEventQueue =
            messageEvent.queue() || new Queue<MessageEvent>();

        // Create new event
        const isEmpty = messageEventQueue.isEmpty();
        messageEventQueue.enqueue(messageEvent);
        // Set event queue on map
        const messageEventQueueMap = messageEvent.queueMap();
        messageEventQueueMap.set(messageEvent.id, messageEventQueue);

        // If queue is empty, run manually
        if (isEmpty) {
            await messageEvent.call();
        }
    }

    public cleanEmbeds(embeds: Embed[]) {
        // Remove any embeds that are not type "rich"
        return embeds.filter((e) => e.data.type === "rich");
    }

    public convertEmojis(message: Message) {
        const emojis = message.content.match(/<a?:[a-zA-Z0-9_]+:[0-9]+>/g);
        const replacement = emojis?.map((e) => {
            const animated = e.startsWith("<a:");
            const id = e.match(/:[0-9]+>/)?.[0].slice(1, -1);
            if (!id) return e;
            const emoji = message.client.emojis.cache.get(id);
            if (emoji) return emoji.toString();
            return `https://cdn.discordapp.com/emojis/${id}.${
                animated ? "gif" : "png"
            }?size=48&quality=lossless`;
        });
        if (!emojis || !replacement) return message.content;
        for (let i = 0; i < emojis.length; i++) {
            message.content = message.content.replace(
                emojis[i],
                replacement[i]
            );
        }
        return message.content;
    }

    public async convertStickers(stickers: Collection<string, Sticker>) {
        const convertedPromise: Promise<string | null>[] = stickers.map(
            async (s) => {
                const stickerFile = await this.stickerToGIF(s);
                if (!stickerFile)
                    return new Promise((resolve) => resolve(s.url));
                return stickerFile;
            }
        );
        const converted = await Promise.all(convertedPromise);
        // Clean cache
        if (converted.some((sticker) => sticker?.endsWith(".gif"))) {
            this.cleanStickerCache();
        }

        return (
            converted.filter((sticker) => sticker !== null) as string[]
        ).map((s) => new AttachmentBuilder(s));
    }

    public async convertAttachments(message: Message) {
        // Any media attachments we want to convert to links.
        // Otherwise, we want to check if the attachment is small enough for us to send.
        // If it is, send it. Else, send a link.

        const attachments = message.attachments;
        const media = attachments.filter(
            (attachment) =>
                attachment.contentType?.startsWith("image") ||
                attachment.contentType?.startsWith("video")
        );
        const tooLarge = attachments.filter(
            (attachment) =>
                // Max upload size is 8 MiB
                attachment.size > 8388608 - 512 && // Subtract 512 for good measure. Don't wanna go above the limit.
                !media.has(attachment.id)
        );
        // Convert media and too large attachments to links
        const linkified = media.concat(tooLarge);

        // Remove media and too large attachments from attachments
        const remaining = attachments.filter(
            (attachment) =>
                !(tooLarge.has(attachment.id) || media.has(attachment.id))
        );

        return {
            linkified,
            remaining,
        };
    }
}
