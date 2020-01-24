const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const debug = require('debug')('gnome');
const noop = () => {};

var schemaName = 'org.gnome.shell.extensions.cast-to-tv';
var schemaDir = path.join(__dirname + '/../schemas');
var isSchema = false;
var isRemoteVisible = null;

var gnome =
{
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

	showRemote: function(enable, cb)
	{
		isRemoteVisible = enable;
		this.setSetting('chromecast-playing', enable, cb);
	},

	showMenu: function(enable, cb)
	{
		this.setSetting('service-enabled', enable, cb);
	},

	isRemote: function()
	{
		isRemoteVisible = (isRemoteVisible === true || isRemoteVisible === false) ?
			isRemoteVisible : this.getBoolean('chromecast-playing');

		return isRemoteVisible;
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
			musicVisualizer: this.getBoolean('music-visualizer'),
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

module.exports = gnome;
