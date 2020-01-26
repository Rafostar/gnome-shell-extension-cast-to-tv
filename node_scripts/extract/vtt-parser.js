const readline = require('readline');
const debug = require('debug')('vtt-parser');

module.exports = function(fileStream, cb)
{
	debug('Started vtt-parser');

	var parsedData = "";

	var prevTime = null;
	var currTime = null;

	var prevLine = "";
	var currLine = "";

	var timesArr = [];
	var linesArr = [];

	const parseLine = function(line)
	{
		if(getIsLineInvalid(line))
			return;

		if(line && !isNaN(line.charAt(0)) && line.includes(' --> '))
			return currTime = line;

		if(line && currTime)
			return currLine += line + '\n';
		else if(line)
			return parsedData += line;
		else if(!currTime)
			parsedData += '\n\n';

		if(
			prevTime !== currTime
			|| prevLine !== currLine
		) {
			prevTime = currTime;
			prevLine = currLine;

			timesArr.push(currTime.split(' --> '));
			linesArr.push(currLine);
			currLine = "";
		}
	}

	const cleanRepeats = function()
	{
		var i = -1;
		var j = 0;

		var prevEnds = [];
		var prevLines = [];

		while(i < linesArr.length - 1)
		{
			i++;

			var start = timesArr[i][0];
			var end = timesArr[i][1];

			while(j < linesArr.length - 1)
			{
				j++;

				if(timesArr[j][0] > end)
					break;

				if(linesArr[i] === linesArr[j])
					end = timesArr[j][1];
			}

			j = i + 1;

			if(
				start >= end
				|| getIsLineAdded(linesArr[i], prevLines, prevEnds, end)
			)
				continue;

			parsedData += `${start} --> ${end}\n${linesArr[i]}\n`;

			prevEnds.push(end);
			prevLines.push(linesArr[i]);
		}
	}

	const onReadClose = function()
	{
		rl.removeListener('line', parseLine);

		debug('Stream from ffmpeg is closed');

		if(!linesArr.length)
			return cb(new Error('Parser output is empty'));

		/* Fix for missing empty line at file end */
		parseLine("");

		debug('Cleaning repeated lines...');

		try {
			cleanRepeats();
			debug('Cleaning finished');
		}
		catch(err) {
			return cb(err);
		}

		debug('Finished parsing vtt subs');

		return cb(null, parsedData);
	}

	const rl = readline.createInterface({
		input: fileStream,
		crlfDelay: Infinity
	});

	rl.on('line', parseLine);
	rl.once('close', onReadClose);
}

function getIsLineInvalid(line)
{
	if(line && line.length > 128)
		return true;

	var numCount = 0;
	var lineArr = line.split(' ');

	for(var word of lineArr)
	{
		if(isNaN(word))
			continue;

		numCount++;

		if(numCount > 10)
			return true;
	}

	return false;
}

function getIsLineAdded(currentLine, prevLines, prevEnds, end)
{
	for(var i = 0; i < prevLines.length; i++)
	{
		if(
			currentLine === prevLines[i]
			&& end === prevEnds[i]
		)
			return true;
	}

	return false;
}
