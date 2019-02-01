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
	metadataPath: tempDir + 'metadata.json',
	remotePath: tempDir + 'chromecast-remote.json',
	statusPath: tempDir + 'chromecast-status.json',
	listPath: tempDir + 'chromecast-list.json',
	vttSubsPath: tempDir + 'webplayer_subs.vtt',
	coverDefault: tempDir + 'cover',
	escapeChars: [' ', '[', ']', '"', "'"],
	coverNames: ['cover', 'cover_01', 'cover 01', 'cover1'],
	coverExtensions: ['.jpg', '.png'],
	subsFormats: ['srt', 'ass', 'vtt'],
	chromecast: {
		launchDelay: 3000,
		searchTimeout: 4000,
		retryNumber: 2,
		videoBuffer: 2500,
		visualizerBuffer: 6500,
		subsStyle: {
			backgroundColor: '#00000000',
			foregroundColor: '#FFFFFFFF',
			edgeType: 'OUTLINE',
			edgeColor: '#000000FF',
			fontScale: 1.0,
			fontStyle: 'NORMAL',
			fontFamily: 'Droid Sans',
			fontGenericFamily: 'SANS_SERIF',
			windowType: 'NONE'
		},
		tracks: [{
			trackId: 1,
			type: 'TEXT',
			trackContentId: '',
			trackContentType: 'text/vtt',
			name: 'Subtitles',
			subtype: 'SUBTITLES'
		}],
		metadata: {
			metadataType: 'MUSIC_TRACK',
			title: '',
			images: [{
				url: ''
			}]
		}
	}
};
