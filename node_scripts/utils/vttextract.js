#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const ffprobe = require('../ffprobe');
const extractVid = require('../extract/extract-video');
const gnome = require('../gnome');
const metadata = require('../../metadata');

const cursor = {
	show: () => process.stdout.write('\u001B[?25h'),
	hide: () => process.stdout.write('\u001B[?25l')
};

var opts = {
	ffprobePath: null,
	inPath: null,
	outDir: null,
	quiet: false,
	recursive: false
};

function showHelp()
{
	const version = (metadata.git) ? `git-${metadata.git}` : `v${metadata.version}`;

	console.log([
		``,
		`vttextract - Cast to TV ${version} subtitles extractor`,
		``,
		`Usage: vttextract <source> [OPTIONS]`,
		``,
		`  source - can be path to single video file or dir with videos`,
		``,
		`OPTIONS:`,
		`  -q, --quiet          Do not print extraction info except errors`,
		`  -r, --recursive      Extract from files in subdirectories`,
		``
	].join('\n'));
}

function logInfo(text)
{
	if(!opts.quiet)
		console.log(text);
}

function writeProgress(fileName, mark, isEndLine)
{
	mark = mark || '\u2B58';

	process.stdout.cursorTo(0);
	process.stdout.clearLine(0);
	process.stdout.write(`${mark} ${fileName}`);

	if(isEndLine)
		process.stdout.write('\n');
}

function parseArgs()
{
	for(var i = 2; i < process.argv.length; i++)
	{
		switch(process.argv[i])
		{
			case '-q':
			case '--quiet':
				opts.quiet = true;
				break;
			case '-r':
			case '--recursive':
				opts.recursive = true;
				break;
			default:
				if(!opts.inPath)
					opts.inPath = process.argv[i];
				else
					return false;
				break;
		}
	}

	return (opts.inPath !== null);
}

function extractFromDir(dirPath)
{
	logInfo(`Browsing dir: "${dirPath}"`);

	return new Promise((resolve, reject) =>
	{
		fs.readdir(dirPath, async (err, files) =>
		{
			if(err) return reject(err);

			for(var fileName of files)
			{
				var runPath = path.join(dirPath, fileName);
				await runInPath(runPath, opts.recursive).catch(onReject);
			}

			resolve();
		});
	});
}

function extractFromFile(filePath)
{
	return new Promise((resolve, reject) =>
	{
		var ffprobeOpts = {
			ffprobePath : opts.ffprobePath,
			filePath: filePath
		};

		ffprobe(ffprobeOpts, (err, data) =>
		{
			if(err)
			{
				/* Returns process error when run on non-video file */
				if(err.message.includes('FFprobe process error'))
					return resolve();
				else
					return reject(err);
			}

			if(!extractVid.getIsSubsMerged(data))
				return resolve();

			var parsed = path.parse(filePath);

			/*
				Access is done here, so we disable second
				access test with overwrite set to true
			*/
			var extOpts = {
				file: filePath,
				outPath: path.join(opts.outDir, parsed.name + '.vtt'),
				overwrite: true
			};

			fs.access(extOpts.outPath, fs.constants.F_OK, (err) =>
			{
				if(!err) return resolve();

				var fileName = parsed.name + parsed.ext;

				if(!opts.quiet)
				{
					cursor.hide();
					writeProgress(fileName);
				}

				extractVid.videoToVtt(extOpts, (err) =>
				{
					if(err)
					{
						writeProgress(fileName, '\u2716', true);
						cursor.show();
						return reject(err);
					}

					if(!opts.quiet)
					{
						writeProgress(fileName, '\u2714', true);
						cursor.show();
					}

					resolve();
				});
			});
		});
	});
}

function runInPath(runPath, isRecursive)
{
	return new Promise((resolve, reject) =>
	{
		fs.access(runPath, fs.constants.F_OK, (err) =>
		{
			if(err) return reject(err);

			fs.stat(runPath, async (err, stat) =>
			{
				if(err) return reject(err);

				if(stat.isDirectory())
				{
					if(isRecursive)
						await extractFromDir(runPath).catch(onReject);
				}
				else if(stat.isFile())
					await extractFromFile(runPath).catch(onReject);
				else
					return reject(new Error(`Not a file or dir: ${runPath}`));

				resolve();
			});
		});
	});
}

function onReject(err)
{
	console.error(err.message);
}

function onFinish(hideMsg)
{
	if(hideMsg)
		console.log();
	else
		logInfo('Extraction finished');

	cursor.show();
	process.exit(0);
}

function onUncaughtException(err)
{
	/* Stopping ffprobe in middle causes JSON error */
	if(err && !err.message.includes('JSON'))
		console.error(err.message);

	cursor.show();
	process.exit(1);
}

function startExtract()
{
	const argsOk = parseArgs();

	if(!argsOk)
		return showHelp();

	gnome.loadSchema();

	if(!gnome.getBoolean('extractor-reuse'))
		return console.error('Extractor is disabled');

	opts.outDir = gnome.getSetting('extractor-dir');

	if(!opts.outDir)
		return console.error('Could not obtain save dir setting');

	const ffprobePath = gnome.getSetting('ffprobe-path');
	opts.ffprobePath = ffprobePath || '/usr/bin/ffprobe';

	process.on('SIGINT', () => onFinish(true));
	process.on('SIGTERM', () => onFinish(true));
	process.on('uncaughtException', onUncaughtException);

	/* First run must be recursive to support starting in dir */
	runInPath(opts.inPath, true)
		.then(onFinish)
		.catch(onReject)
}

startExtract();
