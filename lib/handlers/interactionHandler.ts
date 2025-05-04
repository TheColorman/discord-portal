// ⚠ This is horrible
import {
  BaseInteraction,
  ButtonStyle,
  CacheType,
  ChannelType,
  ComponentType,
  Interaction,
  MessageReaction,
  TextInputStyle,
  User,
} from "discord.js";
import DiscordHelpersCore from "../helpers/discordHelpers.core";
import { PortalConnection, UserId } from "../types";
import { portalIntro } from "../const";
import { ADMINS, PREFIX } from "../../config.json";

async function announcePortalJoin(
  portalConnection: PortalConnection,
  helpers: DiscordHelpersCore,
) {
  // Announce join
  helpers.sendMessageToPortalAsBot({
    portalId: portalConnection.portalId,
    options: `📢 **${portalConnection.guildName.replace(
      "**",
      "\\*\\*",
    )}** joined the Portal. Say hi!`,
    sourceChannelId: portalConnection.channelId,
  });
}

async function handleInteraction(
  interaction: BaseInteraction,
  helpers: DiscordHelpersCore,
  connectionSetups: Map<
    UserId,
    { channelId: string; portalId: string; expires: number }
  >,
  portalSetups: Map<
    UserId,
    {
      name: string;
      emoji: string;
      customEmoji: boolean;
      portalId: string;
      channelId: string;
      nsfw: boolean;
      exclusive: boolean;
      password: string;
      expires: number;
    }
  >,
) {
  // Return if not a text channel
  if (!(interaction.channel && helpers.isValidChannel(interaction.channel)))
    return;

  // Try because discord.js is shit and throws errors for no reason
  // Join portal
  if (interaction.isStringSelectMenu()) {
    switch (interaction.customId) {
      case "portalSelect": {
        const portalId = interaction.values[0];
        const portal = helpers.getPortal(portalId);

        // Add portal to setup
        const setup = connectionSetups.get(interaction.user.id);
        if (!setup) return helpers.sendExpired(interaction);
        setup.portalId = portalId;
        setup.expires = Date.now() + 60000;

        if (portal?.nsfw && !interaction.channel.nsfw) {
          interaction.reply({
            content: "You can only join NSFW Portals from NSFW channels.",
            ephemeral: true,
          });
          return;
        }
        if (!portal?.exclusive) {
          // Edit original message
          interaction.update({
            content: `__Selected channel:__ <#${setup.channelId}>.\n__Selected Portal:__ ${portal?.emoji}${portal?.name}.\n${portalIntro.confirm}`,
            components: [
              {
                type: ComponentType.ActionRow,
                components: [
                  {
                    type: ComponentType.Button,
                    customId: "portalJoinInvite",
                    label: "Join Portal + share invite",
                    style: ButtonStyle.Success,
                  },
                  {
                    type: ComponentType.Button,
                    customId: "portalJoin",
                    label: "Join Portal",
                    style: ButtonStyle.Success,
                  },
                  {
                    type: ComponentType.Button,
                    customId: "portalSelectCancel",
                    label: "Cancel",
                    style: ButtonStyle.Danger,
                  },
                ],
              },
            ],
          });
          return;
        }
        // Modal for exclusive portals
        await interaction.showModal({
          title: `Join ${portal?.emoji}${portal?.name}`,
          customId: "portalPasswordPrompt",
          components: [
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.TextInput,
                  customId: "portalPassword",
                  label: `Enter Password for ${portal?.emoji}${portal?.name}`,
                  placeholder: "Password",
                  maxLength: 64,
                  minLength: 1,
                  style: TextInputStyle.Short,
                },
              ],
            },
          ],
        });
        break;
      }
      case "portalCreateNsfw": {
        const portalCreation = portalSetups.get(interaction.user.id);
        const setup = connectionSetups.get(interaction.user.id);
        if (!portalCreation || !setup) return helpers.sendExpired(interaction);

        const nsfw = interaction.values[0] === "nsfw";

        portalCreation.expires = Date.now() + 60000;

        if (!interaction.channel.nsfw) {
          await interaction.reply({
            content: "NSFW portals can only be created in NSFW channels.",
            ephemeral: true,
          });
          interaction.message.edit({
            content: `__Selected channel:__ <#${
              portalCreation.channelId
            }>.\n**Do you want to create a new Portal?**\n${
              portalCreation.emoji
            }${portalCreation.name}${portalCreation.nsfw ? "🔞" : ""}${
              portalCreation.exclusive
                ? `🔒\nPassword: \`${portalCreation.password}\``
                : ""
            }`,
            components: [
              {
                type: ComponentType.ActionRow,
                components: [
                  {
                    type: ComponentType.StringSelect,
                    customId: "portalCreateNsfw",
                    maxValues: 1,
                    minValues: 1,
                    options: [
                      {
                        label: "SFW",
                        value: "sfw",
                        default: true,
                      },
                      {
                        label: "🔞NSFW",
                        value: "nsfw",
                      },
                    ],
                  },
                ],
              },
              {
                type: ComponentType.ActionRow,
                components: [
                  {
                    type: ComponentType.StringSelect,
                    customId: "portalCreateExclusive",
                    maxValues: 1,
                    minValues: 1,
                    options: [
                      {
                        label: "🔒Private",
                        value: "exclusive",
                        default: portalCreation.exclusive,
                      },
                      {
                        label: "Public",
                        value: "public",
                        default: !portalCreation.exclusive,
                      },
                    ],
                  },
                ],
              },
              {
                type: ComponentType.ActionRow,
                components: [
                  {
                    type: ComponentType.Button,
                    customId: "portalCreateConfirm",
                    label: "Create and join Portal",
                    style: ButtonStyle.Success,
                  },
                  {
                    type: ComponentType.Button,
                    customId: "portalCreateCancel",
                    label: "Cancel",
                    style: ButtonStyle.Danger,
                  },
                ],
              },
            ],
          });
          break;
        }

        portalCreation.nsfw = nsfw;

        // Acknowledge interaction but don't send a response
        await interaction.update({
          content: `__Selected channel:__ <#${
            portalCreation.channelId
          }>.\n**Do you want to create a new Portal?**\n${
            portalCreation.emoji
          }${portalCreation.name}${portalCreation.nsfw ? "🔞" : ""}${
            portalCreation.exclusive
              ? `🔒\nPassword: \`${portalCreation.password}\``
              : ""
          }`,
          components: [
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.StringSelect,
                  customId: "portalCreateNsfw",
                  maxValues: 1,
                  minValues: 1,
                  options: [
                    {
                      label: "🔞NSFW",
                      value: "nsfw",
                      default: portalCreation.nsfw,
                    },
                    {
                      label: "SFW",
                      value: "sfw",
                      default: !portalCreation.nsfw,
                    },
                  ],
                },
              ],
            },
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.StringSelect,
                  customId: "portalCreateExclusive",
                  maxValues: 1,
                  minValues: 1,
                  options: [
                    {
                      label: "🔒Private",
                      value: "exclusive",
                      default: portalCreation.exclusive,
                    },
                    {
                      label: "Public",
                      value: "public",
                      default: !portalCreation.exclusive,
                    },
                  ],
                },
              ],
            },
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.Button,
                  customId: "portalCreateConfirm",
                  label: "Create and join Portal",
                  style: ButtonStyle.Success,
                },
                {
                  type: ComponentType.Button,
                  customId: "portalCreateCancel",
                  label: "Cancel",
                  style: ButtonStyle.Danger,
                },
              ],
            },
          ],
        });
        break;
      }
      case "portalCreateExclusive": {
        const portalCreation = portalSetups.get(interaction.user.id);
        if (!portalCreation) break;

        const exclusive = interaction.values[0] === "exclusive";

        portalCreation.expires = Date.now() + 60000;
        portalCreation.exclusive = false;

        if (!exclusive) {
          // Public, no need to request password
          await interaction.update({
            content: `__Selected channel:__ <#${
              portalCreation.channelId
            }>.\n**Do you want to create a new Portal?**\n${
              portalCreation.emoji
            }${portalCreation.name}${portalCreation.nsfw ? "🔞" : ""}${
              portalCreation.exclusive
                ? `🔒\nPassword: \`${portalCreation.password}\``
                : ""
            }`,
            components: [
              {
                type: ComponentType.ActionRow,
                components: [
                  {
                    type: ComponentType.StringSelect,
                    customId: "portalCreateNsfw",
                    maxValues: 1,
                    minValues: 1,
                    options: [
                      {
                        label: "🔞NSFW",
                        value: "nsfw",
                        default: portalCreation.nsfw,
                      },
                      {
                        label: "SFW",
                        value: "sfw",
                        default: !portalCreation.nsfw,
                      },
                    ],
                  },
                ],
              },
              {
                type: ComponentType.ActionRow,
                components: [
                  {
                    type: ComponentType.StringSelect,
                    customId: "portalCreateExclusive",
                    maxValues: 1,
                    minValues: 1,
                    options: [
                      {
                        label: "🔒Private",
                        value: "exclusive",
                        default: portalCreation.exclusive,
                      },
                      {
                        label: "Public",
                        value: "public",
                        default: !portalCreation.exclusive,
                      },
                    ],
                  },
                ],
              },
              {
                type: ComponentType.ActionRow,
                components: [
                  {
                    type: ComponentType.Button,
                    customId: "portalCreateConfirm",
                    label: "Create and join Portal",
                    style: ButtonStyle.Success,
                  },
                  {
                    type: ComponentType.Button,
                    customId: "portalCreateCancel",
                    label: "Cancel",
                    style: ButtonStyle.Danger,
                  },
                ],
              },
            ],
          });
          break;
        }
        // Request password
        await interaction.showModal({
          title: "Choose a password for your Private Portal",
          customId: "portalPasswordCreate",
          components: [
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.TextInput,
                  customId: "portalPassword",
                  label: "Enter Portal password",
                  placeholder:
                    "Anyone with access to the portal will be able to see the password.",
                  maxLength: 64,
                  minLength: 1,
                  style: TextInputStyle.Short,
                },
              ],
            },
          ],
        });
        break;
      }
    }
  }

  // Buttons
  if (interaction.isButton()) {
    switch (interaction.customId) {
      case "portalJoin": {
        // Join portal
        const setup = connectionSetups.get(interaction.user.id);
        if (!setup) return helpers.sendExpired(interaction);

        // Join portal
        const portalConnection = await helpers.createPortalConnection({
          portalId: setup.portalId,
          channelId: setup.channelId,
        });
        if (portalConnection instanceof Error) {
          interaction.reply({
            content:
              "A weird error ocurred. Apparently this channel doesn't exist!",
            ephemeral: true,
          });
          return;
        }
        const portal = helpers.getPortal(portalConnection.portalId);
        if (!portal) {
          interaction.reply({
            content:
              "A weird error ocurred. Apparently this portal doesn't exist!",
            ephemeral: true,
          });
          return;
        }
        interaction.update({
          content: `Joined \`#${portal.id}\` - ${portal.emoji}${
            portal.name
          }${portal.nsfw ? "🔞" : ""}${portal.exclusive ? "🔒" : ""}!`,
          components: [],
        });
        announcePortalJoin(portalConnection, helpers);
        break;
      }
      case "portalJoinInvite": {
        // Get setup
        const setup = connectionSetups.get(interaction.user.id);
        if (!setup) return helpers.sendExpired(interaction);

        // Create invite
        const invite = await helpers.createInvite(interaction.channel);

        // Join portal
        const portalConnection = await helpers.createPortalConnection({
          portalId: setup.portalId,
          channelId: setup.channelId,
          guildInvite: invite instanceof Error ? "" : invite.code,
        });
        if (portalConnection instanceof Error) {
          interaction.reply({
            content:
              "A weird error ocurred. Apparently this channel doesn't exist!",
            ephemeral: true,
          });
          return;
        }
        const portal = helpers.getPortal(portalConnection.portalId);
        if (!portal) {
          interaction.reply({
            content:
              "A weird error ocurred. Apparently this portal doesn't exist!",
            ephemeral: true,
          });
          return;
        }
        interaction.update({
          content: `Joined \`#${portal.id}\` - ${portal.emoji}${portal.name}!${
            invite instanceof Error
              ? "\n**Error:** Failed to create invite. Do I have the `Create Invite` permission?"
              : `\nCreated invite: ${invite.url}`
          }`,
          components: [],
        });
        announcePortalJoin(portalConnection, helpers);
        break;
      }
      case "portalCreate": {
        // Create new portal
        await interaction.showModal({
          title: "Create new Portal",
          customId: "portalCreateModal",
          components: [
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.TextInput,
                  customId: "portalName",
                  label: "Portal name",
                  placeholder: helpers.generateName(),
                  maxLength: 64,
                  minLength: 1,
                  style: TextInputStyle.Short,
                },
              ],
            },
          ],
        });
        break;
      }
      case "portalCreateConfirm": {
        // Confirm creation of new portal
        const portalSetup = portalSetups.get(interaction.user.id);
        if (!portalSetup) return helpers.sendExpired(interaction);

        const portal = helpers.createPortal({
          name: portalSetup.name,
          emoji: portalSetup.emoji,
          customEmoji: portalSetup.customEmoji,
          nsfw: portalSetup.nsfw,
          exclusive: portalSetup.exclusive,
          password: portalSetup.password,
        });
        portalSetups.delete(interaction.user.id);

        const portalConnection = await helpers.createPortalConnection({
          portalId: portal.id,
          channelId: portalSetup.channelId,
        });
        if (portalConnection instanceof Error) {
          interaction.reply({
            content:
              "A weird error ocurred. Apparently this channel doesn't exist!",
            ephemeral: true,
          });
          return;
        }
        interaction.update({
          content: `Created and joined Portal \`#${
            portalConnection.portalId
          }\` - ${portal.emoji}${portal.name}${portal.nsfw ? "🔞" : ""}${
            portal.exclusive ? "🔒" : ""
          }.\n(You can always leave the Portal with \`${PREFIX}leave\`, or delete it using \`${PREFIX}delete\`.)`,
          components: [],
        });
        break;
      }
      case "portalSelectCancel": {
        // Cancel portal selection
        const setup = connectionSetups.get(interaction.user.id);
        if (!setup) return helpers.sendExpired(interaction);

        connectionSetups.delete(interaction.user.id);
        interaction.update({
          content: "Cancelled Portal setup.",
          components: [],
        });
        break;
      }
      case "portalCreateCancel": {
        // Cancel portal creation
        const portalSetup = portalSetups.get(interaction.user.id);
        if (!portalSetup) return helpers.sendExpired(interaction);

        portalSetups.delete(interaction.user.id);
        interaction.update({
          content: "Cancelled Portal creation.",
          components: [],
        });
        break;
      }
    }
  }

  // Create new portal
  if (interaction.isModalSubmit() && interaction.isFromMessage()) {
    switch (interaction.customId) {
      case "portalCreateModal": {
        const setup = connectionSetups.get(interaction.user.id);
        if (!setup) return helpers.sendExpired(interaction);
        const portalName = interaction.fields.getTextInputValue("portalName");

        // Add portal to portalCreations
        portalSetups.set(interaction.user.id, {
          name: portalName,
          emoji: "",
          customEmoji: false,
          portalId: "",
          channelId: setup.channelId,
          nsfw: false,
          exclusive: false,
          password: "",
          expires: Date.now() + 60000,
        });
        setTimeout(() => {
          // Remove portalCreation if not completed
          if (portalSetups.has(interaction.user.id))
            portalSetups.delete(interaction.user.id);
        }, 60000);

        // Edit original message
        interaction.update({
          content: `__Selected channel:__ <#${setup.channelId}>.\n__Portal name:__ ${portalName}.\nReact to this message with the emoji you want to use for your Portal.`,
          components: [],
        });

        // Wait for emoji
        const filter = (_reaction: MessageReaction, user: User) =>
          user.id === interaction.user.id;

        interaction.message
          .awaitReactions({
            filter,
            max: 1,
            time: 60000,
            errors: ["time"],
          })
          .then(async (collected) => {
            // Add to portalCreations
            const reaction = collected.first();
            if (!reaction) {
              const channel = interaction.channel;
              channel?.type !== ChannelType.GroupDM &&
                channel?.send("You did not react with an emoji in time.");
              return;
            }
            const portalCreation = portalSetups.get(interaction.user.id);
            if (!portalCreation) return helpers.sendExpired(interaction);

            portalCreation.emoji = reaction.emoji.toString() || "";
            portalCreation.customEmoji = reaction.emoji.id ? true : false;
            portalCreation.portalId = helpers.generatePortalId();

            portalSetups.set(interaction.user.id, portalCreation);

            reaction.remove();

            // Edit original message
            interaction.message.edit({
              content: `__Selected channel:__ <#${
                portalCreation.channelId
              }>.\n**Do you want to create a new Portal?**\n${
                portalCreation.emoji
              }${portalCreation.name}${portalCreation.nsfw ? "🔞" : ""}${
                portalCreation.exclusive
                  ? `🔒\nPassword: \`${portalCreation.password}\``
                  : ""
              }`,
              components: [
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.StringSelect,
                      customId: "portalCreateNsfw",
                      maxValues: 1,
                      minValues: 1,
                      options: [
                        {
                          label: "🔞NSFW",
                          value: "nsfw",
                          default: portalCreation.nsfw,
                        },
                        {
                          label: "SFW",
                          value: "sfw",
                          default: !portalCreation.nsfw,
                        },
                      ],
                    },
                  ],
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.StringSelect,
                      customId: "portalCreateExclusive",
                      maxValues: 1,
                      minValues: 1,
                      options: [
                        {
                          label: "🔒Private",
                          value: "exclusive",
                        },
                        {
                          label: "Public",
                          value: "public",
                          default: true,
                        },
                      ],
                    },
                  ],
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.Button,
                      customId: "portalCreateConfirm",
                      label: "Create and join Portal",
                      style: ButtonStyle.Success,
                    },
                    {
                      type: ComponentType.Button,
                      customId: "portalCreateCancel",
                      label: "Cancel",
                      style: ButtonStyle.Danger,
                    },
                  ],
                },
              ],
            });
          })
          .catch(() => {
            const channel = interaction.channel;
            channel?.type !== ChannelType.GroupDM &&
              channel?.send("You did not react with an emoji in time.");
          });
        break;
      }
      case "portalPasswordCreate": {
        const portalCreation = portalSetups.get(interaction.user.id);
        const setup = connectionSetups.get(interaction.user.id);
        if (!portalCreation) return helpers.sendExpired(interaction);
        if (!setup) return helpers.sendExpired(interaction);

        const password = interaction.fields.getTextInputValue("portalPassword");
        portalCreation.password = password;
        portalCreation.exclusive = true;
        portalSetups.set(interaction.user.id, portalCreation);

        interaction.update({
          content: `__Selected channel:__ <#${
            portalCreation.channelId
          }>.\n**Do you want to create a new Portal?**\n${
            portalCreation.emoji
          }${portalCreation.name}${portalCreation.nsfw ? "🔞" : ""}${
            portalCreation.exclusive
              ? `🔒\nPassword: \`${portalCreation.password}\``
              : ""
          }`,
          components: [
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.StringSelect,
                  customId: "portalCreateNsfw",
                  maxValues: 1,
                  minValues: 1,
                  options: [
                    {
                      label: "🔞NSFW",
                      value: "nsfw",
                      default: portalCreation.nsfw,
                    },
                    {
                      label: "SFW",
                      value: "sfw",
                      default: !portalCreation.nsfw,
                    },
                  ],
                },
              ],
            },
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.StringSelect,
                  customId: "portalCreateExclusive",
                  maxValues: 1,
                  minValues: 1,
                  options: [
                    {
                      label: "🔒Private",
                      value: "exclusive",
                      default: true,
                    },
                    {
                      label: "Public",
                      value: "public",
                    },
                  ],
                },
              ],
            },
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.Button,
                  customId: "portalCreateConfirm",
                  label: "Create and join Portal",
                  style: ButtonStyle.Success,
                },
                {
                  type: ComponentType.Button,
                  customId: "portalCreateCancel",
                  label: "Cancel",
                  style: ButtonStyle.Danger,
                },
              ],
            },
          ],
        });
        break;
      }
      case "portalPasswordPrompt": {
        const setup = connectionSetups.get(interaction.user.id);
        if (!setup) return helpers.sendExpired(interaction);

        const password = interaction.fields.getTextInputValue("portalPassword");
        if (!password) return helpers.sendExpired(interaction);

        const portal = helpers.getPortal(setup.portalId);
        if (!portal) return helpers.sendExpired(interaction);

        if (portal.password !== password) {
          interaction.reply({
            content: "Incorrect password.",
            ephemeral: true,
          });
          const portals = helpers.getPortals();
          interaction.message.edit({
            content: `__Selected channel:__ <#${interaction.channel.id}>.\n${portalIntro.portal}.`,
            components: [
              {
                type: ComponentType.ActionRow,
                components: [
                  {
                    type: ComponentType.StringSelect,
                    customId: "portalSelect",
                    maxValues: 1,
                    minValues: 1,
                    options: portals.map((p) => ({
                      label: `${
                        p.customEmoji ? "" : p.emoji
                      }${p.name}${p.nsfw ? "🔞" : ""}${p.exclusive ? "�" : ""}`,
                      value: p.id,
                    })),
                    placeholder: "Select a Portal",
                  },
                ],
              },
              {
                type: ComponentType.ActionRow,
                components: [
                  {
                    type: ComponentType.Button,
                    customId: "portalCreate",
                    label: "Create new Portal",
                    style: ButtonStyle.Primary,
                  },
                  {
                    type: ComponentType.Button,
                    customId: "portalSelectCancel",
                    label: "Cancel",
                    style: ButtonStyle.Danger,
                  },
                ],
              },
            ],
          });
          return;
        }
        // Edit original message
        interaction.update({
          content: `__Selected channel:__ <#${
            setup.channelId
          }>.\n__Selected Portal:__ ${portal.emoji}${portal.name}${
            portal.nsfw ? "🔞" : ""
          }🔒.\n${portalIntro.confirm}`,
          components: [
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.Button,
                  customId: "portalJoinInvite",
                  label: "Join Portal + share invite",
                  style: ButtonStyle.Success,
                },
                {
                  type: ComponentType.Button,
                  customId: "portalJoin",
                  label: "Join Portal",
                  style: ButtonStyle.Success,
                },
                {
                  type: ComponentType.Button,
                  customId: "portalSelectCancel",
                  label: "Cancel",
                  style: ButtonStyle.Danger,
                },
              ],
            },
          ],
        });
      }
    }
  }

  // Context menus
  if (interaction.isUserContextMenuCommand()) {
    switch (interaction.commandName) {
      case "Limit to this channel": {
        // Check if user is allowed to use this command
        if (!ADMINS.includes(interaction.user.id)) {
          interaction.reply({
            content: "You are not allowed to use this command.",
            ephemeral: true,
          });
          return;
        }

        const user = interaction.targetUser;
        const portalId = helpers.getPortalConnection(
          interaction.channel.id,
        )?.portalId;
        if (!portalId) {
          interaction.reply({
            content: "You are not in a Portal channel.",
            ephemeral: true,
          });
          return;
        }
        helpers.setLimitedAccount(user.id, {
          portalId,
          channelId: interaction.channel.id,
          banned: false,
          bot: user.bot,
          reason: "Manual limit",
        });
        interaction.reply({
          content: `${interaction.user} limited ${user.tag} in this channel. They can still send messages to the Portal, but only in this channel.`,
        });
        break;
      }
      case "Unban": {
        // Check if user is allowed to use this command
        if (!ADMINS.includes(interaction.user.id)) {
          interaction.reply({
            content: "You are not allowed to use this command.",
            ephemeral: true,
          });
          return;
        }

        const user = interaction.targetUser;
        const portalId = helpers.getPortalConnection(
          interaction.channel.id,
        )?.portalId;
        if (!portalId) {
          interaction.reply({
            content: "You are not in a Portal channel.",
            ephemeral: true,
          });
          return;
        }
        helpers.deleteLimitedAccount(user.id, portalId);

        // Remove permissions in all channels
        const portalConnections = helpers.getPortalConnections(portalId);
        for (const [channelId, portalConnection] of portalConnections) {
          const channel = await helpers.safeFetchChannel(channelId);
          if (!channel) continue;
          try {
            const member = await channel.guild.members.fetch(user);
            await channel.permissionOverwrites.delete(member);
          } catch (e) {
            // console.error(e);
          }
        }
        interaction.reply({
          content: `${interaction.user} unbanned ${user.tag} in this channel.`,
        });
        break;
      }
      case "Ban": {
        // Check if user is allowed to use this command
        if (!ADMINS.includes(interaction.user.id)) {
          interaction.reply({
            content: "You are not allowed to use this command.",
            ephemeral: true,
          });
          return;
        }

        const user = interaction.targetUser;
        const portalId = helpers.getPortalConnection(
          interaction.channel.id,
        )?.portalId;
        if (!portalId) {
          interaction.reply({
            content: "You are not in a Portal channel.",
            ephemeral: true,
          });
          return;
        }
        helpers.setLimitedAccount(user.id, {
          portalId,
          channelId: interaction.channel.id,
          banned: true,
          bot: user.bot,
          reason: "Manual block",
        });
        interaction.reply({
          content: `${interaction.user} banned ${user.tag} in this channel.`,
        });
        break;
      }
    }
  }
}

export default handleInteraction;
