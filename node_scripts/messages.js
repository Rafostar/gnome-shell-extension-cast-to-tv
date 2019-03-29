function _(text) { return text; }

module.exports = {
	loading: _("LOADING"),
	noMedia: _("No file selected"),
	wrongReceiver: _("Receiver type is set to Chromecast"),
	/* TRANSLATORS: Do not remove HTML tags */
	streamActive: _("Too many connections!<p>Close all other tabs that are accessing this page in all browsers</p>"),
	/* TRANSLATORS: This sentence will contain file path after end */
	ffmpegError: _("FFmpeg could not transcode file:"),
	ffmpegPath: _("FFmpeg path is incorrect"),
	/* TRANSLATORS: This sentence will contain file path after end */
	ffprobeError: _("FFprobe could not process file:"),
	ffprobePath: _("FFprobe path is incorrect"),
	plyr: {
		speed: _("Speed"),
		/* TRANSLATORS: One of "Speed" setting value */
		normal: _("Normal")
	},
	chromecast: {
		notFound: _("Device not found"),
		loadFailed: _("Failed to load media"),
		/* TRANSLATORS: This sentence will contain file path after end */
		playError: _("Could not play file:"),
		tryAgain: _("Try again with transcoding enabled")
	}
}
