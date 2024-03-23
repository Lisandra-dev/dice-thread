import { ActionRowBuilder, APIEmbedField, ButtonInteraction, Embed, EmbedBuilder, ModalActionRowComponentBuilder, ModalBuilder, ModalSubmitInteraction, PermissionsBitField, TextInputBuilder, TextInputStyle, User } from "discord.js";
import { TFunction } from "i18next";

import { roll } from "../../dice";
import { cleanSkillName, cleanStatsName, parseStatsString, title } from "../../utils";
import { editUserButtons } from "../../utils/buttons";
import { registerUser } from "../../utils/db";
import { getEmbeds, getEmbedsList, parseEmbedFields, removeEmbedsFromList } from "../../utils/parse";
import { ensureEmbed, evalStatsDice } from "../../utils/verify_template";
import { getUserNameAndChar } from "..";

export async function showEditDice(interaction: ButtonInteraction, ul: TFunction<"translation", undefined>) {
	const diceEmbed = getEmbeds(ul, interaction.message, "damage");
	if (!diceEmbed) throw new Error(ul("error.invalidDice.embeds"));
	const diceFields = parseEmbedFields(diceEmbed.toJSON() as Embed);
	let dices = "";
	for (const [skill, dice] of Object.entries(diceFields)) {
		dices += `- ${skill}${ul("common.space")}: ${dice}\n`;
	}
	const modal = new ModalBuilder()
		.setCustomId("editDice")
		.setTitle(title(ul("common.dice")));
	const input = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
		new TextInputBuilder()
			.setCustomId("allDice")
			.setLabel(ul("modals.edit.dice"))
			.setRequired(true)
			.setStyle(TextInputStyle.Paragraph)
			.setValue(dices),
	);
	modal.addComponents(input);
	await interaction.showModal(modal);
}

export async function editDice(interaction: ModalSubmitInteraction, ul: TFunction<"translation", undefined>) {
	if (!interaction.message) return;
	const diceEmbeds = getEmbeds(ul, interaction?.message ?? undefined, "damage");
	if (!diceEmbeds) return;
	const values = interaction.fields.getTextInputValue("allDice");
	const valuesAsDice = values.split("\n- ").map(dice => {
		const [name, value] = dice.split(/ ?: ?/);
		return { name: name.replace("- ", "").trim().toLowerCase(), value };
	});
	const dices = valuesAsDice.reduce((acc, { name, value }) => {
		acc[name] = value;
		return acc;
	}, {} as {[name: string]: string});
	const newEmbedDice: APIEmbedField[] = [];
	for (const [skill, dice] of Object.entries(dices)) {
		//test if dice is valid
		if (dice === "X" 
			|| dice.trim().length ===0 
			|| dice === "0" 
			|| newEmbedDice.find(field => cleanStatsName(field.name) === cleanStatsName(skill))
		) continue;
		const statsEmbeds = getEmbeds(ul, interaction?.message ?? undefined, "stats");
		if (!statsEmbeds) {
			if (!roll(dice)) {
				throw new Error(ul("error.invalidDice.withDice", {dice}));
			}
			continue;
		} 
		const statsValues = parseStatsString(statsEmbeds);
		const diceEvaluated = evalStatsDice(dice, statsValues);
		newEmbedDice.push({
			name: title(skill),
			value: diceEvaluated,
			inline: true
		});
	}
	const oldDice = diceEmbeds.toJSON().fields;
	if (oldDice) {
		for (const field of oldDice) {
			const name = field.name.toLowerCase();
			if (field.value !== "0" 
				&& field.value !== "X" 
				&& field.value.trim().length > 0 
				&& !newEmbedDice.find(field => cleanStatsName(field.name) === cleanStatsName(name))
			) {
			//register the old value
				newEmbedDice.push({
					name: title(name),
					value: field.value,
					inline: true
				});
			}
		}
	}
	//remove duplicate
	const fieldsToAppend: APIEmbedField[] = [];
	for (const field of newEmbedDice) {
		const name = field.name.toLowerCase();
		if (fieldsToAppend.find(f => cleanSkillName(f.name) === cleanSkillName(name))) continue;
		fieldsToAppend.push(field);
	}
	const diceEmbed = new EmbedBuilder()
		.setTitle(title(ul("embed.dice")))
		.setColor(diceEmbeds.toJSON().color ?? "Green")
		.addFields(fieldsToAppend);
	const {userID, userName, thread} = await getUserNameAndChar(interaction, ul);	
	if (!fieldsToAppend || fieldsToAppend.length === 0) {
		//dice was removed
		const embedsList = getEmbedsList(ul, {which: "damage", embed: diceEmbed}, interaction.message);
		const toAdd = removeEmbedsFromList(embedsList.list, "damage", ul);
		const components = editUserButtons(ul, embedsList.exists.stats, false);
		await interaction.message.edit({ embeds: toAdd, components: [components] });
		await interaction.reply({ content: ul("modals.removed.dice"), ephemeral: true });
		registerUser(userID, interaction, interaction.message.id, thread, userName, undefined, false);
		return;
	} else if (fieldsToAppend.length > 25) {
		await interaction.reply({ content: ul("error.tooMuchDice"), ephemeral: true });
		return;
	}
	const skillDiceName = Object.keys(fieldsToAppend.reduce((acc, field) => {
		acc[field.name] = field.value;
		return acc;
	}, {} as {[name: string]: string}));
	registerUser(userID, interaction, interaction.message.id, thread, userName, skillDiceName, false);
	const embedsList = getEmbedsList(ul, {which: "damage", embed: diceEmbed}, interaction.message);
	await interaction.message.edit({ embeds: embedsList.list });
	await interaction.reply({ content: ul("embeds.edit.dice"), ephemeral: true });
}
export async function start_edit_dice(interaction: ButtonInteraction, ul: TFunction<"translation", undefined>, interactionUser: User) {
	const embed = ensureEmbed(interaction.message);
	const user = embed.fields.find(field => field.name === ul("common.user"))?.value.replace("<@", "").replace(">", "") === interactionUser.id;
	const isModerator = interaction.guild?.members.cache.get(interactionUser.id)?.permissions.has(PermissionsBitField.Flags.ManageRoles);
	if (user || isModerator)
		await showEditDice(interaction, ul);
	else await interaction.reply({ content: ul("modals.noPermission"), ephemeral: true });
}

