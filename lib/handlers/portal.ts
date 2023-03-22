import { AttachmentBuilder, Embed, Message } from "discord.js";
import DiscordHelpersCore from "../helpers/discord_helpers.core";
import { PortalDiscordMessage } from "../types";

async function handlePortal(message: Message, helpers: DiscordHelpersCore) {
    // why do I have to check this type again?
    if (!helpers.isValidChannel(message.channel)) return;

    const portalConnection = helpers.getPortalConnection(message.channel.id);
    if (!portalConnection) return;

    // Check for spam
    const limitedAccount = helpers.getLimitedAccount({
        userId: message.author.id,
        portalId: portalConnection.portalId,
    });
    // We want to ignore the account if it is banned
    // or if the channel is not this one
    if (
        limitedAccount &&
        (limitedAccount.banned ||
            limitedAccount.channelId !== message.channel.id)
    ) {
        // Remove send permissions from user
        if (!message.member) return;
        try {
            await message.channel.permissionOverwrites.create(message.member, {
                SendMessages: false,
            });
        } catch (err) {
            // console.error(err);
        }
        return;
    }

    const portalConnections = helpers.getPortalConnections(
        portalConnection.portalId
    );

    // Send message to other channels
    // -- Preprocess message --
    // Replace image embeds with links
    const embeds = message.embeds
        .map((e) => {
            if (!e.data.url) return e;
            if (!message.content.includes(e.data.url))
                message.content += `\n${e.data.url}`;
            return null;
        })
        .filter((e) => e !== null) as Embed[];

    // Convert unknown emojis
    const emojis = message.content.match(/<a?:[a-zA-Z0-9_]+:[0-9]+>/g);
    const replacement = emojis?.map((e) => {
        const animated = e.startsWith("<a:");
        // Match all numbers after :
        const id = e.match(/:[0-9]+>/)?.[0].slice(1, -1);
        if (!id) return e;
        const emoji = message.client.emojis.cache.get(id);
        if (emoji) return emoji.toString();
        return `https://cdn.discordapp.com/emojis/${id}.${
            animated ? "gif" : "webp"
        }?size=48&quality=lossless\n`;
    });
    if (emojis && replacement) {
        // Replace message content matches
        for (let i = 0; i < emojis.length; i++) {
            message.content = message.content.replace(
                emojis[i],
                replacement[i]
            );
        }
    }
    // Stickers
    const stickers: string[] = [];
    if (message.stickers.size) {
        for (const [stickerId, sticker] of message.stickers) {
            const stickerFile = await helpers.stickerToGIF(sticker);
            if (!stickerFile) continue;
            stickers.push(stickerFile);
        }
        // Clean cache if file is not a PNG
        if (!stickers.some((sticker) => sticker.endsWith(".png")))
            helpers.cleanStickerCache();
    }

    // Replies
    const originalReference = (
        message.reference?.messageId
            ? await helpers.safeFetchMessage(
                  message.channel,
                  message.reference.messageId
              )
            : null
    ) as PortalDiscordMessage | null;

    let content = message.content;
    const getLinked = async () => {
        const failed = "`[Reply failed]`\n";

        if (!originalReference) return failed;

        // Remove first line if it starts with "`[Reply failed]`" or "[[Reply to `"
        const refContent =
            // check if content is a link to cdn.discordapp.com/attachments or media.discordapp.net/attachments
            (
                originalReference.content === "" ||
                originalReference.content
                    .trim()
                    .match(
                        /https?:\/\/(cdn|media)\.discordapp\.com\/attachments/
                    )
                    ? "(Click to see attachment 🖾)"
                    : originalReference.content.startsWith(
                          "`[Reply failed]`"
                      ) || originalReference.content.startsWith("[[Reply to ")
                    ? originalReference.content.split("\n").slice(1).join("\n")
                    : originalReference.content
            )
                .replace(/<@!?([0-9]+)>/g, (_, id) => {
                    // Replace <@id> with @username
                    const user = message.client.users.cache.get(id);
                    if (!user) return `@Unknown`;
                    return `@${user.username}`;
                })
                .replace(/\n/g, " "); // Remove newlines

        const refAuthorTag = originalReference.author.tag.split("@")[0].trim();
        const refPreview =
            refContent.length + refAuthorTag.length > 50
                ? refContent.substring(0, 50 - refAuthorTag.length) + "..."
                : refContent;

        let referencePortalMessageId = helpers.getPortalMessageId(
            originalReference.id
        );

        if (!referencePortalMessageId) {
            // Try again after 1s
            await new Promise((resolve) => setTimeout(resolve, 1000));
            referencePortalMessageId = helpers.getPortalMessageId(
                originalReference.id
            );
        }

        if (!referencePortalMessageId) return failed;
        const linkedPortalMessages = helpers.getPortalMessages(
            referencePortalMessageId
        );

        return { refAuthorTag, refPreview, linkedPortalMessages };
    };
    const reply = await getLinked();

    const portalMessageId = helpers.generatePortalMessageId();

    // Send to other channels and add to database
    // Use a promise so we can wait for them all to finish
    // When all messages have been sent, add the original to the database
    const sendPromises = portalConnections.map(async (portalConnection) => {
        // Don't send to same channel
        if (portalConnection.channelId === message.channel.id) return;

        // Get channel
        const localChannel = await helpers.safeFetchChannel(
            portalConnection.channelId
        );
        if (!localChannel) {
            // Remove connection if channel is not found
            helpers.deletePortalConnection(portalConnection.channelId);
            return;
        }

        let newContent = content.slice();

        // Add replies
        if (originalReference) {
            const buildReply = async () => {
                if (typeof reply === "string") return reply;
                const { refAuthorTag, refPreview, linkedPortalMessages } =
                    reply;

                // Fetch the message id of the reply in the portalConnection channel
                const localPortalReference = linkedPortalMessages.find(
                    (linkedPortalMessage) =>
                        linkedPortalMessage.channelId ===
                        portalConnection.channelId
                );
                const localReferenceMessageId = localPortalReference?.messageId;

                // Propegate replies through portal
                const replyPing = await (async () => {
                    // Stop if no reference
                    if (!originalReference) return false;
                    // Stop if message is not a webhook
                    if (!helpers.isPortalWebhookMessage(originalReference))
                        return false;
                    // Stop if the reply didn't ping
                    //! Seems like there's no way to check whether the reply pings or not???
                    
                    // Stop if the local version of the reference is not the original source
                    if (localPortalReference?.messageType !== "original")
                        return false;
                    // Now we can add a ping to the reply
                    const localReferenceMessage =
                        await helpers.safeFetchMessage(
                            localChannel,
                            localPortalReference.messageId
                        );
                    if (!localReferenceMessage) return false;
                    return `<@${localReferenceMessage.author.id}>`;
                })();

                if (!localReferenceMessageId) return "`[Reply failed]`\n";
                return (
                    "[[Reply to " +
                    (replyPing || "`" + refAuthorTag + "`") +
                    " - `" +
                    refPreview +
                    "`]](https://discord.com/channels/" +
                    localChannel.guildId +
                    "/" +
                    localChannel.id +
                    "/" +
                    localReferenceMessageId +
                    ")\n"
                );
            };
            newContent = await buildReply() + message.content;
        }

        // Get webhook
        const webhook = await helpers.getWebhook({
            channel: localChannel,
            webhookId: portalConnection.webhookId,
        });
        // If no webhook was found, the channel doesn't exist and we should delete the connection
        if (!webhook) {
            helpers.deletePortalConnection(portalConnection.channelId);
            return;
        }
        // Send webhook message
        // Send a separate message for each attachment to prevent uploading them all again
        const attachments = message.attachments.toJSON();

        const username = `${message.author.tag} ${
            message.guild?.name ? ` @ ${message.guild.name}` : ""
        }`;

        const firstMessage = await webhook.send({
            content: newContent.trim() ? newContent : attachments.shift()?.url,
            username:
                username.length > 80 ? username.slice(0, 77) + "..." : username,
            avatarURL: message.author.avatarURL() || undefined,
            embeds: embeds,
            tts: message.tts,
            allowedMentions: {
                parse: ["users"],
            },
            files: stickers.map((s) => new AttachmentBuilder(s)),
        });

        helpers.createPortalMessage({
            id: portalMessageId,
            portalId: portalConnection.portalId,
            messageId: firstMessage.id,
            channelId: firstMessage.channel.id,
            messageType: "linked",
        });
        // Send remaining attachments
        for (const attachment of attachments) {
            const webhookMessage = await webhook.send({
                content: attachment.url,
                username: `${message.author.tag} ${
                    message.guild?.name ? ` @ ${message.guild.name}` : ""
                }`,
                avatarURL: message.author.avatarURL() || undefined,
                tts: message.tts,
                allowedMentions: {
                    parse: ["users"],
                },
            });

            helpers.createPortalMessage({
                id: portalMessageId,
                portalId: portalConnection.portalId,
                messageId: webhookMessage.id,
                channelId: webhookMessage.channel.id,
                messageType: "linkedAttachment",
            });
        }
    });
    await Promise.all(sendPromises);
    // Add original to database
    helpers.createPortalMessage({
        id: portalMessageId,
        portalId: portalConnection.portalId,
        messageId: message.id,
        channelId: message.channel.id,
        messageType: "original",
    });
}

export default handlePortal;
