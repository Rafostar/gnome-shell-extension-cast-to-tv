const { GLib } = imports.gi;
const Local = imports.misc.extensionUtils.getCurrentExtension();
const Settings = Local.imports.helper.getSettings(Local.path);

function getConfig()
{
	/* Get only settings required by extension */
	let config = {
		listeningPort: Settings.get_int('listening-port'),
		internalPort: Settings.get_int('internal-port'),
		musicVisualizer: Settings.get_boolean('music-visualizer')
	};

	return config;
}

function getRemoteOpts()
{
	let opts = {
		mode: 'DIRECT',
		seekTime: Settings.get_int('seek-time'),
		isUnifiedSlider: Settings.get_boolean('unified-slider'),
		isLabel: Settings.get_boolean('remote-label'),
		receiverType: Settings.get_string('receiver-type'),
		useFriendlyName: Settings.get_boolean('remote-label-fn'),
		sliderIconSize: Settings.get_int('slider-icon-size'),
		mediaButtonsSize: Settings.get_int('media-buttons-size')
	};

	return opts;
}
