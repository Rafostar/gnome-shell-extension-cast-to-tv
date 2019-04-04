if(typeof process === 'undefined')
{
	/* When importing to GJS */
	var exports = {};
	var module = {exports};
}

var tempDir = '/tmp/.cast-to-tv/';

module.exports = {
	configPath: tempDir + 'config.json',
	selectionPath: tempDir + 'selection.json',
	listPath: tempDir + 'playlist.json',
	remotePath: tempDir + 'chromecast-remote.json',
	statusPath: tempDir + 'chromecast-status.json',
	vttSubsPath: tempDir + 'webplayer_subs.vtt',
	coverDefault: tempDir + 'cover',
	escapeChars: [' ', '[', ']', '"', "'"],
	coverNames: ['cover', 'cover_01', 'cover 01', 'cover1'],
	coverExtensions: ['.jpg', '.png'],
	subsFormats: ['srt', 'ass', 'vtt'],
	chromecast: {
		relaunchDelay: 1200,
		searchTimeout: 4000,
		retryNumber: 2,
		videoBuffer: 2500,
		visualizerBuffer: 6500,
		subsStyle: {
			backgroundColor: '#00000000',
			foregroundColor: '#FFFFFFFF',
			edgeType: 'OUTLINE',
			edgeColor: '#000000FF',
			fontScale: '1.0',
			fontStyle: 'NORMAL',
			fontGenericFamily: 'SANS_SERIF',
			windowType: 'NONE'
		},
		tracks: [{
			trackId: 1,
			type: 'TEXT',
			trackContentType: 'text/vtt',
			name: 'Subtitles',
			subtype: 'SUBTITLES'
		}]
	}
};
