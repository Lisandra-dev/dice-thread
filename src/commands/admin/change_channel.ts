import { cmdLn, ln } from "@localization";
import { EClient } from "@main";
import { reply } from "@utils";
import { channelMention,ChannelType, CommandInteraction, CommandInteractionOptionResolver, Locale, PermissionFlagsBits, SlashCommandBuilder, TextChannel } from "discord.js";
import { t } from "i18next";

export const logs = {
	data: new SlashCommandBuilder()
		.setName(t("logs.name"))
		.setNameLocalizations(cmdLn("logs.name"))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
		.setDescription(t("logs.description"))
		.setDescriptionLocalizations(cmdLn("logs.description"))
		.setNameLocalizations(cmdLn("logs.name"))
		.addChannelOption(option =>
			option
				.setName(t("common.channel"))
				.setDescription(t("logs.options"))
				.setDescriptionLocalizations(cmdLn("logs.options"))
				.setNameLocalizations(cmdLn("common.channel"))
				.setRequired(true)
				.addChannelTypes(ChannelType.GuildText, ChannelType.PrivateThread, ChannelType.PublicThread)
		),
	async execute(interaction: CommandInteraction, client: EClient): Promise<void> {
		if (!interaction.guild) return;
		const ul = ln(interaction.locale as Locale);
		const options = interaction.options as CommandInteractionOptionResolver;
		const channel = options.getChannel(ul("common.channel"), true);
		if (!channel || !(channel instanceof TextChannel)) {
			await reply(interaction, { content: ul("error.invalidChannelType", {channel: channel ? `<#${channel.id}>` : ul("common.channel")}), ephemeral: true});
			return;
		}
		client.settings.set(interaction.guild.id, channel.id, "logs");
		await reply(interaction, { content: ul("logs.set", {channel: channel.name}), ephemeral: true });
	}
};

export const changeThread = {
	data: new SlashCommandBuilder()
		.setName(t("changeThread.name"))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
		.setNameLocalizations(cmdLn("changeThread.name"))
		.setDescription(t("changeThread.description"))
		.setDescriptionLocalizations(cmdLn("changeThread.description"))
		.setDMPermission(false)
		.addChannelOption(option =>
			option
				.setName(t("common.channel"))
				.setNameLocalizations(cmdLn("common.channel"))
				.setDescription(t("changeThread.options"))
				.setDescriptionLocalizations(cmdLn("changeThread.options"))
				.setRequired(true)
				.addChannelTypes(ChannelType.GuildText, ChannelType.PublicThread, ChannelType.PrivateThread)
		),
	async execute(interaction: CommandInteraction, client: EClient): Promise<void> {
		const options = interaction.options as CommandInteractionOptionResolver;
		const channel = options.getChannel("channel", true);
		const ul = ln(interaction.locale as Locale);
		if (!channel || !interaction.guild?.id) return;
		client.settings.set(interaction.guild.id, channel.id, "rollChannel");
		await reply(interaction, ul("changeThread.set", {channel: channelMention(channel.id)}));
	}
};