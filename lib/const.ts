import { PREFIX } from "../config.json";
import os from "os";

export const webhookAvatars = [
  "https://cdn.discordapp.com/avatars/1066196719173386261/e9b57e69088a7f5eff063317335bcb0f.webp",
  "https://cdn.discordapp.com/avatars/1057901464435044403/54ea7de9372438c6272614c510e4aa74.webp",
  "https://i.imgur.com/AJDWIxq.png",
  "https://i.imgur.com/UHEJ41P.png",
];
export const nameSuggestions = {
  beginning: [
    "Cool",
    "Hot",
    "Steamy",
    "Awesome",
    "Dank",
    "Dark",
    "Deep",
    "Shiny",
    "Haunted",
    "Intense",
  ],
  middle: [
    "discussion",
    "chill",
    "grill",
    "study",
    "programming",
    "gaming",
    "text",
    "bot",
    "wrestling",
  ],
  end: [
    "zone",
    "place",
    "room",
    "space",
    "world",
    "realm",
    "dimension",
    "area",
    "portal",
    "hangout",
  ],
};
export const emojiSuggestions = [
  "🌌",
  "😂",
  "👽",
  "🎅",
  "👑",
  "🥋",
  "🎮",
  "🎲",
  "🎨",
  "🎬",
  "🎤",
  "🎸",
  "🎹",
  "🎻",
  "🎺",
  "🎼",
  "🎵",
  "🎶",
  "🎧",
  "🎙️",
  "🎚️",
  "🎛️",
  "🎞️",
  "📽️",
  "📺",
  "📷",
  "📸",
  "📹",
  "📼",
  "🔍",
  "🔎",
  "🔬",
  "🔭",
  "📡",
  "🕯️",
  "💡",
  "🔦",
  "🏮",
  "📔",
  "📕",
  "📖",
  "📗",
  "📘",
  "📙",
  "📚",
  "📓",
  "📒",
  "📃",
  "📜",
  "📄",
  "📰",
  "🗞️",
  "📑",
  "🔖",
  "🏷️",
  "💰",
  "💴",
  "💵",
  "💶",
  "💷",
  "💸",
  "💳",
  "🧾",
  "💹",
  "💱",
  "💲",
  "✉️",
  "📧",
  "📨",
  "📩",
  "📤",
  "📥",
  "📦",
  "📫",
  "📪",
  "📬",
  "📭",
  "📮",
  "🗳️",
  "✏️",
  "✒️",
  "🖋️",
  "🖊️",
  "🖌️",
  "🖍️",
  "📝",
  "💼",
  "📁",
  "📂",
  "🗂️",
  "📅",
  "📆",
  "🗒️",
  "🗓️",
  "📇",
  "📈",
  "📉",
  "📊",
  "📋",
  "📌",
  "📍",
  "📎",
  "🖇️",
  "📏",
  "📐",
];

export const portalIntro = {
  portal:
    "**Welcome to the setup!** Select which Portal you want this channel to be connected to.",
  askInvite:
    "**Do you want to share an invite link to your server** with the Portal? You can always remove it by re-joining the Portal.",
  confirm: `**Do you want to join this Portal?** You can also choose to share an invite to this server with the Portal. You can always leave using \`${PREFIX}leave\`.`,
};

