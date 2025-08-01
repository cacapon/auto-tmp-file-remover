import {
	App,
	normalizePath,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	TFolder,
} from "obsidian";

interface AutoTempCleanerSettings {
	targetFolder: string;
	ttlMinites: number;
	checkInterval: number;
	confirmed: boolean;
}

const DEFAULT_SETTINGS: AutoTempCleanerSettings = {
	targetFolder: "tmp",
	ttlMinites: 1440,
	checkInterval: 0,
	confirmed: false,
};

export default class AutoTempCleanerPlugin extends Plugin {
	settings: AutoTempCleanerSettings;
	intervalId: number | null = null;

	async onload() {
		await this.loadSettings();
		this.startInterval();
		this.addSettingTab(new AutoTempCleanerSettingTab(this.app, this));
	}

	onunload() {
		if (this.intervalId !== null) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	startInterval() {
		if (this.settings.checkInterval === 0) {
			new Notice("Auto Temp Cleaner has been stopped.");
		} else {
			new Notice(
				`Run Auto Temp Cleaner every ${this.settings.checkInterval} minutes.`
			);
		}
		this.runCleanUp();
		const intervalMs = toMilliSec(this.settings.checkInterval);
		this.intervalId = window.setInterval(
			() => this.runCleanUp(),
			intervalMs
		);
	}

	async runCleanUp() {
		if (this.settings.checkInterval === 0) return;
		if (!this.settings.confirmed) {
			new Notice(
				"This plugin automatically deletes files in the specified folder.\nPlease check the settings."
			);
			return;
		}
		const folderPath = normalizePath(this.settings.targetFolder);
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!(folder instanceof TFolder)) return;

		const now = Date.now();
		const ttlMillis = toMilliSec(this.settings.ttlMinites);
		const delFiles: string[] = [];
		for (const file of folder.children) {
			if (file instanceof TFile && file.extension === "md") {
				const ctime = file.stat.ctime;
				if (now - ctime > ttlMillis) {
					await this.app.fileManager.trashFile(file);
					delFiles.push(file.path);
				}
			}
		}
		if (delFiles.length > 0) {
			new Notice(`Deleted files: \n${delFiles.join("\n")}`);
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class AutoTempCleanerSettingTab extends PluginSettingTab {
	plugin: AutoTempCleanerPlugin;

	constructor(app: App, plugin: AutoTempCleanerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}
	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl).addButton((btn) =>
			btn
				.setButtonText("Initialize settings")
				.setCta()
				.onClick(async () => {
					this.plugin.settings = { ...DEFAULT_SETTINGS };
					await this.plugin.saveSettings();
					this.display();
					new Notice("Settings have been reset.");
				})
		);

		new Setting(containerEl)
			.setName("Target folder")
			.setDesc(
				"Enter the relative path of the folder to be deleted from the Vault."
			)
			.addText((text) =>
				text
					.setPlaceholder("tmp")
					.setValue(this.plugin.settings.targetFolder)
					.onChange(async (value) => {
						this.plugin.settings.targetFolder = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("File expiration time (minutes)")
			.setDesc("How many minutes after creation should files be deleted?")
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = "1";
				text.inputEl.max = "10080";
				text.setPlaceholder("1")
					.setValue(String(this.plugin.settings.ttlMinites))
					.onChange(async (value) => {
						const numVal = parseInt(value);
						if (!isNaN(numVal) && numVal >= 1 && numVal <= 10080) {
							this.plugin.settings.ttlMinites = numVal;
							await this.plugin.saveSettings();
						}
					});
			});

		new Setting(containerEl)
			.setName("Cleaner execution interval (minutes)")
			.setDesc(
				"How often should the Cleaner be run? (0-1440) *0 means stop"
			)
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = "0";
				text.inputEl.max = "1440";
				text.setPlaceholder("0")
					.setValue(String(this.plugin.settings.checkInterval))
					.onChange(async (value) => {
						const numVal = parseInt(value);
						if (!isNaN(numVal) && numVal >= 0 && numVal <= 1440) {
							this.plugin.settings.checkInterval = numVal;
							await this.plugin.saveSettings();
							this.plugin.onunload();
							this.plugin.startInterval();
						}
					});
			});

			new Setting(containerEl)
			.setName("Confirm automatic deletion")
			.setDesc("You understand and agree that this plugin will automatically delete files in the specified folder.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.confirmed)
					.onChange(async (value) => {
						this.plugin.settings.confirmed = value;
						await this.plugin.saveSettings();
						new Notice(
							value
								? "Automatic deletion is now enabled."
								: "Automatic deletion is now disabled."
						);
					})
			);
	}
}

function toMilliSec(minitues: number): number {
	return minitues * 60000;
}
