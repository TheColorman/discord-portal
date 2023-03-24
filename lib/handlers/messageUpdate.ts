import { Message, PartialMessage } from "discord.js";
import DiscordHelpersCore from "../helpers/discord_helpers.core";

async function handleMessageUpdate(
    message: Message | PartialMessage,
    helpers: DiscordHelpersCore
) {
    // Check if message is a portal message
    const portalMessageId = helpers.getPortalMessageId(message.id);
    if (!portalMessageId) return;
    const portalMessages = helpers.getPortalMessages(portalMessageId);
    if (!portalMessages.size) return;

    // Edit linked messages
    for (const [messageId, portalMessage] of portalMessages) {
        // Find channel and message objects
        const channel = await helpers.safeFetchChannel(portalMessage.channelId);
        if (!channel) continue;
        const message = await helpers.safeFetchMessage(
            channel,
            portalMessage.messageId
        );
        if (!message) continue;

        // Attempt to edit message
        await helpers.editMessage(channel, portalMessage.messageId, {
            content: message.content,
            // files: message.attachments.map((a) => ({
            //     attachment: a.url,
            //     name: a.name || undefined,
            // })),
            embeds: message.embeds,
            allowedMentions: {
                parse: ["users"],
            },
        });
    }
}

export default handleMessageUpdate;
