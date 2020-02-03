const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const debug = require('debug')('gnome');
const sender = require('./sender');
const noop = () => {};

var schemaName = 'org.gnome.shell.extensions.cast-to-tv';
var schemaDir = path.join(__dirname + '/../schemas');
var isSchema = false;

module.exports =
{
	isRemote: false,
	isLockScreen: false,

	loadSchema: function(customName, customPath)
	{
		schemaName = customName || schemaName;
		schemaDir = customPath || schemaDir;

		isSchema = fs.existsSync(`${schemaDir}/gschemas.compiled`);
		debug(`Settings schema available: ${isSchema}`);
	},

	setSetting: function(setting, value, cb)
	{
		cb = cb || noop;

		var args = ['set', schemaName, setting, value];
		if(isSchema) args.unshift('--schemadir', schemaDir);

		debug(`Set ${setting}: ${value}`);
		var gProcess = spawn('gsettings', args);
		gProcess.once('exit', cb);
	},

	getSetting: function(setting)
	{
		var args = ['get', schemaName, setting];
		if(isSchema) args.unshift('--schemadir', schemaDir);

		var gsettings = spawnSync('gsettings', args);
		var value = String(gsettings.stdout).replace(/\n/, '').replace(/\'/g, '');
		debug(`Get ${setting}: ${value}`);

		return value;
	},

	getBoolean: function(setting)
	{
		var value = this.getSetting(setting);
		return (value === 'true' || value === true);
	},

	getJSON: function(setting)
	{
		var value = this.getSetting(setting);
		return JSON.parse(value);
	},

	showRemote: function(enable, playbackData, cb)
	{
		cb = cb || noop;

		if(this.isLockScreen)
			return cb(null);

		debug(`Show remote widget: ${enable}`);

		var data = { isPlaying: enable };

		if(playbackData)
			data = { ...playbackData, ...data };

		this.isRemote = enable;
		sender.sendPlaybackData(data, cb);
	},

	getTempConfig: function()
	{
		var config = {
			ffmpegPath: this.getSetting('ffmpeg-path'),
			ffprobePath: this.getSetting('ffprobe-path'),
			receiverType: this.getSetting('receiver-type'),
			listeningPort: this.getSetting('listening-port'),
			internalPort: this.getSetting('internal-port'),
			webplayerSubs: parseFloat(this.getSetting('webplayer-subs')).toFixed(1),
			videoBitrate: parseFloat(this.getSetting('video-bitrate')).toFixed(1),
			videoAcceleration: this.getSetting('video-acceleration'),
			burnSubtitles: this.getBoolean('burn-subtitles'),
			musicVisualizer: this.getBoolean('music-visualizer'),
			slideshowTime: this.getSetting('slideshow-time'),
			extractorReuse: this.getBoolean('extractor-reuse'),
			extractorDir: this.getSetting('extractor-dir'),
			chromecastName: this.getSetting('chromecast-name'),
			playercastName: this.getSetting('playercast-name')
		};

		/* Use default paths if custom paths are not defined */
		if(!config.ffmpegPath) config.ffmpegPath = '/usr/bin/ffmpeg';
		if(!config.ffprobePath) config.ffprobePath = '/usr/bin/ffprobe';

		return config;
	}
}
