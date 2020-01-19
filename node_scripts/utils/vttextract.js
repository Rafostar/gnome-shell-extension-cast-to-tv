#!/bin/sh
//bin/false || exec "$(command -v nodejs || command -v node)" "$0"

function extractSubs()
{
	console.log([
		``,
		`vttextract - Cast to TV subtitles extractor`,
		``
	].join('\n'));
}

extractSubs();
