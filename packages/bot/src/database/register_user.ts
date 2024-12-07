import { ln } from "@dicelette/localization";
import type { PersonnageIds, UserRegistration } from "@dicelette/types";
import type { Settings } from "@dicelette/types";
import type * as Djs from "discord.js";
import { searchUserChannel } from "utils";

/**
 * Register the managerId in the database
 */
export function setDefaultManagerId(
	guildData: Settings,
	interaction: Djs.BaseInteraction,
	channel?: string
) {
	if (!channel || !interaction.guild) return;
	guildData.set(interaction.guild.id, channel, "managerId");
}

/**
 * Register an user in the database
 * @returns
 */
export async function registerUser(
	userData: UserRegistration,
	interaction: Djs.BaseInteraction,
	enmap: Settings,
	deleteMsg: boolean | undefined = true,
	errorOnDuplicate: boolean | undefined = false
) {
	const { userID, charName, msgId, isPrivate, damage } = userData;
	const ids: PersonnageIds = { channelId: msgId[1], messageId: msgId[0] };
	if (!interaction.guild) return;
	const guildData = enmap.get(interaction.guild.id);
	if (!guildData) return;
	if (!guildData.user) guildData.user = {};

	const user = enmap.get(interaction.guild.id, `user.${userID}`);
	const newChar = {
		charName,
		messageId: msgId,
		damageName: damage,
		isPrivate,
	};
	//biome-ignore lint/performance/noDelete: We need to delete the key if it's not needed (because we are registering in the DB and undefined can lead to a bug)
	if (!charName) delete newChar.charName;
	//biome-ignore lint/performance/noDelete: We need to delete the key if it's not needed (because we are registering in the DB and undefined can lead to a bug)
	if (!damage) delete newChar.damageName;
	if (user) {
		const char = user.find((char) => {
			return char.charName?.subText(charName, true);
		});
		const charIndex = user.findIndex((char) => {
			return char.charName?.subText(charName, true);
		});
		if (char) {
			if (errorOnDuplicate) throw new Error("DUPLICATE");
			//delete old message
			if (deleteMsg) {
				try {
					const threadOfChar = await searchUserChannel(
						enmap,
						interaction,
						ln(interaction.locale),
						ids.channelId
					);
					if (threadOfChar) {
						const oldMessage = await threadOfChar.messages.fetch(char.messageId[1]);
						if (oldMessage) await oldMessage.delete();
					}
				} catch (error) {
					//skip unknown message
				}
			}
			//overwrite the message id
			char.messageId = msgId;
			if (damage) char.damageName = damage;
			enmap.set(interaction.guild.id, char, `user.${userID}.${charIndex}`);
		} else enmap.set(interaction.guild.id, [...user, newChar], `user.${userID}`);
		return;
	}
	enmap.set(interaction.guild.id, [newChar], `user.${userID}`);
}