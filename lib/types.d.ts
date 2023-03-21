import {
    NewsChannel,
    TextChannel,
    ThreadChannel,
    PublicThreadChannel,
    PrivateThreadChannel,
} from "discord.js";

// Types
export type Portal = {
    id: string;
    name: string;
    emoji: string;
    customEmoji: boolean;
    nsfw: boolean;
    exclusive: boolean;
    password: string;
};
export type PortalConnection = {
    portalId: string;
    guildId: string;
    guildName: string;
    channelId: string;
    channelName: string;
    guildInvite?: string;
    webhookId: string;
    webhookToken: string;
};
export type PortalConnectionOptions = {
    guildName?: string;
    channelName?: string;
    guildInvite?: string;
    webhookId?: string;
    webhookToken?: string;
};
export type PortalMessage = {
    id: string;
    portalId: string;
    messageId: string;
    channelId: string;
    messageType: MessageType;
};
export type LimitedAccount = {
    userId: string;
    portalId: PortalId;
    channelId: ChannelId;
    reason: string;
    banned: boolean;
    bot: boolean;
};
export type PortalId = string;
export type ChannelId = string;
export type MessageId = string;
export type UserId = string;
export type PortalMessageId = string;
export type MessageType = "original" | "linked" | "linkedAttachment";
export type Permissions = BitFieldResolvable<S, N>[];
export type ValidChannel =
    | TextChannel
    | NewsChannel
export type DiscordChannel =
    | TextChannel
    | NewsChannel
    | PrivateThreadChannel
    | PublicThreadChannel<boolean>
    | DMChannel
    | PartialDMChannel
    | VoiceChannel
    | ThreadChannel;
