import DiscordHelpersCore from "../helpers/discord_helpers.core";
import { ValidMessage } from "../types";

async function handlePortal(
    message: ValidMessage,
    helpers: DiscordHelpersCore
) {
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

    // Send message to other channels
    // -- Preprocess message --
    // Replace image embeds with links
    const embeds = helpers.cleanEmbeds(message.embeds);

    // Convert unknown emojis
    let content = helpers.convertEmojis(message);

    // Convert stickers
    const stickerAttachments = await helpers.convertStickers(message.stickers);

    // Convert attachments
    const { linkified, remaining } =
        await helpers.convertAttachments(message);

    // Replace content with first attachment link if there is no content, no embeds and no files.
    if (
        content.length === 0 &&
        embeds.length === 0 &&
        remaining.size === 0 &&
        stickerAttachments.length === 0
    ) {
        content = linkified.first()?.url || ""
        linkified.delete(linkified.firstKey() || "");
        message.attachments.delete(message.attachments.firstKey() || "");
    }

    // Send initial message
    await helpers.propegatePortalMessage({
        portalId: portalConnection.portalId,
        message,
        options: {
            content,
            username: `${message.author.tag} ${
                message.guild?.name ? ` @ ${message.guild.name}` : ""
            }`,
            avatarURL:
                message.member?.avatarURL() ||
                message.author.avatarURL() ||
                undefined,
            embeds: embeds,
            files: [...stickerAttachments, ...remaining.toJSON()],
            allowedMentions: {
                parse: ["users"],
            },
        },
        attachments: linkified
    });
}

export default handlePortal;
