// Types
type Portal = {
    id: string;
    name: string;
    emoji: string;
    customEmoji: boolean;
    nsfw: boolean;
    exclusive: boolean;
    password: string;
};
type PortalConnection = {
    portalId: string;
    guildId: string;
    guildName: string;
    channelId: string;
    channelName: string;
    guildInvite?: string;
    webhookId: string;
    webhookToken: string;
};
type PortalConnectionOptions = {
    guildName?: string;
    channelName?: string;
    guildInvite?: string;
    webhookId?: string;
    webhookToken?: string;
};
type PortalMessage = {
    id: string;
    portalId: string;
    messageId: string;
    channelId: string;
    messageType: MessageType;
};
type PortalId = string;
type ChannelId = string;
type MessageId = string;
type UserId = string;
type PortalMessageId = string;
type MessageType = "original" | "linked" | "linkedAttachment";

export type { Portal, PortalConnection, PortalConnectionOptions, PortalMessage, PortalId, ChannelId, MessageId, UserId, PortalMessageId, MessageType };