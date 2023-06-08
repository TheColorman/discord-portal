import DiscordHelpersCore from "../helpers/discordHelpers.core";
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
    const { content, embeds, files, attachments } =
        await helpers.preparePortalMessage(message);

    // Send initial message
    const username = message.author.username;
    const discriminator = message.author.discriminator;
    const tag = username + (discriminator === "0" ? "" : `#${discriminator}`);
    await helpers.propegatePortalMessage({
        portalId: portalConnection.portalId,
        message,
        options: {
            content,
            username: `${tag}${
                message.guild?.name ? ` @ ${message.guild.name}` : ""
            }`,
            avatarURL:
                message.member?.avatarURL() ||
                message.author.avatarURL() ||
                undefined,
            embeds,
            files,
            allowedMentions: {
                parse: ["users"],
            },
        },
        attachments,
    });
}

export default handlePortal;
