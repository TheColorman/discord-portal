import { MessageReaction, PartialMessageReaction } from "discord.js";
import DiscordHelpersCore from "../helpers/discord_helpers.core";

async function handleReact(
    reaction: MessageReaction | PartialMessageReaction,
    helpers: DiscordHelpersCore
) {
    // Check if message is a portal message
    const portalMessageId = helpers.getPortalMessageId(reaction.message.id);
    if (!portalMessageId) return;
    const portalMessages = helpers.getPortalMessages(portalMessageId);
    if (!portalMessages.size) return;

    // Add reaction to linked messages if we have access to it
    for (const [messageId, portalMessage] of portalMessages) {
        // Ignore original message
        //// if (messageId === reaction.message.id) continue;
        // ? For now we'll also react to the original message, so you can see that the bot has reacted to it

        // Find channel and message objects
        const channel = await helpers.safeFetchChannel(portalMessage.channelId);
        if (!channel) continue;
        const message = await helpers.safeFetchMessage(
            channel,
            portalMessage.messageId
        );
        if (!message) continue;

        // Attempt to add reaction
        await helpers.addReaction(message, reaction.emoji); // TODO: 1. Check if we have access to the emoji. 2. Remove reaction if it disappears from the original message
    }
}

export default handleReact;