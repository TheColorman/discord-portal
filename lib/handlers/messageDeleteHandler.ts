import { Message, PartialMessage } from "discord.js";
import DiscordHelpersCore from "../helpers/discordHelpers.core";

async function handleDeleteMessage(
    message: Message | PartialMessage,
    helpers: DiscordHelpersCore
) {
    // Check if message is a portal message
    const portalMessageId = helpers.getPortalMessageId(message.id);
    if (!portalMessageId) return;
    const portalMessages = helpers.getPortalMessages(portalMessageId);
    if (!portalMessages.size) return;

    // Delete linked messages
    for (const [messageId, portalMessage] of portalMessages) {
        // Find channel and message objects
        const channel = await helpers.safeFetchChannel(portalMessage.channelId);
        if (!channel) continue;
        const message = await helpers.safeFetchMessage({
            channel,
            messageId: portalMessage.messageId
        });
        if (!message) continue;

        // Attempt to delete message
        const result = await helpers.deleteMessage(
            channel,
            portalMessage.messageId
        );
        // If result is an Error we couldn't delete the message
        if (result instanceof Error) {
            channel.send(
                "Note: I need the `Manage Messages` permission to function properly."
            );
        }
    }
    // Delete portal message
    helpers.deletePortalMessages(message.id);
}

export default handleDeleteMessage;