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

    // Replace image embeds with links
    const embeds = helpers.cleanEmbeds(newMessage.embeds);

    // Convert unknown emojis
    let content = helpers.convertEmojis(newMessage);

    // Convert stickers
    const stickerAttachments = await helpers.convertStickers(
        newMessage.stickers
    );

    // Convert attachments
    const { linkified, remaining } = await helpers.convertAttachments(
        newMessage
    );

    // Replace content with first attachment link if there is no content, no embeds and no files.
    if (
        content.length === 0 &&
        embeds.length === 0 &&
        remaining.size === 0 &&
        stickerAttachments.length === 0
    ) {
        content = linkified.first()?.url || ""
        linkified.delete(linkified.firstKey() || "");
        newMessage.attachments.delete(newMessage.attachments.firstKey() || "");
    }

    // Update portal message
    await helpers.updatePortalMessage({
        sourceMessage: newMessage,
        options: {
            content: content,
            embeds: embeds,
            files: [
                ...(await helpers.convertStickers(newMessage.stickers)),
                ...remaining.toJSON(),
            ],
        },
    });
}

export default handleMessageUpdate;
