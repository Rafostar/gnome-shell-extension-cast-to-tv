const { GLib } = imports.gi;
const Local = imports.misc.extensionUtils.getCurrentExtension();
const Settings = Local.imports.helper.getSettings(Local.path);
const shared = Local.imports.shared.module.exports;

function getConfig()
{
	/* Get only settings required by extension */
	let config = {
		receiverType: Settings.get_string('receiver-type'),
		listeningPort: Settings.get_int('listening-port'),
		internalPort: Settings.get_int('internal-port'),
		musicVisualizer: Settings.get_boolean('music-visualizer')
	};

	return config;
}

function createTempDir()
{
	let dirExists = GLib.file_test(shared.tempDir, GLib.FileTest.EXISTS);
	if(!dirExists) GLib.mkdir_with_parents(shared.tempDir, 448); // 700 in octal
}
