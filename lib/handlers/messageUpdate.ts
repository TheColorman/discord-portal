import { Message, PartialMessage } from "discord.js";
import DiscordHelpersCore from "../helpers/discord_helpers.core";
import { ValidMessage } from "../types";

async function handleMessageUpdate(
    newMessage: ValidMessage,
    helpers: DiscordHelpersCore
) {
    // Check if message is a portal message
    const portalMessageId = helpers.getPortalMessageId(newMessage.id);
    if (!portalMessageId) return;
    const portalMessages = helpers.getPortalMessages(portalMessageId);
    if (!portalMessages.size) return;

    // Edit linked messages
    const promises: Promise<void>[] = [];

    portalMessages.forEach((portalMessage) => {
        promises.push(
            (async () => {
                // Find channel and message objects
                const channel = await helpers.safeFetchChannel(
                    portalMessage.channelId
                );
                if (!channel) return;
                const message = await helpers.safeFetchMessage(
                    channel,
                    portalMessage.messageId
                );
                if (!message) return;

                // Attempt to edit message
                await helpers.editMessage(channel, portalMessage.messageId, {
                    content: newMessage.content,
                    // files: message.attachments.map((a) => ({
                    //     attachment: a.url,
                    //     name: a.name || undefined,
                    // })),
                    embeds: newMessage.embeds,
                    allowedMentions: {
                        parse: ["users"],
                    },
                });
            })()
        );
    });

    await Promise.all(promises);
}

export default handleMessageUpdate;
