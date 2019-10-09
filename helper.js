/*
Convenience replacement
Original convenience.js does not work correctly with this extension use-cases
*/

const { Gio, GLib } = imports.gi;
const ByteArray = imports.byteArray;
const Gettext = imports.gettext;

function getSettings(localPath, schemaName)
{
	if(!localPath || !schemaName) return null;

	const GioSSS = Gio.SettingsSchemaSource;
	let schemaDir = Gio.File.new_for_path(localPath).get_child('schemas');
	let schemaSource = null;

	if(schemaDir.query_exists(null))
		schemaSource = GioSSS.new_from_directory(
			localPath + '/schemas', GioSSS.get_default(), false
		);
	else
		schemaSource = GioSSS.get_default();

	let schemaObj = schemaSource.lookup(schemaName, true);
	if(!schemaObj)
		throw new Error('Cast to TV: extension schemas could not be found!');

	return new Gio.Settings({ settings_schema: schemaObj });
}

function initTranslations(localPath, gettextDomain)
{
	if(localPath && gettextDomain)
	{
		let localeDir = Gio.File.new_for_path(localPath).get_child('locale');

		if(localeDir.query_exists(null))
			Gettext.bindtextdomain(gettextDomain, localPath + '/locale');
		else
			Gettext.bindtextdomain(gettextDomain, '/usr/share/locale');
	}
}

function closeOtherApps(mainPath, totalKill)
{
	let extPath = mainPath.substring(0, mainPath.lastIndexOf('/'));
	let addKill = (totalKill) ? '' : '/file-chooser';

	/* Close other possible opened extension windows */
	GLib.spawn_command_line_async('pkill -SIGINT -f ' + mainPath + addKill + '|' +
		extPath + '/cast-to-tv-.*-addon@.*/app');
}

function startApp(appPath, appName, args)
{
	appName = appName || 'app';
	let spawnArgs = ['/usr/bin/gjs', appPath + '/' + appName + '.js'];

	if(args && Array.isArray(args))
		args.forEach(arg => spawnArgs.push(arg));

	/* To not freeze gnome shell app needs to be run as separate process */
	GLib.spawn_async(appPath, spawnArgs, null, 0, null);
}

function readFromFile(path)
{
	let fileExists = GLib.file_test(path, GLib.FileTest.EXISTS);

	if(fileExists)
	{
		let [readOk, readFile] = GLib.file_get_contents(path);

		if(readOk)
		{
			let data;

			if(readFile instanceof Uint8Array)
			{
				try { data = JSON.parse(ByteArray.toString(readFile)); }
				catch(err) { data = null; }
			}
			else
			{
				try { data = JSON.parse(readFile); }
				catch(err) { data = null; }
			}

			return data;
		}
	}

	return null;
}

function writeToFile(path, contents)
{
	GLib.file_set_contents(path, JSON.stringify(contents, null, 1));
}

function readOutputAsync(stream, callback)
{
	stream.read_line_async(GLib.PRIORITY_LOW, null, (source, res) =>
	{
		let out_fd, length, outStr;

		[out_fd, length] = source.read_line_finish(res);

		if(out_fd !== null)
		{
			if(out_fd instanceof Uint8Array)
				outStr = ByteArray.toString(out_fd);
			else
				outStr = out_fd.toString();

			callback(outStr);
			readOutputAsync(source, callback);
		}
	});
}
