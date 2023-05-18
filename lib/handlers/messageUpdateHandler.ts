import DiscordHelpersCore from "../helpers/discordHelpers.core";
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

    const { content, embeds, files } =
        await helpers.preparePortalMessage(newMessage);

    // Update portal message
    await helpers.updatePortalMessage({
        sourceMessage: newMessage,
        options: {
            content: content,
            embeds: embeds,
            files: files,
        },
    });
}

export default handleMessageUpdate;
