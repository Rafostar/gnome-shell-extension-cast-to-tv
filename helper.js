/*
Convenience replacement
Original convenience.js does not work correctly with this extension use-cases
*/

const { Gio, GLib } = imports.gi;
const ByteArray = imports.byteArray;
const Gettext = imports.gettext;

const NOTIFY_PATH = GLib.find_program_in_path('notify-send');
const GJS_PATH = GLib.find_program_in_path('gjs');

let launcher;
let runApp;

function getSettings(localPath, schemaName)
{
	if(!localPath) return null;

	schemaName = schemaName || 'org.gnome.shell.extensions.cast-to-tv';

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
	gettextDomain = gettextDomain || 'cast-to-tv';

	if(localPath)
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
	if(runApp)
	{
		if(!runApp.get_identifier())
			runApp = null;
		else
		{
			runApp.wait_async(null, () => runApp = null);
			runApp.force_exit();
		}
	}

	/* Close other possible opened extension windows */
	if(mainPath && totalKill)
		GLib.spawn_command_line_async('pkill -SIGINT -f ' + mainPath);
}

function startApp(appPath, appName, args, noClose)
{
	appName = appName || 'app';
	let spawnArgs = [GJS_PATH, appPath + '/' + appName + '.js'];

	if(args && Array.isArray(args))
		args.forEach(arg => spawnArgs.push(arg));

	/* To not freeze gnome shell app needs to be run as separate process */
	if(noClose) return GLib.spawn_async(appPath, spawnArgs, null, 0, null);

	if(!launcher)
		launcher = new Gio.SubprocessLauncher();

	launcher.set_cwd(appPath);

	if(!runApp || !runApp.get_identifier())
		return runApp = launcher.spawnv(spawnArgs);

	runApp.wait_async(null, () => runApp = launcher.spawnv(spawnArgs));
	runApp.force_exit();
}

function setDevicesWidget(widget, devices, activeText)
{
	if(Array.isArray(devices) && devices.length)
	{
		let foundActive = false;
		let appendIndex = 0;
		let appendArray = [];

		devices.forEach(device =>
		{
			if(
				(!device.name
				|| !device.friendlyName
				|| appendArray.includes(device.friendlyName))
				|| (!device.name.endsWith('.local')
				&& !device.ip)
			) {
				return;
			}

			widget.append(device.friendlyName, device.friendlyName);
			appendArray.push(device.friendlyName);
			appendIndex++;

			if(!foundActive && activeText && activeText === device.friendlyName)
			{
				widget.set_active(appendIndex);
				foundActive = true;
			}
		});

		if(activeText && !foundActive)
			widget.set_active(0);

		return;
	}

	widget.set_active(0);
}

function parsePlayercastDevices(localData, webData)
{
	if(webData)
	{
		webData.forEach(fn =>
		{
			if(localData.some(dev => dev.friendlyName === fn))
				return;

			localData.unshift({
				name: (fn.split(' ').join('')).toLowerCase() + '.local',
				friendlyName: fn,
				ip: ''
			});
		});
	}

	return localData;
}

function readFromFile(path)
{
	let fileExists = GLib.file_test(path, GLib.FileTest.EXISTS);

	if(fileExists)
	{
		let [success, contents] = GLib.file_get_contents(path);

		if(success)
		{
			if(contents instanceof Uint8Array)
			{
				try { contents = JSON.parse(ByteArray.toString(contents)); }
				catch(err) { contents = null; }
			}
			else
			{
				try { contents = JSON.parse(contents); }
				catch(err) { contents = null; }
			}

			return contents;
		}
	}

	return null;
}

function readFromFileAsync(file, callback)
{
	/* Either filepath or Gio.File can be used */
	if(file && typeof file === 'string')
		file = Gio.file_new_for_path(file);

	file.load_contents_async(null, (file, res) =>
	{
		let success, contents;

		try {
			[success, contents] = file.load_contents_finish(res);

			if(success)
			{
				if(contents instanceof Uint8Array)
					contents = JSON.parse(ByteArray.toString(contents));
				else
					contents = JSON.parse(contents);
			}
			else
				contents = null;
		}
		catch(err) {
			contents = null;
		}

		callback(contents);
	});
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

			callback(outStr, false);
			return readOutputAsync(source, callback);
		}

		callback('', true);
	});
}

function createDir(dirPath, permissions)
{
	permissions = permissions || 493 // 755 in octal

	let dirExists = GLib.file_test(dirPath, GLib.FileTest.EXISTS);

	if(!dirExists)
		GLib.mkdir_with_parents(dirPath, permissions);
}

function notify(summary, mainBody)
{
	if(NOTIFY_PATH)
	{
		GLib.spawn_async(null, [
			NOTIFY_PATH,
			'-i', 'tv-symbolic',
			'-u', 'normal',
			summary, mainBody
		], null, 0, null);
	}

	log(summary + ': ' + mainBody);
}
